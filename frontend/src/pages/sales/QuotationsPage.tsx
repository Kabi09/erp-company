import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Eye, FileSpreadsheet, GitBranch, Plus, Send, Trash2 } from 'lucide-react';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
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
import type { Quotation } from '../../types/erp';
import { calculateQuotationTotals, formatCurrency } from '../../utils/erpLogic';

interface DraftQtItem {
  productId: string;
  productName: string;
  model: string;
  specifications: string;
  quantity: number;
  unitPrice: number;
  highlights: string[];
}

export const QuotationsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [revisingQt, setRevisingQt] = useState<Quotation | null>(null);
  const [previewQt, setPreviewQt] = useState<Quotation | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Quotation | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Form state
  const [enquiryId, setEnquiryId] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().slice(0, 10));
  const [validityDate, setValidityDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [items, setItems] = useState<DraftQtItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(18);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [warranty, setWarranty] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadFromEnquiry = (enqId: string) => {
    if (!data) return;
    setEnquiryId(enqId);
    const enq = data.enquiries.find((e) => e.id === enqId);
    if (!enq) return;
    setItems(
      enq.items.map((it) => {
        const prod = data.products.find((p) => p.id === it.productId);
        return {
          productId: it.productId,
          productName: it.productName,
          model: it.model,
          specifications: it.requiredSpecifications || prod?.specifications || '',
          quantity: it.quantity,
          unitPrice: prod?.sellingPrice || 0,
          highlights: prod?.highlights?.length ? [...prod.highlights] : ['Precision temperature control'],
        };
      }),
    );
    setTaxPercent(data.company.defaultTaxPercent);
    setPaymentTerms(data.company.defaultPaymentTerms);
    setDeliveryTerms(data.company.defaultDeliveryTerms);
    setWarranty(data.company.defaultWarranty);
  };

  useEffect(() => {
    if (!data) return;
    if (searchParams.get('create') === '1') {
      const preEnq = searchParams.get('enquiryId');
      setRevisingQt(null);
      if (preEnq) loadFromEnquiry(preEnq);
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, data]);

  if (!data) return null;

  const openRevisionModal = (qt: Quotation) => {
    setRevisingQt(qt);
    setEnquiryId(qt.enquiryId);
    setQuotationDate(new Date().toISOString().slice(0, 10));
    setValidityDate(qt.validityDate);
    setItems(
      qt.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        model: i.model,
        specifications: i.specifications,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        highlights: [...i.highlights],
      })),
    );
    setDiscountPercent(qt.discountPercent);
    setTaxPercent(qt.taxPercent);
    setPaymentTerms(qt.paymentTerms);
    setDeliveryTerms(qt.deliveryTerms);
    setWarranty(qt.warranty);
    setRemarks(`Revision V${qt.version + 1} updated after customer negotiation.`);
    setErr(null);
    setCreateOpen(true);
  };

  const totals = calculateQuotationTotals(items, discountPercent, taxPercent);

  const handleSave = async (e: React.FormEvent, submitStatus: 'Draft' | 'Sent' = 'Sent') => {
    e.preventDefault();
    setErr(null);
    if (!revisingQt && !enquiryId) {
      setErr('Please select a Qualified Enquiry.');
      return;
    }
    if (items.length === 0) {
      setErr('Add at least one product line.');
      return;
    }
    setSubmitting(true);
    try {
      if (revisingQt) {
        const rev: any = await erpApi.reviseQuotation(revisingQt.id, {
          quotationDate,
          validityDate,
          items,
          discountPercent,
          taxPercent,
          paymentTerms,
          deliveryTerms,
          warranty,
          remarks,
        });
        await refresh();
        toast('success', `Revision ${rev.docNo} created`, `${revisingQt.docNo} preserved as Superseded.`);
      } else {
        const created: any = await erpApi.createQuotation({
          enquiryId,
          quotationDate,
          validityDate,
          items,
          discountPercent,
          taxPercent,
          paymentTerms,
          deliveryTerms,
          warranty,
          remarks,
          status: submitStatus,
        });
        await refresh();
        toast('success', `Quotation ${created.docNo} saved`, `Total: ${formatCurrency(created.totalAmount)}`);
      }
      setCreateOpen(false);
      setRevisingQt(null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save quotation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (qt: Quotation, status: string, reason?: string) => {
    try {
      await erpApi.updateQuotationStatus(qt.id, status, reason);
      await refresh();
      toast('success', `${qt.docNo} marked ${status}`);
      setRejectTarget(null);
      setRejectReason('');
    } catch (error) {
      toast('error', 'Action failed', error instanceof Error ? error.message : 'Unable to update status');
    }
  };

  const handleGeneratePI = async (qt: Quotation) => {
    try {
      const pi: any = await erpApi.createProformaInvoice({ quotationId: qt.id });
      await refresh();
      toast('success', `Proforma Invoice ${pi.docNo} created`, `Generated from ${qt.docNo}.`);
      navigate('/sales/proforma-invoices');
    } catch (error) {
      toast('error', 'Could not generate PI', error instanceof Error ? error.message : 'Error');
    }
  };

  const filtered = useMemo(() => {
    return data.quotations.filter((q) => {
      if (statusFilter !== 'All' && q.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (
          !q.docNo.toLowerCase().includes(s) &&
          !q.customerSnapshot.name.toLowerCase().includes(s) &&
          !q.enquiryDocNo.toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [data.quotations, statusFilter, search]);

  const qualifiedEnquiries = data.enquiries.filter((e) => e.status === 'Qualified');

  const columns: ColumnDef<Quotation>[] = [
    {
      key: 'docNo',
      header: 'Quotation / Version',
      sortable: true,
      sortValue: (r) => r.docNo,
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-xs text-slate-900 dark:text-slate-100">{r.docNo}</div>
          <div className="text-[11px] text-slate-500">Ref: {r.enquiryDocNo} · Rev {r.version}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      sortValue: (r) => r.customerSnapshot.name,
      render: (r) => (
        <div>
          <div className="font-medium">{r.customerSnapshot.name}</div>
          <div className="text-xs text-slate-500">
            {r.items.map((i) => `${i.quantity}× ${i.model || i.productName}`).join(', ')}
          </div>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Grand Total',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.totalAmount,
      render: (r) => (
        <div className="font-mono font-medium">
          <div>{formatCurrency(r.totalAmount)}</div>
          {r.discountPercent > 0 && <div className="text-[11px] text-emerald-700 dark:text-emerald-400">-{r.discountPercent}% disc</div>}
        </div>
      ),
    },
    {
      key: 'validity',
      header: 'Valid Until',
      render: (r) => <span className="font-mono text-xs">{r.validityDate}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Workflow Actions',
      align: 'right',
      render: (r) => {
        const hasPI = data.proformaInvoices.some((p) => p.quotationId === r.id && p.status !== 'Cancelled');
        return (
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setPreviewQt(r)} aria-label={`Preview ${r.docNo}`}>
              <Eye className="w-3.5 h-3.5" />
              PDF
            </Button>
            {(r.status === 'Draft' || r.status === 'Changes Requested') && can('sales', 'create') && (
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await erpApi.submitQuotationForApproval(r.id);
                    if (res.approvalRequired) {
                      toast('info', `Quotation ${r.docNo} submitted for approval`);
                    } else {
                      toast('success', `Quotation ${r.docNo} approved directly`);
                    }
                    await refresh();
                  } catch (e) {
                    toast('error', 'Submission failed', (e as Error).message);
                  }
                }}
              >
                <Send className="w-3.5 h-3.5" /> Submit for Approval
              </Button>
            )}
            {r.status === 'Pending Approval' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <Clock className="w-3 h-3" /> Awaiting Review
              </span>
            )}
            {(r.status === 'Approved' || r.status === 'Draft') && can('sales', 'edit') && (
              <Button variant="secondary" size="sm" onClick={() => handleStatusChange(r, 'Sent')}>
                Mark Sent
              </Button>
            )}
            {(r.status === 'Sent' || r.status === 'Pending' || r.status === 'Negotiation') && can('sales', 'edit') && (
              <>
                <Button variant="secondary" size="sm" onClick={() => openRevisionModal(r)}>
                  <GitBranch className="w-3.5 h-3.5" />
                  Revise
                </Button>
                <Button variant="success" size="sm" onClick={() => handleStatusChange(r, 'Accepted')}>
                  Accept
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRejectTarget(r)}>
                  Reject
                </Button>
              </>
            )}
            {r.status === 'Accepted' && !hasPI && can('sales', 'create') && (
              <Button variant="primary" size="sm" onClick={() => handleGeneratePI(r)}>
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Generate PI
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quotations & Revisions"
        subtitle="Create commercial quotes from qualified enquiries, manage negotiation revisions, and generate Proforma Invoices."
        actions={
          can('sales', 'create') && (
            <Button
              onClick={() => {
                setRevisingQt(null);
                setEnquiryId('');
                setItems([]);
                setDiscountPercent(0);
                setErr(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Create Quotation
            </Button>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search quotation number, enquiry, or customer..."
        statuses={['All', 'Draft', 'Pending Approval', 'Approved', 'Changes Requested', 'Sent', 'Negotiation', 'Accepted', 'Superseded', 'Rejected']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => {
          const hasPI = data.proformaInvoices.some((p) => p.quotationId === r.id && p.status !== 'Cancelled');
          return (
            <div className="space-y-2.5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-sm font-semibold">{r.docNo}</div>
                  <div className="text-xs text-slate-500">{r.customerSnapshot.name}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Ref: {r.enquiryDocNo}</span>
                <span className="font-mono font-semibold text-sm">{formatCurrency(r.totalAmount)}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="secondary" size="sm" onClick={() => setPreviewQt(r)}>PDF</Button>
                {(r.status === 'Sent' || r.status === 'Pending' || r.status === 'Negotiation') && can('sales', 'edit') && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => openRevisionModal(r)}>Revise</Button>
                    <Button variant="success" size="sm" onClick={() => handleStatusChange(r, 'Accepted')}>Accept</Button>
                  </>
                )}
                {r.status === 'Accepted' && !hasPI && can('sales', 'create') && (
                  <Button size="sm" onClick={() => handleGeneratePI(r)}>Generate PI</Button>
                )}
              </div>
            </div>
          );
        }}
      />

      {/* Create / Revise Quotation Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={revisingQt ? `Revise Quotation ${revisingQt.docNo} → V${revisingQt.version + 1}` : 'Create Commercial Quotation'}
        subtitle={
          revisingQt
            ? 'Previous revision is preserved intact as Superseded.'
            : 'Auto-fills customer, products, specifications, and highlights from a Qualified Enquiry.'
        }
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            {!revisingQt && (
              <Button variant="secondary" loading={submitting} onClick={(e) => handleSave(e as any, 'Draft')}>
                Save Draft
              </Button>
            )}
            <Button type="submit" form="qt-form" loading={submitting}>
              {revisingQt ? `Create Revision V${revisingQt.version + 1}` : 'Save & Mark Sent'}
            </Button>
          </>
        }
      >
        <form id="qt-form" onSubmit={(e) => handleSave(e, 'Sent')} className="space-y-4">
          {err && <ErrorBanner message={err} />}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {!revisingQt ? (
              <Field label="Qualified Enquiry" required>
                <Select value={enquiryId} onChange={(e) => loadFromEnquiry(e.target.value)} required>
                  <option value="">Select qualified enquiry...</option>
                  {qualifiedEnquiries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.docNo} — {e.customerSnapshot.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Source Enquiry">
                <Input value={`${revisingQt.enquiryDocNo} (${revisingQt.customerSnapshot.name})`} disabled />
              </Field>
            )}
            <Field label="Quotation Date" required>
              <Input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} required />
            </Field>
            <Field label="Validity Date" required>
              <Input type="date" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} required />
            </Field>
          </div>

          {/* Line Items + Dynamic Highlights */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Product Lines & Highlights</div>
            {items.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <Field label="Product & Model">
                      <Input
                        value={`${item.productName} (${item.model})`}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, productName: e.target.value } : x)))
                        }
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Qty" required>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))
                        }
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-3">
                    <Field label="Unit Price (₹)" required>
                      <Input
                        type="number"
                        min={0}
                        value={item.unitPrice}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, unitPrice: Number(e.target.value) } : x)))
                        }
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2 flex flex-col justify-end items-end">
                    <span className="text-[11px] text-slate-500">Line Total</span>
                    <span className="font-mono text-sm font-semibold">
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </span>
                  </div>
                </div>
                <Field label="Technical Specifications">
                  <Input
                    value={item.specifications}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, specifications: e.target.value } : x)))
                    }
                  />
                </Field>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Product Highlights</span>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, highlights: [...x.highlights, ''] } : x)),
                        )
                      }
                      className="text-xs text-teal-700 dark:text-teal-400 font-medium hover:underline cursor-pointer"
                    >
                      + Add Highlight
                    </button>
                  </div>
                  {item.highlights.map((hl, hi) => (
                    <div key={hi} className="flex gap-2">
                      <Input
                        value={hl}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, highlights: x.highlights.map((h, j) => (j === hi ? e.target.value : h)) }
                                : x,
                            ),
                          )
                        }
                        placeholder="Feature bullet shown on quotation PDF..."
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, highlights: x.highlights.filter((_, j) => j !== hi) } : x,
                            ),
                          )
                        }
                        aria-label="Remove highlight"
                        className="p-2 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Pricing & Commercial Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Field label="Discount (%)">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
              />
            </Field>
            <Field label="GST / Tax (%)">
              <Input type="number" min={0} max={50} value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value))} />
            </Field>
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-3 text-xs space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatCurrency(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span className="font-mono">-{formatCurrency(totals.discountAmount)}</span></div>
              <div className="flex justify-between"><span>Tax ({taxPercent}%)</span><span className="font-mono">{formatCurrency(totals.taxAmount)}</span></div>
              <div className="flex justify-between font-semibold text-sm pt-1 border-t border-slate-200 dark:border-slate-800">
                <span>Grand Total</span>
                <span className="font-mono">{formatCurrency(totals.totalAmount)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Payment Terms">
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </Field>
            <Field label="Delivery Terms">
              <Input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} />
            </Field>
            <Field label="Warranty">
              <Input value={warranty} onChange={(e) => setWarranty(e.target.value)} />
            </Field>
            <Field label="Remarks">
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          </div>
        </form>
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title={`Reject Quotation ${rejectTarget?.docNo || ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => rejectTarget && handleStatusChange(rejectTarget, 'Rejected', rejectReason)}
              disabled={!rejectReason.trim()}
            >
              Confirm Reject
            </Button>
          </>
        }
      >
        <Field label="Rejection Reason" required>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Provide reason recorded from customer..." />
        </Field>
      </Modal>

      <DocumentPreviewModal
        open={Boolean(previewQt)}
        onClose={() => setPreviewQt(null)}
        company={data.company}
        payload={previewQt ? { kind: 'quotation', doc: previewQt } : null}
      />
    </div>
  );
};
