import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Factory } from 'lucide-react';
import {
  Button,
  DataTable,
  ErrorBanner,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { ProductionOrder, SalesOrder } from '../../types/erp';
import { calculateDurationDays, getRemainingSOAllocatableQty } from '../../utils/erpLogic';

export const ProductionDashboard: React.FC = () => {
  const { data } = useERP();
  const navigate = useNavigate();
  if (!data) return null;

  const receivedSOs = data.salesOrders.filter((so) =>
    so.commercialStatus === 'Confirmed' &&
    so.items.some((it) => getRemainingSOAllocatableQty(so, it.productId, data.productionOrders) > 0),
  );
  const planned = data.productionOrders.filter((p) => p.status === 'Planned');
  const awaitingMat = data.productionOrders.filter((p) => p.status === 'Awaiting Materials');
  const ready = data.productionOrders.filter((p) => p.status === 'Ready to Start');
  const active = data.productionOrders.filter((p) => p.status === 'In Progress');
  const qcPending = data.productionOrders.filter((p) => p.status === 'QC Pending');
  const rework = data.productionOrders.filter((p) => p.status === 'Rework');
  const completed = data.productionOrders.filter((p) => p.status === 'Completed');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Management"
        subtitle="Convert confirmed sales orders into planned production batches, manage BOMs, daily manufacturing updates, QC, and rework."
        actions={
          <Button size="sm" onClick={() => navigate('/production/received-orders')}>
            <Factory className="w-4 h-4" />
            Received Sales Orders ({receivedSOs.length})
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Received Sales Orders"
          value={receivedSOs.length}
          hint="Awaiting production order"
          tone={receivedSOs.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/production/received-orders')}
        />
        <StatCard label="Planned Orders" value={planned.length} hint="Need BOM submission" onClick={() => navigate('/production/orders')} />
        <StatCard
          label="Waiting for Materials"
          value={awaitingMat.length}
          hint="Pending store issue/receipt"
          tone={awaitingMat.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/production/material-receipts')}
        />
        <StatCard
          label="Ready to Start"
          value={ready.length}
          hint="All materials received"
          tone="success"
          onClick={() => navigate('/production/orders')}
        />
        <StatCard label="Active Production" value={active.length} onClick={() => navigate('/production/active')} />
        <StatCard
          label="Pending Quality Checks"
          value={qcPending.length}
          tone={qcPending.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/production/quality-check')}
        />
        <StatCard
          label="Rework Orders"
          value={rework.length}
          tone={rework.length > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/production/rework')}
        />
        <StatCard label="Completed Production" value={completed.length} tone="success" onClick={() => navigate('/production/completed')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Production Orders Requiring Attention</h2>
            <button
              type="button"
              onClick={() => navigate('/production/orders')}
              className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              All orders <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.productionOrders.filter((p) => p.status !== 'Completed').map((po) => (
              <div key={po.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/production/orders/${po.id}`)}
                    className="font-mono text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                  >
                    {po.docNo}
                  </button>
                  <span className="text-xs text-slate-500 ml-2">({po.salesOrderDocNo})</span>
                  <div className="text-sm font-medium truncate">{po.quantity}× {po.productName} ({po.model})</div>
                  <div className="text-xs text-slate-500">Plan: {po.plannedStartDate} → {po.plannedEndDate} ({po.plannedDurationDays}d)</div>
                </div>
                <StatusBadge status={po.status} />
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent Daily Production Updates</h2>
            <button
              type="button"
              onClick={() => navigate('/production/daily-updates')}
              className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Log update <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.dailyUpdates.slice(0, 5).map((du) => (
              <div key={du.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-mono text-slate-500">{du.productionOrderDocNo} · {du.workDate} · {du.stage}</div>
                  <div className="text-sm text-slate-900 dark:text-slate-100 mt-0.5">{du.workCompleted}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{du.employeeName} · {du.workHours}h</div>
                </div>
                <StatusBadge status={du.stageStatus} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

// ==========================================
// RECEIVED SALES ORDERS & CREATE PROD ORDER
// ==========================================

export const ReceivedSalesOrdersPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const [allocatingSO, setAllocatingSO] = useState<SalesOrder | null>(null);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [plannedStartDate, setPlannedStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [plannedEndDate, setPlannedEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [productionInCharge, setProductionInCharge] = useState('');
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [priority, setPriority] = useState<'Normal' | 'High' | 'Urgent'>('Normal');
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return null;

  const prodStaff = data.employees.filter((e) => e.department === 'production' || e.department === 'admin');

  const openCreateModal = (so: SalesOrder) => {
    const firstItem = so.items.find((it) => getRemainingSOAllocatableQty(so, it.productId, data.productionOrders) > 0) || so.items[0];
    const rem = getRemainingSOAllocatableQty(so, firstItem.productId, data.productionOrders);
    setAllocatingSO(so);
    setProductId(firstItem.productId);
    setQuantity(rem);
    setPriority(so.priority);
    setProductionInCharge(prodStaff[0]?.name || 'Kavitha Iyer');
    setAssignedEmployees(prodStaff.slice(0, 2).map((e) => e.name));
    setInstructions('');
    setErr(null);
  };

  const durationDays = calculateDurationDays(plannedStartDate, plannedEndDate);

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocatingSO) return;
    setErr(null);
    setSubmitting(true);
    try {
      const po: any = await erpApi.createProductionOrder({
        salesOrderId: allocatingSO.id,
        productId,
        quantity: Number(quantity),
        plannedStartDate,
        plannedEndDate,
        productionInCharge,
        assignedEmployees,
        priority,
        instructions,
      });
      await refresh();
      toast('success', `Production Order ${po.docNo} created`, `Duration: ${po.plannedDurationDays} days. Prepare BOM next.`);
      setAllocatingSO(null);
      navigate(`/production/orders/${po.id}`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create production order');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = data.salesOrders.filter((so) => {
    if (so.commercialStatus !== 'Confirmed') return false;
    const q = search.trim().toLowerCase();
    return !q || so.docNo.toLowerCase().includes(q) || so.customerSnapshot.name.toLowerCase().includes(q);
  });

  const columns: ColumnDef<SalesOrder>[] = [
    {
      key: 'docNo',
      header: 'Sales Order',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-xs">{r.docNo}</div>
          <div className="text-[11px] text-slate-500">Customer PO: {r.customerPoNumber}</div>
        </div>
      ),
    },
    { key: 'cust', header: 'Customer', render: (r) => r.customerSnapshot.name },
    {
      key: 'items',
      header: 'Product & Remaining Qty',
      render: (r) => (
        <div className="text-xs space-y-0.5">
          {r.items.map((it) => {
            const rem = getRemainingSOAllocatableQty(r, it.productId, data.productionOrders);
            return (
              <div key={it.id}>
                <span className="font-medium">{it.productName} ({it.model})</span> · Ordered: <span className="font-mono">{it.quantity}</span> · Unallocated: <span className="font-mono font-semibold">{rem}</span>
              </div>
            );
          })}
        </div>
      ),
    },
    { key: 'deadline', header: 'Delivery Deadline', render: (r) => <span className="font-mono text-xs">{r.promisedDeliveryDate}</span> },
    { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (r) => {
        const hasRem = r.items.some((it) => getRemainingSOAllocatableQty(r, it.productId, data.productionOrders) > 0);
        return hasRem && can('production', 'create') ? (
          <Button size="sm" onClick={() => openCreateModal(r)}>
            Create Production Order
          </Button>
        ) : (
          <StatusBadge status="Planned" />
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Received Sales Orders"
        subtitle="Confirmed sales orders automatically received from Sales Management. Create production orders with duration planning."
      />
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search SO number or customer..." />
      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => {
          const hasRem = r.items.some((it) => getRemainingSOAllocatableQty(r, it.productId, data.productionOrders) > 0);
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-sm">{r.docNo}</span>
                <StatusBadge status={r.priority} />
              </div>
              <div className="text-sm font-medium">{r.customerSnapshot.name}</div>
              <div className="text-xs text-slate-500">Deadline: {r.promisedDeliveryDate}</div>
              {hasRem && can('production', 'create') && (
                <Button size="sm" onClick={() => openCreateModal(r)}>Create Production Order</Button>
              )}
            </div>
          );
        }}
      />

      <Modal
        open={Boolean(allocatingSO)}
        onClose={() => setAllocatingSO(null)}
        title={`Create Production Order — ${allocatingSO?.docNo || ''}`}
        subtitle={`${allocatingSO?.customerSnapshot.name || ''} · Promised Delivery: ${allocatingSO?.promisedDeliveryDate || 'TBD'}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAllocatingSO(null)}>Cancel</Button>
            <Button type="submit" form="create-prod-form" loading={submitting}>Create Production Order</Button>
          </>
        }
      >
        {allocatingSO && (
          <form id="create-prod-form" onSubmit={handleCreatePO} className="space-y-3.5">
            {err && <ErrorBanner message={err} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Product Line" required>
                <Select value={productId} onChange={(e) => setProductId(e.target.value)} required>
                  {allocatingSO.items.map((it) => (
                    <option key={it.id} value={it.productId}>
                      {it.productName} ({it.model}) — Rem: {getRemainingSOAllocatableQty(allocatingSO, it.productId, data.productionOrders)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Production Quantity" required>
                <Input
                  type="number"
                  min={1}
                  max={getRemainingSOAllocatableQty(allocatingSO, productId, data.productionOrders)}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  required
                />
              </Field>
              <Field label="Planned Start Date" required>
                <Input type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} required />
              </Field>
              <Field
                label="Planned Completion Date"
                required
                hint={
                  durationDays > 0
                    ? `Calculated duration: ${durationDays} calendar day(s)${
                        allocatingSO.promisedDeliveryDate && plannedEndDate > allocatingSO.promisedDeliveryDate
                          ? ' · Warning: exceeds customer delivery commitment'
                          : ''
                      }`
                    : 'Completion date must be on or after start date'
                }
              >
                <Input type="date" value={plannedEndDate} onChange={(e) => setPlannedEndDate(e.target.value)} required />
              </Field>
              <Field label="Production In-Charge" required>
                <Select value={productionInCharge} onChange={(e) => setProductionInCharge(e.target.value)}>
                  {prodStaff.map((e) => (
                    <option key={e.id} value={e.name}>{e.name} ({e.designation})</option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </Select>
              </Field>
            </div>
            <Field label="Manufacturing Instructions">
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Special customer engineering specs, calibration notes..." />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
};

export const ProductionPlanningReportsPage: React.FC<{ mode: 'planning' | 'reports' }> = ({ mode }) => {
  const { data } = useERP();
  const navigate = useNavigate();
  if (!data) return null;

  const qcPassRate = useMemo(() => {
    if (data.qualityChecks.length === 0) return 100;
    const passed = data.qualityChecks.filter((q) => q.finalResult === 'Accepted').length;
    return Math.round((passed / data.qualityChecks.length) * 100);
  }, [data.qualityChecks]);

  const columns: ColumnDef<ProductionOrder>[] = [
    {
      key: 'docNo',
      header: 'Prod Order',
      render: (r) => (
        <button type="button" onClick={() => navigate(`/production/orders/${r.id}`)} className="font-mono font-semibold text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer">
          {r.docNo}
        </button>
      ),
    },
    { key: 'prod', header: 'Product & Customer', render: (r) => <div><div className="font-medium">{r.quantity}× {r.productName} ({r.model})</div><div className="text-xs text-slate-500">{r.customerName}</div></div> },
    { key: 'dates', header: 'Planned Schedule', render: (r) => <span className="font-mono text-xs">{r.plannedStartDate} → {r.plannedEndDate}</span> },
    { key: 'dur', header: 'Duration', align: 'right', render: (r) => <span className="font-mono text-xs">{r.plannedDurationDays} days</span> },
    { key: 'lead', header: 'In-Charge', render: (r) => <span className="text-xs">{r.productionInCharge}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === 'planning' ? 'Production Duration Planning' : 'Production & Quality Reports'}
        subtitle={
          mode === 'planning'
            ? 'Planned start/completion dates, durations, and assigned leads across all manufacturing batches.'
            : 'Manufacturing throughput, QC first-pass rate, and rework metrics.'
        }
      />
      {mode === 'reports' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Production Orders" value={data.productionOrders.length} />
          <StatCard label="Completed Batches" value={data.productionOrders.filter((p) => p.status === 'Completed').length} tone="success" />
          <StatCard label="QC Pass Rate" value={`${qcPassRate}%`} hint={`${data.qualityChecks.length} inspections`} />
          <StatCard label="Rework Cycles" value={data.reworkOrders.length} tone={data.reworkOrders.length > 0 ? 'warning' : 'default'} />
        </div>
      )}
      <DataTable rows={data.productionOrders} columns={columns} />
    </div>
  );
};
