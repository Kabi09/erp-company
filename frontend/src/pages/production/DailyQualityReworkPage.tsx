import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, CheckCircle2, Plus, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import {
  Button,
  DataTable,
  Field,
  FileUploadInput,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { formatDate } from '../../utils/erpLogic';
import type { DailyProductionUpdate, QCCheckItem, QualityCheck, ReworkOrder } from '../../types/erp';

const DEFAULT_QC_CHECKS: QCCheckItem[] = [
  { name: 'Visual & Mechanical Fabrication Inspection', result: 'Pass', observation: '' },
  { name: 'Electrical Insulation & Controller Safety Check', result: 'Pass', observation: '' },
  { name: 'Thermal Pull-Down & Stability Performance Test', result: 'Pass', observation: '' },
  { name: 'Product-Specific Calibration & Alarm Verification', result: 'Pass', observation: '' },
];

export const DailyUpdatesPage: React.FC = () => {
  const { data: db, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [poId, setPoId] = useState('');
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [stage, setStage] = useState('');
  const [workCompleted, setWorkCompleted] = useState('');
  const [workHours, setWorkHours] = useState('8');
  const [completedQty, setCompletedQty] = useState('0');
  const [stageStatus, setStageStatus] = useState<'Pending' | 'In Progress' | 'Completed' | 'Blocked'>('In Progress');
  const [issues, setIssues] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');

  const activePOs = useMemo(
    () => (db ? db.productionOrders.filter((p) => p.status === 'In Progress' || p.status === 'Rework') : []),
    [db],
  );

  const selectedPo = db?.productionOrders.find((p) => p.id === poId);
  const productStages = useMemo(() => {
    if (!db || !selectedPo) return ['Fabrication', 'Assembly', 'Electrical Integration', 'Testing'];
    const prod = db.products.find((pr) => pr.id === selectedPo.productId);
    return prod?.stages.length ? prod.stages : ['Fabrication', 'Assembly', 'Electrical Integration', 'Testing'];
  }, [db, selectedPo]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const requestedPo = searchParams.get('poId') || activePOs[0]?.id || '';
      setPoId(requestedPo);
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, activePOs, setSearchParams]);

  useEffect(() => {
    if (productStages.length > 0 && !productStages.includes(stage)) {
      setStage(productStages[0]);
    }
  }, [productStages, stage]);

  if (!db) return null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.dailyUpdates.filter((du) => {
      if (!q) return true;
      return (
        du.productionOrderDocNo.toLowerCase().includes(q) ||
        du.stage.toLowerCase().includes(q) ||
        du.workCompleted.toLowerCase().includes(q) ||
        du.employeeName.toLowerCase().includes(q)
      );
    });
  }, [db.dailyUpdates, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await erpApi.createDailyUpdate({
        productionOrderId: poId,
        workDate,
        stage,
        workCompleted,
        workHours: Number(workHours) || 0,
        completedQty: Number(completedQty) || 0,
        stageStatus,
        issues,
        remarks,
        photoName: photoName || undefined,
        photoDataUrl: photoDataUrl || undefined,
      });
      await refresh();
      setModalOpen(false);
      setWorkCompleted('');
      setIssues('');
      setRemarks('');
      setPhotoName('');
      setPhotoDataUrl('');
      toast('success', 'Daily production update logged');
    } catch (err) {
      toast('error', 'Failed to log update', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<DailyProductionUpdate>[] = [
    {
      key: 'date',
      header: 'Work Date',
      sortable: true,
      sortValue: (d) => d.workDate,
      render: (d) => <span className="font-mono text-xs">{formatDate(d.workDate)}</span>,
    },
    {
      key: 'po',
      header: 'Production Order',
      render: (d) => (
        <Link
          to={`/production/orders/${d.productionOrderId}`}
          className="font-mono font-medium text-teal-700 dark:text-teal-400 hover:underline"
        >
          {d.productionOrderDocNo}
        </Link>
      ),
    },
    {
      key: 'stage',
      header: 'Stage & Work Completed',
      render: (d) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100 text-xs">{d.stage}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 max-w-md">{d.workCompleted}</div>
          {d.issues && <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Issue: {d.issues}</div>}
        </div>
      ),
    },
    {
      key: 'hours',
      header: 'Hours / Qty',
      align: 'right',
      render: (d) => (
        <div className="font-mono text-xs">
          <div>{d.workHours} hrs</div>
          <div className="text-slate-500">Qty: {d.completedQty}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Stage Status',
      render: (d) => <StatusBadge status={d.stageStatus} />,
    },
    {
      key: 'employee',
      header: 'Logged By',
      render: (d) => <span className="text-xs">{d.employeeName}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Daily Production Updates"
        subtitle="Record shift-level stage progress, hours spent, blockers, and floor observations on active production orders."
        actions={
          can('production', 'create') && (
            <Button
              onClick={() => {
                if (!poId && activePOs[0]) setPoId(activePOs[0].id);
                setModalOpen(true);
              }}
              disabled={activePOs.length === 0}
            >
              <Plus className="w-4 h-4" /> Log Daily Update
            </Button>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search production order, stage, work log, or technician..."
      />

      <DataTable
        rows={filtered}
        columns={columns}
        emptyTitle="No daily updates recorded"
        emptyDescription="Start a production order to log daily work updates."
        renderMobileCard={(d) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  to={`/production/orders/${d.productionOrderId}`}
                  className="font-mono font-semibold text-sm text-teal-700 dark:text-teal-400"
                >
                  {d.productionOrderDocNo}
                </Link>
                <div className="text-xs text-slate-500">
                  {formatDate(d.workDate)} · {d.stage}
                </div>
              </div>
              <StatusBadge status={d.stageStatus} />
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300">{d.workCompleted}</p>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span>{d.employeeName}</span>
              <span className="font-mono">
                {d.workHours} hrs · Qty {d.completedQty}
              </span>
            </div>
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Log Daily Production Update"
        subtitle="Select an active production order to view context and record progress."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="daily-update-form" loading={saving}>
              <Activity className="w-4 h-4" /> Save Daily Update
            </Button>
          </>
        }
      >
        <form id="daily-update-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label="Production Order" required>
            <Select value={poId} onChange={(e) => setPoId(e.target.value)} required>
              <option value="">-- Select Active Production Order --</option>
              {activePOs.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.docNo} — {po.productName} ({po.model}) [{po.status}]
                </option>
              ))}
            </Select>
          </Field>

          {selectedPo && (
            <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <div className="text-slate-500">Customer</div>
                <div className="font-medium truncate">{selectedPo.customerName}</div>
              </div>
              <div>
                <div className="text-slate-500">Sales Order</div>
                <div className="font-mono">{selectedPo.salesOrderDocNo}</div>
              </div>
              <div>
                <div className="text-slate-500">Order Qty</div>
                <div className="font-mono font-medium">{selectedPo.quantity} Unit(s)</div>
              </div>
              <div>
                <div className="text-slate-500">Planned End</div>
                <div className="font-mono">{formatDate(selectedPo.plannedEndDate)}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Work Date" required>
              <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
            </Field>
            <Field label="Manufacturing Stage" required>
              <Select value={stage} onChange={(e) => setStage(e.target.value)} required>
                {productStages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Work Completed" required>
            <Textarea
              value={workCompleted}
              onChange={(e) => setWorkCompleted(e.target.value)}
              placeholder="Describe assembly, wiring, vacuum test, or stage milestones completed today..."
              required
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Work Hours" required>
              <Input type="number" min="0.5" step="0.5" value={workHours} onChange={(e) => setWorkHours(e.target.value)} required />
            </Field>
            <Field label="Completed Units (cumulative)">
              <Input
                type="number"
                min="0"
                max={selectedPo?.quantity || 999}
                value={completedQty}
                onChange={(e) => setCompletedQty(e.target.value)}
              />
            </Field>
            <Field label="Stage Status" required>
              <Select value={stageStatus} onChange={(e) => setStageStatus(e.target.value as any)}>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Blocked">Blocked</option>
                <option value="Pending">Pending</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Issues / Blockers (if any)">
              <Input value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="Optional floor issue or delay note" />
            </Field>
            <Field label="Remarks">
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Handover notes for next shift" />
            </Field>
          </div>

          <FileUploadInput
            label="Work Progress Photo (optional)"
            fileName={photoName}
            accept=".png,.jpg,.jpeg,.pdf"
            onFileSelected={(name, dataUrl) => {
              setPhotoName(name);
              setPhotoDataUrl(dataUrl);
            }}
          />
        </form>
      </Modal>
    </div>
  );
};

export const QualityCheckPage: React.FC = () => {
  const { data: db, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [poId, setPoId] = useState('');
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().slice(0, 10));
  const [inspector, setInspector] = useState('');
  const [inspectedQty, setInspectedQty] = useState(1);
  const [acceptedQty, setAcceptedQty] = useState(1);
  const [rejectedQty, setRejectedQty] = useState(0);
  const [checks, setChecks] = useState<QCCheckItem[]>(DEFAULT_QC_CHECKS);
  const [finalResult, setFinalResult] = useState<'Accepted' | 'Rejected'>('Accepted');
  const [rejectionReason, setRejectionReason] = useState('');
  const [requiredCorrection, setRequiredCorrection] = useState('');
  const [expectedCompletionDate, setExpectedCompletionDate] = useState(
    new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  );
  const [remarks, setRemarks] = useState('');
  const [reportName, setReportName] = useState('');
  const [reportDataUrl, setReportDataUrl] = useState('');

  const pendingQcOrders = useMemo(
    () => (db ? db.productionOrders.filter((p) => p.status === 'QC Pending') : []),
    [db],
  );

  const selectedQcPo = useMemo(
    () => (db ? db.productionOrders.find((p) => p.id === poId) : undefined),
    [db, poId],
  );

  const maxInspectable = useMemo(() => {
    if (!selectedQcPo) return 1;
    const total = selectedQcPo.completedManufacturingQty || selectedQcPo.quantity;
    return Math.max(1, total - (selectedQcPo.qcAcceptedQty || 0));
  }, [selectedQcPo]);

  const openInspection = (targetPoId?: string) => {
    const targetId = targetPoId || pendingQcOrders[0]?.id || '';
    setPoId(targetId);
    const targetPo = db?.productionOrders.find((p) => p.id === targetId);
    const remaining = targetPo
      ? Math.max(1, (targetPo.completedManufacturingQty || targetPo.quantity) - (targetPo.qcAcceptedQty || 0))
      : 1;
    setInspectedQty(remaining);
    setAcceptedQty(remaining);
    setRejectedQty(0);
    setChecks(DEFAULT_QC_CHECKS.map((c) => ({ ...c })));
    setFinalResult('Accepted');
    setRejectionReason('');
    setRequiredCorrection('');
    setRemarks('');
    setReportName('');
    setReportDataUrl('');
    setModalOpen(true);
  };

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const targetId = searchParams.get('poId') || pendingQcOrders[0]?.id || '';
      openInspection(targetId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, pendingQcOrders, setSearchParams]);

  if (!db) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await erpApi.createQualityCheck({
        productionOrderId: poId,
        inspectionDate,
        inspector: inspector || undefined,
        inspectedQty,
        acceptedQty,
        rejectedQty,
        checks,
        finalResult: rejectedQty > 0 ? 'Rejected' : 'Accepted',
        rejectionReason: rejectedQty > 0 ? rejectionReason : undefined,
        requiredCorrection: rejectedQty > 0 ? requiredCorrection : undefined,
        expectedCompletionDate: rejectedQty > 0 ? expectedCompletionDate : undefined,
        remarks,
        reportName: reportName || undefined,
        reportDataUrl: reportDataUrl || undefined,
      });
      await refresh();
      setModalOpen(false);
      if (acceptedQty > 0 && rejectedQty > 0) {
        toast(
          'info',
          'Partial Quality Inspection Recorded',
          `${acceptedQty} unit(s) accepted & released to Logistics, ${rejectedQty} unit(s) sent to Rework.`,
        );
      } else if (acceptedQty > 0) {
        toast('success', 'QC Accepted — Released to Logistics for Dispatch');
      } else {
        toast('info', 'QC Rejected — Rework Order generated automatically');
      }
    } catch (err) {
      toast('error', 'QC recording failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.qualityChecks.filter((qc) => {
      if (statusFilter !== 'All' && qc.finalResult !== statusFilter) return false;
      if (!q) return true;
      return (
        qc.docNo.toLowerCase().includes(q) ||
        qc.productionOrderDocNo.toLowerCase().includes(q) ||
        qc.productName.toLowerCase().includes(q) ||
        qc.inspector.toLowerCase().includes(q)
      );
    });
  }, [db.qualityChecks, search, statusFilter]);

  const columns: ColumnDef<QualityCheck>[] = [
    {
      key: 'docNo',
      header: 'QC Report',
      sortable: true,
      sortValue: (q) => q.docNo,
      render: (q) => (
        <div>
          <div className="font-mono font-medium text-slate-900 dark:text-slate-100">{q.docNo}</div>
          <div className="text-xs text-slate-500">Attempt #{q.attemptNumber}</div>
        </div>
      ),
    },
    {
      key: 'po',
      header: 'Production Order',
      render: (q) => (
        <div>
          <Link
            to={`/production/orders/${q.productionOrderId}`}
            className="font-mono text-teal-700 dark:text-teal-400 hover:underline font-medium"
          >
            {q.productionOrderDocNo}
          </Link>
          <div className="text-xs text-slate-500 truncate max-w-[200px]">{q.productName}</div>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Inspection Date',
      render: (q) => (
        <div className="text-xs">
          <div className="font-mono">{formatDate(q.inspectionDate)}</div>
          <div className="text-slate-500">{q.inspector}</div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Inspected / Acc / Rej',
      align: 'right',
      render: (q) => (
        <span className="font-mono text-xs">
          {q.inspectedQty} / <span className="text-emerald-700 dark:text-emerald-400">{q.acceptedQty}</span> /{' '}
          <span className="text-red-700 dark:text-red-400">{q.rejectedQty}</span>
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Final Result',
      render: (q) => (
        <div>
          <StatusBadge status={q.finalResult} />
          {q.reworkDocNo && <div className="text-xs font-mono text-red-700 dark:text-red-400 mt-0.5">{q.reworkDocNo}</div>}
        </div>
      ),
    },
    {
      key: 'remarks',
      header: 'Notes',
      render: (q) => (
        <span className="text-xs text-slate-600 dark:text-slate-400 block max-w-[220px] truncate">
          {q.rejectionReason || q.remarks || '—'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quality Check (QC)"
        subtitle="Inspect completed production orders. Accepted units release to Logistics; rejected units create Rework orders."
        actions={
          can('production', 'create') && (
            <Button onClick={() => openInspection()} disabled={pendingQcOrders.length === 0}>
              <ShieldCheck className="w-4 h-4" /> Record QC Inspection
            </Button>
          )
        }
      />

      {pendingQcOrders.length > 0 && (
        <div className="mb-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Awaiting Quality Inspection ({pendingQcOrders.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingQcOrders.map((po) => (
              <div
                key={po.id}
                className="p-3 rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{po.docNo}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                    {po.quantity}× {po.productName} ({po.model})
                  </div>
                  <div className="text-[11px] text-slate-500">{po.customerName}</div>
                </div>
                {can('production', 'create') && (
                  <Button size="sm" onClick={() => openInspection(po.id)}>
                    Inspect
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search QC number, production order, product, or inspector..."
        statuses={['All', 'Accepted', 'Rejected']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        emptyTitle="No QC records yet"
        emptyDescription="Complete manufacturing on a production order to submit it for quality inspection."
        renderMobileCard={(q) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono font-semibold text-sm">{q.docNo}</div>
                <div className="text-xs text-slate-500">
                  {q.productionOrderDocNo} · Attempt #{q.attemptNumber}
                </div>
              </div>
              <StatusBadge status={q.finalResult} />
            </div>
            <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{q.productName}</div>
            {q.rejectionReason && <p className="text-xs text-red-700 dark:text-red-400">{q.rejectionReason}</p>}
            <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span>{q.inspector}</span>
              <span className="font-mono">{formatDate(q.inspectionDate)}</span>
            </div>
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record Quality Inspection"
        subtitle="Verify all engineering checklists. Rejecting automatically creates a Rework Order."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="qc-form"
              variant={rejectedQty === 0 ? 'success' : 'danger'}
              loading={saving}
            >
              {rejectedQty === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Accept & Release {acceptedQty} to Logistics
                </>
              ) : acceptedQty > 0 ? (
                <>
                  <ShieldAlert className="w-4 h-4" /> Release {acceptedQty} & Rework {rejectedQty}
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4" /> Reject & Create Rework for {rejectedQty}
                </>
              )}
            </Button>
          </>
        }
      >
        <form id="qc-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Field label="Production Order (QC Pending)" required>
                <Select
                  value={poId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setPoId(nextId);
                    const targetPo = db.productionOrders.find((p) => p.id === nextId);
                    const remaining = targetPo
                      ? Math.max(1, (targetPo.completedManufacturingQty || targetPo.quantity) - (targetPo.qcAcceptedQty || 0))
                      : 1;
                    setInspectedQty(remaining);
                    setAcceptedQty(remaining);
                    setRejectedQty(0);
                    setFinalResult('Accepted');
                  }}
                  required
                >
                  <option value="">-- Select Production Order --</option>
                  {pendingQcOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.docNo} — {po.quantity}× {po.productName} ({po.customerName})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Inspection Date" required>
              <Input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} required />
            </Field>
          </div>

          {/* Batch & Partial Inspection Quantities */}
          <div className="p-3.5 rounded-md bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-purple-900 dark:text-purple-200">
                Inspection Batch Breakdown (Partial Acceptance Supported)
              </span>
              <span className="font-mono text-slate-500">
                Max Unaccepted: {maxInspectable} unit(s)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Inspected Units" required>
                <Input
                  type="number"
                  min={1}
                  max={maxInspectable}
                  value={inspectedQty}
                  onChange={(e) => {
                    const total = Math.min(maxInspectable, Math.max(1, Number(e.target.value) || 1));
                    setInspectedQty(total);
                    setAcceptedQty(total);
                    setRejectedQty(0);
                    setFinalResult('Accepted');
                  }}
                  required
                />
              </Field>
              <Field label="Accepted Units" required>
                <Input
                  type="number"
                  min={0}
                  max={inspectedQty}
                  value={acceptedQty}
                  onChange={(e) => {
                    const acc = Math.min(inspectedQty, Math.max(0, Number(e.target.value) || 0));
                    setAcceptedQty(acc);
                    const rej = Math.max(0, inspectedQty - acc);
                    setRejectedQty(rej);
                    setFinalResult(rej > 0 ? 'Rejected' : 'Accepted');
                  }}
                  required
                />
              </Field>
              <Field label="Rejected Units" required>
                <Input
                  type="number"
                  min={0}
                  max={inspectedQty}
                  value={rejectedQty}
                  onChange={(e) => {
                    const rej = Math.min(inspectedQty, Math.max(0, Number(e.target.value) || 0));
                    setRejectedQty(rej);
                    const acc = Math.max(0, inspectedQty - rej);
                    setAcceptedQty(acc);
                    setFinalResult(rej > 0 ? 'Rejected' : 'Accepted');
                  }}
                  required
                />
              </Field>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">
              {rejectedQty === 0 ? (
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  ✓ All {acceptedQty} inspected unit(s) will be released to Logistics for dispatch.
                </span>
              ) : acceptedQty > 0 ? (
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  ⚠ Partial acceptance: {acceptedQty} unit(s) released to Logistics, while {rejectedQty} unit(s) create a Rework Order.
                </span>
              ) : (
                <span className="text-red-700 dark:text-red-400 font-medium">
                  ✕ All {rejectedQty} inspected unit(s) rejected; entire batch moves to Rework.
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Inspection Checklist</div>
            {checks.map((ck, idx) => (
              <div
                key={ck.name}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 items-center"
              >
                <div className="sm:col-span-5 text-xs font-medium text-slate-800 dark:text-slate-200">{ck.name}</div>
                <div className="sm:col-span-3 flex items-center gap-1.5">
                  {(['Pass', 'Fail'] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => {
                        const next = checks.map((c, i) => (i === idx ? { ...c, result: res } : c));
                        setChecks(next);
                        if (next.some((c) => c.result === 'Fail')) setFinalResult('Rejected');
                      }}
                      className={`px-3 py-1 text-xs font-medium rounded border cursor-pointer ${
                        ck.result === res
                          ? res === 'Pass'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-red-600 text-white border-red-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
                <div className="sm:col-span-4">
                  <Input
                    value={ck.observation}
                    onChange={(e) =>
                      setChecks((prev) => prev.map((c, i) => (i === idx ? { ...c, observation: e.target.value } : c)))
                    }
                    placeholder="Measured value / observation"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Final QC Decision" required>
              <Select value={finalResult} onChange={(e) => setFinalResult(e.target.value as 'Accepted' | 'Rejected')}>
                <option value="Accepted">Accepted (Release to Logistics)</option>
                <option value="Rejected">Rejected (Send to Rework)</option>
              </Select>
            </Field>
            <Field label="Inspector Name">
              <Input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="Defaults to logged-in user" />
            </Field>
          </div>

          {finalResult === 'Rejected' && (
            <div className="p-3.5 rounded-md bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-800/70 space-y-3">
              <Field label="Rejection Reason" required>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Describe the exact test failure or non-conformance..."
                  required
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Required Corrective Action" required>
                  <Input
                    value={requiredCorrection}
                    onChange={(e) => setRequiredCorrection(e.target.value)}
                    placeholder="E.g., Re-braze suction line & re-run vacuum hold"
                    required
                  />
                </Field>
                <Field label="Expected Rework Completion Date">
                  <Input
                    type="date"
                    value={expectedCompletionDate}
                    onChange={(e) => setExpectedCompletionDate(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="QC Remarks">
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Calibration log / test summary" />
            </Field>
            <FileUploadInput
              label="QC Test Report Attachment"
              fileName={reportName}
              onFileSelected={(name, dataUrl) => {
                setReportName(name);
                setReportDataUrl(dataUrl);
              }}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const ReworkPage: React.FC = () => {
  const { data: db, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [target, setTarget] = useState<ReworkOrder | null>(null);
  const [completedWork, setCompletedWork] = useState('');
  const [assignedEmployee, setAssignedEmployee] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  if (!db) return null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.reworkOrders.filter((rw) => {
      if (statusFilter !== 'All' && rw.status !== statusFilter) return false;
      if (!q) return true;
      return (
        rw.docNo.toLowerCase().includes(q) ||
        rw.productionOrderDocNo.toLowerCase().includes(q) ||
        rw.rejectionReason.toLowerCase().includes(q) ||
        rw.assignedEmployee.toLowerCase().includes(q)
      );
    });
  }, [db.reworkOrders, search, statusFilter]);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    try {
      await erpApi.completeRework(target.id, {
        completedWork,
        assignedEmployee,
        remarks,
      });
      await refresh();
      setTarget(null);
      setCompletedWork('');
      setRemarks('');
      toast(
        'success',
        `Rework ${target.docNo} completed`,
        `${target.productionOrderDocNo} returned to Quality Check for reinspection.`,
      );
    } catch (err) {
      toast('error', 'Could not complete rework', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<ReworkOrder>[] = [
    {
      key: 'docNo',
      header: 'Rework No',
      sortable: true,
      sortValue: (r) => r.docNo,
      render: (r) => (
        <div>
          <div className="font-mono font-medium text-slate-900 dark:text-slate-100">{r.docNo}</div>
          <div className="text-xs font-mono text-slate-500">From {r.qcDocNo}</div>
        </div>
      ),
    },
    {
      key: 'po',
      header: 'Production Order',
      render: (r) => (
        <Link
          to={`/production/orders/${r.productionOrderId}`}
          className="font-mono font-medium text-teal-700 dark:text-teal-400 hover:underline"
        >
          {r.productionOrderDocNo}
        </Link>
      ),
    },
    {
      key: 'reason',
      header: 'Defect & Required Correction',
      render: (r) => (
        <div className="max-w-sm">
          <div className="text-xs text-red-700 dark:text-red-400 font-medium">{r.rejectionReason}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Fix: {r.requiredCorrection}</div>
          {r.completedWork && (
            <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Done: {r.completedWork}</div>
          )}
        </div>
      ),
    },
    {
      key: 'assigned',
      header: 'Assigned / Due',
      render: (r) => (
        <div className="text-xs">
          <div>{r.assignedEmployee}</div>
          <div className="font-mono text-slate-500">Due {formatDate(r.expectedCompletionDate)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) =>
        (r.status === 'Open' || r.status === 'In Progress') && can('production', 'edit') ? (
          <Button
            size="sm"
            onClick={() => {
              setTarget(r);
              setAssignedEmployee(r.assignedEmployee);
              setCompletedWork('');
              setRemarks('');
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Complete & Re-QC
          </Button>
        ) : (
          <Link to="/production/quality-check">
            <Button variant="ghost" size="sm">
              View QC Queue
            </Button>
          </Link>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Rework Orders"
        subtitle="Track corrective actions on QC-rejected units and return completed rework to Quality Check for reinspection."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search rework no, production order, defect, or assignee..."
        statuses={['All', 'Open', 'In Progress', 'Reinspection', 'Completed']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        emptyTitle="No rework orders"
        emptyDescription="Rework orders are automatically created whenever a QC inspection is rejected."
        renderMobileCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono font-semibold text-sm">{r.docNo}</div>
                <div className="text-xs text-slate-500">
                  {r.productionOrderDocNo} · {r.qcDocNo}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-xs text-red-700 dark:text-red-400">{r.rejectionReason}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Fix: {r.requiredCorrection}</p>
            {(r.status === 'Open' || r.status === 'In Progress') && can('production', 'edit') && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    setTarget(r);
                    setAssignedEmployee(r.assignedEmployee);
                    setCompletedWork('');
                  }}
                >
                  Complete Rework
                </Button>
              </div>
            )}
          </div>
        )}
      />

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={`Complete Rework — ${target?.docNo || ''}`}
        subtitle={`Returns ${target?.productionOrderDocNo || ''} to QC Pending for formal reinspection.`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="rework-complete-form" loading={saving}>
              Submit for QC Reinspection
            </Button>
          </>
        }
      >
        {target && (
          <form id="rework-complete-form" onSubmit={handleComplete} className="space-y-4">
            <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div>
                <span className="text-slate-500">Defect: </span>
                <span className="font-medium text-red-700 dark:text-red-400">{target.rejectionReason}</span>
              </div>
              <div>
                <span className="text-slate-500">Required Fix: </span>
                <span className="text-slate-800 dark:text-slate-200">{target.requiredCorrection}</span>
              </div>
            </div>
            <Field label="Completed Corrective Work" required>
              <Textarea
                value={completedWork}
                onChange={(e) => setCompletedWork(e.target.value)}
                placeholder="Detail the repair, part replacement, and internal bench test performed..."
                required
              />
            </Field>
            <Field label="Assigned Technician">
              <Input value={assignedEmployee} onChange={(e) => setAssignedEmployee(e.target.value)} />
            </Field>
            <Field label="Remarks">
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Ready for QC verification" />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
};
