export type Workspace = 'service' | 'rnd';
export type Values = Record<string, any>;
export type FieldKind =
  | 'text'
  | 'long'
  | 'number'
  | 'date'
  | 'time'
  | 'select'
  | 'choice'
  | 'rows'
  | 'list'
  | 'attachment';
export interface FormField {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  source?: string;
  fields?: FormField[];
  min?: number;
}
const field = (key: string, label: string, kind: FieldKind = 'text', required = false): FormField => ({
  key,
  label,
  kind,
  required,
});
const pick = (key: string, label: string, options: string[], required = true): FormField => ({
  ...field(key, label, 'select', required),
  options,
});
const choice = (key: string, label: string, source: string, required = true): FormField => ({
  ...field(key, label, 'choice', required),
  source,
});
const rows = (key: string, label: string, fields: FormField[], required = true): FormField => ({
  ...field(key, label, 'rows', required),
  fields,
});
const qty = (key: string, label: string, min = 0.01, required = true): FormField => ({
  ...field(key, label, 'number', required),
  min,
});
const req = (key: string, label: string) => field(key, label, 'text', true);
const date = (key: string, label: string, required = true) => field(key, label, 'date', required);
const file = field('attachment', 'Attachment', 'attachment');
const priority = pick('priority', 'Priority', ['Normal', 'High', 'Urgent']);
const location = pick('location', 'Service location', ['Customer Site', 'CRYO Workshop']);
const employee = choice('employeeId', 'Technician', 'technicians');
const material = choice('materialId', 'Material', 'materials');
const coverage = pick('coverage', 'Parts coverage', ['Chargeable', 'Warranty-covered']);
const materialRows = [material, qty('quantity', 'Required quantity'), field('remarks', 'Notes')];
const testFields = [
  req('name', 'Test name'),
  field('expected', 'Expected result'),
  field('actual', 'Actual result'),
  pick('result', 'Result', ['Pending', 'Pass', 'Fail']),
  pick('required', 'Mandatory', ['Yes', 'No']),
  field('remarks', 'Remarks'),
];
export const serviceCreate = [
  choice('customerId', 'Customer', 'customers', false),
  choice('assetId', 'Delivered product', 'assets', false),
  field('customerName', 'Unverified customer name'),
  field('productName', 'Unverified equipment'),
  field('serial', 'Reported serial number'),
  field('contact', 'Contact person'),
  field('phone', 'Phone number'),
  location,
  req('problem', 'Problem description'),
  priority,
  date('preferred', 'Preferred visit date', false),
  file,
];
export const projectCreate = [
  req('name', 'Project name'),
  choice('productId', 'Existing product', 'products', false),
  field('productName', 'Product name'),
  field('category', 'Product category'),
  pick('type', 'Project type', ['New Development', 'Improvement', 'Research']),
  choice('employeeId', 'Assigned R&D employee', 'engineers'),
  date('start', 'Start date'),
  date('target', 'Target date', false),
  field('description', 'Description', 'long'),
  priority,
];
export const warrantyFields = [
  qty('duration', 'Warranty duration', 1),
  pick('unit', 'Unit', ['Months', 'Years']),
  pick('basis', 'Start basis', ['Delivery Date', 'Installation Date', 'Contract Date']),
  date('start', 'Installation or contract date', false),
  field('notes', 'Coverage notes', 'long'),
];
export interface Operation {
  label: string;
  module: string;
  permission: 'create' | 'edit' | 'verify' | 'confirm';
  tab: string;
  fields: FormField[];
}
const op = (
  label: string,
  module: string,
  permission: Operation['permission'],
  tab: string,
  fields: FormField[],
): Operation => ({ label, module, permission, tab, fields });
const movement = [
  choice('requestId', 'Material request', 'requests'),
  choice('materialId', 'Request line', 'lines'),
  qty('quantity', 'Quantity'),
];
export const serviceOps: Record<string, Operation> = {
  link: op('Verify equipment', 'service_requests', 'edit', 'Overview', [
    choice('assetId', 'Delivered product', 'assets'),
  ]),
  claim: op('Review warranty claim', 'service_warranty', 'verify', 'Overview', [
    pick('decision', 'Claim decision', [
      'Verification Required',
      'Potentially Covered',
      'Claim Approved',
      'Claim Rejected',
      'Out of Warranty',
    ]),
    field('reason', 'Decision reason'),
  ]),
  assign: op('Schedule technician', 'service_schedule', 'edit', 'Overview', [
    employee,
    date('date', 'Visit date'),
    field('time', 'Visit time', 'time', true),
    location,
    field('instructions', 'Instructions'),
  ]),
  checkIn: op('Check in', 'service_jobs', 'edit', 'Work Updates', []),
  update: op('Add work update', 'service_jobs', 'edit', 'Work Updates', [
    date('date', 'Service date'),
    field('problem', 'Problem found'),
    req('work', 'Work performed'),
    field('highlights', 'Highlight', 'list'),
    rows(
      'checks',
      'Inspection',
      [
        req('name', 'Inspection name'),
        pick('result', 'Result', ['Pending', 'Pass', 'Fail', 'Not Applicable']),
        field('remarks', 'Remarks'),
      ],
      false,
    ),
    pick('status', 'Work status', ['In Progress', 'Awaiting Parts', 'Ready for Inspection']),
    field('remarks', 'Remarks'),
    file,
  ]),
  checkOut: op('Check out', 'service_jobs', 'edit', 'Work Updates', [
    req('summary', 'Visit summary'),
    pick('status', 'Job status', ['Follow-up Required', 'Ready for Inspection', 'Awaiting Parts']),
  ]),
  receiveUnit: op('Receive workshop equipment', 'service_jobs', 'edit', 'Overview', [
    date('date', 'Received date'),
    req('condition', 'Condition at receipt'),
    field('serial', 'Verified serial number'),
    file,
  ]),
  returnUnit: op('Return workshop equipment', 'service_jobs', 'edit', 'Overview', [
    date('date', 'Return date'),
    req('recipient', 'Returned to'),
  ]),
  parts: op('Request spare parts', 'service_parts', 'create', 'Spare Parts', [
    rows('items', 'Material', [...materialRows, coverage]),
  ]),
  receive: op('Record physical receipt', 'service_parts', 'edit', 'Spare Parts', movement),
  use: op('Record parts used', 'service_parts', 'edit', 'Spare Parts', movement),
  return: op('Return unused parts', 'service_parts', 'edit', 'Spare Parts', movement),
  advance: op('Request advance', 'service_expenses', 'create', 'Expenses', [
    qty('amount', 'Amount'),
    field('description', 'Purpose'),
  ]),
  payAdvance: op('Record advance payment', 'service_verification', 'verify', 'Expenses', [
    choice('entryId', 'Advance request', 'advances'),
    req('reference', 'Payment reference'),
  ]),
  expense: op('Submit expense', 'service_expenses', 'create', 'Expenses', [
    date('date', 'Expense date'),
    pick('category', 'Expense type', [
      'Travel',
      'Food',
      'Accommodation',
      'Local Transport',
      'Tools / Consumables',
      'Other',
    ]),
    qty('amount', 'Amount'),
    field('description', 'Description'),
    pick('paidBy', 'Paid by', ['Technician', 'Company']),
    file,
  ]),
  verify: op('Verify expense', 'service_verification', 'verify', 'Expenses', [
    choice('entryId', 'Expense', 'expenses'),
    pick('decision', 'Decision', ['Approved', 'Rejected']),
    field('reason', 'Reason'),
  ]),
  settle: op('Record settlement', 'service_verification', 'verify', 'Expenses', [
    choice('employeeId', 'Technician', 'accounts'),
    pick('direction', 'Settlement', ['Reimbursement paid', 'Advance returned']),
    qty('amount', 'Amount'),
    req('reference', 'Settlement reference'),
  ]),
  charges: op('Save service charges', 'service_billing', 'edit', 'Billing', [
    rows('items', 'Charge', [
      pick('type', 'Type', ['Spare Parts', 'Labour', 'Visit Charges', 'Other Charges']),
      choice('part', 'Used spare part', 'usedParts', false),
      req('description', 'Description'),
      coverage,
      qty('amount', 'Amount', 0),
    ]),
    qty('discount', 'Discount', 0, false),
    qty('tax', 'Tax (%)', 0, false),
  ]),
  payment: op('Record customer payment', 'service_billing', 'confirm', 'Billing', [
    qty('amount', 'Amount'),
    req('reference', 'Receipt reference'),
    date('date', 'Payment date'),
  ]),
  complete: op('Complete service', 'service_jobs', 'confirm', 'Overview', [
    req('summary', 'Work summary'),
    req('condition', 'Final working condition'),
    req('inspection', 'Final inspection result'),
    field('acknowledgement', 'Customer acknowledgement'),
  ]),
};
export const projectOps: Record<string, Operation> = {
  specs: op('Save specifications', 'rnd_specs', 'edit', 'Specifications', [
    rows(
      'items',
      'Specification',
      [
        req('name', 'Specification name'),
        req('value', 'Value'),
        field('unit', 'Unit'),
        field('remarks', 'Remarks'),
      ],
      false,
    ),
    file,
  ]),
  bom: op('Save BOM', 'rnd_materials', 'edit', 'BOM / Materials', [
    rows('items', 'Material', materialRows, false),
  ]),
  request: op('Request materials', 'rnd_materials', 'create', 'BOM / Materials', []),
  receive: op('Record physical receipt', 'rnd_materials', 'edit', 'BOM / Materials', movement),
  use: op('Record prototype consumption', 'rnd_materials', 'edit', 'BOM / Materials', movement),
  update: op('Add daily update', 'rnd_updates', 'create', 'Daily Work Updates', [
    date('date', 'Work date'),
    {
      ...field('stages', 'Work stage', 'list', true),
      options: [
        'Research',
        'Design',
        'Material Preparation',
        'Prototype Development',
        'Testing',
        'Improvement',
      ],
    },
    field('highlights', 'Highlight', 'list'),
    req('notes', 'Progress notes'),
    field('issues', 'Issues'),
  ]),
  draft: op('Save draft test', 'rnd_testing', 'create', 'Testing & Inspection', [
    rows('items', 'Test', testFields),
    file,
  ]),
  test: op('Save test attempt', 'rnd_testing', 'create', 'Testing & Inspection', [
    rows('items', 'Test', testFields),
    file,
  ]),
  complete: op('Mark Successfully Completed', 'rnd_completion', 'confirm', 'Overview', [
    date('date', 'Completion date'),
    req('summary', 'Final summary'),
    file,
  ]),
};
