import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Button,
  DataTable,
  ErrorBanner,
  Input,
  LoadingSkeleton,
  Modal,
  PageHeader,
  StatusBadge,
  Tabs,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { DEPARTMENTS, type NavItem } from '../../config/navigation';
import { API_BASE, getAuthToken, request } from '../../services/api';
import {
  projectCreate,
  projectOps,
  serviceCreate,
  serviceOps,
  warrantyFields,
  type Values,
} from '../../../../shared/departmentForms';
import WorkForm, { type Options } from './WorkForm';

type Row = Values & { id: string };
const panel = 'rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
const linkClass = 'text-blue-700 dark:text-blue-300 hover:underline';
const title = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s) => s.toUpperCase());
const closed = (s: string) => ['Completed', 'Successfully Completed'].includes(s);
async function download(path: string, name: string) {
  const res = await fetch(API_BASE + path, { headers: { Authorization: 'Bearer ' + getAuthToken() } });
  if (!res.ok) throw new Error('Download unavailable.');
  const url = URL.createObjectURL(await res.blob()),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Facts({ values, names = {} }: { values: Values; names?: Record<string, string> }) {
  const { toast } = useERP();
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {Object.entries(values)
        .filter(
          ([k]) =>
            ![
              '_id',
              '__v',
              'id',
              'assetId',
              'identifiable',
              'deliveryId',
              'reviewedBy',
              'createdAt',
              'updatedAt',
            ].includes(k),
        )
        .map(([k, v]) => {
          if (k === 'attachment' && !v) return null;
          return (
            <div key={k} className={'min-w-0 ' + (typeof v === 'object' ? 'sm:col-span-2' : '')}>
              <dt className="text-xs text-slate-500">{title(k)}</dt>
              <dd className="text-sm break-words">
                {k === 'attachment' ? (
                  <button
                    className={linkClass}
                    onClick={() =>
                      download('/files/' + v + '/download', 'attachment').catch((e) =>
                        toast('error', e.message),
                      )
                    }
                  >
                    Download attachment
                  </button>
                ) : Array.isArray(v) ? (
                  v.length ? (
                    v.map((x, i) => (
                      <div key={i} className="border-l-2 pl-3 my-2">
                        {typeof x === 'object' ? <Facts values={x} names={names} /> : String(x)}
                      </div>
                    ))
                  ) : (
                    '—'
                  )
                ) : v && typeof v === 'object' ? (
                  <Facts values={v} names={names} />
                ) : typeof v === 'boolean' ? (
                  v ? (
                    'Yes'
                  ) : (
                    'No'
                  )
                ) : (
                  names[v] || String(v ?? '').trim() || '—'
                )}
              </dd>
            </div>
          );
        })}
    </dl>
  );
}
export default function DepartmentPage({ item }: { item: NavItem }) {
  const { id } = useParams(),
    [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const { user, can, toast } = useERP();
  const service = item.path.startsWith('/service'),
    asset = item.path.endsWith('delivered-products'),
    dept = service ? 'service' : 'rnd';
  const base = service ? '/service/jobs' : '/rnd/projects',
    ops = service ? serviceOps : projectOps;
  const home = item.path === '/' + dept,
    report = item.path.endsWith('/reports'),
    schedule = item.path.endsWith('/schedule');
  const creatingModule = service ? 'service_requests' : 'rnd_projects',
    createLabel = service ? 'New service request' : 'New R&D project';
  const [rows, setRows] = useState<Row[]>([]),
    [record, setRecord] = useState<Row | null>(null),
    [options, setOptions] = useState<Options>({});
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    [query, setQuery] = useState('');
  const [form, setForm] = useState(''),
    [newId, setNewId] = useState(''),
    [tab, setTab] = useState('Overview');
  const defaultTab: Record<string, string> = {
    rnd_specs: 'Specifications',
    rnd_materials: 'BOM / Materials',
    rnd_updates: 'Daily Work Updates',
    rnd_testing: 'Testing & Inspection',
    service_parts: 'Spare Parts',
    service_expenses: 'Expenses',
    service_billing: 'Billing',
    service_verification: 'Expenses',
  };
  useEffect(() => {
    setTab(defaultTab[item.module!] || 'Overview');
    setForm('');
    setQuery('');
  }, [id, item.path, item.module]);
  useEffect(() => {
    if (params.get('create') === '1' && can(creatingModule, 'create')) {
      setNewId(crypto.randomUUID());
      setForm('create');
      setParams({}, { replace: true });
    }
  }, [params, creatingModule, can, setParams]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    const suffix = '?module=' + item.module;
    const work = asset
      ? request<Row[]>(item.path)
      : request<Row[] | Row>(base + (id ? '/' + encodeURIComponent(id) : '') + suffix);
    Promise.all([work, asset ? {} : request<Options>('/' + dept + '/options' + suffix)])
      .then(([value, opts]) => {
        if (!live) return;
        setOptions(opts);
        if (Array.isArray(value)) {
          setRows(value);
          setRecord(id ? value.find((x) => x.id === id) || null : null);
        } else setRecord(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [base, dept, id, item.path, item.module, asset, reload, user]);
  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} onRetry={() => setReload((x) => x + 1)} />;
  if (id && !record) return <ErrorBanner message="Record unavailable." />;
  const r = record,
    entries: Values[] = r?.entries || [],
    people = options.technicians?.length ? options.technicians : options.engineers || [];
  const names = Object.fromEntries(
    [...people, ...(options.materials || []), ...(options.products || []), ...(options.customers || [])].map(
      (x) => [x.id, x.name],
    ),
  );
  const viewPath = home || report ? (service ? '/service/jobs' : '/rnd/projects') : item.path;
  const canOpen = !(home || report) || can(service ? 'service_jobs' : 'rnd_projects');
  const go = (r: Row) => viewPath + '/' + encodeURIComponent(r.id);
  const matches = (r: Row) =>
    !query ||
    Object.values(r)
      .filter((v) => typeof v === 'string')
      .some((v) => v.toLowerCase().includes(query.toLowerCase()));
  const visible = rows.filter(
    (r) =>
      matches(r) &&
      (!item.path.endsWith('/completed') || closed(r.status)) &&
      (!schedule || (r.schedule && !closed(r.status))),
  );
  const create = () => {
    setNewId(crypto.randomUUID());
    setForm('create');
  };
  const latest = (action: string) => [...entries].reverse().find((e) => e.action === action);
  const openVisit =
    entries.filter((e) => e.action === 'checkIn').length >
    entries.filter((e) => e.action === 'checkOut').length;
  const location = r?.location || latest('assign')?.data.location || r?.details?.location;
  const custody = [...entries]
    .reverse()
    .find((e) => ['receiveUnit', 'returnUnit'].includes(e.action))?.action;
  const available = (key: string) => {
    const op = ops[key];
    if (!r || !can(op.module, op.permission)) return false;
    if (r.status === 'Pending Completion Approval') return false;
    if (
      closed(r.status) &&
      !(service && (['Expenses', 'Billing'].includes(op.tab) || ['receive', 'use', 'return'].includes(key)))
    )
      return false;
    if (key === 'checkIn' || key === 'checkOut')
      return r.employeeId === user?.id && (key === 'checkIn' ? !openVisit : openVisit);
    if (service && ['assign', 'complete'].includes(key) && openVisit) return false;
    if (service && ['complete', 'advance', 'expense'].includes(key) && !r.employeeId) return false;
    if (service && key === 'complete' && location === 'CRYO Workshop' && custody !== 'returnUnit')
      return false;
    if (key === 'link') return !r.details.identifiable;
    if (['receiveUnit', 'returnUnit'].includes(key))
      return (
        location === 'CRYO Workshop' &&
        (key === 'receiveUnit' ? custody !== 'receiveUnit' : custody === 'receiveUnit')
      );
    return true;
  };
  const tabs = Array.from(
    new Set([
      'Overview',
      ...Object.values(ops)
        .filter((o) => can(o.module))
        .map((o) => o.tab),
      'History',
    ]),
  );
  const newForm = form === 'create',
    termsForm = form === 'warranty',
    operation = ops[form];
  const pending = (action: string, done: string) =>
    entries
      .filter(
        (e) =>
          e.action === action &&
          e.actor !== user?.id &&
          e.employeeId !== user?.id &&
          !entries.some((x) => x.action === done && x.data.entryId === e.id),
      )
      .map((e) => ({
        id: e.id,
        label: [names[e.employeeId], e.data.category, e.data.amount, e.at.slice(0, 10)]
          .filter(Boolean)
          .join(' · '),
      }));
  const formOptions = {
    ...options,
    assets:
      form === 'link'
        ? options.assets?.filter(
            (u) => u.identifiable && (!r?.details?.customerId || r.details.customerId === u.customerId),
          )
        : options.assets,
    requests: (r?.requests || [])
      .map((m) => ({
        ...m,
        items: m.items.filter((i) =>
          form === 'receive'
            ? i.issuedQty > i.receivedQty
            : !['return', 'use'].includes(form) || i.receivedQty > (i.usedQty || 0) + (i.returnedQty || 0),
        ),
      }))
      .filter((m) => m.items.length),
    usedParts: (r?.requests || []).flatMap((m) =>
      m.items
        .filter((i) => i.usedQty > 0)
        .map((i) => ({
          id: m.id + '/' + i.materialId,
          label: [m.docNo, i.materialName, i.coverage].filter(Boolean).join(' · '),
        })),
    ),
    accounts: (r?.accounts || [])
      .filter((a) => a.toReturn || a.toReimburse)
      .map((a) => ({
        id: a.employeeId,
        name: names[a.employeeId],
        toReturn: a.toReturn,
        toReimburse: a.toReimburse,
      })),
    advances: pending('advance', 'payAdvance'),
    expenses: pending('expense', 'verify'),
  };
  const sourceEntry =
    form === 'test' || form === 'draft'
      ? [...entries].reverse().find((e) => ['draft', 'test'].includes(e.action))
      : latest(form);
  const initial = termsForm
    ? r?.warranty
    : ['specs', 'bom', 'draft', 'test', 'charges', 'assign'].includes(form)
      ? sourceEntry?.data ||
        (form === 'assign' ? { location, date: r?.details?.preferred || undefined } : undefined)
      : undefined;
  const modal = (newForm || termsForm || operation) && (
    <Modal
      open={!!form}
      onClose={() => setForm('')}
      title={newForm ? createLabel : termsForm ? 'Confirm warranty terms' : operation.label}
    >
      <WorkForm
        key={form}
        id={newForm ? newId : r?.id || ''}
        module={newForm ? creatingModule : termsForm ? 'service_warranty' : operation.module}
        fields={
          newForm
            ? service
              ? serviceCreate
              : projectCreate
            : termsForm
              ? warrantyFields
              : operation.fields
                  .filter((f) => f.key !== 'acknowledgement' || location === 'Customer Site')
                  .map((f) => (f.key === 'acknowledgement' ? { ...f, required: true } : f))
        }
        options={formOptions}
        initial={initial}
        label={newForm ? 'Create' : termsForm ? 'Save terms' : operation.label}
        onSave={async (values) => {
          const path = newForm ? base : termsForm ? '/service/warranty' : base + '/' + id + '/' + form;
          const result = await request<Values>(path, {
            method: 'POST',
            body: JSON.stringify({
              ...values,
              ...(newForm ? { id: newId } : termsForm ? { assetId: id } : { revision: r!.revision }),
            }),
          });
          setForm('');
          toast('success', newForm ? result.docNo + ' created' : 'Saved');
          if (newForm) navigate((service ? '/service/requests/' : '/rnd/projects/') + result.id);
          else setReload((x) => x + 1);
        }}
      />
    </Modal>
  );
  if (id && r && asset) {
    const { id: unitId, customerId, history, warranty, terms, ...facts } = r;
    return (
      <div className="space-y-4">
        <Link className={linkClass} to={item.path}>
          Delivered Products
        </Link>
        <PageHeader
          title={r.productName || 'Delivered equipment'}
          subtitle={r.serial || r.deliveryOrder}
          actions={
            service &&
            r.identifiable &&
            can('service_warranty', 'verify') && (
              <Button onClick={() => setForm('warranty')}>Confirm warranty terms</Button>
            )
          }
        />
        <section className={panel}>
          <Facts
            values={{
              ...facts,
              serial: r.serial || 'Not recorded',
              manufacturingDate: r.manufacturingDate || 'Not recorded',
              deliveryDate: r.deliveryDate || 'Not recorded',
              salesOrder: r.salesOrder || 'Not recorded',
              productionOrder: r.productionOrder || 'Not recorded',
            }}
          />
        </section>
        <section className={panel}>
          <h2 className="font-semibold mb-3">Warranty</h2>
          <Facts values={{ ...warranty, duration: warranty.duration ?? 'Not recorded' }} />
        </section>
        <section className={panel}>
          <h2 className="font-semibold mb-3">Service history</h2>
          {history.length
            ? history.map((h) => (
                <p key={h.id}>
                  {can('service_jobs') ? (
                    <Link className={linkClass} to={'/service/jobs/' + h.id}>
                      {h.docNo}
                    </Link>
                  ) : (
                    h.docNo
                  )}{' '}
                  · {h.status} {h.shipmentOnly && '(Shipment-level record; individual unit unverified)'}
                </p>
              ))
            : 'No recorded service history.'}
        </section>
        {modal}
      </div>
    );
  }
  if (id && r) {
    const actions = Object.keys(ops).filter((k) => {
      if (ops[k].tab !== tab || !available(k)) return false;
      if (k === 'verify') return formOptions.expenses.length > 0;
      if (k === 'payAdvance') return formOptions.advances.length > 0;
      if (k === 'settle') return formOptions.accounts.length > 0;
      if (k === 'payment') return r.billing?.outstanding > 0;
      if (k === 'receive') return r.requests?.some((m) => m.items.some((i) => i.issuedQty > i.receivedQty));
      if (k === 'return' || k === 'use')
        return r.requests?.some((m) =>
          m.items.some((i) => i.receivedQty > (i.usedQty || 0) + (i.returnedQty || 0)),
        );
      if (k === 'request')
        return latest('bom')?.data.items?.some(
          (i) =>
            i.quantity >
            (r.requests || [])
              .filter((m) => m.status !== 'Cancelled')
              .flatMap((m) => m.items)
              .filter((l) => l.materialId === i.materialId)
              .reduce((s, l) => s + l.requiredQty, 0),
        );
      return true;
    });
    const history = entries.filter((e) => tab === 'History' || ops[e.action]?.tab === tab);
    return (
      <div className="space-y-4">
        <Link className={linkClass} to={item.path}>
          {item.label}
        </Link>
        <PageHeader
          title={r.docNo + ' · ' + r.name}
          subtitle={[r.status, names[r.employeeId]].filter(Boolean).join(' · ')}
          actions={
            service &&
            closed(r.status) &&
            can('service_jobs') && (
              <Button
                onClick={() =>
                  download(base + '/' + id + '/report/pdf', r.docNo + '.pdf').catch((e) =>
                    toast('error', e.message),
                  )
                }
              >
                Download service report
              </Button>
            )
          }
        />
        <Tabs tabs={tabs.map((k) => ({ key: k, label: k }))} active={tab} onChange={setTab} />
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((k, i) => (
              <Button key={k} size="sm" variant={i ? 'secondary' : 'primary'} onClick={() => setForm(k)}>
                {ops[k].label}
              </Button>
            ))}
          </div>
        )}
        {tab === 'Overview' && (
          <div className={panel}>
            <Facts
              values={{
                ...r.details,
                ...(location ? { location } : {}),
                assignedTo: names[r.employeeId] || 'Unassigned',
              }}
              names={names}
            />
          </div>
        )}
        {tab === 'Expenses' &&
          r.accounts.map((a) => (
            <section key={a.employeeId} className={panel}>
              <h2 className="font-semibold mb-3">{names[a.employeeId] || 'Technician account'} · INR</h2>
              <Facts
                values={{
                  advanceReceived: a.advances,
                  totalVerifiedExpenses: a.verifiedExpenses,
                  technicianPaidExpenses: a.eligible,
                  amountAlreadySettled: a.alreadySettled,
                  reimbursementDue: a.toReimburse,
                  advanceToReturn: a.toReturn,
                }}
              />
            </section>
          ))}
        {tab === 'Billing' && r.billing && (
          <div className={panel}>
            <Facts values={r.billing} />
          </div>
        )}
        {['Spare Parts', 'BOM / Materials'].includes(tab) &&
          r.requests?.map((m) => (
            <section key={m.id} className={panel}>
              <h2 className="font-semibold">
                {m.docNo} · {m.status}
              </h2>
              {m.items.map((i) => (
                <div className="py-2" key={i.materialId}>
                  <strong>
                    {i.materialName} ({i.unit})
                  </strong>
                  <Facts
                    values={{
                      requested: i.requiredQty,
                      issued: i.issuedQty,
                      received: i.receivedQty,
                      used: i.usedQty || 0,
                      returned: i.returnedQty || 0,
                      coverage: i.coverage,
                    }}
                  />
                </div>
              ))}
            </section>
          ))}
        {history.map((e) => (
          <article className={panel} key={e.id}>
            <div className="flex justify-between flex-wrap mb-3">
              <strong>{ops[e.action]?.label || title(e.action)}</strong>
              <small>
                {e.actorName} · {new Date(e.at).toLocaleString()}
              </small>
            </div>
            <Facts values={e.data || {}} names={names} />
          </article>
        ))}
        {!history.length && tab !== 'Overview' && (
          <p className="text-sm text-slate-500">No entries recorded.</p>
        )}
        {modal}
      </div>
    );
  }
  const createAllowed = !asset && (item.module === creatingModule || home) && can(creatingModule, 'create');
  const columns = asset
    ? [
        {
          key: 'productName',
          header: 'Equipment',
          render: (r: Row) => (
            <Link className={linkClass} to={go(r)}>
              {r.productName || 'Delivered equipment'}
            </Link>
          ),
        },
        { key: 'customerName', header: 'Customer', render: (r: Row) => r.customerName },
        {
          key: 'serial',
          header: 'Serial / quantity',
          render: (r: Row) => r.serial || r.quantity + ' delivered',
        },
        {
          key: 'warranty',
          header: 'Warranty',
          render: (r: Row) => <StatusBadge status={r.warranty.status} />,
        },
      ]
    : [
        {
          key: 'docNo',
          header: 'Reference',
          render: (r: Row) =>
            !canOpen ? (
              r.docNo
            ) : (
              <Link className={linkClass} to={go(r)}>
                {r.docNo}
              </Link>
            ),
        },
        { key: 'name', header: service ? 'Customer / equipment' : 'Project', render: (r: Row) => r.name },
        {
          key: 'employeeId',
          header: service ? 'Technician' : 'Assigned to',
          render: (r: Row) => names[r.employeeId] || 'Unassigned',
        },
        { key: 'status', header: 'Status', render: (r: Row) => <StatusBadge status={r.status} /> },
      ];
  if (report)
    columns.push({
      key: 'activity',
      header: service ? 'Visits / updates' : 'Tests / updates',
      render: (r: Row) => (
        <span>
          {service ? r.visits : r.testAttempts} / {r.workUpdates}
        </span>
      ),
    });
  if (schedule)
    columns.push({
      key: 'schedule',
      header: 'Next visit',
      render: (r: Row) => [r.schedule?.date, r.schedule?.time].join(' '),
    });
  const counts = Object.entries(
    rows.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  );
  return (
    <div className="space-y-4">
      <PageHeader
        title={home ? DEPARTMENTS[dept].label + ' Dashboard' : item.label}
        actions={
          report && can(dept + '_reports', 'export') ? (
            <Button
              onClick={() =>
                download('/' + dept + '/reports.csv', dept + '-report.csv').catch((e) =>
                  toast('error', e.message),
                )
              }
            >
              Export CSV
            </Button>
          ) : (
            createAllowed && <Button onClick={create}>{createLabel}</Button>
          )
        }
      />
      {(home || report) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[['Total', rows.length], ...counts].map(([k, v]) => (
            <div key={k} className={panel}>
              <div className="text-xs text-slate-500">{k}</div>
              <strong className="text-2xl">{v}</strong>
            </div>
          ))}
        </div>
      )}
      <Input
        aria-label="Search records"
        placeholder={
          asset ? 'Search product, customer, serial or order…' : 'Search by name, reference or status…'
        }
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <DataTable
        rows={visible}
        columns={columns}
        emptyTitle={asset ? 'No confirmed deliveries' : 'No matching records'}
        emptyDescription={
          asset
            ? 'Equipment appears after delivery confirmation.'
            : 'Records you have access to will appear here.'
        }
        renderMobileCard={(r) =>
          !canOpen ? (
            <div className="p-3">
              {r.docNo} · {r.name} · {r.status}
            </div>
          ) : (
            <Link to={go(r)} className="block p-3">
              <strong>{asset ? r.productName : r.docNo}</strong>
              <div>
                {asset
                  ? [r.customerName, r.serial, r.warranty.status].filter(Boolean).join(' · ')
                  : r.name + ' · ' + r.status}
              </div>
              {schedule && [r.schedule?.date, r.schedule?.time].join(' ')}
            </Link>
          )
        }
      />
      {modal}
    </div>
  );
}
