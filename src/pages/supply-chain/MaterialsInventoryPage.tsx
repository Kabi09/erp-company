import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, SlidersHorizontal } from 'lucide-react';
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
  const [adjustTarget, setAdjustTarget] = useState<Material | null>(null);
  const [adjDelta, setAdjDelta] = useState('');
  const [adjRemarks, setAdjRemarks] = useState('');

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
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1' && mode === 'materials') {
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, mode]);

  if (!data) return null;

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
      await erpApi.createMaterial(form);
      await refresh();
      toast('success', `Material ${form.code} added`);
      setCreateOpen(false);
      setForm({ code: '', name: '', category: 'Cooling Systems', specification: '', unit: 'Nos', minStock: 5, storageLocation: 'Bay A-01', preferredSupplierId: '', openingStock: 0 });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create material');
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
          <div className="text-xs text-slate-500">{r.category} · {r.specification}</div>
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
      render: (r) => <span className="font-mono text-xs text-slate-500">{r.minStock} {r.unit}</span>,
    },
    {
      key: 'health',
      header: 'Status',
      render: (r) => <StatusBadge status={(data.stockMap[r.id] || 0) < r.minStock ? 'Issue' : 'Active'} />,
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (r) =>
        can('supply_chain', 'approve') ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdjustTarget(r);
              setErr(null);
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Adjust
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title={mode === 'materials' ? 'Raw Material Master' : 'Inventory / Live Stock'}
        subtitle="Stock balances are derived strictly from verified GRNs, material issues, and authorized ledger adjustments."
        actions={
          can('supply_chain', 'create') && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Material
            </Button>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by material code, name, category, or bin..."
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
            <Field label="Material Code" required>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MAT-009" required />
            </Field>
            <Field label="Material Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Category">
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="Unit of Measure" required>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Nos / Sheets / Sets / Meters" required />
            </Field>
            <Field label="Minimum Stock Level" required>
              <Input type="number" min={0} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} required />
            </Field>
            <Field label="Opening Stock Balance">
              <Input type="number" min={0} value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value) })} />
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
            <Input type="number" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} required />
          </Field>
          <Field label="Reason / Audit Reference" required>
            <Textarea value={adjRemarks} onChange={(e) => setAdjRemarks(e.target.value)} required />
          </Field>
        </form>
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
      <PageHeader title="Stock Movement Ledger" subtitle="Immutable transaction history for every accepted GRN, material issue, and authorized adjustment." />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search material code, name, or document ID..."
        statuses={['All', 'GRN Accepted', 'Material Issue', 'Opening Balance', 'Stock Adjustment']}
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
