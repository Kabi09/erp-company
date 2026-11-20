import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Play, ShieldCheck, Wrench } from 'lucide-react';
import {
  Button,
  DataTable,
  ErrorBanner,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  StatusBadge,
  Tabs,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { ProductionOrder } from '../../types/erp';

export const ProductionOrdersListPage: React.FC<{ filterPreset?: 'all' | 'active' | 'completed' }> = ({
  filterPreset = 'all',
}) => {
  const { data } = useERP();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  if (!data) return null;

  const filtered = useMemo(() => {
    return data.productionOrders.filter((po) => {
      if (filterPreset === 'active' && po.status !== 'In Progress' && po.status !== 'Ready to Start') return false;
      if (filterPreset === 'completed' && po.status !== 'Completed') return false;
      if (filterPreset === 'all' && statusFilter !== 'All' && po.status !== statusFilter) return false;
      const q = search.trim().toLowerCase();
      return (
        !q ||
        po.docNo.toLowerCase().includes(q) ||
        po.salesOrderDocNo.toLowerCase().includes(q) ||
        po.customerName.toLowerCase().includes(q) ||
        po.productName.toLowerCase().includes(q)
      );
    });
  }, [data.productionOrders, filterPreset, statusFilter, search]);

  const title =
    filterPreset === 'active'
      ? 'Active Production'
      : filterPreset === 'completed'
        ? 'Completed Production'
        : 'Production Orders';

  const columns: ColumnDef<ProductionOrder>[] = [
    {
      key: 'docNo',
      header: 'Production Order',
      sortable: true,
      sortValue: (r) => r.docNo,
      render: (r) => (
        <div>
          <Link to={`/production/orders/${r.id}`} className="font-mono font-semibold text-xs text-purple-600 dark:text-purple-400 hover:underline">
            {r.docNo}
          </Link>
          <div className="text-[11px] text-slate-500">SO: {r.salesOrderDocNo}</div>
        </div>
      ),
    },
    {
      key: 'product',
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
      header: 'Planned Dates',
      render: (r) => (
        <div className="font-mono text-xs">
          <div>{r.plannedStartDate} → {r.plannedEndDate}</div>
          <div className="text-slate-500">{r.plannedDurationDays} days · Lead: {r.productionInCharge}</div>
        </div>
      ),
    },
    { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (r) => (
        <Button variant="secondary" size="sm" onClick={() => navigate(`/production/orders/${r.id}`)}>
          Open Details
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={title}
        subtitle="Click any production order to view Overview, BOM, Material Receipts, Daily Updates, QC, and Rework in one screen."
      />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search PROD ID, SO, customer, or product..."
        statuses={
          filterPreset === 'all'
            ? ['All', 'Planned', 'Awaiting Materials', 'Ready to Start', 'In Progress', 'QC Pending', 'Rework', 'Completed']
            : undefined
        }
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />
      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Link to={`/production/orders/${r.id}`} className="font-mono font-semibold text-sm text-purple-600 dark:text-purple-400">
                {r.docNo}
              </Link>
              <StatusBadge status={r.status} />
            </div>
            <div className="font-medium text-sm">{r.quantity}× {r.productName} ({r.model})</div>
            <div className="text-xs text-slate-500">{r.customerName} · {r.plannedStartDate} → {r.plannedEndDate}</div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => navigate(`/production/orders/${r.id}`)}>Open Details</Button>
            </div>
          </div>
        )}
      />
    </div>
  );
};

// ==========================================
// CENTRALIZED PRODUCTION ORDER DETAIL PAGE
// ==========================================

