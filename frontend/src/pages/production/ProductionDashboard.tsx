import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Factory,
  Layers,
  PackageCheck,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
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
import {
  calculateDurationDays,
  calculateProductionProgress,
  formatDate,
  getRemainingSOAllocatableQty,
  isProductionOrderDelayed,
} from '../../utils/erpLogic';

export const ProductionDashboard: React.FC = () => {
  const { data, can } = useERP();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    erpApi.getProductionSummary()
      .then((res) => {
        if (mounted) setSummary(res);
      })
      .catch(() => {
        // Fallback to ERPContext data if summary API encounters an issue
      });
    return () => {
      mounted = false;
    };
  }, [data]);

  if (!data) return null;

  const today = new Date().toISOString().slice(0, 10);
  const receivedSOs = data.salesOrders.filter(
    (so) =>
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
  const delayed = data.productionOrders.filter((p) => isProductionOrderDelayed(p, today));

  const stats = {
    receivedSOs: summary?.receivedSalesOrders ?? receivedSOs.length,
    planned: summary?.planned ?? planned.length,
    awaitingMat: summary?.awaitingMaterials ?? awaitingMat.length,
    ready: summary?.readyToStart ?? ready.length,
    active: summary?.inProduction ?? active.length,
    qcPending: summary?.pendingQualityChecks ?? qcPending.length,
    rework: summary?.activeReworkOrders ?? rework.length,
    completed: summary?.completed ?? completed.length,
    delayed: summary?.delayedOrders ?? delayed.length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Management"
        subtitle="Industrial manufacturing workspace for batch planning, BOM preparation, floor updates, and quality control."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {can('production', 'create') && (
              <Button size="sm" onClick={() => navigate('/production/received-orders')}>
                <Plus className="w-4 h-4" />
                Create Production Order
              </Button>
            )}
          </div>
        }
      />

      {/* Quick Actions Row */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 flex items-center gap-2 flex-wrap text-xs shadow-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1 flex items-center gap-1.5">
          <Factory className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Quick Operations:
        </span>
        <Button variant="secondary" size="sm" onClick={() => navigate('/production/received-orders')}>
          Received Sales Orders ({stats.receivedSOs})
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate('/production/bom')}>
          <Layers className="w-3.5 h-3.5" /> Prepare BOM
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate('/production/material-receipts')}>
          <PackageCheck className="w-3.5 h-3.5" /> Confirm Material Receipt
        </Button>
        {can('production', 'create') && (
          <Button variant="secondary" size="sm" onClick={() => navigate('/production/daily-updates?create=1')}>
            <Wrench className="w-3.5 h-3.5" /> Add Daily Update
          </Button>
        )}
        {can('production', 'create') && (
          <Button variant="secondary" size="sm" onClick={() => navigate('/production/quality-check?create=1')}>
            <ShieldCheck className="w-3.5 h-3.5" /> Perform QC
          </Button>
        )}
      </div>

      {/* 10 Operational Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Received Sales Orders"
          value={stats.receivedSOs}
          hint="Unallocated SO lines"
          tone={stats.receivedSOs > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/production/received-orders')}
        />
        <StatCard
          label="Awaiting Planning"
          value={stats.planned}
          hint="Need BOM setup"
          onClick={() => navigate('/production/orders?status=Planned')}
        />
        <StatCard
          label="Waiting for Materials"
          value={stats.awaitingMat}
          hint="Pending store issues"
          tone={stats.awaitingMat > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/production/material-receipts')}
        />
        <StatCard
          label="Ready to Start"
          value={stats.ready}
          hint="Materials received"
          tone={stats.ready > 0 ? 'success' : 'default'}
          onClick={() => navigate('/production/orders?status=Ready to Start')}
        />
        <StatCard
          label="Active Production"
          value={stats.active}
          hint="Currently on floor"
          onClick={() => navigate('/production/active')}
        />
        <StatCard
          label="QC Pending"
          value={stats.qcPending}
          hint="Awaiting inspection"
          tone={stats.qcPending > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/production/quality-check')}
        />
        <StatCard
          label="Rework Required"
          value={stats.rework}
          hint="Corrective actions"
          tone={stats.rework > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/production/rework')}
        />
        <StatCard
          label="Completed Batches"
          value={stats.completed}
          hint="Passed QA & ready"
          tone="success"
          onClick={() => navigate('/production/completed')}
        />
        <StatCard
          label="Delayed Orders"
          value={stats.delayed}
          hint="Past planned end date"
          tone={stats.delayed > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/production/planning?filter=delayed')}
        />
        <StatCard
          label="Duration Planning"
          value={data.productionOrders.length}
          hint="View timeline schedule"
          onClick={() => navigate('/production/planning')}
        />
      </div>

      {/* Urgent Orders & Floor Updates Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Active Orders Requiring Attention
            </h2>
            <button
              type="button"
              onClick={() => navigate('/production/orders')}
              className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              All orders <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.productionOrders.filter((p) => p.status !== 'Completed').length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">All manufacturing orders are completed.</p>
            ) : (
              data.productionOrders
                .filter((p) => p.status !== 'Completed')
                .slice(0, 6)
                .map((po) => {
                  const delayedFlag = isProductionOrderDelayed(po, today);
                  const progress = calculateProductionProgress(po, data.dailyUpdates);
                  return (
                    <div key={po.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/production/orders/${po.id}`)}
                            className="font-mono text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                          >
                            {po.docNo}
                          </button>
                          <span className="text-[11px] text-slate-500">({po.salesOrderDocNo})</span>
                          {delayedFlag && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                              OVERDUE
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-medium truncate">
                          {po.quantity}× {po.productName} ({po.model})
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span>Plan: {po.plannedStartDate} → {po.plannedEndDate} ({po.plannedDurationDays}d)</span>
                          <span>·</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{progress.label}</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <StatusBadge status={po.status} />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Wrench className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Recent Daily Production Updates
            </h2>
            <button
              type="button"
              onClick={() => navigate('/production/daily-updates')}
              className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Log update <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.dailyUpdates.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">No daily updates recorded yet.</p>
            ) : (
              data.dailyUpdates.slice(0, 6).map((du) => (
                <div key={du.id} className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-slate-500">
                      {du.productionOrderDocNo} · {du.workDate} · <span className="font-semibold text-slate-700 dark:text-slate-300">{du.stage}</span>
                    </div>
                    <div className="text-sm text-slate-900 dark:text-slate-100 mt-0.5 line-clamp-2">{du.workCompleted}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      By {du.employeeName} · {du.workHours}h
                      {du.issues && <span className="text-red-600 dark:text-red-400 ml-2 font-medium">Issue: {du.issues}</span>}
                    </div>
                  </div>
                  <StatusBadge status={du.stageStatus} />
                </div>
              ))
            )}
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
                <span className="font-medium">{it.productName} ({it.model})</span> · Ordered: <span className="font-mono">{it.quantity}</span> · Unallocated:{' '}
                <span className={`font-mono font-semibold ${rem > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`}>
                  {rem}
                </span>
              </div>
            );
          })}
        </div>
      ),
    },
    { key: 'deadline', header: 'Delivery Deadline', render: (r) => <span className="font-mono text-xs">{formatDate(r.promisedDeliveryDate)}</span> },
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
          <StatusBadge status="Fully Allocated" />
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Received Sales Orders"
        subtitle="Confirmed sales orders automatically received from Sales Management. Allocate production batches with duration planning."
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
              <div className="text-xs text-slate-500">Deadline: {formatDate(r.promisedDeliveryDate)}</div>
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
                      {it.productName} ({it.model}) — Unallocated: {getRemainingSOAllocatableQty(allocatingSO, it.productId, data.productionOrders)}
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
                          ? ' · Note: Exceeds customer delivery deadline'
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
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Special customer engineering specs, testing parameters..." />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
};

// ==========================================
// DURATION PLANNING & MANUFACTURING REPORTS
// ==========================================

export const ProductionPlanningReportsPage: React.FC<{ mode: 'planning' | 'reports' }> = ({ mode }) => {
  const { data, refresh, toast, can } = useERP();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [delayedOnly, setDelayedOnly] = useState(searchParams.get('filter') === 'delayed');

  // Reschedule Modal
  const [rescheduleOrder, setRescheduleOrder] = useState<ProductionOrder | null>(null);
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleErr, setRescheduleErr] = useState<string | null>(null);

  if (!data) return null;

  const today = new Date().toISOString().slice(0, 10);

  const qcPassRate = useMemo(() => {
    if (data.qualityChecks.length === 0) return 100;
    const passed = data.qualityChecks.filter((q) => q.finalResult === 'Accepted').length;
    return Math.round((passed / data.qualityChecks.length) * 100);
  }, [data.qualityChecks]);

  const openRescheduleModal = (po: ProductionOrder) => {
    setRescheduleOrder(po);
    setNewStartDate(po.plannedStartDate);
    setNewEndDate(po.plannedEndDate);
    setRescheduleReason('');
    setRescheduleErr(null);
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleOrder) return;
    setRescheduling(true);
    setRescheduleErr(null);
    try {
      await erpApi.rescheduleProductionOrder(rescheduleOrder.id, {
        newStartDate,
        newEndDate,
        reason: rescheduleReason,
      });
      await refresh();
      toast('success', `Schedule updated for ${rescheduleOrder.docNo}`);
      setRescheduleOrder(null);
    } catch (err) {
      setRescheduleErr(err instanceof Error ? err.message : 'Failed to reschedule order');
    } finally {
      setRescheduling(false);
    }
  };

  const filtered = useMemo(() => {
    return data.productionOrders.filter((po) => {
      if (delayedOnly && !isProductionOrderDelayed(po, today)) return false;
      if (statusFilter !== 'All' && po.status !== statusFilter) return false;
      const q = search.trim().toLowerCase();
      return (
        !q ||
        po.docNo.toLowerCase().includes(q) ||
        po.salesOrderDocNo.toLowerCase().includes(q) ||
        po.productName.toLowerCase().includes(q) ||
        po.customerName.toLowerCase().includes(q) ||
        po.productionInCharge.toLowerCase().includes(q)
      );
    });
  }, [data.productionOrders, delayedOnly, statusFilter, search, today]);

  const handleExportCSV = () => {
    if (mode === 'planning') {
      const headers = ['Order No', 'Sales Order', 'Customer', 'Product', 'Quantity', 'Planned Start', 'Planned End', 'Duration (Days)', 'In-Charge', 'Status', 'Overdue'];
      const rows = filtered.map((po) => [
        po.docNo,
        po.salesOrderDocNo,
        po.customerName,
        `"${po.productName} (${po.model})"`,
        po.quantity,
        po.plannedStartDate,
        po.plannedEndDate,
        po.plannedDurationDays,
        po.productionInCharge,
        po.status,
        isProductionOrderDelayed(po, today) ? 'YES' : 'NO',
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Production_Planning_${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['Prod Order', 'Product', 'Quantity', 'QC Accepted', 'QC Rejected', 'Dispatched', 'Actual Start', 'Completion Date', 'Status'];
      const rows = filtered.map((po) => [
        po.docNo,
        `"${po.productName} (${po.model})"`,
        po.quantity,
        po.qcAcceptedQty,
        po.qcRejectedQty,
        po.dispatchedQty,
        po.actualStartDate || '',
        po.actualCompletionDate || '',
        po.status,
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Production_Reports_${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const columns: ColumnDef<ProductionOrder>[] = [
    {
      key: 'docNo',
      header: 'Prod Order',
      render: (r) => (
        <div>
          <button
            type="button"
            onClick={() => navigate(`/production/orders/${r.id}`)}
            className="font-mono font-semibold text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
          >
            {r.docNo}
          </button>
          <div className="text-[11px] text-slate-500">SO: {r.salesOrderDocNo}</div>
        </div>
      ),
    },
    {
      key: 'prod',
      header: 'Product & Customer',
      render: (r) => (
        <div>
          <div className="font-medium">{r.quantity}× {r.productName} ({r.model})</div>
          <div className="text-xs text-slate-500">{r.customerName}</div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Planned Schedule',
      render: (r) => {
        const isOverdue = isProductionOrderDelayed(r, today);
        return (
          <div className="font-mono text-xs">
            <span className={isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
              {r.plannedStartDate} → {r.plannedEndDate}
            </span>
            {isOverdue && (
              <span className="ml-1.5 px-1 py-0.2 rounded text-[10px] bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                OVERDUE
              </span>
            )}
          </div>
        );
      },
    },
    { key: 'dur', header: 'Duration', align: 'right', render: (r) => <span className="font-mono text-xs">{r.plannedDurationDays}d</span> },
    { key: 'lead', header: 'In-Charge', render: (r) => <span className="text-xs">{r.productionInCharge}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/production/orders/${r.id}`)}>
            View
          </Button>
          {mode === 'planning' && r.status !== 'Completed' && can('production', 'edit') && (
            <Button variant="secondary" size="sm" onClick={() => openRescheduleModal(r)}>
              Reschedule
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === 'planning' ? 'Production Duration Planning' : 'Production & Quality Reports'}
        subtitle={
          mode === 'planning'
            ? 'Planned duration schedules, lead assignments, and delay tracking across manufacturing batches.'
            : 'Manufacturing output, QC pass/fail metrics, and rework cycle summaries.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportCSV}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {mode === 'reports' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Batches" value={data.productionOrders.length} />
          <StatCard label="Completed Batches" value={data.productionOrders.filter((p) => p.status === 'Completed').length} tone="success" />
          <StatCard label="QC First-Pass Rate" value={`${qcPassRate}%`} hint={`${data.qualityChecks.length} inspections`} />
          <StatCard label="Rework Cycles" value={data.reworkOrders.length} tone={data.reworkOrders.length > 0 ? 'warning' : 'default'} />
        </div>
      )}

      {mode === 'planning' && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={delayedOnly}
              onChange={(e) => setDelayedOnly(e.target.checked)}
              className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            Show Delayed / Overdue Orders Only ({data.productionOrders.filter((p) => isProductionOrderDelayed(p, today)).length})
          </label>
        </div>
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search order no, customer, product, or lead..."
        statuses={['All', 'Planned', 'Awaiting Materials', 'Ready to Start', 'In Progress', 'QC Pending', 'Rework', 'Completed']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable rows={filtered} columns={columns} />

      {/* Reschedule Modal */}
      <Modal
        open={Boolean(rescheduleOrder)}
        onClose={() => setRescheduleOrder(null)}
        title={`Reschedule Production Order — ${rescheduleOrder?.docNo || ''}`}
        subtitle="Adjust planned timeline with mandatory justification. Preserves audit history."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleOrder(null)}>Cancel</Button>
            <Button type="submit" form="reschedule-form" loading={rescheduling}>Save Reschedule</Button>
          </>
        }
      >
        {rescheduleOrder && (
          <form id="reschedule-form" onSubmit={handleReschedule} className="space-y-3.5">
            {rescheduleErr && <ErrorBanner message={rescheduleErr} />}
            <div className="grid grid-cols-2 gap-3 text-xs p-3 bg-slate-50 dark:bg-slate-950 rounded">
              <div>Current Start: <span className="font-mono font-medium">{rescheduleOrder.plannedStartDate}</span></div>
              <div>Current End: <span className="font-mono font-medium">{rescheduleOrder.plannedEndDate} ({rescheduleOrder.plannedDurationDays}d)</span></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="New Planned Start Date" required>
                <Input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} required />
              </Field>
              <Field
                label="New Planned Completion Date"
                required
                hint={
                  calculateDurationDays(newStartDate, newEndDate) > 0
                    ? `Duration: ${calculateDurationDays(newStartDate, newEndDate)} calendar days`
                    : 'End date must be on or after start date'
                }
              >
                <Input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} required />
              </Field>
            </div>
            <Field label="Rescheduling Reason" required>
              <Textarea
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="Reason for schedule adjustment (e.g., supplier material delay, customer design revision, power maintenance)..."
                required
              />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
};
