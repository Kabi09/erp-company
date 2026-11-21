import type { FormField, Values } from '../../../shared/departmentForms';
import type { WorkRecord, WorkEntry } from '../models/department.model';

export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function ensure(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export const latest = (r: WorkRecord, action: string) =>
  [...r.entries].reverse().find((e) => e.action === action);
export function clean(fields: FormField[], raw: Values = {}): Values {
  const result: Values = {};
  for (const f of fields) {
    const value = raw[f.key];
    if (f.kind === 'rows' || f.kind === 'list') {
      const items = value ?? [];
      ensure(Array.isArray(items) && items.length <= 150, 'Invalid ' + f.label);
      result[f.key] =
        f.kind === 'rows'
          ? items.map((row) => clean(f.fields!, row))
          : items
              .map((x) => {
                ensure(typeof x === 'string' && x.trim().length <= 500, 'Invalid ' + f.label);
                return x.trim();
              })
              .filter(Boolean);
      ensure(!f.required || result[f.key].length, 'Add at least one ' + f.label);
      continue;
    }
    if (value == null || value === '') {
      ensure(!f.required, f.label + ' is required.');
      continue;
    }
    if (f.kind === 'number') {
      const n = Number(value);
      ensure(
        (typeof value === 'number' || typeof value === 'string') &&
          Number.isFinite(n) &&
          n >= (f.min ?? 0) &&
          n <= 1e10 &&
          money(n) === n,
        'Invalid ' + f.label,
      );
      result[f.key] = n;
    } else {
      ensure(
        typeof value === 'string' && value.trim().length > 0 && value.length <= 4000,
        'Invalid ' + f.label,
      );
      const str = value.trim();
      if (f.options) ensure(f.options.includes(str), 'Invalid ' + f.label);
      if (f.kind === 'date')
        ensure(
          /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(str) &&
            Number.isFinite(Date.parse(str)) &&
            new Date(str).toISOString().slice(0, 10) === str,
          'Invalid ' + f.label,
        );
      if (f.kind === 'time') ensure(/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(str), 'Invalid visit time.');
      result[f.key] = str;
    }
  }
  return result;
}
export function account(entries: WorkEntry[], employeeId: string) {
  const own = entries.filter((e) => e.employeeId === employeeId);
  const advances = own.filter((e) => e.action === 'payAdvance').reduce((s, e) => s + e.data.amount, 0);
  const approved = new Set(
    own.filter((e) => e.action === 'verify' && e.data.decision === 'Approved').map((e) => e.data.entryId),
  );
  const verified = own.filter((e) => approved.has(e.id) && e.action === 'expense');
  const eligible = verified
    .filter((e) => e.data.paidBy === 'Technician')
    .reduce((s, e) => s + e.data.amount, 0);
  const settlements = own.filter((e) => e.action === 'settle');
  const reimbursed = settlements
    .filter((e) => e.data.direction === 'Reimbursement paid')
    .reduce((s, e) => s + e.data.amount, 0);
  const returned = settlements
    .filter((e) => e.data.direction === 'Advance returned')
    .reduce((s, e) => s + e.data.amount, 0);
  const balance = money(advances + reimbursed - returned - eligible);
  return {
    advances: money(advances),
    verifiedExpenses: money(verified.reduce((sum, e) => sum + e.data.amount, 0)),
    alreadySettled: money(reimbursed + returned),
    eligible: money(eligible),
    reimbursed: money(reimbursed),
    returned: money(returned),
    toReimburse: Math.max(0, -balance),
    toReturn: Math.max(0, balance),
  };
}
export function billing(r: WorkRecord, charges = latest(r, 'charges')?.data) {
  const subtotal = money(
    (charges?.items || []).reduce(
      (s: number, i: Values) => s + (i.coverage === 'Chargeable' ? i.amount : 0),
      0,
    ),
  );
  const discount = charges?.discount || 0;
  ensure(discount <= subtotal && (charges?.tax || 0) <= 100, 'Check discount and tax.');
  const total = money((subtotal - discount) * (1 + (charges?.tax || 0) / 100));
  const received = money(
    r.entries.filter((e) => e.action === 'payment').reduce((s, e) => s + e.data.amount, 0),
  );
  return { total, received, outstanding: money(total - received) };
}
export function serviceTransition(r: WorkRecord, e: WorkEntry, warrantyStatus?: string) {
  const { action, data: d } = e;
  const open =
    r.entries.filter((x) => x.action === 'checkIn').length >
    r.entries.filter((x) => x.action === 'checkOut').length;
  const financial = ['advance', 'payAdvance', 'expense', 'verify', 'settle', 'charges', 'payment'];
  ensure(
    r.status !== 'Completed' || [...financial, 'receive', 'use', 'return'].includes(action),
    'Service is already complete.',
  );
  if (['checkIn', 'checkOut'].includes(action))
    ensure(r.employeeId && e.actor === r.employeeId, 'Only the assigned technician can record their visit.');
  if (['assign', 'checkIn', 'complete'].includes(action))
    ensure(!open, 'Check out of the current visit first.');
  if (action === 'assign') return 'Scheduled';
  if (action === 'checkIn') return 'In Progress';
  if (action === 'checkOut') {
    ensure(open, 'No active visit.');
    d.minutes = money((Date.parse(e.at) - Date.parse(latest(r, 'checkIn')!.at)) / 60000);
    return d.status;
  }
  if (action === 'claim') {
    if (d.decision === 'Claim Approved')
      ensure(
        r.assetId && warrantyStatus === 'Under Warranty',
        'Verify the unit and warranty dates before approval.',
      );
    if (d.decision === 'Claim Rejected') ensure(d.reason, 'Enter the rejection reason.');
  }
  if (['receiveUnit', 'returnUnit'].includes(action)) {
    ensure(
      (latest(r, 'assign')?.data.location || r.details.location) === 'CRYO Workshop',
      'Workshop custody only applies to workshop repairs.',
    );
    const received = latest(r, 'receiveUnit'),
      returned = latest(r, 'returnUnit');
    const held = received && (!returned || r.entries.indexOf(received) > r.entries.indexOf(returned));
    ensure(action === 'receiveUnit' ? !held : held, 'Check the current workshop custody status.');
    if (action === 'receiveUnit' && r.details.serial && r.details.identifiable)
      ensure(d.serial === r.details.serial, 'Confirm the delivered serial number at workshop receipt.');
    if (action === 'returnUnit') ensure(d.date >= received.data.date, 'Return predates receipt.');
  }
  if (['expense', 'advance'].includes(action)) ensure(r.employeeId, 'Assign the technician first.');
  if (['payAdvance', 'verify'].includes(action)) {
    const item = r.entries.find(
      (x) => x.id === d.entryId && x.action === (action === 'verify' ? 'expense' : 'advance'),
    );
    ensure(
      item && !r.entries.some((x) => x.action === action && x.data.entryId === item.id),
      'Entry missing or already processed.',
    );
    ensure(
      e.actor !== item.actor && e.actor !== item.employeeId,
      'A different authorized employee must verify this entry.',
    );
    e.employeeId = item.employeeId;
    d.amount = item.data.amount;
  }
  if (action === 'settle') {
    e.employeeId = d.employeeId;
    const a = account(r.entries, d.employeeId);
    ensure(
      d.amount <= (d.direction === 'Advance returned' ? a.toReturn : a.toReimburse),
      'Amount exceeds unsettled balance.',
    );
  }
  if (['payAdvance', 'settle', 'payment'].includes(action))
    ensure(
      !r.entries.some(
        (x) => x.action === action && x.data.reference.toLowerCase() === d.reference.toLowerCase(),
      ),
      'Reference already recorded.',
    );
  if (action === 'payment')
    ensure(d.amount <= billing(r).outstanding, 'Payment exceeds outstanding charges.');
  if (action === 'charges')
    ensure(billing(r, d).outstanding >= 0, 'Charges fall below payments already received.');
  if (action === 'complete') {
    ensure(r.employeeId, 'Assign a technician first.');
    const location = latest(r, 'assign')?.data.location || r.details.location;
    if (location === 'Customer Site') ensure(d.acknowledgement, 'Customer acknowledgement is required.');
    else
      ensure(
        latest(r, 'returnUnit') &&
          r.entries.lastIndexOf(latest(r, 'returnUnit')!) > r.entries.lastIndexOf(latest(r, 'receiveUnit')!),
        'Record equipment return first.',
      );
    return 'Completed';
  }
  return action === 'update' ? d.status : r.status;
}
export function researchTransition(r: WorkRecord, action: string, data: Values) {
  ensure(r.status !== 'Successfully Completed', 'Project is already completed.');
  if (action === 'complete') {
    ensure(data.date >= r.details.start, 'Completion predates the project start.');
    const outcomes = new Map<string, Values>();
    for (const entry of r.entries.filter((e) => e.action === 'test')) {
      for (const row of entry.data.items) {
        const name = row.name.trim().toLowerCase();
        outcomes.set(name, {
          ...row,
          required: outcomes.get(name)?.required === 'Yes' ? 'Yes' : row.required,
        });
      }
    }
    for (const row of outcomes.values())
      ensure(
        row.required !== 'Yes' || row.result === 'Pass',
        'Mandatory test needs a passing result: ' + row.name,
      );
    ensure(
      !latest(r, 'draft') || r.entries.indexOf(latest(r, 'draft')!) < r.entries.indexOf(latest(r, 'test')!),
      'Save the draft test attempt first.',
    );
    return 'Successfully Completed';
  }
  return 'In Progress';
}
