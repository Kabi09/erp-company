import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, PhoneCall, Plus, Trash2 } from 'lucide-react';
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
import type { Enquiry } from '../../types/erp';

export const EnquiriesPage: React.FC<{ qualifiedOnly?: boolean }> = ({ qualifiedOnly = false }) => {
  const { data, refresh, toast, can } = useERP();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);

  // Create Enquiry form state
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [newCust, setNewCust] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', gstin: '' });
  const [source, setSource] = useState<'Phone' | 'Email' | 'Website' | 'Direct'>('Direct');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Array<{ productId: string; model: string; quantity: number; requiredSpecifications: string; customerRequirements: string }>>([
    { productId: '', model: '', quantity: 1, requiredSpecifications: '', customerRequirements: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1' && !qualifiedOnly) {
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, qualifiedOnly]);

  if (!data) return null;

  const filtered = useMemo(() => {
    return data.enquiries.filter((e) => {
      if (qualifiedOnly && e.status !== 'Qualified') return false;
      if (!qualifiedOnly && statusFilter !== 'All' && e.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          e.docNo.toLowerCase().includes(q) ||
          e.customerSnapshot.name.toLowerCase().includes(q) ||
          e.items.some((i) => i.productName.toLowerCase().includes(q) || i.model.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [data.enquiries, qualifiedOnly, statusFilter, search]);

  const handleProductChange = (idx: number, prodId: string) => {
    const prod = data.products.find((p) => p.id === prodId);
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              productId: prodId,
              model: prod?.model || '',
              requiredSpecifications: prod?.specifications || '',
            }
          : l,
      ),
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isNewCustomer && !customerId) {
      setFormError('Please select an existing customer or choose "New Customer".');
      return;
    }
    if (isNewCustomer && !newCust.name.trim()) {
      setFormError('Customer / company name is required.');
      return;
    }
    if (lines.some((l) => !l.productId || l.quantity <= 0)) {
      setFormError('Select a product and enter a valid quantity for every line.');
      return;
    }
    setSubmitting(true);
    try {
      const created: any = await erpApi.createEnquiry({
        isNewCustomer,
        customerId: isNewCustomer ? undefined : customerId,
        newCustomer: isNewCustomer ? newCust : undefined,
        source,
        expectedDeliveryDate,
        notes,
        items: lines,
      });
      await refresh();
      toast('success', `Enquiry ${created.docNo} created`, `Customer: ${created.customerSnapshot.name}`);
      setCreateOpen(false);
      setCustomerId('');
      setIsNewCustomer(false);
      setNewCust({ name: '', contactPerson: '', phone: '', email: '', address: '', gstin: '' });
      setNotes('');
      setLines([{ productId: '', model: '', quantity: 1, requiredSpecifications: '', customerRequirements: '' }]);
      navigate(`/sales/enquiries/${created.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create enquiry');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<Enquiry>[] = [
    {
      key: 'docNo',
      header: 'Enquiry ID',
      sortable: true,
      sortValue: (r) => r.docNo,
      render: (r) => (
        <Link to={`/sales/enquiries/${r.id}`} className="font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          {r.docNo}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      sortValue: (r) => r.customerSnapshot.name,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{r.customerSnapshot.name}</div>
          <div className="text-xs text-slate-500">{r.customerSnapshot.contactPerson} · {r.customerSnapshot.phone}</div>
        </div>
      ),
    },
    {
      key: 'products',
      header: 'Products',
      render: (r) => (
        <div className="text-xs space-y-0.5">
          {r.items.map((it) => (
            <div key={it.id}>
              <span className="font-medium">{it.productName}</span> ({it.model}) × <span className="font-mono">{it.quantity}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'expected',
      header: 'Expected Delivery',
      sortable: true,
      sortValue: (r) => r.expectedDeliveryDate || '',
      render: (r) => <span className="font-mono text-xs">{r.expectedDeliveryDate || '—'}</span>,
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
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/sales/enquiries/${r.id}`)}>
            View
          </Button>
          {r.status === 'Qualified' && can('sales', 'create') && (
            data.quotations.some((q) => q.enquiryId === r.id) ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/sales/quotations')}
              >
                View Quotation
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/sales/quotations?create=1&enquiryId=${r.id}`)}
              >
                Create Quotation
              </Button>
            )
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={qualifiedOnly ? 'Qualified Enquiries' : 'Customer Enquiries'}
        subtitle={
          qualifiedOnly
            ? 'Accepted enquiries ready for commercial quotation preparation.'
            : 'Capture customer requirements and manage sales qualification.'
        }
        actions={
          !qualifiedOnly &&
          can('sales', 'create') && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              New Enquiry
            </Button>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by enquiry ID, customer, or product..."
        statuses={qualifiedOnly ? undefined : ['All', 'New', 'Contacted', 'Qualified', 'On Hold', 'Rejected']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        emptyTitle={qualifiedOnly ? 'No qualified enquiries yet' : 'No enquiries found'}
        emptyDescription={
          qualifiedOnly
            ? 'Qualify an enquiry via follow-up acceptance to prepare a quotation.'
            : 'Create your first customer enquiry to start the sales lifecycle.'
        }
        renderMobileCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link to={`/sales/enquiries/${r.id}`} className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {r.docNo}
                </Link>
                <div className="text-sm font-medium mt-0.5">{r.customerSnapshot.name}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {r.items.map((i) => `${i.quantity}× ${i.productName} (${i.model})`).join(', ')}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500">Delivery: {r.expectedDeliveryDate || '—'}</span>
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => navigate(`/sales/enquiries/${r.id}`)}>
                  Details
                </Button>
                {r.status === 'Qualified' && can('sales', 'create') && (
                  data.quotations.some((q) => q.enquiryId === r.id) ? (
                    <Button size="sm" variant="secondary" onClick={() => navigate('/sales/quotations')}>
                      View Quote
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => navigate(`/sales/quotations?create=1&enquiryId=${r.id}`)}>
                      Quote
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      />

      {/* New Enquiry Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Customer Enquiry"
        subtitle="Select an existing customer or create one inline, then add product requirements."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="enquiry-form" loading={submitting}>
              Save Enquiry
            </Button>
          </>
        }
      >
        <form id="enquiry-form" onSubmit={handleCreateSubmit} className="space-y-5">
          {formError && <ErrorBanner message={formError} />}

          {/* Customer Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Customer Details</h3>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => setIsNewCustomer(false)}
                  className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${
                    !isNewCustomer ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Existing Customer
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewCustomer(true)}
                  className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${
                    isNewCustomer ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  New Customer
                </button>
              </div>
            </div>

            {!isNewCustomer ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Select Customer" required htmlFor="enq-cust">
                  <Select id="enq-cust" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                    <option value="">Choose customer...</option>
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.contactPerson})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Enquiry Source" htmlFor="enq-source">
                  <Select id="enq-source" value={source} onChange={(e) => setSource(e.target.value as any)}>
                    <option value="Direct">Direct</option>
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="Website">Website</option>
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Company / Customer Name" required htmlFor="nc-name">
                  <Input id="nc-name" value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} required />
                </Field>
                <Field label="Contact Person" htmlFor="nc-contact">
                  <Input id="nc-contact" value={newCust.contactPerson} onChange={(e) => setNewCust({ ...newCust, contactPerson: e.target.value })} />
                </Field>
                <Field label="Phone Number" htmlFor="nc-phone">
                  <Input id="nc-phone" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} />
                </Field>
                <Field label="Email" htmlFor="nc-email">
                  <Input id="nc-email" type="email" value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} />
                </Field>
                <Field label="Address" htmlFor="nc-addr">
                  <Input id="nc-addr" value={newCust.address} onChange={(e) => setNewCust({ ...newCust, address: e.target.value })} />
                </Field>
                <Field label="GSTIN (Optional)" htmlFor="nc-gstin">
                  <Input id="nc-gstin" value={newCust.gstin} onChange={(e) => setNewCust({ ...newCust, gstin: e.target.value })} />
                </Field>
              </div>
            )}
          </div>

          {/* Product Lines */}
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Product Requirements</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { productId: '', model: '', quantity: 1, requiredSpecifications: '', customerRequirements: '' },
                  ])
                }
              >
                <Plus className="w-3.5 h-3.5" />
                Add Product
              </Button>
            </div>

            {lines.map((line, idx) => (
              <div key={idx} className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-6">
                    <Field label="Product" required>
                      <Select value={line.productId} onChange={(e) => handleProductChange(idx, e.target.value)} required>
                        <option value="">Select product...</option>
                        {data.products.filter((p) => p.status === 'Active').map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.model}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="sm:col-span-3">
                    <Field label="Model">
                      <Input
                        value={line.model}
                        onChange={(e) =>
                          setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, model: e.target.value } : l)))
                        }
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Qty" required>
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, quantity: Number(e.target.value) } : l)),
                          )
                        }
                        required
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-1 flex items-end justify-end">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove product line"
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Required Specifications">
                    <Input
                      value={line.requiredSpecifications}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, requiredSpecifications: e.target.value } : l)),
                        )
                      }
                    />
                  </Field>
                  <Field label="Customer Requirements">
                    <Input
                      value={line.customerRequirements}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, customerRequirements: e.target.value } : l)),
                        )
                      }
                      placeholder="Calibration, accessories, special voltage..."
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <Field label="Expected Delivery Date" htmlFor="enq-date">
              <Input
                id="enq-date"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </Field>
            <Field label="Notes (Optional)" htmlFor="enq-notes">
              <Input id="enq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Project context or special notes" />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const EnquiryDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refresh, toast, can } = useERP();

  const [fuOpen, setFuOpen] = useState(false);
  const [fuForm, setFuForm] = useState({
    followUpDate: new Date().toISOString().slice(0, 10),
    contactMethod: 'Call' as 'Call' | 'Email' | 'Meeting',
    discussion: '',
    response: 'Pending' as 'Pending' | 'Accepted' | 'Rejected',
    nextFollowUpDate: '',
    rejectionReason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return null;
  const enquiry = data.enquiries.find((e) => e.id === id);
  if (!enquiry) {
    return (
      <div className="space-y-4">
        <ErrorBanner message="Enquiry record not found." />
        <Button variant="secondary" onClick={() => navigate('/sales/enquiries')}>
          Back to Enquiries
        </Button>
      </div>
    );
  }

  const followUps = data.followUps.filter((f) => f.entityType === 'enquiry' && f.entityId === enquiry.id);
  const quotations = data.quotations.filter((q) => q.enquiryId === enquiry.id);

  const handleSaveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await erpApi.createFollowUp({
        entityType: 'enquiry',
        entityId: enquiry.id,
        ...fuForm,
      });
      await refresh();
      toast(
        'success',
        'Follow-up recorded',
        fuForm.response === 'Accepted'
          ? `${enquiry.docNo} has been qualified and moved to Qualified Enquiries.`
          : `Saved against ${enquiry.docNo}.`,
      );
      setFuOpen(false);
      setFuForm({
        followUpDate: new Date().toISOString().slice(0, 10),
        contactMethod: 'Call',
        discussion: '',
        response: 'Pending',
        nextFollowUpDate: '',
        rejectionReason: '',
      });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save follow-up');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <button type="button" onClick={() => navigate('/sales/enquiries')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Enquiries
        </button>
      </div>

      <PageHeader
        title={`${enquiry.docNo} — ${enquiry.customerSnapshot.name}`}
        subtitle={`Source: ${enquiry.source} · Assigned to ${enquiry.assignedTo} · Expected Delivery: ${enquiry.expectedDeliveryDate || 'TBD'}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={enquiry.status} />
            {enquiry.status !== 'Rejected' && can('sales', 'create') && (
              <Button variant="secondary" size="sm" onClick={() => setFuOpen(true)}>
                <PhoneCall className="w-4 h-4" />
                Add Follow-up
              </Button>
            )}
            {enquiry.status === 'Qualified' && can('sales', 'create') && (
              quotations.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => navigate('/sales/quotations')}>
                  <FileText className="w-4 h-4" />
                  View Quotation
                </Button>
              ) : (
                <Button size="sm" onClick={() => navigate(`/sales/quotations?create=1&enquiryId=${enquiry.id}`)}>
                  <FileText className="w-4 h-4" />
                  Create Quotation
                </Button>
              )
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customer & Products */}
        <div className="lg:col-span-2 space-y-5">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Customer Information</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Contact Person</dt>
                <dd className="font-medium mt-0.5">{enquiry.customerSnapshot.contactPerson || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Phone / Email</dt>
                <dd className="mt-0.5">{enquiry.customerSnapshot.phone} · {enquiry.customerSnapshot.email}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Shipping Address</dt>
                <dd className="mt-0.5">{enquiry.customerSnapshot.shippingAddress || enquiry.customerSnapshot.billingAddress || '—'}</dd>
              </div>
            </dl>
            {enquiry.notes && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                Notes: {enquiry.notes}
              </div>
            )}
            {enquiry.rejectionReason && (
              <div className="mt-3 p-3 rounded bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                Rejection Reason: {enquiry.rejectionReason}
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
              Requested Products
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {enquiry.items.map((item) => (
                <div key={item.id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.productName} <span className="font-mono text-xs text-slate-500">({item.model})</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{item.requiredSpecifications}</div>
                    {item.customerRequirements && (
                      <div className="text-xs text-slate-500 mt-1">Customer note: {item.customerRequirements}</div>
                    )}
                  </div>
                  <div className="font-mono text-sm font-semibold shrink-0">Qty: {item.quantity}</div>
                </div>
              ))}
            </div>
          </section>

          {quotations.length > 0 && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">Linked Quotations</h2>
              <div className="space-y-2">
                {quotations.map((q) => (
                  <div key={q.id} className="flex items-center justify-between p-3 rounded border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="font-mono font-semibold text-sm">{q.docNo}</span>
                      <span className="text-xs text-slate-500 ml-2">Date: {q.quotationDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={q.status} />
                      <Button variant="secondary" size="sm" onClick={() => navigate('/sales/quotations')}>
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: Follow-up Timeline */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Follow-up History ({followUps.length})</h2>
            {enquiry.status !== 'Rejected' && can('sales', 'create') && (
              <Button variant="ghost" size="sm" onClick={() => setFuOpen(true)}>
                + Add
              </Button>
            )}
          </div>
          {followUps.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No follow-ups logged yet.</p>
          ) : (
            <ol className="space-y-4 border-l border-slate-200 dark:border-slate-800 ml-2 pl-4">
              {followUps.map((f) => (
                <li key={f.id} className="relative">
                  <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600 absolute -left-[21px] top-1.5" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-500">{f.followUpDate} · {f.contactMethod}</span>
                    <StatusBadge status={f.response} />
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">{f.discussion}</p>
                  <div className="text-xs text-slate-500 mt-1">
                    By {f.followedBy}
                    {f.nextFollowUpDate && ` · Next: ${f.nextFollowUpDate}`}
                  </div>
                  {f.rejectionReason && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">Reason: {f.rejectionReason}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Add Follow-up Modal */}
      <Modal
        open={fuOpen}
        onClose={() => setFuOpen(false)}
        title={`Add Follow-up — ${enquiry.docNo}`}
        subtitle={`${enquiry.customerSnapshot.name} · Accepting automatically qualifies this enquiry.`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFuOpen(false)}>Cancel</Button>
            <Button type="submit" form="enq-fu-form" loading={submitting}>Save Follow-up</Button>
          </>
        }
      >
        <form id="enq-fu-form" onSubmit={handleSaveFollowUp} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Follow-up Date" required>
              <Input
                type="date"
                value={fuForm.followUpDate}
                onChange={(e) => setFuForm({ ...fuForm, followUpDate: e.target.value })}
                required
              />
            </Field>
            <Field label="Contact Method" required>
              <Select
                value={fuForm.contactMethod}
                onChange={(e) => setFuForm({ ...fuForm, contactMethod: e.target.value as any })}
              >
                <option value="Call">Call</option>
                <option value="Email">Email</option>
                <option value="Meeting">Meeting</option>
              </Select>
            </Field>
          </div>
          <Field label="Discussion Details" required>
            <Textarea
              value={fuForm.discussion}
              onChange={(e) => setFuForm({ ...fuForm, discussion: e.target.value })}
              placeholder="Summarize technical discussion, commercial expectations, or next steps..."
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer Response" required>
              <Select
                value={fuForm.response}
                onChange={(e) => setFuForm({ ...fuForm, response: e.target.value as any })}
              >
                <option value="Pending">Pending</option>
                <option value="Accepted">Accepted (Qualify Enquiry)</option>
                <option value="Rejected">Rejected</option>
              </Select>
            </Field>
            {fuForm.response === 'Pending' && (
              <Field label="Next Follow-up Date">
                <Input
                  type="date"
                  value={fuForm.nextFollowUpDate}
                  onChange={(e) => setFuForm({ ...fuForm, nextFollowUpDate: e.target.value })}
                />
              </Field>
            )}
          </div>
          {fuForm.response === 'Rejected' && (
            <Field label="Rejection Reason" required>
              <Input
                value={fuForm.rejectionReason}
                onChange={(e) => setFuForm({ ...fuForm, rejectionReason: e.target.value })}
                placeholder="Price, timeline, competitor, or cancelled requirement..."
                required
              />
            </Field>
          )}
        </form>
      </Modal>
    </div>
  );
};
