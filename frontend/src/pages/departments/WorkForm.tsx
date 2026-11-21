import React, { useState } from 'react';
import { Button, Field, Input, Select, Textarea, ErrorBanner } from '../../components/ui';
import type { FormField, Values } from '../../../../shared/departmentForms';
import { serviceCreate, projectCreate } from '../../../../shared/departmentForms';
import { erpApi } from '../../services/api';

export type Options = Record<string, Values[]>;
const today = () => new Date().toLocaleDateString('en-CA');
function defaults(fields: FormField[], initial: Values = {}): Values {
  return Object.fromEntries(
    fields.map((f) => [
      f.key,
      initial[f.key] ??
        (f.kind === 'rows'
          ? f.required
            ? [defaults(f.fields!)]
            : []
          : f.kind === 'list'
            ? []
            : f.kind === 'select'
              ? f.options![0]
              : f.kind === 'date' && f.required
                ? today()
                : ''),
    ]),
  );
}
export const optionLabel = (x: Values) =>
  x.label || [x.docNo, x.name || x.productName, x.serial, x.unit].filter(Boolean).join(' · ') || x.id;
function Choice({
  id,
  f,
  value,
  items,
  onChange,
}: {
  id: string;
  f: FormField;
  value: string;
  items: Values[];
  onChange: (v: string) => void;
}) {
  const selected = items.find((x) => x.id === value);
  const [typed, setTyped] = useState('');
  const label = (x: Values) =>
    optionLabel(x) +
    (items.some((y) => y.id !== x.id && optionLabel(y) === optionLabel(x)) ? ' (' + x.id + ')' : '');
  if (items.length <= 20) {
    return (
      <Select
        id={id}
        value={selected?.id || ''}
        required={f.required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{items.length ? 'Select ' + f.label.toLowerCase() : 'No matching options'}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {label(item)}
          </option>
        ))}
      </Select>
    );
  }
  return (
    <>
      <Input
        id={id}
        list={id + '-list'}
        autoComplete="off"
        required={f.required}
        placeholder="Search or select…"
        value={selected ? label(selected) : typed}
        onChange={(e) => {
          setTyped(e.target.value);
          onChange(items.find((x) => label(x) === e.target.value)?.id || '');
        }}
        onBlur={(e) => e.target.setCustomValidity(!selected && typed ? 'Select a matching option.' : '')}
        onInput={(e) => e.currentTarget.setCustomValidity('')}
      />
      <datalist id={id + '-list'}>
        {items.map((x) => (
          <option key={x.id} value={label(x)} />
        ))}
      </datalist>
    </>
  );
}
function Fields({
  fields,
  data,
  set,
  options,
  prefix,
}: {
  fields: FormField[];
  data: Values;
  set: (d: Values) => void;
  options: Options;
  prefix: string;
}) {
  function change(key: string, v: any) {
    const next = { ...data, [key]: v };
    if (key === 'customerId') {
      next.assetId = '';
      next.customerName = '';
      next.serial = '';
      const c = options.customers?.find((x) => x.id === v);
      next.contact = c?.contactPerson || '';
      next.phone = c?.phone || '';
    }
    if (key === 'assetId' && !v) {
      const customer = options.customers?.find((x) => x.id === data.customerId);
      Object.assign(next, {
        serial: '',
        contact: customer?.contactPerson || '',
        phone: customer?.phone || '',
      });
    }
    if (key === 'assetId' && v) {
      const u = options.assets?.find((x) => x.id === v);
      if (u)
        Object.assign(next, {
          customerId: u.customerId,
          contact: u.contact || '',
          phone: u.phone || '',
          serial: u.serial || '',
        });
    }
    if (key === 'productId' && !v) Object.assign(next, { productName: '', category: '' });
    if (key === 'productId' && v) {
      const p = options.products?.find((x) => x.id === v);
      if (p) Object.assign(next, { productName: p.name, category: p.category });
    }
    if (key === 'employeeId' && 'direction' in data) {
      const account = options.accounts?.find((x) => x.id === v);
      next.direction = account?.toReturn ? 'Advance returned' : 'Reimbursement paid';
      next.amount = account?.toReturn || account?.toReimburse || '';
    }
    if (key === 'requestId') next.materialId = '';
    set(next);
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        if (f.key === 'part' && (data.type !== 'Spare Parts' || !options.usedParts?.length)) return null;
        if (
          data.assetId &&
          ['customerName', 'productName', 'serial'].includes(f.key) &&
          fields.some((f) => f.key === 'problem')
        )
          return null;
        const id = prefix + '-' + f.key,
          v = data[f.key] ?? '';
        if (f.kind === 'rows' || f.kind === 'list') {
          const values: any[] = v || [];
          return (
            <fieldset
              key={id}
              className="min-w-0 sm:col-span-2 space-y-2 border-t border-slate-200 dark:border-slate-700 pt-3"
            >
              <legend className="text-sm font-semibold">{f.label}</legend>
              {f.options && (
                <div className="flex flex-wrap gap-2">
                  {f.options.map((o) => (
                    <label key={o} className="text-xs">
                      <input
                        type="checkbox"
                        checked={values.includes(o)}
                        onChange={(e) =>
                          change(f.key, e.target.checked ? [...values, o] : values.filter((x) => x !== o))
                        }
                      />{' '}
                      {o}
                    </label>
                  ))}
                </div>
              )}
              {values.map((row, i) =>
                f.options?.includes(row) ? null : (
                  <div
                    key={i}
                    className="rounded border border-slate-200 dark:border-slate-700 p-3 space-y-2"
                  >
                    {f.kind === 'rows' ? (
                      <Fields
                        fields={f.fields!}
                        data={row}
                        options={options}
                        prefix={id + i}
                        set={(updated) =>
                          change(
                            f.key,
                            values.map((x, j) => (i === j ? updated : x)),
                          )
                        }
                      />
                    ) : (
                      <Input
                        aria-label={f.label + ' ' + (i + 1)}
                        value={row}
                        onChange={(e) =>
                          change(
                            f.key,
                            values.map((x, j) => (i === j ? e.target.value : x)),
                          )
                        }
                      />
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        change(
                          f.key,
                          values.filter((_, j) => i !== j),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ),
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => change(f.key, [...values, f.kind === 'rows' ? defaults(f.fields!) : ''])}
              >
                {f.options ? 'Add custom stage' : 'Add ' + f.label}
              </Button>
            </fieldset>
          );
        }
        let items = options[f.source!] || [];
        if (f.source === 'assets' && data.customerId)
          items = items.filter((x) => x.customerId === data.customerId);
        if (f.source === 'lines')
          items = (options.requests?.find((x) => x.id === data.requestId)?.items || []).map((x) => ({
            id: x.materialId,
            name: x.materialName,
            unit: x.unit,
          }));
        return (
          <Field key={id} label={f.label} required={f.required} htmlFor={id}>
            {f.kind === 'choice' ? (
              <Choice
                key={
                  id +
                  (f.source === 'assets'
                    ? data.customerId || ''
                    : f.source === 'lines'
                      ? data.requestId || ''
                      : '')
                }
                id={id}
                f={f}
                value={v}
                items={items}
                onChange={(x) => change(f.key, x)}
              />
            ) : f.kind === 'select' ? (
              <Select id={id} value={v} required={f.required} onChange={(e) => change(f.key, e.target.value)}>
                {f
                  .options!.filter((o) => f.key !== 'direction' || !data.employeeId || o === data.direction)
                  .map((o) => (
                    <option key={o}>{o}</option>
                  ))}
              </Select>
            ) : f.kind === 'long' ? (
              <Textarea id={id} value={v} onChange={(e) => change(f.key, e.target.value)} />
            ) : f.kind === 'attachment' ? (
              <Input
                id={id}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv"
                onChange={(e) => change(f.key, e.target.files?.[0])}
              />
            ) : (
              <Input
                id={id}
                type={f.kind}
                required={f.required}
                min={f.min}
                step={f.kind === 'number' ? '0.01' : undefined}
                value={v}
                onChange={(e) => change(f.key, e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
export default function WorkForm({
  fields,
  options,
  initial,
  label,
  module,
  id,
  onSave,
}: {
  fields: FormField[];
  options: Options;
  initial?: Values;
  label: string;
  module: string;
  id: string;
  onSave: (d: Values) => Promise<void>;
}) {
  const [data, set] = useState(() => defaults(fields, initial)),
    [manual, setManual] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const isRequest = fields === serviceCreate;
  const isProject = fields === projectCreate;
  const unit = options.assets?.find((x) => x.id === data.assetId);
  const customer = options.customers?.find((x) => x.id === data.customerId);
  const visibleFields = fields
    .filter((f) => {
      if (isRequest && ['productName', 'serial', 'customerName'].includes(f.key))
        return manual && (f.key !== 'customerName' || !customer);
      if (isRequest && f.key === 'assetId') return !manual;
      if (isRequest && ['contact', 'phone'].includes(f.key))
        return (
          manual ||
          (Boolean(unit) && !(unit?.[f.key] || customer?.[f.key === 'contact' ? 'contactPerson' : 'phone']))
        );
      if (isProject && f.key === 'productName' && data.productId) return false;
      if (f.key === 'start' && data.basis === 'Delivery Date') return false;
      return !(isProject && ['priority', 'type'].includes(f.key));
    })
    .map((f) =>
      isRequest &&
      ((f.key === 'assetId' && !manual) || (manual && ['productName', 'customerName'].includes(f.key)))
        ? { ...f, required: true }
        : f,
    );
  const known = isRequest
    ? [
        ['Customer', unit?.customerName || customer?.name],
        ['Contact', unit?.contact || customer?.contactPerson],
        ['Phone', unit?.phone || customer?.phone],
        ['Email', unit?.email || customer?.email],
        ['Address', unit?.address || customer?.shippingAddress || customer?.billingAddress],
        ...(unit
          ? [
              ['Product', unit.productName],
              ['Model', unit.model],
              ['Serial number', unit.serial],
              ['Sales order', unit.salesOrder],
              ['Production order', unit.productionOrder],
              ['Warranty', unit.warranty?.status],
              [
                'Warranty period',
                unit.warranty?.duration ? unit.warranty.duration + ' ' + unit.warranty.unit : '',
              ],
              ['Warranty expiry', unit.warranty?.end],
            ]
          : []),
      ]
    : [];
  return (
    <form
      className="space-y-4 dark:[color-scheme:dark]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          const body = { ...data };
          if (body.attachment instanceof File) {
            const form = new FormData();
            form.append('file', body.attachment);
            form.append('module', module);
            form.append('recordId', id);
            body.attachment = (await erpApi.uploadFile(form)).attachment.id;
            set(body);
          }
          await onSave(body);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {isRequest && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={manual}
            onChange={(e) => {
              setManual(e.target.checked);
              set({
                ...data,
                assetId: '',
                customerName: '',
                productName: '',
                serial: '',
                phone: customer?.phone || '',
                contact: customer?.contactPerson || '',
              });
            }}
          />
          Equipment is missing from the delivered register
        </label>
      )}
      <Fields fields={visibleFields} data={data} set={set} options={options} prefix={'edit-' + module} />
      {isProject && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Project type and priority</summary>
          <Fields
            fields={fields.filter((f) => ['type', 'priority'].includes(f.key))}
            data={data}
            set={set}
            options={options}
            prefix="project-options"
          />
        </details>
      )}
      {isRequest && (customer || unit) && (
        <dl className="grid gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 sm:grid-cols-2">
          {known.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="break-words text-sm">{value || 'Not recorded'}</dd>
            </div>
          ))}
        </dl>
      )}
      {!isRequest && unit && (
        <p className="text-sm">
          {[
            unit.productName,
            unit.serial,
            unit.salesOrder,
            unit.productionOrder,
            unit.address,
            unit.warranty.status,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {error && <ErrorBanner message={error} />}
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : label}
      </Button>
    </form>
  );
}
