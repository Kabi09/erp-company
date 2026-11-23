import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Download, Edit2, Eye, Plus, RefreshCw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
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
  StatusBadge,
  Tabs,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { Material, StockTransaction, Supplier } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

export const MaterialsInventoryPage: React.FC<{ mode: 'materials' | 'inventory' }> = ({ mode }) => {
  const { data, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Material | null>(null);
  const [adjDelta, setAdjDelta] = useState('');
  const [adjRemarks, setAdjRemarks] = useState('');

  // Stock audit / reconciliation state
  const [reconOpen, setReconOpen] = useState(false);
  const [reconData, setReconData] = useState<any>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  // Material Stock & Supplier detail view state
  const [detailMaterial, setDetailMaterial] = useState<Material | null>(null);
  const [detailTab, setDetailTab] = useState('movements');

  const [form, setForm] = useState({
    code: '',
    name: '',
    category: 'Cooling Systems',
    specification: '',
    unit: 'Nos',
    minStock: 5,
    storageLocation: 'Bay A-01',
    preferredSupplierId: '',
    openingStock: 0,
  });

  const [editForm, setEditForm] = useState({
    name: '',
    category: '',
    specification: '',
    unit: 'Nos',
    minStock: 0,
    storageLocation: '',
    preferredSupplierId: '',
    active: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1' && mode === 'materials') {
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, mode]);

  if (!data) return null;

  const openEdit = (m: Material) => {
    setEditTarget(m);
    setEditForm({
      name: m.name,
      category: m.category,
      specification: m.specification || '',
      unit: m.unit,
      minStock: m.minStock,
      storageLocation: m.storageLocation,
      preferredSupplierId: m.preferredSupplierId || '',
      active: m.active ?? true,
    });
    setErr(null);
  };

  const openReconciliation = async () => {
    setReconOpen(true);
    setReconLoading(true);
    try {
      const res: any = await erpApi.getStockReconciliation();
      setReconData(res);
    } catch (error: any) {
      toast('error', 'Reconciliation audit failed', error.message);
    } finally {
      setReconLoading(false);
    }
  };

  const handleRunReconcile = async () => {
    setReconciling(true);
    try {
      const res: any = await erpApi.reconcileStock();
      await refresh();
      setReconData(res);
      toast('success', 'Stock Reconciled', `Synchronized ${res.reconciledCount || 0} material(s) with ledger.`);
    } catch (error: any) {
      toast('error', 'Reconciliation failed', error.message);
    } finally {
      setReconciling(false);
    }
  };

  const openDetail = (m: Material, tab = 'movements') => {
    setDetailMaterial(m);
    setDetailTab(tab);
  };

  const filtered = data.materials.filter((m) => {
    const stock = data.stockMap[m.id] || 0;
    const isLow = stock < m.minStock;
    if (statusFilter === 'Low Stock' && !isLow) return false;
    if (statusFilter === 'Healthy' && isLow) return false;
    const q = search.trim().toLowerCase();
    return (
      !q ||
      m.code.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.storageLocation.toLowerCase().includes(q)
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res: any = await erpApi.createMaterial(form);
      await refresh();
      toast('success', `Material ${res.code} added`);
      setCreateOpen(false);
      setForm({ code: '', name: '', category: 'Cooling Systems', specification: '', unit: 'Nos', minStock: 5, storageLocation: 'Bay A-01', preferredSupplierId: '', openingStock: 0 });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create material');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setErr(null);
    setSubmitting(true);
    try {
      await erpApi.updateMaterial(editTarget.id, editForm);
      await refresh();
      toast('success', `Material ${editTarget.code} updated`);
      setEditTarget(null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to update material');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setErr(null);
    setSubmitting(true);
    try {
      await erpApi.adjustStock({
        materialId: adjustTarget.id,
        quantityDelta: Number(adjDelta),
        remarks: adjRemarks,
      });
      await refresh();
      toast('success', `Stock adjusted for ${adjustTarget.name}`);
      setAdjustTarget(null);
      setAdjDelta('');
      setAdjRemarks('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Stock adjustment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<Material>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      sortValue: (r) => r.code,
      render: (r) => <span className="font-mono font-semibold text-xs">{r.code}</span>,
    },
    {
      key: 'name',
      header: 'Material & Specification',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <button
            type="button"
            onClick={() => openDetail(r)}
            className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            {r.name}
          </button>
          <div className="text-xs text-slate-500">{r.category} · {r.specification || 'Standard spec'}</div>
        </div>
      ),
    },
    { key: 'loc', header: 'Location', render: (r) => <span className="font-mono text-xs">{r.storageLocation}</span> },
    {
      key: 'stock',
      header: 'Available Stock',
      align: 'right',
      sortable: true,
      sortValue: (r) => data.stockMap[r.id] || 0,
      render: (r) => {
        const bal = data.stockMap[r.id] || 0;
        const low = bal < r.minStock;
        return (
          <span className={`font-mono font-semibold ${low ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
            {bal} {r.unit}
          </span>
        );
      },
    },
    {
      key: 'min',
      header: 'Min Stock',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.minStock,
      render: (r) => <span className="font-mono text-slate-500">{r.minStock} {r.unit}</span>,
    },
    {
      key: 'health',
      header: 'Status',
      render: (r) => {
        const bal = data.stockMap[r.id] || 0;
        return <StatusBadge status={bal < r.minStock ? 'Issue' : 'Active'} />;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>
            <Eye className="w-3.5 h-3.5" />
            Show
          </Button>
          {mode === 'materials' && can('supply_chain', 'edit') && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </Button>
          )}
          {mode === 'inventory' && can('supply_chain', 'approve') && (
            <Button size="sm" variant="secondary" onClick={() => setAdjustTarget(r)}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Adjust
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={mode === 'materials' ? 'Raw Materials Master' : 'Inventory Stock Levels'}
        subtitle={
          mode === 'materials'
            ? 'Approved catalog of raw materials, parts, specifications, and default vendors.'
            : 'Live usable stock balances backed by immutable transaction history and min-stock alert thresholds.'
        }
        actions={
          <div className="flex gap-2">
            {mode === 'inventory' && (
              <Button variant="ghost" size="sm" onClick={openReconciliation}>
                <RefreshCw className="w-4 h-4" />
                Audit Reconciliation
              </Button>
            )}
            {mode === 'materials' && can('supply_chain', 'create') && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                Add Material
              </Button>
            )}
          </div>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search material code, name, category, or location..."
        statuses={['All', 'Low Stock', 'Healthy']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => {
          const bal = data.stockMap[r.id] || 0;
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">{r.code} · {r.storageLocation}</span>
                <StatusBadge status={bal < r.minStock ? 'Issue' : 'Active'} />
              </div>
              <button
                type="button"
                onClick={() => openDetail(r)}
                className="text-left font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {r.name}
              </button>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Min: {r.minStock} {r.unit}</span>
                <span className="font-mono font-semibold text-sm">Available: {bal} {r.unit}</span>
              </div>
              <div className="pt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>
                  <Eye className="w-3.5 h-3.5" />
                  Show
                </Button>
                {mode === 'inventory' && can('supply_chain', 'approve') && (
                  <Button size="sm" variant="secondary" onClick={() => setAdjustTarget(r)}>
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Adjust
                  </Button>
                )}
              </div>
            </div>
          );
        }}
      />

      {/* Add Material Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Raw Material"
        subtitle="Create a new raw material catalog record. Stock balance is initialized via opening ledger transaction."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="mat-form" loading={submitting}>Save Material</Button>
          </>
        }
      >
        <form id="mat-form" onSubmit={handleCreate} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Material Code" hint="Leave blank to auto-generate MAT-XXXX">
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Auto: MAT-XXXX" />
            </Field>
            <Field label="Material Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Category">
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="Unit of Measure" required>
              <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="Nos">Nos (Discrete Integer)</option>
                <option value="Sets">Sets (Discrete Integer)</option>
                <option value="Rolls">Rolls (Discrete Integer)</option>
                <option value="Pcs">Pcs (Discrete Integer)</option>
                <option value="Boxes">Boxes (Discrete Integer)</option>
                <option value="Meter">Meter (Decimals Allowed)</option>
                <option value="Kg">Kg (Decimals Allowed)</option>
                <option value="Liter">Liter (Decimals Allowed)</option>
                <option value="Sheets">Sheets (Decimals Allowed)</option>
              </Select>
            </Field>
            <Field label="Minimum Stock Level" required>
              <Input type="number" min={0} step="any" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} required />
            </Field>
            <Field label="Opening Stock Balance">
              <Input type="number" min={0} step="any" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value) })} />
            </Field>
            <Field label="Storage Location">
              <Input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} />
            </Field>
            <Field label="Preferred Supplier">
              <Select value={form.preferredSupplierId} onChange={(e) => setForm({ ...form, preferredSupplierId: e.target.value })}>
                <option value="">None</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Specification">
            <Textarea value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} rows={2} />
          </Field>
        </form>
      </Modal>

      {/* Edit Material Modal */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Edit Material — ${editTarget?.code || ''}`}
        subtitle="Operational stock balance is read-only and governed strictly by transactions."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="edit-mat-form" loading={submitting}>Update Material</Button>
          </>
        }
      >
        {editTarget && (
          <form id="edit-mat-form" onSubmit={handleUpdate} className="space-y-3.5">
            {err && <ErrorBanner message={err} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Material Code (Permanent)">
                <Input value={editTarget.code} disabled />
              </Field>
              <Field label="Material Name" required>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
              </Field>
              <Field label="Category">
                <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
              </Field>
              <Field label="Unit of Measure" required>
                <Select value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}>
                  <option value="Nos">Nos</option>
                  <option value="Sets">Sets</option>
                  <option value="Rolls">Rolls</option>
                  <option value="Pcs">Pcs</option>
                  <option value="Boxes">Boxes</option>
                  <option value="Meter">Meter</option>
                  <option value="Kg">Kg</option>
                  <option value="Liter">Liter</option>
                  <option value="Sheets">Sheets</option>
                </Select>
              </Field>
              <Field label="Minimum Stock Level" required>
                <Input type="number" min={0} step="any" value={editForm.minStock} onChange={(e) => setEditForm({ ...editForm, minStock: Number(e.target.value) })} required />
              </Field>
              <Field label="Current Available Stock (Read Only)">
                <Input value={`${data.stockMap[editTarget.id] || 0} ${editTarget.unit}`} disabled />
              </Field>
              <Field label="Storage Location">
                <Input value={editForm.storageLocation} onChange={(e) => setEditForm({ ...editForm, storageLocation: e.target.value })} />
              </Field>
              <Field label="Preferred Supplier">
                <Select value={editForm.preferredSupplierId} onChange={(e) => setEditForm({ ...editForm, preferredSupplierId: e.target.value })}>
                  <option value="">None</option>
                  {data.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Specification">
              <Textarea value={editForm.specification} onChange={(e) => setEditForm({ ...editForm, specification: e.target.value })} rows={2} />
            </Field>
          </form>
        )}
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal
        open={Boolean(adjustTarget)}
        onClose={() => setAdjustTarget(null)}
        title={`Authorized Stock Adjustment — ${adjustTarget?.name || ''}`}
        subtitle={`Current available stock: ${adjustTarget ? data.stockMap[adjustTarget.id] || 0 : 0} ${adjustTarget?.unit || ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button type="submit" form="adj-form" loading={submitting}>Post Adjustment</Button>
          </>
        }
      >
        <form id="adj-form" onSubmit={handleAdjust} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <Field label="Quantity Adjustment (+ or -)" required hint="Use negative values for write-offs or audit deductions.">
            <Input type="number" step="any" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} required />
          </Field>
          <Field label="Reason / Audit Reference" required>
            <Textarea value={adjRemarks} onChange={(e) => setAdjRemarks(e.target.value)} required placeholder="Audited physical discrepancy, damage scrap, or calibration loss..." />
          </Field>
        </form>
      </Modal>

      {/* Stock Reconciliation Modal */}
      <Modal
        open={reconOpen}
        onClose={() => setReconOpen(false)}
        title="Inventory Stock Reconciliation"
        subtitle="Verification between operational stock balances and the immutable transaction ledger."
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500">
              {reconData?.matched ? 'All material balances match ledger.' : `${reconData?.discrepanciesCount || 0} discrepancy(ies) detected.`}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setReconOpen(false)}>Close</Button>
              {!reconData?.matched && can('supply_chain', 'approve') && (
                <Button onClick={handleRunReconcile} loading={reconciling}>
                  Align with Ledger
                </Button>
              )}
            </div>
          </div>
        }
      >
        {reconLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Running reconciliation audit...</div>
        ) : reconData ? (
          <div className="space-y-4">
            <div className={`p-3.5 rounded-lg border flex items-center gap-3 ${reconData.matched ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'}`}>
              {reconData.matched ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
              <div className="text-xs">
                <div className="font-semibold text-sm">{reconData.matched ? 'Ledger & Stock Perfectly Synchronized' : 'Discrepancy Detected'}</div>
                <div>Audited {reconData.totalMaterials} materials against the immutable transaction ledger.</div>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {(reconData.materials || []).map((m: any) => (
                <div key={m.materialId} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-semibold mr-1.5">{m.materialCode}</span>
                    <span>{m.materialName}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-slate-500">Stock: {m.currentStock} {m.unit}</span>
                    <span className="text-slate-500">Ledger: {m.ledgerBalance} {m.unit}</span>
                    <StatusBadge status={m.status === 'MATCHED' ? 'Accepted' : 'Issue'} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Material Stock Add/Decrease & Supplier History Modal */}
      <Modal
        open={Boolean(detailMaterial)}
        onClose={() => setDetailMaterial(null)}
        title={detailMaterial ? `${detailMaterial.code} — ${detailMaterial.name}` : ''}
        subtitle={
          detailMaterial
            ? `${detailMaterial.category} · Storage: ${detailMaterial.storageLocation} · Unit: ${detailMaterial.unit}`
            : ''
        }
        size="xl"
        footer={<Button variant="secondary" onClick={() => setDetailMaterial(null)}>Close</Button>}
      >
        {detailMaterial && (() => {
          const mat = detailMaterial;
          const avail = data.stockMap[mat.id] || 0;
          const txns = (data.stockTransactions || [])
            .filter((t) => t.materialId === mat.id)
            .slice()
            .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
          const totalAdded = txns
            .filter((t) => t.quantityDelta > 0)
            .reduce((sum, t) => sum + t.quantityDelta, 0);
          const totalDecreased = txns
            .filter((t) => t.quantityDelta < 0)
            .reduce((sum, t) => sum + Math.abs(t.quantityDelta), 0);

          const supplierPurchases = (data.supplierPOs || [])
            .flatMap((po) =>
              (po.items || [])
                .filter((it) => it.materialId === mat.id || (it.materialCode && it.materialCode === mat.code))
                .map((it) => ({
                  po,
                  item: it,
                  supplier: (data.suppliers || []).find((s) => s.id === po.supplierId),
                })),
            )
            .sort((a, b) => (b.po.poDate || b.po.createdAt || '').localeCompare(a.po.poDate || a.po.createdAt || ''));

          const approvedSuppliers = (data.suppliers || []).filter(
            (s) => s.id === mat.preferredSupplierId || (s.suppliedMaterialIds || []).includes(mat.id),
          );

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Available Stock</div>
                  <div className={`text-lg font-mono font-bold mt-0.5 ${avail < mat.minStock ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {avail} {mat.unit}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Minimum Level</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">
                    {mat.minStock} {mat.unit}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30">
                  <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Total Stock Added</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-emerald-700 dark:text-emerald-300">
                    +{totalAdded} {mat.unit}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30">
                  <div className="text-[11px] font-medium text-red-700 dark:text-red-400">Total Stock Decreased</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-red-700 dark:text-red-300">
                    -{totalDecreased} {mat.unit}
                  </div>
                </div>
              </div>

              <Tabs
                active={detailTab}
                onChange={setDetailTab}
                tabs={[
                  { key: 'movements', label: 'Stock Add / Decrease', count: txns.length },
                  { key: 'suppliers', label: 'Suppliers (Date-wise)', count: supplierPurchases.length },
                ]}
              />

              {detailTab === 'movements' && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {txns.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No stock add or decrease movements recorded for this material yet.
                    </div>
                  ) : (
                    txns.map((t, idx) => {
                      const isAdd = t.quantityDelta >= 0;
                      const num = String(idx + 1).padStart(2, '0');
                      return (
                        <div
                          key={t.id}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                              {num}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${isAdd ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'}`}>
                                  {isAdd ? 'Stock Added' : 'Stock Decreased'}
                                </span>
                                <span className="font-medium text-slate-900 dark:text-slate-100">{t.type}</span>
                                <span className="font-mono text-xs text-slate-500">· {t.linkedDocNo}</span>
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                {(t.timestamp || '').slice(0, 16).replace('T', ' ')} · By {t.performedBy}
                                {t.remarks ? ` · ${t.remarks}` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="text-left sm:text-right shrink-0 pl-8 sm:pl-0">
                            <div className={`font-mono font-bold text-sm ${isAdd ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                              {isAdd ? `+${t.quantityDelta}` : t.quantityDelta} {t.unit}
                            </div>
                            <div className="text-xs font-mono text-slate-500">
                              Balance: {t.balanceAfter} {t.unit}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {detailTab === 'suppliers' && (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {approvedSuppliers.length > 0 && (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-xs font-medium text-slate-500 mb-1.5">Preferred / Mapped Suppliers</div>
                      <div className="flex flex-wrap gap-2">
                        {approvedSuppliers.map((sup) => (
                          <span
                            key={sup.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
                          >
                            <span>{sup.name}</span>
                            {sup.id === mat.preferredSupplierId && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-semibold">
                                Preferred
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {supplierPurchases.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No supplier purchase orders recorded for this material yet.
                    </div>
                  ) : (
                    supplierPurchases.map(({ po, item, supplier }, idx) => {
                      const num = String(idx + 1).padStart(2, '0');
                      const rate = item.unitPrice || 0;
                      const total = item.lineTotal || item.orderedQty * rate;
                      return (
                        <div
                          key={`${po.id}-${idx}`}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                              {num}
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100">{po.supplierName}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                Date: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{po.poDate || (po.createdAt || '').slice(0, 10)}</span>
                                {' · '}PO: <span className="font-mono">{po.docNo}</span>
                                {supplier?.phone ? ` · ${supplier.phone}` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-8 sm:pl-0">
                            <div className="text-left sm:text-right">
                              <div className="font-mono text-xs font-semibold">
                                Ordered: {item.orderedQty} {item.unit || mat.unit}
                                {item.acceptedQty > 0 ? ` · Accepted: ${item.acceptedQty}` : ''}
                              </div>
                              <div className="text-xs font-mono text-slate-500">
                                {formatCurrency(rate)}/{item.unit || mat.unit} · Total {formatCurrency(total)}
                              </div>
                            </div>
                            <StatusBadge status={po.status} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export const SuppliersPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierTab, setSupplierTab] = useState('materials');
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', gstin: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return null;

  const filtered = data.suppliers.filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.contactPerson.toLowerCase().includes(q) || s.gstin.toLowerCase().includes(q);
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await erpApi.createSupplier(form);
      await refresh();
      toast('success', 'Supplier added', form.name);
      setOpen(false);
      setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', gstin: '', notes: '' });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const openSupplierDetail = (s: Supplier) => {
    setSelectedSupplier(s);
    setSupplierTab('materials');
  };

  const columns: ColumnDef<Supplier>[] = [
    {
      key: 'name',
      header: 'Supplier',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <button
          type="button"
          onClick={() => openSupplierDetail(r)}
          className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          {r.name}
        </button>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (r) => (
        <div>
          <div>{r.contactPerson}</div>
          <div className="text-xs text-slate-500">{r.phone} · {r.email}</div>
        </div>
      ),
    },
    { key: 'gstin', header: 'GSTIN', render: (r) => <span className="font-mono text-xs">{r.gstin || '—'}</span> },
    {
      key: 'pos',
      header: 'POs / Items',
      align: 'right',
      render: (r) => {
        const pos = data.supplierPOs.filter((p) => p.supplierId === r.id);
        const itemCount = pos.reduce((s, p) => s + (p.items || []).length, 0);
        return (
          <span className="font-mono text-xs">
            {pos.length} POs · {itemCount} items
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <Button size="sm" variant="secondary" onClick={() => openSupplierDetail(r)}>
          <Eye className="w-3.5 h-3.5" />
          Show
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Approved raw-material vendors for shortage procurement and regular stock replenishment."
        actions={
          can('supply_chain', 'create') && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Supplier
            </Button>
          )
        }
      />
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search supplier, contact, or GSTIN..." />
      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => openSupplierDetail(r)}
              className="text-left font-semibold text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {r.name}
            </button>
            <div className="text-xs text-slate-500">{r.contactPerson} · {r.phone}</div>
            <div className="text-xs font-mono text-slate-500">GSTIN: {r.gstin || 'N/A'}</div>
            <div className="pt-2">
              <Button size="sm" variant="secondary" onClick={() => openSupplierDetail(r)}>
                <Eye className="w-3.5 h-3.5" />
                Show
              </Button>
            </div>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Supplier"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="sup-form" loading={submitting}>Save Supplier</Button>
          </>
        }
      >
        <form id="sup-form" onSubmit={handleCreate} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Supplier Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Contact Person"><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="GSTIN"><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></Field>
          </div>
          <Field label="Address"><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </form>
      </Modal>

      {/* Supplier Purchase & Materials Bought Modal */}
      <Modal
        open={Boolean(selectedSupplier)}
        onClose={() => setSelectedSupplier(null)}
        title={selectedSupplier ? `${selectedSupplier.name} — Purchase Details` : ''}
        subtitle={
          selectedSupplier
            ? `${selectedSupplier.contactPerson || 'Primary Contact'} · ${selectedSupplier.phone || '—'} · GSTIN: ${selectedSupplier.gstin || 'N/A'}`
            : ''
        }
        size="xl"
        footer={<Button variant="secondary" onClick={() => setSelectedSupplier(null)}>Close</Button>}
      >
        {selectedSupplier && (() => {
          const sup = selectedSupplier;
          const pos = (data.supplierPOs || [])
            .filter((p) => p.supplierId === sup.id)
            .slice()
            .sort((a, b) => (b.poDate || b.createdAt || '').localeCompare(a.poDate || a.createdAt || ''));
          const boughtItems = pos.flatMap((po) => (po.items || []).map((item) => ({ po, item })));
          const distinctMaterials = new Set(boughtItems.map((x) => x.item.materialId || x.item.materialCode)).size;
          const totalUnits = boughtItems.reduce((sum, x) => sum + (x.item.orderedQty || 0), 0);
          const totalValue = boughtItems.reduce(
            (sum, x) => sum + (x.item.lineTotal || x.item.orderedQty * (x.item.unitPrice || 0)),
            0,
          );
          const grns = (data.grns || [])
            .filter((g) => g.supplierId === sup.id)
            .slice()
            .sort((a, b) => (b.receivedDate || b.createdAt || '').localeCompare(a.receivedDate || a.createdAt || ''));

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Materials Bought</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">
                    {boughtItems.length} <span className="text-xs font-normal text-slate-500">({distinctMaterials} unique)</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Purchase Orders</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">{pos.length}</div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Total Qty Ordered</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">{totalUnits}</div>
                </div>
                <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30">
                  <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Total Purchase Value</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-amber-700 dark:text-amber-300">{formatCurrency(totalValue)}</div>
                </div>
              </div>

              <Tabs
                active={supplierTab}
                onChange={setSupplierTab}
                tabs={[
                  { key: 'materials', label: 'Materials Bought', count: boughtItems.length },
                  { key: 'pos', label: 'Purchase Orders', count: pos.length },
                  { key: 'grns', label: 'GRN Receipts', count: grns.length },
                  { key: 'info', label: 'Supplier Info' },
                ]}
              />

              {supplierTab === 'materials' && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {boughtItems.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No materials purchased from this supplier yet.
                    </div>
                  ) : (
                    boughtItems.map(({ po, item }, idx) => {
                      const num = String(idx + 1).padStart(2, '0');
                      const rate = item.unitPrice || 0;
                      const total = item.lineTotal || item.orderedQty * rate;
                      return (
                        <div
                          key={`${po.id}-${item.materialId || item.materialCode}-${idx}`}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                              {num}
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {item.materialName}
                                <span className="font-mono text-xs text-slate-500 ml-1.5">({item.materialCode})</span>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                Date: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{po.poDate || (po.createdAt || '').slice(0, 10)}</span>
                                {' · '}PO: <span className="font-mono">{po.docNo}</span>
                                {' · '}{po.purchaseType}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-8 sm:pl-0">
                            <div className="text-left sm:text-right">
                              <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                                Qty: {item.orderedQty} {item.unit}
                                {item.acceptedQty > 0 ? ` · Accepted: ${item.acceptedQty}` : ''}
                              </div>
                              <div className="text-xs font-mono text-slate-500">
                                {formatCurrency(rate)}/{item.unit} · {formatCurrency(total)}
                              </div>
                            </div>
                            <StatusBadge status={po.status} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {supplierTab === 'pos' && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {pos.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No purchase orders raised for this supplier.
                    </div>
                  ) : (
                    pos.map((po, idx) => {
                      const num = String(idx + 1).padStart(2, '0');
                      return (
                        <div key={po.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                              {num}
                            </span>
                            <div className="min-w-0">
                              <div className="font-mono font-semibold">{po.docNo}</div>
                              <div className="text-xs text-slate-500">
                                Date: {po.poDate || (po.createdAt || '').slice(0, 10)} · {(po.items || []).length} item(s) · {po.purchaseType}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-mono font-semibold">{formatCurrency(po.totalAmount)}</span>
                            <StatusBadge status={po.status} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {supplierTab === 'grns' && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {grns.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No GRN receipts logged for this supplier.
                    </div>
                  ) : (
                    grns.map((g, idx) => {
                      const num = String(idx + 1).padStart(2, '0');
                      const acc = (g.items || []).reduce((s, it) => s + (it.acceptedQty || 0), 0);
                      const rej = (g.items || []).reduce((s, it) => s + (it.rejectedQty || 0), 0);
                      return (
                        <div key={g.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                              {num}
                            </span>
                            <div>
                              <div className="font-mono font-semibold">{g.docNo} <span className="text-xs font-normal text-slate-500">(PO: {g.supplierPoDocNo})</span></div>
                              <div className="text-xs text-slate-500">
                                Received: {g.receivedDate || (g.createdAt || '').slice(0, 10)} · Accepted: {acc} · Rejected: {rej}
                              </div>
                            </div>
                          </div>
                          <StatusBadge status={g.verificationStatus} />
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {supplierTab === 'info' && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-xs text-slate-500">Contact Person</dt><dd>{sup.contactPerson || '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Phone</dt><dd>{sup.phone || '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Email</dt><dd>{sup.email || '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">GSTIN</dt><dd className="font-mono">{sup.gstin || '—'}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Address</dt><dd>{sup.address || '—'}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Notes</dt><dd>{sup.notes || '—'}</dd></div>
                </dl>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export const StockHistoryPage: React.FC = () => {
  const { data } = useERP();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  if (!data) return null;

  const reversed = [...data.stockTransactions].reverse().filter((t) => {
    if (typeFilter !== 'All' && t.type !== typeFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || t.materialName.toLowerCase().includes(q) || t.materialCode.toLowerCase().includes(q) || t.linkedDocNo.toLowerCase().includes(q);
  });

  const exportCSV = () => {
    const headers = ['Timestamp', 'Material Code', 'Material Name', 'Unit', 'Transaction Type', 'Delta', 'Balance After', 'Linked Doc', 'Performed By', 'Remarks'];
    const rows = reversed.map((t) => [
      t.timestamp,
      t.materialCode,
      `"${t.materialName.replace(/"/g, '""')}"`,
      t.unit,
      t.type,
      t.quantityDelta,
      t.balanceAfter,
      t.linkedDocNo,
      `"${t.performedBy}"`,
      `"${(t.remarks || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Movement_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns: ColumnDef<StockTransaction>[] = [
    { key: 'time', header: 'Date / Time', render: (r) => <span className="font-mono text-xs">{r.timestamp.slice(0, 16).replace('T', ' ')}</span> },
    {
      key: 'mat',
      header: 'Material',
      render: (r) => (
        <div>
          <span className="font-mono text-xs text-slate-500 mr-1.5">{r.materialCode}</span>
          <span className="font-medium">{r.materialName}</span>
        </div>
      ),
    },
    { key: 'type', header: 'Transaction', render: (r) => <StatusBadge status={r.type === 'GRN Accepted' ? 'Accepted' : r.type === 'Material Issue' ? 'Dispatched' : 'Active'} /> },
    { key: 'doc', header: 'Linked Doc', render: (r) => <span className="font-mono text-xs">{r.linkedDocNo}</span> },
    {
      key: 'delta',
      header: 'Change',
      align: 'right',
      render: (r) => (
        <span className={`font-mono font-semibold ${r.quantityDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
          {r.quantityDelta >= 0 ? `+${r.quantityDelta}` : r.quantityDelta} {r.unit}
        </span>
      ),
    },
    { key: 'bal', header: 'Balance After', align: 'right', render: (r) => <span className="font-mono">{r.balanceAfter} {r.unit}</span> },
    { key: 'by', header: 'By', render: (r) => <span className="text-xs text-slate-500">{r.performedBy}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Movement Ledger"
        subtitle="Immutable transaction history for every accepted GRN, material issue, and authorized adjustment."
        actions={
          <Button variant="secondary" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            Export Ledger CSV
          </Button>
        }
      />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search material code, name, or document ID..."
        statuses={['All', 'GRN Accepted', 'Material Issue', 'Opening Balance', 'Stock Adjustment', 'Production Return']}
        activeStatus={typeFilter}
        onStatusChange={setTypeFilter}
      />
      <DataTable
        rows={reversed}
        columns={columns}
        pageSize={15}
        renderMobileCard={(r) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono">{r.linkedDocNo} · {r.type}</span>
              <span className={`font-mono font-semibold ${r.quantityDelta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {r.quantityDelta >= 0 ? `+${r.quantityDelta}` : r.quantityDelta} {r.unit}
              </span>
            </div>
            <div className="font-medium text-sm">{r.materialName}</div>
            <div className="text-xs text-slate-500">Bal: {r.balanceAfter} · {r.performedBy} · {r.timestamp.slice(0, 10)}</div>
          </div>
        )}
      />
    </div>
  );
};
