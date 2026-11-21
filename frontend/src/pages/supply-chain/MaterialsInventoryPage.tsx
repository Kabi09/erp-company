import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Download, Edit2, Plus, RefreshCw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
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
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { Material, StockTransaction, Supplier } from '../../types/erp';

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
          <div className="font-medium">{r.name}</div>
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
              <div className="font-medium text-sm">{r.name}</div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Min: {r.minStock} {r.unit}</span>
                <span className="font-mono font-semibold text-sm">Available: {bal} {r.unit}</span>
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
    </div>
  );
};

export const SuppliersPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
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

  const columns: ColumnDef<Supplier>[] = [
    { key: 'name', header: 'Supplier', render: (r) => <span className="font-medium">{r.name}</span> },
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
      header: 'Open POs',
      align: 'right',
      render: (r) => <span className="font-mono">{data.supplierPOs.filter((p) => p.supplierId === r.id).length}</span>,
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
            <div className="font-semibold text-sm">{r.name}</div>
            <div className="text-xs text-slate-500">{r.contactPerson} · {r.phone}</div>
            <div className="text-xs font-mono text-slate-500">GSTIN: {r.gstin || 'N/A'}</div>
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