export const ProductionOrderDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refresh, toast, can } = useERP();

  const [tab, setTab] = useState('overview');
  const [startOpen, setStartOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [actualStartDate, setActualStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [completedQty, setCompletedQty] = useState(1);
  const [serialNumbersText, setSerialNumbersText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return null;
  const po = data.productionOrders.find((p) => p.id === id);
  if (!po) {
    return (
      <div className="space-y-4">
        <ErrorBanner message="Production order not found." />
        <Button variant="secondary" onClick={() => navigate('/production/orders')}>Back to Production Orders</Button>
      </div>
    );
  }

  const bom = data.boms.find((b) => b.productionOrderId === po.id);
  const mr = data.materialRequests.find((m) => m.productionOrderId === po.id);
  const issues = data.materialIssues.filter((m) => m.productionOrderId === po.id);
  const updates = data.dailyUpdates.filter((u) => u.productionOrderId === po.id);
  const qcs = data.qualityChecks.filter((q) => q.productionOrderId === po.id);
  const reworks = data.reworkOrders.filter((r) => r.productionOrderId === po.id);
  const history = data.activityLogs.filter((a) => a.entityDocNo === po.docNo || a.details.includes(po.docNo));

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await erpApi.startProduction(po.id, { actualStartDate });
      await refresh();
      toast('success', `Production started for ${po.docNo}`);
      setStartOpen(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to start production');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteMfg = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await erpApi.completeManufacturing(po.id, {
        completedQty,
        serialNumbers: serialNumbersText,
      });
      await refresh();
      toast('success', `Manufacturing completed for ${po.docNo}`, 'Moved to Quality Check queue.');
      setCompleteOpen(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to complete manufacturing');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAckReceipt = async (issueId: string) => {
    try {
      await erpApi.acknowledgeMaterialReceipt(issueId);
      await refresh();
      toast('success', 'Material receipt acknowledged', 'Production readiness recalculated.');
    } catch (error) {
      toast('error', 'Failed', error instanceof Error ? error.message : 'Error');
    }
  };

  // Contextual Next Action button based on current state
  const renderNextAction = () => {
    if (!can('production', 'edit')) return null;
    if (po.status === 'Planned') {
      return (
        <Button size="sm" onClick={() => navigate(`/production/bom?poId=${po.id}`)}>
          Prepare BOM & Request Materials
        </Button>
      );
    }
    if (po.status === 'Awaiting Materials') {
      const pendingAck = issues.find((i) => !i.receiptAcknowledged);
      if (pendingAck) {
        return (
          <Button size="sm" onClick={() => handleAckReceipt(pendingAck.id)}>
            Acknowledge Material Receipt ({pendingAck.docNo})
          </Button>
        );
      }
      return (
        <Button variant="secondary" size="sm" onClick={() => setTab('materials')}>
          Waiting on Supply Chain Issue
        </Button>
      );
    }
    if (po.status === 'Ready to Start') {
      return (
        <Button size="sm" variant="success" onClick={() => { setErr(null); setStartOpen(true); }}>
          <Play className="w-4 h-4" />
          Start Production
        </Button>
      );
    }
    if (po.status === 'In Progress') {
      return (
        <>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/production/daily-updates?create=1&poId=${po.id}`)}>
            <Wrench className="w-4 h-4" />
            Add Daily Update
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setCompletedQty(po.quantity);
              setSerialNumbersText('');
              setErr(null);
              setCompleteOpen(true);
            }}
          >
            <CheckCircle2 className="w-4 h-4" />
            Complete Manufacturing
          </Button>
        </>
      );
    }
    if (po.status === 'QC Pending') {
      return (
        <Button size="sm" onClick={() => navigate(`/production/quality-check?create=1&poId=${po.id}`)}>
          <ShieldCheck className="w-4 h-4" />
          Perform Quality Check
        </Button>
      );
    }
    if (po.status === 'Rework') {
      return (
        <Button size="sm" variant="danger" onClick={() => navigate('/production/rework')}>
          Open Rework Queue
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <button type="button" onClick={() => navigate('/production/orders')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Production Orders
        </button>
      </div>

      <PageHeader
        title={`${po.docNo} — ${po.productName} (${po.model})`}
        subtitle={`${po.customerName} · Sales Order ${po.salesOrderDocNo} · Qty: ${po.quantity} · In-Charge: ${po.productionInCharge}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={po.status} />
            {renderNextAction()}
          </div>
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview & Planning' },
          { key: 'materials', label: 'BOM & Materials', count: mr?.items.length || bom?.items.length || 0 },
          { key: 'daily', label: 'Daily Work Updates', count: updates.length },
          { key: 'qc', label: 'Quality Check & Rework', count: qcs.length + reworks.length },
          { key: 'history', label: 'Activity History', count: history.length },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold">Order Specifications</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">Sales Order</dt><dd className="font-mono"><Link to={`/tracking/${po.salesOrderId}`} className="text-blue-600 dark:text-blue-400 hover:underline">{po.salesOrderDocNo}</Link></dd></div>
              <div><dt className="text-xs text-slate-500">Quantity</dt><dd className="font-mono font-semibold">{po.quantity}</dd></div>
              <div><dt className="text-xs text-slate-500">QC Accepted / Dispatched</dt><dd className="font-mono">{po.qcAcceptedQty} / {po.dispatchedQty}</dd></div>
              <div><dt className="text-xs text-slate-500">Serial Numbers</dt><dd className="font-mono text-xs">{po.serialNumbers.length > 0 ? po.serialNumbers.join(', ') : 'Assigned on completion'}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-slate-500">Accepted Specifications</dt><dd className="text-xs mt-0.5">{po.specifications}</dd></div>
              {po.instructions && <div className="col-span-2"><dt className="text-xs text-slate-500">Manufacturing Instructions</dt><dd className="text-xs mt-0.5">{po.instructions}</dd></div>}
            </dl>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold">Schedule & Team</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">Planned Start</dt><dd className="font-mono">{po.plannedStartDate}</dd></div>
              <div><dt className="text-xs text-slate-500">Planned End</dt><dd className="font-mono">{po.plannedEndDate} ({po.plannedDurationDays}d)</dd></div>
              <div><dt className="text-xs text-slate-500">Actual Start</dt><dd className="font-mono">{po.actualStartDate || 'Not started'}</dd></div>
              <div><dt className="text-xs text-slate-500">Actual Completion</dt><dd className="font-mono">{po.actualCompletionDate || 'In progress'}</dd></div>
              <div><dt className="text-xs text-slate-500">Production In-Charge</dt><dd>{po.productionInCharge}</dd></div>
              <div><dt className="text-xs text-slate-500">Assigned Team</dt><dd className="text-xs">{po.assignedEmployees.join(', ') || '—'}</dd></div>
            </dl>
          </div>
        </div>
      )}

      {tab === 'materials' && (
        <div className="space-y-4">
          {!bom ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center">
              <p className="text-sm font-medium">No BOM prepared yet for {po.docNo}.</p>
              <div className="mt-3">
                <Button size="sm" onClick={() => navigate(`/production/bom?poId=${po.id}`)}>Prepare BOM Now</Button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-semibold text-sm mr-2">{bom.docNo}</span>
                  {mr && <span className="font-mono text-slate-500">MR: {mr.docNo} ({mr.status} · Receipt: {mr.receiptStatus})</span>}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="px-4 py-2">Material</th>
                      <th className="px-4 py-2 text-right">Required</th>
                      <th className="px-4 py-2 text-right">Issued by Store</th>
                      <th className="px-4 py-2 text-right">Received by Prod</th>
                      <th className="px-4 py-2 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(mr ? mr.items : bom.items.map((b) => ({ ...b, requiredQty: b.totalRequiredQty, issuedQty: 0, receivedQty: 0 }))).map((item) => {
                      const pending = Math.max(0, item.requiredQty - item.receivedQty);
                      return (
                        <tr key={item.materialId}>
                          <td className="px-4 py-2.5 font-medium">{item.materialCode} — {item.materialName}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{item.requiredQty} {item.unit}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{item.issuedQty}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">{item.receivedQty}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{pending}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {issues.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400">Store Material Issue Records</h3>
              {issues.map((mi) => (
                <div key={mi.id} className="p-3 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-mono font-semibold">{mi.docNo}</span> · Issued {mi.issueDate} by {mi.issuedBy}
                    <div className="text-slate-500 mt-0.5">{mi.items.map((i) => `${i.materialName} (${i.issuedQty})`).join(', ')}</div>
                  </div>
                  {mi.receiptAcknowledged ? (
                    <StatusBadge status="Fully Received" />
                  ) : (
                    <Button size="sm" onClick={() => handleAckReceipt(mi.id)}>Acknowledge Receipt</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'daily' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Daily Work Timeline</h2>
            {(po.status === 'In Progress' || po.status === 'Rework') && can('production', 'create') && (
              <Button size="sm" onClick={() => navigate(`/production/daily-updates?create=1&poId=${po.id}`)}>
                + Add Daily Update
              </Button>
            )}
          </div>
          {updates.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No daily work updates recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {updates.map((u) => (
                <div key={u.id} className="p-3.5 rounded border border-slate-200 dark:border-slate-800 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{u.stage} <span className="font-mono text-xs text-slate-500">· {u.workDate}</span></span>
                    <StatusBadge status={u.stageStatus} />
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 mt-1 text-xs">{u.workCompleted}</p>
                  <div className="text-xs text-slate-500 mt-1.5">
                    By {u.employeeName} · {u.workHours} hrs · Qty: {u.completedQty}
                    {u.issues && <span className="text-red-600 dark:text-red-400 ml-2">Issue: {u.issues}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'qc' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold">Quality Check Attempts ({qcs.length})</h2>
            {qcs.length === 0 ? (
              <p className="text-xs text-slate-500">No quality inspections logged yet.</p>
            ) : (
              qcs.map((q) => (
                <div key={q.id} className="p-3.5 rounded border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-sm">{q.docNo} (Attempt #{q.attemptNumber})</span>
                    <StatusBadge status={q.finalResult} />
                  </div>
                  <div className="text-slate-500">Inspector: {q.inspector} · Date: {q.inspectionDate} · Serials: {q.serialNumbers.join(', ')}</div>
                  {q.rejectionReason && <div className="text-red-700 dark:text-red-400 font-medium">Rejection: {q.rejectionReason}</div>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {q.checks.map((c, idx) => (
                      <div key={idx} className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 rounded">
                        <span>{c.name}</span>
                        <StatusBadge status={c.result} />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          {reworks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
              <h2 className="text-sm font-semibold">Rework History ({reworks.length})</h2>
              {reworks.map((r) => (
                <div key={r.id} className="p-3 rounded border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{r.docNo} (from {r.qcDocNo})</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div>Correction: {r.requiredCorrection}</div>
                  {r.completedWork && <div className="text-emerald-700 dark:text-emerald-400">Completed: {r.completedWork}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-2.5">
          {history.map((h) => (
            <div key={h.id} className="flex items-start justify-between text-xs pb-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{h.action} — {h.actorName}</div>
                <div className="text-slate-500 mt-0.5">{h.details}</div>
              </div>
              <span className="font-mono text-slate-400 shrink-0">{h.timestamp.slice(0, 16).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Start Production Modal */}
      <Modal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title={`Start Production — ${po.docNo}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button type="submit" form="start-prod-form" variant="success" loading={submitting}>Confirm Start</Button>
          </>
        }
      >
        <form id="start-prod-form" onSubmit={handleStart} className="space-y-3">
          {err && <ErrorBanner message={err} />}
          <Field label="Actual Start Date" required>
            <Input type="date" value={actualStartDate} onChange={(e) => setActualStartDate(e.target.value)} required />
          </Field>
          <p className="text-xs text-slate-500">Order will move to Active Production so daily work updates can be logged.</p>
        </form>
      </Modal>

      {/* Complete Manufacturing Modal */}
      <Modal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title={`Complete Manufacturing — ${po.docNo}`}
        subtitle="Moves order to Quality Check queue. Products cannot go to Logistics before QC acceptance."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button type="submit" form="comp-mfg-form" loading={submitting}>Send to Quality Check</Button>
          </>
        }
      >
        <form id="comp-mfg-form" onSubmit={handleCompleteMfg} className="space-y-3">
          {err && <ErrorBanner message={err} />}
          <Field label="Completed Manufacturing Quantity" required>
            <Input type="number" min={1} max={po.quantity} value={completedQty} onChange={(e) => setCompletedQty(Number(e.target.value))} required />
          </Field>
          <Field label="Serial Numbers (comma-separated, optional)" hint="Leave blank to auto-generate CRYO serial numbers.">
            <Input value={serialNumbersText} onChange={(e) => setSerialNumbersText(e.target.value)} placeholder="CRYO-ULT500-2603, CRYO-ULT500-2604" />
          </Field>
        </form>
      </Modal>
    </div>
  );
};
