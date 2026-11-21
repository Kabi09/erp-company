import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck,
  Info,
  Layers,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
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
import type { DailyProductionUpdate, QCCheckItem, QualityCheck, ReworkOrder, WorkUpdateType } from '../../types/erp';

const DEFAULT_QC_CHECKS: QCCheckItem[] = [
  { id: 'qc-vis', name: 'Visual & Mechanical Fabrication Inspection', result: 'Pass', observation: '', required: true },
  { id: 'qc-elec', name: 'Electrical Insulation & Controller Safety Check', result: 'Pass', observation: '', required: true },
  { id: 'qc-therm', name: 'Thermal Pull-Down & Stability Performance Test', result: 'Pass', observation: '', required: true },
  { id: 'qc-cal', name: 'Product-Specific Calibration & Alarm Verification', result: 'Pass', observation: '', required: true },
];

const STANDARD_STAGES = [
  'Design Review',
  'Material Preparation',
  'Cutting',
  'Fabrication',
  'Welding',
  'Assembly',
  'Electrical Wiring',
  'Testing Preparation',
  'Finishing',
  'Packing',
];

export const DailyUpdatesPage: React.FC = () => {
  const { data: db, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [poId, setPoId] = useState('');
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [workType, setWorkType] = useState<WorkUpdateType>('Preliminary Planning / Preparation');
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [availableStages, setAvailableStages] = useState<string[]>(STANDARD_STAGES);
  const [newStageInput, setNewStageInput] = useState('');
  const [showNewStageForm, setShowNewStageForm] = useState(false);
  const [stageToAdd, setStageToAdd] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [newHighlight, setNewHighlight] = useState('');
  const [workCompleted, setWorkCompleted] = useState('');
  const [workHours, setWorkHours] = useState('8');
  const [completedQty, setCompletedQty] = useState('0');
  const [stageStatus, setStageStatus] = useState<'Pending' | 'In Progress' | 'Completed' | 'Blocked'>('In Progress');
  const [issues, setIssues] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');

  // Load backend catalog stages
  useEffect(() => {
    let active = true;
    erpApi
      .getProductionStages()
      .then((stages) => {
        if (!active) return;
        const stageNames = stages.map((s) => s.name);
        setAvailableStages((prev) => {
          const merged = Array.from(new Set([...prev, ...stageNames]));
          return merged;
        });
      })
      .catch(() => {
        // Fallback to STANDARD_STAGES
      });
    return () => {
      active = false;
    };
  }, []);

  // Allowed POs: Planned, Awaiting Materials, Ready to Start, In Progress, Rework
  const eligiblePOs = useMemo(
    () =>
      db
        ? db.productionOrders.filter((p) =>
            ['Planned', 'Awaiting Materials', 'Ready to Start', 'In Progress', 'Rework'].includes(p.status),
          )
        : [],
    [db],
  );

  const selectedPo = useMemo(() => db?.productionOrders.find((p) => p.id === poId), [db, poId]);
  const isManufacturingAllowed = selectedPo?.status === 'In Progress' || selectedPo?.status === 'Rework';

  // Product stages from catalog
  const productStages = useMemo(() => {
    if (!db || !selectedPo) return [];
    const prod = db.products.find((pr) => pr.id === selectedPo.productId);
    return prod?.stages && prod.stages.length ? prod.stages : [];
  }, [db, selectedPo]);

  // Combined available stages
  const allCandidateStages = useMemo(() => {
    return Array.from(new Set([...STANDARD_STAGES, ...availableStages, ...productStages]));
  }, [availableStages, productStages]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const requestedPo = searchParams.get('poId') || eligiblePOs[0]?.id || '';
      setPoId(requestedPo);
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, eligiblePOs, setSearchParams]);

  // Adjust workType and default stage when PO changes
  useEffect(() => {
    if (!selectedPo) return;
    if (!isManufacturingAllowed) {
      setWorkType('Preliminary Planning / Preparation');
      setCompletedQty('0');
      if (selectedStages.length === 0) {
        setSelectedStages(['Design Review']);
      }
    } else {
      if (selectedStages.length === 0) {
        setSelectedStages(['Fabrication']);
      }
    }
  }, [selectedPo, isManufacturingAllowed]);

  if (!db) return null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.dailyUpdates.filter((du) => {
      if (!q) return true;
      return (
        du.productionOrderDocNo.toLowerCase().includes(q) ||
        du.stage.toLowerCase().includes(q) ||
        du.workCompleted.toLowerCase().includes(q) ||
        du.employeeName.toLowerCase().includes(q) ||
        (du.workType && du.workType.toLowerCase().includes(q))
      );
    });
  }, [db.dailyUpdates, search]);

  const handleAddStage = (stg: string) => {
    const trimmed = stg.trim();
    if (!trimmed) return;
    if (!selectedStages.includes(trimmed)) {
      setSelectedStages([...selectedStages, trimmed]);
    }
    setStageToAdd('');
  };

  const handleRemoveStage = (stg: string) => {
    setSelectedStages(selectedStages.filter((s) => s !== stg));
  };

  const handleCreateNewStage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newStageInput.trim();
    if (!clean) return;

    const exists = allCandidateStages.some((s) => s.toLowerCase() === clean.toLowerCase());
    if (exists) {
      const existingName = allCandidateStages.find((s) => s.toLowerCase() === clean.toLowerCase()) || clean;
      handleAddStage(existingName);
      setNewStageInput('');
      setShowNewStageForm(false);
      return;
    }

    try {
      await erpApi.createProductionStage(clean);
      setAvailableStages((prev) => [...prev, clean]);
      handleAddStage(clean);
      toast('success', 'Custom Stage Added', `Stage "${clean}" saved to company catalog.`);
    } catch {
      // Local fallback
      setAvailableStages((prev) => [...prev, clean]);
      handleAddStage(clean);
    }
    setNewStageInput('');
    setShowNewStageForm(false);
  };

  const handleAddHighlight = () => {
    const text = newHighlight.trim();
    if (!text) return;
    setHighlights((prev) => [...prev, text]);
    setNewHighlight('');
  };

  const handleRemoveHighlight = (index: number) => {
    setHighlights((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStages.length === 0) {
      toast('error', 'Stage Required', 'Please select at least one manufacturing or work stage.');
      return;
    }

    let finalWorkCompleted = workCompleted.trim();
    if (!finalWorkCompleted && highlights.length > 0) {
      finalWorkCompleted = highlights.join('; ');
    }
    if (!finalWorkCompleted) {
      toast('error', 'Description Required', 'Please provide a work description or add at least one highlight.');
      return;
    }

    setSaving(true);
    try {
      await erpApi.createDailyUpdate({
        productionOrderId: poId,
        workDate,
        workType,
        stage: selectedStages.join(', '),
        selectedStages,
        workCompleted: finalWorkCompleted,
        highlights,
        workHours: Number(workHours) || 0,
        completedQty: workType === 'Preliminary Planning / Preparation' ? 0 : Number(completedQty) || 0,
        stageStatus,
        issues,
        remarks,
        photoName: photoName || undefined,
        photoDataUrl: photoDataUrl || undefined,
      });
      await refresh();
      setModalOpen(false);
      setWorkCompleted('');
      setHighlights([]);
      setIssues('');
      setRemarks('');
      setPhotoName('');
      setPhotoDataUrl('');
      toast('success', 'Daily update logged', `Recorded under "${workType}".`);
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
        <div>
          <Link
            to={`/production/orders/${d.productionOrderId}`}
            className="font-mono font-medium text-teal-700 dark:text-teal-400 hover:underline"
          >
            {d.productionOrderDocNo}
          </Link>
          {d.workType && (
            <div className="mt-0.5">
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  d.workType === 'Preliminary Planning / Preparation'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                {d.workType === 'Preliminary Planning / Preparation' ? 'Planning / Prep' : 'Manufacturing'}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'Stages & Highlights',
      render: (d) => (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {(d.selectedStages && d.selectedStages.length > 0 ? d.selectedStages : [d.stage]).map((stg, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {stg}
              </span>
            ))}
          </div>
          <div className="text-xs text-slate-700 dark:text-slate-300 max-w-md">{d.workCompleted}</div>
          {d.highlights && d.highlights.length > 0 && (
            <ul className="list-disc list-inside text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
              {d.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
          {d.issues && <div className="text-xs text-amber-700 dark:text-amber-400">Issue: {d.issues}</div>}
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
        subtitle="Record planning preparation, shift-level manufacturing stages, highlights, blockers, and floor observations."
        actions={
          can('production', 'create') && (
            <Button
              onClick={() => {
                if (!poId && eligiblePOs[0]) setPoId(eligiblePOs[0].id);
                setModalOpen(true);
              }}
              disabled={eligiblePOs.length === 0}
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
        emptyDescription="Select a production order to log shift work or planning updates."
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
            {d.workType && (
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  d.workType === 'Preliminary Planning / Preparation'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                {d.workType}
              </span>
            )}
            <p className="text-xs text-slate-700 dark:text-slate-300">{d.workCompleted}</p>
            {d.highlights && d.highlights.length > 0 && (
              <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                {d.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
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
        subtitle="Record planning and preparation or physical manufacturing progress with selectable stages and highlights."
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
              <option value="">-- Select Production Order --</option>
              {eligiblePOs.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.docNo} — {po.productName} ({po.model}) [{po.status}]
                </option>
              ))}
            </Select>
          </Field>

          {/* PO Context Summary */}
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
                <div className="text-slate-500">Order Qty / Current Status</div>
                <div className="font-medium">
                  {selectedPo.quantity} Unit(s) · <span className="font-mono text-purple-700 dark:text-purple-400">{selectedPo.status}</span>
                </div>
              </div>
              <div>
                <div className="text-slate-500">Planned End</div>
                <div className="font-mono">{formatDate(selectedPo.plannedEndDate)}</div>
              </div>
            </div>
          )}

          {/* BOQ/BOM Pending Informative Banner */}
          {selectedPo && !isManufacturingAllowed && (
            <div className="p-3.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <span className="font-semibold">BOQ/BOM Preparation / Material Receipt Pending:</span> This order is currently in{' '}
                <span className="font-mono font-bold">"{selectedPo.status}"</span> state. You can record preliminary planning, design review,
                tooling prep, and floor coordination. Physical manufacturing progress will be enabled once production readiness requirements are met.
              </div>
            </div>
          )}

          {/* Work Type Selection */}
          <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Work Update Type
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`flex items-start gap-2 p-2.5 rounded border cursor-pointer text-xs ${
                  workType === 'Preliminary Planning / Preparation'
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="workType"
                  className="mt-0.5"
                  checked={workType === 'Preliminary Planning / Preparation'}
                  onChange={() => {
                    setWorkType('Preliminary Planning / Preparation');
                    setCompletedQty('0');
                  }}
                />
                <div>
                  <div className="font-semibold">Preliminary Planning / Preparation</div>
                  <div className="text-[11px] text-slate-500">Design review, BOM drafting, fixtures setup, floor prep. (Zero completed units)</div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2 p-2.5 rounded border text-xs ${
                  !isManufacturingAllowed
                    ? 'opacity-50 cursor-not-allowed border-dashed border-slate-300 dark:border-slate-700 text-slate-400'
                    : workType === 'Manufacturing Progress'
                      ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 cursor-pointer'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer'
                }`}
              >
                <input
                  type="radio"
                  name="workType"
                  className="mt-0.5"
                  disabled={!isManufacturingAllowed}
                  checked={workType === 'Manufacturing Progress'}
                  onChange={() => {
                    if (isManufacturingAllowed) setWorkType('Manufacturing Progress');
                  }}
                />
                <div>
                  <div className="font-semibold">Manufacturing Progress</div>
                  <div className="text-[11px] text-slate-500">
                    {isManufacturingAllowed
                      ? 'Physical fabrication, assembly, wiring, and unit completion.'
                      : 'Disabled: Requires production order in "In Progress" or "Rework" state.'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Work Date" required>
              <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
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

          {/* Manufacturing Stages Multi-Select */}
          <div className="space-y-2 p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Manufacturing / Work Stages (Multi-Select) <span className="text-red-500">*</span>
              </span>
              <button
                type="button"
                onClick={() => setShowNewStageForm(!showNewStageForm)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add New Stage
              </button>
            </div>

            {/* Selected Stage Chips */}
            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded">
              {selectedStages.length === 0 ? (
                <span className="text-xs text-slate-400 italic">No stages selected yet. Choose from dropdown below.</span>
              ) : (
                selectedStages.map((stg) => (
                  <span
                    key={stg}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
                  >
                    {stg}
                    <button
                      type="button"
                      onClick={() => handleRemoveStage(stg)}
                      className="hover:text-red-600 focus:outline-none cursor-pointer"
                      title="Remove stage"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Stage Selector Dropdown */}
            <div className="flex gap-2">
              <Select
                value={stageToAdd}
                onChange={(e) => {
                  handleAddStage(e.target.value);
                }}
              >
                <option value="">-- Add a stage to this update --</option>
                {allCandidateStages
                  .filter((s) => !selectedStages.includes(s))
                  .map((s) => (
                    <option key={s} value={s}>
                      + {s}
                    </option>
                  ))}
              </Select>
            </div>

            {/* Inline Custom Stage Form */}
            {showNewStageForm && (
              <div className="p-2.5 rounded border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 flex items-center gap-2">
                <Input
                  value={newStageInput}
                  onChange={(e) => setNewStageInput(e.target.value)}
                  placeholder="Enter custom stage name (e.g. Helium Leak Testing)..."
                  className="text-xs"
                />
                <Button size="sm" type="button" onClick={() => handleCreateNewStage()}>
                  Add Stage
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setShowNewStageForm(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Daily Work Highlights */}
          <div className="space-y-2 p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Daily Work Highlights (Multiple Entries)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">{highlights.length} added</span>
            </div>

            <div className="flex gap-2">
              <Input
                value={newHighlight}
                onChange={(e) => setNewHighlight(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddHighlight();
                  }
                }}
                placeholder="Enter today's key milestone or task (e.g., Completed inner vessel TIG welding)..."
                className="text-xs"
              />
              <Button type="button" size="sm" onClick={handleAddHighlight}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>

            {highlights.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {highlights.map((hl, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <span className="text-slate-800 dark:text-slate-200">• {hl}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveHighlight(idx)}
                      className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                      title="Remove highlight"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Detailed Work Description" required>
            <Textarea
              value={workCompleted}
              onChange={(e) => setWorkCompleted(e.target.value)}
              placeholder="Provide complete shift summary, technical observations, or equipment parameters..."
              required={highlights.length === 0}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Work Hours" required>
              <Input type="number" min="0.5" step="0.5" value={workHours} onChange={(e) => setWorkHours(e.target.value)} required />
            </Field>

            <Field
              label={
                workType === 'Preliminary Planning / Preparation'
                  ? 'Completed Units (0 in Planning Mode)'
                  : 'Completed Units (Cumulative)'
              }
            >
              <Input
                type="number"
                min="0"
                max={selectedPo?.quantity || 999}
                value={workType === 'Preliminary Planning / Preparation' ? '0' : completedQty}
                disabled={workType === 'Preliminary Planning / Preparation'}
                onChange={(e) => setCompletedQty(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Issues / Blockers (if any)">
              <Input value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="Material delay, drawing clarification, etc." />
            </Field>
            <Field label="Remarks">
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Shift handover instructions" />
            </Field>
          </div>

          <FileUploadInput
            label="Work Progress Photo / Inspection Report (optional)"
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
  const [finalResult, setFinalResult] = useState<'Accepted' | 'Rejected' | 'Pending'>('Accepted');
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

  // Inspection Checklist Summary
  const passCount = useMemo(() => checks.filter((c) => c.result === 'Pass').length, [checks]);
  const failCount = useMemo(() => checks.filter((c) => c.result === 'Fail').length, [checks]);
  const pendingCount = useMemo(() => checks.filter((c) => c.result === 'Pending').length, [checks]);
  const totalCount = checks.length;

  const failedItems = useMemo(() => checks.filter((c) => c.result === 'Fail'), [checks]);
  const pendingRequiredItems = useMemo(() => checks.filter((c) => c.required && c.result === 'Pending'), [checks]);

  const canAccept = failedItems.length === 0 && pendingRequiredItems.length === 0 && rejectedQty === 0;

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

  const handleAddCheckItem = () => {
    const nextIdx = checks.length + 1;
    const newItem: QCCheckItem = {
      id: `chk-custom-${Date.now()}-${nextIdx}`,
      name: `Inspection Item #${nextIdx}`,
      result: 'Pending',
      observation: '',
      measuredValue: '',
      expectedValue: '',
      required: false,
    };
    setChecks((prev) => [...prev, newItem]);
  };

  const handleRemoveCheckItem = (id?: string) => {
    if (!id) return;
    setChecks((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await erpApi.createQualityCheck({
        productionOrderId: poId,
        inspectionDate,
        inspector: inspector || undefined,
        inspectedQty,
        acceptedQty: 0,
        rejectedQty: 0,
        checks,
        finalResult: 'Pending',
        remarks: remarks || 'Draft / In-progress QC Inspection',
        reportName: reportName || undefined,
        reportDataUrl: reportDataUrl || undefined,
      });
      await refresh();
      setModalOpen(false);
      toast('info', 'QC Draft Saved', 'Inspection checklist saved with Pending status. Order remains in QC Pending.');
    } catch (err) {
      toast('error', 'Failed to save draft QC', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (finalResult === 'Accepted') {
      if (failedItems.length > 0) {
        toast('error', 'Cannot Accept QC', `Inspection failed on: ${failedItems.map((c) => c.name).join(', ')}`);
        return;
      }
      if (pendingRequiredItems.length > 0) {
        toast(
          'error',
          'Cannot Accept QC',
          `Required check(s) still pending: ${pendingRequiredItems.map((c) => c.name).join(', ')}. Use "Save as Draft" if inspection is incomplete.`,
        );
        return;
      }
      if (rejectedQty > 0) {
        toast('error', 'Quantity Mismatch', 'Cannot set Accepted decision when rejected units exist.');
        return;
      }
    }

    if (finalResult === 'Rejected' && !rejectionReason.trim()) {
      if (failedItems.length > 0) {
        setRejectionReason(`Checklist items failed: ${failedItems.map((c) => c.name).join(', ')}`);
      } else {
        toast('error', 'Rejection Reason Required', 'Please enter a rejection reason before submitting.');
        return;
      }
    }

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
        finalResult: rejectedQty > 0 ? 'Rejected' : finalResult,
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
      key: 'checks',
      header: 'Checklist Summary',
      render: (q) => {
        const passed = (q.checks || []).filter((c) => c.result === 'Pass' || (c as any).passed).length;
        const total = (q.checks || []).length;
        return (
          <div className="text-xs">
            <span className="font-mono font-medium">{passed}/{total}</span> checks passed
          </div>
        );
      },
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
        subtitle="Inspect completed production orders with dynamic checklists. Accepted units release to Logistics; rejected units create Rework orders."
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
        statuses={['All', 'Accepted', 'Rejected', 'Pending']}
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
          <div className="flex flex-wrap items-center justify-between w-full gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSaveDraft}
              loading={saving}
              className="flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> Save as Draft / Pending
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="qc-form"
                variant={rejectedQty === 0 && canAccept ? 'success' : 'danger'}
                loading={saving}
                disabled={finalResult === 'Accepted' && !canAccept}
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
            </div>
          </div>
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

          {/* Dynamic Inspection Checklist */}
          <div className="space-y-3 p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Engineering Quality Inspection Checklist
                </div>
                <div className="text-[11px] text-slate-500">
                  Pass, Fail or Pending inspection. All required items must pass for final acceptance.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {passCount} Pass
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                  {failCount} Fail
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {pendingCount} Pending
                </span>
                <Button type="button" size="sm" variant="secondary" onClick={handleAddCheckItem}>
                  <Plus className="w-3.5 h-3.5" /> Add Check Item
                </Button>
              </div>
            </div>

            {/* Checklist items */}
            <div className="space-y-2">
              {checks.map((ck, idx) => (
                <div
                  key={ck.id || idx}
                  className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      {ck.required ? (
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{ck.name}</span>
                      ) : (
                        <Input
                          value={ck.name}
                          onChange={(e) =>
                            setChecks((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c)),
                            )
                          }
                          className="text-xs h-7"
                          placeholder="Check item title..."
                        />
                      )}
                      {ck.required ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          Mandatory
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemoveCheckItem(ck.id)}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                          title="Remove custom check"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* 3-way toggle button group */}
                    <div className="flex items-center gap-1">
                      {(['Pass', 'Fail', 'Pending'] as const).map((res) => (
                        <button
                          key={res}
                          type="button"
                          onClick={() => {
                            const next = checks.map((c, i) =>
                              i === idx ? { ...c, result: res, passed: res === 'Pass' } : c,
                            );
                            setChecks(next);
                            if (res === 'Fail') {
                              setFinalResult('Rejected');
                              setRejectedQty(inspectedQty);
                              setAcceptedQty(0);
                            } else if (res === 'Pass' && !next.some((c) => c.result === 'Fail')) {
                              setFinalResult('Accepted');
                              setAcceptedQty(inspectedQty);
                              setRejectedQty(0);
                            }
                          }}
                          className={`px-2.5 py-1 text-xs font-medium rounded border cursor-pointer ${
                            ck.result === res
                              ? res === 'Pass'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : res === 'Fail'
                                  ? 'bg-red-600 text-white border-red-600'
                                  : 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Observations, Expected & Measured Values */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Input
                      value={ck.observation}
                      onChange={(e) =>
                        setChecks((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, observation: e.target.value } : c)),
                        )
                      }
                      placeholder="Observation / physical condition..."
                      className="text-xs h-7"
                    />
                    <Input
                      value={ck.measuredValue || ''}
                      onChange={(e) =>
                        setChecks((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, measuredValue: e.target.value } : c)),
                        )
                      }
                      placeholder="Measured value (e.g. -86.4 °C)"
                      className="text-xs h-7"
                    />
                    <Input
                      value={ck.expectedValue || ''}
                      onChange={(e) =>
                        setChecks((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, expectedValue: e.target.value } : c)),
                        )
                      }
                      placeholder="Expected spec (e.g. <= -80 °C)"
                      className="text-xs h-7"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Warning Banner if acceptance blocked */}
            {!canAccept && finalResult === 'Accepted' && (
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="font-semibold">Acceptance Gated:</span> Order cannot be accepted and released to Logistics because:{' '}
                  {failedItems.length > 0 && (
                    <span className="font-medium text-red-700 dark:text-red-400">
                      {failedItems.length} inspection check item(s) failed ({failedItems.map((c) => c.name).join(', ')}).{' '}
                    </span>
                  )}
                  {pendingRequiredItems.length > 0 && (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      {pendingRequiredItems.length} required inspection item(s) are still pending ({pendingRequiredItems.map((c) => c.name).join(', ')}).{' '}
                    </span>
                  )}
                  Resolve checks, reject to Rework, or use <strong>"Save as Draft / Pending"</strong>.
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Final QC Decision" required>
              <Select
                value={finalResult}
                onChange={(e) => {
                  const val = e.target.value as 'Accepted' | 'Rejected' | 'Pending';
                  setFinalResult(val);
                  if (val === 'Rejected') {
                    setRejectedQty(inspectedQty);
                    setAcceptedQty(0);
                  } else if (val === 'Accepted') {
                    setAcceptedQty(inspectedQty);
                    setRejectedQty(0);
                  } else {
                    setAcceptedQty(0);
                    setRejectedQty(0);
                  }
                }}
              >
                <option value="Accepted">Accepted (Release to Logistics)</option>
                <option value="Rejected">Rejected (Send to Rework)</option>
                <option value="Pending">Pending (Draft / In-Progress)</option>
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
