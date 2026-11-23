import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Plus, Trash2 } from 'lucide-react';
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
  const [detailTab, setDetailTab] = useState('orders');
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
            setDetailTab('orders');
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
            setDetailTab('orders');
          }}
        >
          <Eye className="w-3.5 h-3.5" />
          Show
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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedCustomer(r);
                  setDetailTab('orders');
                }}
              >
                <Eye className="w-3.5 h-3.5" />
                Show
              </Button>
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
        {selectedCustomer && (() => {
          const cust = selectedCustomer;
          const custEnquiries = (data.enquiries || [])
            .filter((e) => e.customerId === cust.id)
            .slice()
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          const custQuotes = (data.quotations || [])
            .filter((q) => q.customerId === cust.id)
            .slice()
            .sort((a, b) => (b.quotationDate || b.createdAt || '').localeCompare(a.quotationDate || a.createdAt || ''));
          const custOrders = (data.salesOrders || [])
            .filter((s) => s.customerId === cust.id)
            .slice()
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          const custPayments = (data.payments || [])
            .filter((p) => p.customerId === cust.id)
            .slice()
            .sort((a, b) => (b.paymentDate || b.createdAt || '').localeCompare(a.paymentDate || a.createdAt || ''));
          const totalOrderedQty = custOrders.reduce(
            (sum, s) => sum + (s.items || []).reduce((iSum, it) => iSum + (it.quantity || 0), 0),
            0,
          );
          const totalOrderValue = custOrders.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Sales Orders</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">{custOrders.length}</div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Total Products Ordered</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">{totalOrderedQty} Units</div>
                </div>
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30">
                  <div className="text-[11px] font-medium text-blue-700 dark:text-blue-400">Total Order Value</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-blue-700 dark:text-blue-300">{formatCurrency(totalOrderValue)}</div>
                </div>
              </div>

              <Tabs
                active={detailTab}
                onChange={setDetailTab}
                tabs={[
                  { key: 'orders', label: 'Sales Orders', count: custOrders.length },
                  { key: 'quotations', label: 'Quotations', count: custQuotes.length },
                  { key: 'enquiries', label: 'Enquiries', count: custEnquiries.length },
                  { key: 'payments', label: 'Payments', count: custPayments.length },
                  { key: 'overview', label: 'Overview' },
                ]}
              />

              {detailTab === 'orders' && (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {custOrders.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No sales orders recorded for this customer yet.
                    </div>
                  ) : (
                    custOrders.map((s, idx) => {
                      const num = String(idx + 1).padStart(2, '0');
                      const orderDate = (s.createdAt || '').slice(0, 10) || '—';
                      return (
                        <div key={s.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2 text-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {num}
                              </span>
                              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{s.docNo}</span>
                              <span className="text-xs text-slate-500">Order Date: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{orderDate}</span></span>
                              {s.promisedDeliveryDate && (
                                <span className="text-xs text-slate-500">· Delivery Due: <span className="font-mono">{s.promisedDeliveryDate}</span></span>
                              )}
                              {s.customerPoNumber && (
                                <span className="text-xs text-slate-500">· PO: <span className="font-mono">{s.customerPoNumber}</span></span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-semibold">{formatCurrency(s.totalAmount)}</span>
                              <StatusBadge status={s.fulfillmentStatus} />
                            </div>
                          </div>
                          {(s.items || []).length > 0 && (
                            <div className="pl-7 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                              {(s.items || []).map((it, itemIdx) => (
                                <div key={`${it.id || itemIdx}`} className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                                  <div>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">{it.productName}</span>
                                    {it.model ? <span className="font-mono ml-1.5 text-slate-500">({it.model})</span> : null}
                                  </div>
                                  <div className="font-mono shrink-0">
                                    {it.quantity} × {formatCurrency(it.unitPrice)} = <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(it.lineTotal || it.quantity * it.unitPrice)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {detailTab === 'overview' && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-xs text-slate-500">Phone</dt><dd>{cust.phone || '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">GSTIN</dt><dd className="font-mono">{cust.gstin || '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Billing Address</dt><dd>{cust.billingAddress || '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Shipping Address</dt><dd>{cust.shippingAddress || '—'}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Notes</dt><dd>{cust.notes || '—'}</dd></div>
                </dl>
              )}

              {detailTab === 'enquiries' && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {custEnquiries.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No enquiries recorded for this customer.
                    </div>
                  ) : (
                    custEnquiries.map((e) => (
                      <div key={e.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between text-sm">
                        <div>
                          <span className="font-mono font-medium">{e.docNo}</span>
                          <span className="text-xs text-slate-500 ml-2">{(e.createdAt || '').slice(0, 10)}</span>
                          <span className="text-xs text-slate-500 ml-2">· {e.items.map((i) => `${i.quantity}× ${i.model}`).join(', ')}</span>
                        </div>
                        <StatusBadge status={e.status} />
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'quotations' && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {custQuotes.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No quotations issued for this customer.
                    </div>
                  ) : (
                    custQuotes.map((q) => (
                      <div key={q.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between text-sm">
                        <div>
                          <span className="font-mono font-medium">{q.docNo}</span>
                          <span className="text-xs text-slate-500 ml-2">{q.quotationDate || (q.createdAt || '').slice(0, 10)}</span>
                          <span className="text-xs font-mono text-slate-500 ml-3">{formatCurrency(q.totalAmount)}</span>
                        </div>
                        <StatusBadge status={q.status} />
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'payments' && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {custPayments.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No payments logged for this customer.
                    </div>
                  ) : (
                    custPayments.map((p) => (
                      <div key={p.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between text-sm">
                        <div>
                          <span className="font-mono font-medium">{p.docNo}</span>
                          <span className="text-xs text-slate-500 ml-2">{p.paymentDate} · {p.method} ({p.transactionRef})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{formatCurrency(p.amount)}</span>
                          <StatusBadge status={p.status} />
                        </div>
                      </div>
                    ))
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

export const ProductsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productTab, setProductTab] = useState('orders');
  const [categories, setCategories] = useState<string[]>([]);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [catError, setCatError] = useState<string | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);

  const defaultCategories = useMemo(
    () => [
      'Ultra Low Temperature Freezers',
      'Laboratory Refrigerators',
      'Cold Rooms',
      'Environmental Chambers',
      'Scientific Equipment',
    ],
    [],
  );

  const allCategories = useMemo(() => {
    return Array.from(new Set([...defaultCategories, ...categories]));
  }, [defaultCategories, categories]);

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

  useEffect(() => {
    let active = true;
    erpApi
      .getProductCategories()
      .then((cats) => {
        if (!active) return;
        const catNames = cats.filter((c) => c.active).map((c) => c.name);
        const existingFromCatalog = data ? Array.from(new Set(data.products.map((p) => p.category).filter(Boolean))) : [];
        const merged = Array.from(new Set([...catNames, ...existingFromCatalog]));
        if (merged.length > 0) setCategories(merged);
      })
      .catch(() => {
        if (data) {
          const existingFromCatalog = Array.from(new Set(data.products.map((p) => p.category).filter(Boolean)));
          if (existingFromCatalog.length > 0) setCategories(existingFromCatalog);
        }
      });
    return () => {
      active = false;
    };
  }, [data]);

  if (!data) return null;

  const handleCreateCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCatError(null);
    const clean = newCategoryName.trim();
    if (!clean) {
      setCatError('Category name is required.');
      return;
    }
    const exists = allCategories.some((c) => c.toLowerCase() === clean.toLowerCase());
    if (exists) {
      setCatError(`Category "${clean}" already exists.`);
      return;
    }
    setCreatingCat(true);
    try {
      await erpApi.createProductCategory(clean);
      setCategories((prev) => [...prev, clean]);
      setForm((prev) => ({ ...prev, category: clean }));
      toast('success', 'Category Created', `Category "${clean}" added to catalog and selected.`);
      setNewCategoryName('');
      setShowNewCategoryModal(false);
    } catch (err) {
      setCatError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setCreatingCat(false);
    }
  };

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
      setForm({
        code: '',
        name: '',
        category: allCategories[0] || 'Ultra Low Temperature Freezers',
        model: '',
        specifications: '',
        sellingPrice: 0,
        unit: 'Unit',
        description: '',
        highlights: [''],
      });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  const openProductDetail = (p: Product) => {
    setSelectedProduct(p);
    setProductTab('orders');
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
          <button
            type="button"
            onClick={() => openProductDetail(r)}
            className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            {r.name}
          </button>
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
      key: 'orders',
      header: 'Sales Orders',
      align: 'right',
      render: (r) => {
        const orderCount = (data.salesOrders || []).filter((so) =>
          (so.items || []).some((it) => it.productId === r.id || (it.model && r.model && it.model === r.model)),
        ).length;
        return <span className="font-mono">{orderCount}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) => (
        <Button size="sm" variant="secondary" onClick={() => openProductDetail(r)}>
          <Eye className="w-3.5 h-3.5" />
          Show
        </Button>
      ),
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
            <button
              type="button"
              onClick={() => openProductDetail(r)}
              className="text-left font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {r.name}
            </button>
            <div className="text-xs text-slate-500">{r.specifications}</div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-mono text-sm font-semibold">{formatCurrency(r.sellingPrice)} / {r.unit}</span>
              <Button size="sm" variant="secondary" onClick={() => openProductDetail(r)}>
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
            <Field
              label="Category"
              required
              hint={
                <button
                  type="button"
                  onClick={() => {
                    setCatError(null);
                    setNewCategoryName('');
                    setShowNewCategoryModal(true);
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-medium ml-auto"
                >
                  <Plus className="w-3.5 h-3.5" /> Add New Category
                </button>
              }
            >
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
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

      <Modal
        open={showNewCategoryModal}
        onClose={() => setShowNewCategoryModal(false)}
        title="Add Product Category"
        subtitle="Create a new reusable category in the product catalog."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewCategoryModal(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => handleCreateCategory()} loading={creatingCat}>
              Create Category
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {catError && <ErrorBanner message={catError} />}
          <Field label="Category Name" required>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Cryogenic Storage Tanks"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateCategory();
                }
              }}
            />
          </Field>
        </div>
      </Modal>

      {/* Product Sales Orders & Details Modal */}
      <Modal
        open={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        title={selectedProduct ? `${selectedProduct.name} (${selectedProduct.model})` : ''}
        subtitle={
          selectedProduct
            ? `Code: ${selectedProduct.code} · Category: ${selectedProduct.category} · Default Price: ${formatCurrency(selectedProduct.sellingPrice)} / ${selectedProduct.unit}`
            : ''
        }
        size="xl"
        footer={<Button variant="secondary" onClick={() => setSelectedProduct(null)}>Close</Button>}
      >
        {selectedProduct && (() => {
          const prod = selectedProduct;
          const matchesProduct = (it: { productId?: string; model?: string }) =>
            it.productId === prod.id || (Boolean(it.model) && Boolean(prod.model) && it.model === prod.model);

          const soLines = (data.salesOrders || [])
            .flatMap((so) => (so.items || []).filter(matchesProduct).map((item) => ({ so, item })))
            .sort((a, b) => (b.so.createdAt || '').localeCompare(a.so.createdAt || ''));

          const distinctSoCount = new Set(soLines.map((x) => x.so.id)).size;
          const totalUnits = soLines.reduce((sum, x) => sum + (x.item.quantity || 0), 0);
          const totalSalesValue = soLines.reduce(
            (sum, x) => sum + (x.item.lineTotal || (x.item.quantity || 0) * (x.item.unitPrice || 0)),
            0,
          );

          const qtLines = (data.quotations || [])
            .flatMap((q) => (q.items || []).filter(matchesProduct).map((item) => ({ q, item })))
            .sort((a, b) => (b.q.quotationDate || b.q.createdAt || '').localeCompare(a.q.quotationDate || a.q.createdAt || ''));

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Sales Orders</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">{distinctSoCount}</div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Total Units Ordered</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">
                    {totalUnits} {prod.unit}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30">
                  <div className="text-[11px] font-medium text-blue-700 dark:text-blue-400">Total Order Value</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-blue-700 dark:text-blue-300">
                    {formatCurrency(totalSalesValue)}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-[11px] font-medium text-slate-500">Default Price</div>
                  <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">
                    {formatCurrency(prod.sellingPrice)}
                  </div>
                </div>
              </div>

              <Tabs
                active={productTab}
                onChange={setProductTab}
                tabs={[
                  { key: 'orders', label: 'Sales Orders', count: soLines.length },
                  { key: 'quotations', label: 'Quotations', count: qtLines.length },
                  { key: 'specs', label: 'Specifications' },
                ]}
              />

              {productTab === 'orders' && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {soLines.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No sales orders found for this product yet.
                    </div>
                  ) : (
                    soLines.map(({ so, item }, idx) => {
                      const num = String(idx + 1).padStart(2, '0');
                      const orderDate = (so.createdAt || '').slice(0, 10) || '—';
                      const lineVal = item.lineTotal || item.quantity * item.unitPrice;
                      return (
                        <div
                          key={`${so.id}-${idx}`}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                              {num}
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {so.customerSnapshot?.name || 'Customer'}
                                <span className="font-mono text-xs text-slate-500 ml-2">· {so.docNo}</span>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                Order Date: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{orderDate}</span>
                                {so.promisedDeliveryDate ? ` · Delivery Due: ${so.promisedDeliveryDate}` : ''}
                                {so.customerPoNumber ? ` · PO: ${so.customerPoNumber}` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-8 sm:pl-0">
                            <div className="text-left sm:text-right">
                              <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                                Qty: {item.quantity} {prod.unit}
                              </div>
                              <div className="text-xs font-mono text-slate-500">
                                {formatCurrency(item.unitPrice)}/{prod.unit} · {formatCurrency(lineVal)}
                              </div>
                            </div>
                            <StatusBadge status={so.fulfillmentStatus} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {productTab === 'quotations' && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {qtLines.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      No quotations found for this product.
                    </div>
                  ) : (
                    qtLines.map(({ q, item }, idx) => {
                      const num = String(idx + 1).padStart(2, '0');
                      const lineVal = item.lineTotal || item.quantity * item.unitPrice;
                      return (
                        <div key={`${q.id}-${idx}`} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                              {num}
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {q.customerSnapshot?.name || 'Customer'} <span className="font-mono text-xs text-slate-500 ml-1.5">{q.docNo}</span>
                              </div>
                              <div className="text-xs text-slate-500">
                                Date: {q.quotationDate || (q.createdAt || '').slice(0, 10)} · Qty: {item.quantity} {prod.unit}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-mono text-xs font-semibold">{formatCurrency(lineVal)}</span>
                            <StatusBadge status={q.status} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {productTab === 'specs' && (
                <div className="space-y-3 text-sm">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <div className="text-xs font-medium text-slate-500 mb-1">Technical Specifications</div>
                    <div className="text-slate-800 dark:text-slate-200">{prod.specifications || 'No specifications recorded.'}</div>
                  </div>
                  {(prod.highlights || []).filter(Boolean).length > 0 && (
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="text-xs font-medium text-slate-500 mb-1.5">Product Highlights</div>
                      <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300 text-xs">
                        {prod.highlights.filter(Boolean).map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
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
