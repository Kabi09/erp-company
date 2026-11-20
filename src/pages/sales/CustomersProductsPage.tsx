import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import type { Customer, Product } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

export const CustomersPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    billingAddress: '',
    shippingAddress: '',
    gstin: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.customers.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        c.gstin.toLowerCase().includes(q),
    );
  }, [data.customers, search]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await erpApi.createCustomer(form);
      await refresh();
      toast('success', 'Customer added', form.name);
      setCreateOpen(false);
      setForm({ name: '', contactPerson: '', phone: '', email: '', billingAddress: '', shippingAddress: '', gstin: '', notes: '' });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save customer');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<Customer>[] = [
    {
      key: 'name',
      header: 'Customer / Company',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <button
          type="button"
          onClick={() => {
            setSelectedCustomer(r);
            setDetailTab('overview');
          }}
          className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          {r.name}
        </button>
      ),
    },
    {
      key: 'contact',
      header: 'Contact Person',
      render: (r) => (
        <div>
          <div>{r.contactPerson || '—'}</div>
          <div className="text-xs text-slate-500">{r.phone} · {r.email}</div>
        </div>
      ),
    },
    {
      key: 'gstin',
      header: 'GSTIN',
      render: (r) => <span className="font-mono text-xs">{r.gstin || '—'}</span>,
    },
    {
      key: 'orders',
      header: 'Sales Orders',
      align: 'right',
      render: (r) => (
        <span className="font-mono">{data.salesOrders.filter((s) => s.customerId === r.id).length}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSelectedCustomer(r);
            setDetailTab('overview');
          }}
        >
          View History
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Customer master records and complete commercial transaction history."
        actions={
          can('sales', 'create') && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Customer
            </Button>
          )
        }
      />
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search by company, contact, or GSTIN..." />
      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="font-semibold text-sm">{r.name}</div>
            <div className="text-xs text-slate-500">{r.contactPerson} · {r.phone}</div>
            <div className="text-xs font-mono text-slate-500">GSTIN: {r.gstin || 'N/A'}</div>
            <div className="pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedCustomer(r)}>View History</Button>
            </div>
          </div>
        )}
      />

      {/* Add Customer Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Customer"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="cust-form" loading={submitting}>Save Customer</Button>
          </>
        }
      >
        <form id="cust-form" onSubmit={handleSave} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Customer / Company Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Contact Person">
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="GSTIN">
              <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </Field>
          </div>
          <Field label="Billing Address">
            <Textarea value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} rows={2} />
          </Field>
          <Field label="Shipping Address">
            <Textarea value={form.shippingAddress} onChange={(e) => setForm({ ...form, shippingAddress: e.target.value })} rows={2} />
          </Field>
          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </form>
      </Modal>

      {/* Customer Detail Drawer Modal */}
      <Modal
        open={Boolean(selectedCustomer)}
        onClose={() => setSelectedCustomer(null)}
        title={selectedCustomer?.name || ''}
        subtitle={selectedCustomer ? `${selectedCustomer.contactPerson} · ${selectedCustomer.email}` : ''}
        size="xl"
      >
        {selectedCustomer && (
          <div>
            <Tabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { key: 'overview', label: 'Overview' },
                { key: 'enquiries', label: 'Enquiries', count: data.enquiries.filter((e) => e.customerId === selectedCustomer.id).length },
                { key: 'quotations', label: 'Quotations', count: data.quotations.filter((q) => q.customerId === selectedCustomer.id).length },
                { key: 'orders', label: 'Orders', count: data.salesOrders.filter((s) => s.customerId === selectedCustomer.id).length },
                { key: 'payments', label: 'Payments', count: data.payments.filter((p) => p.customerId === selectedCustomer.id).length },
              ]}
            />
            {detailTab === 'overview' && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-slate-500">Phone</dt><dd>{selectedCustomer.phone || '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">GSTIN</dt><dd className="font-mono">{selectedCustomer.gstin || '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Billing Address</dt><dd>{selectedCustomer.billingAddress || '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Shipping Address</dt><dd>{selectedCustomer.shippingAddress || '—'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Notes</dt><dd>{selectedCustomer.notes || '—'}</dd></div>
              </dl>
            )}
            {detailTab === 'enquiries' && (
              <div className="space-y-2">
                {data.enquiries.filter((e) => e.customerId === selectedCustomer.id).map((e) => (
                  <div key={e.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between text-sm">
                    <div>
                      <span className="font-mono font-medium">{e.docNo}</span>
                      <span className="text-xs text-slate-500 ml-2">{e.items.map((i) => `${i.quantity}× ${i.model}`).join(', ')}</span>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                ))}
              </div>
            )}
            {detailTab === 'quotations' && (
              <div className="space-y-2">
                {data.quotations.filter((q) => q.customerId === selectedCustomer.id).map((q) => (
                  <div key={q.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between text-sm">
                    <div>
                      <span className="font-mono font-medium">{q.docNo}</span>
                      <span className="text-xs font-mono text-slate-500 ml-3">{formatCurrency(q.totalAmount)}</span>
                    </div>
                    <StatusBadge status={q.status} />
                  </div>
                ))}
              </div>
            )}
            {detailTab === 'orders' && (
              <div className="space-y-2">
                {data.salesOrders.filter((s) => s.customerId === selectedCustomer.id).map((s) => (
                  <div key={s.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between text-sm">
                    <div>
                      <span className="font-mono font-medium">{s.docNo}</span>
                      <span className="text-xs font-mono text-slate-500 ml-3">{formatCurrency(s.totalAmount)}</span>
                    </div>
                    <StatusBadge status={s.fulfillmentStatus} />
                  </div>
                ))}
              </div>
            )}
            {detailTab === 'payments' && (
              <div className="space-y-2">
                {data.payments.filter((p) => p.customerId === selectedCustomer.id).map((p) => (
                  <div key={p.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between text-sm">
                    <div>
                      <span className="font-mono font-medium">{p.docNo}</span>
                      <span className="text-xs text-slate-500 ml-2">{p.paymentDate} · {p.method} ({p.transactionRef})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{formatCurrency(p.amount)}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export const ProductsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    category: 'Ultra Low Temperature Freezers',
    model: '',
    specifications: '',
    sellingPrice: 0,
    unit: 'Unit',
    description: '',
    highlights: [''],
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.products.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [data.products, search]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await erpApi.createProduct(form);
      await refresh();
      toast('success', 'Product added to catalogue', `${form.name} (${form.model})`);
      setOpen(false);
      setForm({ code: '', name: '', category: 'Ultra Low Temperature Freezers', model: '', specifications: '', sellingPrice: 0, unit: 'Unit', description: '', highlights: [''] });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<Product>[] = [
    {
      key: 'code',
      header: 'Code / Model',
      sortable: true,
      sortValue: (r) => r.code,
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-xs">{r.code}</div>
          <div className="text-xs text-slate-500">{r.model}</div>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-slate-500">{r.category}</div>
        </div>
      ),
    },
    {
      key: 'specs',
      header: 'Specifications',
      render: (r) => <div className="text-xs text-slate-600 dark:text-slate-400 max-w-md">{r.specifications}</div>,
    },
    {
      key: 'price',
      header: 'Default Price',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.sellingPrice,
      render: (r) => <span className="font-mono font-medium">{formatCurrency(r.sellingPrice)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Saleable Products"
        subtitle="CRYO equipment catalogue separate from raw materials, with reusable highlights and BOM templates."
        actions={
          can('sales', 'create') && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Product
            </Button>
          )
        }
      />
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search by product name, model, code, or category..." />
      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold">{r.code} · {r.model}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="font-medium text-sm">{r.name}</div>
            <div className="text-xs text-slate-500">{r.specifications}</div>
            <div className="font-mono text-sm font-semibold pt-1">{formatCurrency(r.sellingPrice)} / {r.unit}</div>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Saleable Product"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="prod-form" loading={submitting}>Save Product</Button>
          </>
        }
      >
        <form id="prod-form" onSubmit={handleSave} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Product Code" required>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CRYO-ULT-600" required />
            </Field>
            <Field label="Model" required>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="ULT-600" required />
            </Field>
            <Field label="Product Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Category" required>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="Ultra Low Temperature Freezers">Ultra Low Temperature Freezers</option>
                <option value="Laboratory Refrigerators">Laboratory Refrigerators</option>
                <option value="Cold Rooms">Cold Rooms</option>
                <option value="Environmental Chambers">Environmental Chambers</option>
                <option value="Scientific Equipment">Scientific Equipment</option>
              </Select>
            </Field>
            <Field label="Default Selling Price (₹)" required>
              <Input type="number" min={0} value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })} required />
            </Field>
            <Field label="Unit">
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </Field>
          </div>
          <Field label="Technical Specifications">
            <Textarea value={form.specifications} onChange={(e) => setForm({ ...form, specifications: e.target.value })} rows={2} />
          </Field>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Product Highlights</span>
              <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, highlights: [...form.highlights, ''] })}>
                + Add Highlight
              </Button>
            </div>
            {form.highlights.map((h, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={h}
                  onChange={(e) =>
                    setForm({ ...form, highlights: form.highlights.map((x, idx) => (idx === i ? e.target.value : x)) })
                  }
                  placeholder="Key engineering or commercial highlight..."
                />
                {form.highlights.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, highlights: form.highlights.filter((_, idx) => idx !== i) })}
                    className="p-2 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                    aria-label="Remove highlight"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </form>
      </Modal>
    </div>
  );
};
