import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, CheckCircle2, Eye, FileCheck2, Plus, ShoppingBag } from 'lucide-react';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import {
  Button,
  DataTable,
  ErrorBanner,
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
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { CustomerPO, PaymentEntry, ProformaInvoice, SalesOrder } from '../../types/erp';
import { calculatePaymentSummary, formatCurrency } from '../../utils/erpLogic';

// ==========================================
// PROFORMA INVOICES
// ==========================================

export const ProformaInvoicesPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [previewPI, setPreviewPI] = useState<ProformaInvoice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [quotationId, setQuotationId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return null;

  const eligibleQuotations = data.quotations.filter(
    (q) => q.status === 'Accepted' && !data.proformaInvoices.some((p) => p.quotationId === q.id && p.status !== 'Cancelled'),
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.proformaInvoices.filter(
      (p) => !s || p.docNo.toLowerCase().includes(s) || p.customerSnapshot.name.toLowerCase().includes(s) || p.quotationDocNo.toLowerCase().includes(s),
    );
  }, [data.proformaInvoices, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const pi: any = await erpApi.createProformaInvoice({ quotationId, remarks });
      await refresh();
      toast('success', `Proforma Invoice ${pi.docNo} generated`);
      setCreateOpen(false);
      setQuotationId('');
      setRemarks('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to generate PI');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<ProformaInvoice>[] = [
    {
      key: 'docNo',
      header: 'PI Number',
      sortable: true,
      sortValue: (r) => r.docNo,
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-xs">{r.docNo}</div>
          <div className="text-[11px] text-slate-500">Ref: {r.quotationDocNo}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div>
          <div className="font-medium">{r.customerSnapshot.name}</div>
          <div className="text-xs text-slate-500">{r.items.map((i) => `${i.quantity}× ${i.model}`).join(', ')}</div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Total Amount',
      align: 'right',
      render: (r) => <span className="font-mono font-medium">{formatCurrency(r.totalAmount)}</span>,
    },
    {
      key: 'paid',
      header: 'Verified Received',
      align: 'right',
      render: (r) => {
        const pay = calculatePaymentSummary(r.totalAmount, data.payments, { piId: r.id });
        return (
          <div className="font-mono text-xs">
            <div className="text-emerald-700 dark:text-emerald-400">{formatCurrency(pay.verifiedReceived)}</div>
            <div className="text-slate-500">Bal: {formatCurrency(pay.outstandingBalance)}</div>
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setPreviewPI(r)}>
            <Eye className="w-3.5 h-3.5" />
            PDF
          </Button>
          {r.status === 'Issued' && can('sales', 'create') && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/sales/customer-pos?create=1&piId=${r.id}`)}>
              Record Customer PO
            </Button>
          )}
          {r.status === 'PO Received' && can('sales', 'create') && (
            <Button size="sm" onClick={() => navigate(`/sales/sales-orders?create=1&piId=${r.id}`)}>
              Confirm SO
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Proforma Invoices"
        subtitle="Generated exclusively from accepted quotation versions with company bank details."
        actions={
          can('sales', 'create') && (
            <Button onClick={() => setCreateOpen(true)} disabled={eligibleQuotations.length === 0}>
              <Plus className="w-4 h-4" />
              Generate PI
            </Button>
          )
        }
      />
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search PI number, quotation, or customer..." />
      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-sm">{r.docNo}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="text-sm font-medium">{r.customerSnapshot.name}</div>
            <div className="flex items-center justify-between text-xs">
              <span>Ref: {r.quotationDocNo}</span>
              <span className="font-mono font-semibold">{formatCurrency(r.totalAmount)}</span>
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button variant="secondary" size="sm" onClick={() => setPreviewPI(r)}>PDF</Button>
              {r.status === 'Issued' && (
                <Button size="sm" onClick={() => navigate(`/sales/customer-pos?create=1&piId=${r.id}`)}>Record PO</Button>
              )}
            </div>
          </div>
        )}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate Proforma Invoice"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="pi-form" loading={submitting}>Generate PI</Button>
          </>
        }
      >
        <form id="pi-form" onSubmit={handleCreate} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <Field label="Accepted Quotation" required>
            <Select value={quotationId} onChange={(e) => setQuotationId(e.target.value)} required>
              <option value="">Select accepted quotation...</option>
              {eligibleQuotations.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.docNo} — {q.customerSnapshot.name} ({formatCurrency(q.totalAmount)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Remarks (Optional)">
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </Field>
        </form>
      </Modal>

      <DocumentPreviewModal
        open={Boolean(previewPI)}
        onClose={() => setPreviewPI(null)}
        company={data.company}
        payload={previewPI ? { kind: 'pi', doc: previewPI } : null}
      />
    </div>
  );
};

// ==========================================
// CUSTOMER PURCHASE ORDERS
// ==========================================

export const CustomerPOsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const [piId, setPiId] = useState('');
  const [customerPoNumber, setCustomerPoNumber] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentDataUrl, setAttachmentDataUrl] = useState('');
  const [hasDiscrepancy, setHasDiscrepancy] = useState(false);
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const pre = searchParams.get('piId');
      if (pre) setPiId(pre);
      setOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (!data) return null;

  const eligiblePIs = data.proformaInvoices.filter(
    (p) => p.status !== 'Cancelled' && !data.customerPOs.some((c) => c.piId === p.id),
  );
  const selectedPI = data.proformaInvoices.find((p) => p.id === piId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const cpo: any = await erpApi.createCustomerPO({
        piId,
        customerPoNumber,
        receivedDate,
        expectedDeliveryDate,
        attachmentName: attachmentName || undefined,
        attachmentDataUrl: attachmentDataUrl || undefined,
        hasDiscrepancy,
        discrepancyNotes,
        remarks,
      });
      await refresh();
      toast('success', `Customer PO ${cpo.docNo} recorded`, `PO #${cpo.customerPoNumber}`);
      setOpen(false);
      setCustomerPoNumber('');
      setHasDiscrepancy(false);
      setDiscrepancyNotes('');
      setRemarks('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save customer PO');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (cpo: CustomerPO) => {
    try {
      await erpApi.resolveCustomerPODiscrepancy(cpo.id, 'Aligned with customer and PI terms');
      await refresh();
      toast('success', `Discrepancy resolved on ${cpo.docNo}`);
    } catch (error) {
      toast('error', 'Failed', error instanceof Error ? error.message : 'Error');
    }
  };

  const filtered = data.customerPOs.filter((c) => {
    const s = search.trim().toLowerCase();
    return !s || c.docNo.toLowerCase().includes(s) || c.customerPoNumber.toLowerCase().includes(s) || c.customerName.toLowerCase().includes(s);
  });

  const columns: ColumnDef<CustomerPO>[] = [
    {
      key: 'docNo',
      header: 'CPO Ref',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-xs">{r.docNo}</div>
          <div className="text-[11px] text-slate-500">PI: {r.piDocNo}</div>
        </div>
      ),
    },
    { key: 'custPo', header: 'Customer PO #', render: (r) => <span className="font-mono font-medium">{r.customerPoNumber}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.customerName },
    { key: 'dates', header: 'Received / Delivery', render: (r) => <span className="font-mono text-xs">{r.receivedDate} → {r.expectedDeliveryDate || '—'}</span> },
    {
      key: 'discrepancy',
      header: 'Terms Match',
      render: (r) =>
        r.hasDiscrepancy && !r.discrepancyResolved ? (
          <StatusBadge status="Issue" />
        ) : (
          <StatusBadge status="Verified" />
        ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) =>
        r.hasDiscrepancy && !r.discrepancyResolved && can('sales', 'edit') ? (
          <Button variant="secondary" size="sm" onClick={() => handleResolve(r)}>
            Resolve Discrepancy
          </Button>
        ) : (
          <span className="text-xs text-slate-500">{r.attachmentName || '—'}</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customer Purchase Orders"
        subtitle="Record official purchase orders received from customers against Proforma Invoices."
        actions={
          can('sales', 'create') && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" />
              Record Customer PO
            </Button>
          )
        }
      />
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search CPO reference, PO number, or customer..." />
      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-xs">{r.docNo} · {r.customerPoNumber}</span>
              <StatusBadge status={r.hasDiscrepancy && !r.discrepancyResolved ? 'Issue' : 'Verified'} />
            </div>
            <div className="text-sm font-medium">{r.customerName}</div>
            <div className="text-xs text-slate-500">PI: {r.piDocNo} · Received: {r.receivedDate}</div>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record Customer Purchase Order"
        subtitle="Distinct from Supplier POs. Customer and products auto-fill from the linked Proforma Invoice."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="cpo-form" loading={submitting}>Save Customer PO</Button>
          </>
        }
      >
        <form id="cpo-form" onSubmit={handleSave} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <Field label="Proforma Invoice Reference" required>
            <Select value={piId} onChange={(e) => setPiId(e.target.value)} required>
              <option value="">Select PI...</option>
              {eligiblePIs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.docNo} — {p.customerSnapshot.name} ({formatCurrency(p.totalAmount)})
                </option>
              ))}
            </Select>
          </Field>

          {selectedPI && (
            <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div className="font-semibold text-slate-900 dark:text-slate-100">{selectedPI.customerSnapshot.name}</div>
              <div className="text-slate-600 dark:text-slate-400">
                {selectedPI.items.map((i) => `${i.quantity}× ${i.productName} (${i.model})`).join(', ')} · Total: {formatCurrency(selectedPI.totalAmount)}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Customer PO Number" required>
              <Input value={customerPoNumber} onChange={(e) => setCustomerPoNumber(e.target.value)} placeholder="CUST/PO/2026/001" required />
            </Field>
            <Field label="Received Date" required>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
            </Field>
            <Field label="Expected Delivery Date">
              <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
            </Field>
          </div>

          <FileUploadInput
            label="PO Document Upload"
            fileName={attachmentName}
            onFileSelected={(name, url) => {
              setAttachmentName(name);
              setAttachmentDataUrl(url);
            }}
          />

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={hasDiscrepancy}
              onChange={(e) => setHasDiscrepancy(e.target.checked)}
              className="rounded border-slate-300"
            />
            Flag discrepancy between Customer PO and Proforma Invoice (blocks SO confirmation until resolved)
          </label>
          {hasDiscrepancy && (
            <Field label="Discrepancy Details" required>
              <Input value={discrepancyNotes} onChange={(e) => setDiscrepancyNotes(e.target.value)} required />
            </Field>
          )}
          <Field label="Remarks">
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </Field>
        </form>
      </Modal>
    </div>
  );
};

// ==========================================
// PAYMENT ENTRIES
// ==========================================

export const PaymentsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [open, setOpen] = useState(false);

  const [piId, setPiId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<'Bank Transfer' | 'UPI' | 'Cheque' | 'Cash'>('Bank Transfer');
  const [paymentType, setPaymentType] = useState<'Advance' | 'Partial' | 'Full'>('Advance');
  const [transactionRef, setTransactionRef] = useState('');
  const [proofName, setProofName] = useState('');
  const [proofDataUrl, setProofDataUrl] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (!data) return null;

  const selectedPI = data.proformaInvoices.find((p) => p.id === piId);
  const selectedBalance = selectedPI
    ? calculatePaymentSummary(selectedPI.totalAmount, data.payments, { piId: selectedPI.id })
    : null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const pay: any = await erpApi.createPayment({
        piId,
        amount: Number(amount),
        paymentDate,
        method,
        paymentType,
        transactionRef,
        proofName: proofName || undefined,
        proofDataUrl: proofDataUrl || undefined,
        remarks,
      });
      await refresh();
      toast('success', `Payment ${pay.docNo} recorded`, `${formatCurrency(pay.amount)} (${pay.status})`);
      setOpen(false);
      setAmount('');
      setTransactionRef('');
      setRemarks('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (p: PaymentEntry, status: 'Verified' | 'Rejected') => {
    try {
      await erpApi.verifyPayment(p.id, status);
      await refresh();
      toast('success', `Payment ${p.docNo} marked ${status}`);
    } catch (error) {
      toast('error', 'Failed', error instanceof Error ? error.message : 'Error');
    }
  };

  const filtered = data.payments.filter((p) => {
    if (statusFilter !== 'All' && p.status !== statusFilter) return false;
    const s = search.trim().toLowerCase();
    return (
      !s ||
      p.docNo.toLowerCase().includes(s) ||
      p.customerName.toLowerCase().includes(s) ||
      p.transactionRef.toLowerCase().includes(s) ||
      (p.piDocNo || '').toLowerCase().includes(s) ||
      (p.salesOrderDocNo || '').toLowerCase().includes(s)
    );
  });

  const columns: ColumnDef<PaymentEntry>[] = [
    {
      key: 'docNo',
      header: 'Payment ID',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-xs">{r.docNo}</div>
          <div className="text-[11px] text-slate-500">{r.salesOrderDocNo || r.piDocNo}</div>
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', render: (r) => r.customerName },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold">{formatCurrency(r.amount)}</div>
          <div className="text-[11px] text-slate-500">{r.paymentType} · {r.method}</div>
        </div>
      ),
    },
    { key: 'ref', header: 'Transaction Ref', render: (r) => <span className="font-mono text-xs">{r.transactionRef}</span> },
    { key: 'date', header: 'Date', render: (r) => <span className="font-mono text-xs">{r.paymentDate}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) =>
        r.status === 'Pending' && can('sales', 'approve') ? (
          <div className="flex justify-end gap-1.5">
            <Button variant="success" size="sm" onClick={() => handleVerify(r, 'Verified')}>Verify</Button>
            <Button variant="ghost" size="sm" onClick={() => handleVerify(r, 'Rejected')}>Reject</Button>
          </div>
        ) : (
          <span className="text-xs text-slate-500">{r.verifiedBy || '—'}</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payment Entries"
        subtitle="Record advance, partial, and full payments. Balances recalculate automatically from verified receipts."
        actions={
          can('sales', 'create') && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" />
              Record Payment
            </Button>
          )
        }
      />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search payment ID, customer, UTR/ref, or PI/SO..."
        statuses={['All', 'Verified', 'Pending', 'Rejected']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />
      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold">{r.docNo} · {r.salesOrderDocNo || r.piDocNo}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="text-sm font-medium">{r.customerName}</div>
            <div className="flex justify-between text-xs">
              <span>{r.method} · {r.transactionRef}</span>
              <span className="font-mono font-semibold text-sm">{formatCurrency(r.amount)}</span>
            </div>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record Customer Payment"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="pay-form" loading={submitting}>Save Payment</Button>
          </>
        }
      >
        <form id="pay-form" onSubmit={handleCreate} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <Field label="Proforma Invoice / Order" required>
            <Select value={piId} onChange={(e) => setPiId(e.target.value)} required>
              <option value="">Select PI / Order...</option>
              {data.proformaInvoices.map((p) => {
                const so = data.salesOrders.find((s) => s.piId === p.id);
                const bal = calculatePaymentSummary(p.totalAmount, data.payments, { piId: p.id, salesOrderId: so?.id });
                return (
                  <option key={p.id} value={p.id}>
                    {so ? `${so.docNo} (${p.docNo})` : p.docNo} — {p.customerSnapshot.name} (Bal: {formatCurrency(bal.outstandingBalance)})
                  </option>
                );
              })}
            </Select>
          </Field>

          {selectedBalance && (
            <div className="grid grid-cols-3 gap-2 p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <div className="text-slate-500">Total</div>
                <div className="font-mono font-semibold">{formatCurrency(selectedBalance.totalAmount)}</div>
              </div>
              <div>
                <div className="text-slate-500">Received</div>
                <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(selectedBalance.verifiedReceived)}</div>
              </div>
              <div>
                <div className="text-slate-500">Outstanding</div>
                <div className="font-mono font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(selectedBalance.outstandingBalance)}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment Amount (₹)" required>
              <Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
            <Field label="Payment Date" required>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
            </Field>
            <Field label="Payment Type">
              <Select value={paymentType} onChange={(e) => setPaymentType(e.target.value as any)}>
                <option value="Advance">Advance</option>
                <option value="Partial">Partial</option>
                <option value="Full">Full / Final</option>
              </Select>
            </Field>
            <Field label="Payment Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value as any)}>
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                <option value="UPI">UPI</option>
                <option value="Cheque">Cheque</option>
                <option value="Cash">Cash</option>
              </Select>
            </Field>
          </div>
          <Field label="Transaction Reference / UTR" required>
            <Input value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="UTR / Ref Number" required />
          </Field>
          <FileUploadInput
            label="Payment Proof (Optional)"
            fileName={proofName}
            onFileSelected={(n, u) => {
              setProofName(n);
              setProofDataUrl(u);
            }}
          />
          <Field label="Remarks">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
};

// ==========================================
// SALES ORDERS
// ==========================================

export const SalesOrdersPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [open, setOpen] = useState(false);

  const [piId, setPiId] = useState('');
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState('');
  const [priority, setPriority] = useState<'Normal' | 'High' | 'Urgent'>('Normal');
  const [allowCreditTerms, setAllowCreditTerms] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const pre = searchParams.get('piId');
      if (pre) setPiId(pre);
      setOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (!data) return null;

  const eligiblePIs = data.proformaInvoices.filter(
    (p) =>
      p.status !== 'Cancelled' &&
      !data.salesOrders.some((s) => s.piId === p.id && s.commercialStatus !== 'Cancelled') &&
      data.customerPOs.some((c) => c.piId === p.id),
  );

  const handleConfirmSO = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const so: any = await erpApi.createSalesOrder({
        piId,
        promisedDeliveryDate: promisedDeliveryDate || undefined,
        priority,
        allowCreditTerms,
        remarks,
      });
      await refresh();
      toast('success', `Sales Order ${so.docNo} confirmed`, 'Automatically sent to Production Management.');
      setOpen(false);
      setPiId('');
      setRemarks('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to confirm sales order');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = data.salesOrders.filter((s) => {
    if (statusFilter !== 'All' && s.fulfillmentStatus !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || s.docNo.toLowerCase().includes(q) || s.customerSnapshot.name.toLowerCase().includes(q) || s.customerPoNumber.toLowerCase().includes(q);
  });

  const columns: ColumnDef<SalesOrder>[] = [
    {
      key: 'docNo',
      header: 'Sales Order',
      sortable: true,
      sortValue: (r) => r.docNo,
      render: (r) => (
        <div>
          <Link to={`/tracking/${r.id}`} className="font-mono font-semibold text-xs text-blue-600 dark:text-blue-400 hover:underline">
            {r.docNo}
          </Link>
          <div className="text-[11px] text-slate-500">PI: {r.piDocNo} · PO: {r.customerPoNumber}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer & Items',
      render: (r) => (
        <div>
          <div className="font-medium">{r.customerSnapshot.name}</div>
          <div className="text-xs text-slate-500">{r.items.map((i) => `${i.quantity}× ${i.model}`).join(', ')}</div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Total / Balance',
      align: 'right',
      render: (r) => {
        const pay = calculatePaymentSummary(r.totalAmount, data.payments, { piId: r.piId, salesOrderId: r.id });
        return (
          <div className="font-mono text-xs">
            <div className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(r.totalAmount)}</div>
            <div className="text-slate-500">Bal: {formatCurrency(pay.outstandingBalance)}</div>
          </div>
        );
      },
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (r) => {
        const pay = calculatePaymentSummary(r.totalAmount, data.payments, { piId: r.piId, salesOrderId: r.id });
        return <StatusBadge status={pay.paymentStatus} />;
      },
    },
    {
      key: 'fulfillment',
      header: 'Fulfillment',
      render: (r) => <StatusBadge status={r.fulfillmentStatus} />,
    },
    {
      key: 'actions',
      header: 'Track',
      align: 'right',
      render: (r) => (
        <Button variant="secondary" size="sm" onClick={() => navigate(`/tracking/${r.id}`)}>
          <Activity className="w-3.5 h-3.5" />
          Lifecycle
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        subtitle="Confirmed sales orders linked to Quotation, PI, Customer PO, and Payments. Automatically released to Production."
        actions={
          can('sales', 'create') && (
            <Button onClick={() => setOpen(true)}>
              <ShoppingBag className="w-4 h-4" />
              Confirm Sales Order
            </Button>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search SO number, customer, or customer PO..."
        statuses={['All', 'Awaiting Production', 'In Production', 'QC Pending', 'Ready for Dispatch', 'In Transit', 'Delivered']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => {
          const pay = calculatePaymentSummary(r.totalAmount, data.payments, { piId: r.piId, salesOrderId: r.id });
          return (
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono font-semibold text-sm">{r.docNo}</div>
                  <div className="text-xs text-slate-500">{r.customerSnapshot.name}</div>
                </div>
                <StatusBadge status={r.fulfillmentStatus} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>Payment: <StatusBadge status={pay.paymentStatus} /></span>
                <span className="font-mono font-semibold">{formatCurrency(r.totalAmount)}</span>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => navigate(`/tracking/${r.id}`)}>
                  Track Order
                </Button>
              </div>
            </div>
          );
        }}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm Sales Order"
        subtitle="Reuses all linked commercial data from Accepted Quotation, PI, Customer PO, and Payments."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="so-form" loading={submitting}>
              <CheckCircle2 className="w-4 h-4" />
              Confirm & Release to Production
            </Button>
          </>
        }
      >
        <form id="so-form" onSubmit={handleConfirmSO} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <Field label="Select Proforma Invoice (with Customer PO recorded)" required>
            <Select value={piId} onChange={(e) => setPiId(e.target.value)} required>
              <option value="">Choose eligible PI...</option>
              {eligiblePIs.map((p) => {
                const cpo = data.customerPOs.find((c) => c.piId === p.id);
                const pay = calculatePaymentSummary(p.totalAmount, data.payments, { piId: p.id });
                return (
                  <option key={p.id} value={p.id}>
                    {p.docNo} · PO {cpo?.customerPoNumber} — {p.customerSnapshot.name} (Paid: {formatCurrency(pay.verifiedReceived)})
                  </option>
                );
              })}
            </Select>
          </Field>
          {eligiblePIs.length === 0 && (
            <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <FileCheck2 className="w-4 h-4 shrink-0" />
              No PIs are awaiting Sales Order conversion. Record a Customer PO against a PI first.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Promised Delivery Date">
              <Input type="date" value={promisedDeliveryDate} onChange={(e) => setPromisedDeliveryDate(e.target.value)} />
            </Field>
            <Field label="Order Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={allowCreditTerms}
              onChange={(e) => setAllowCreditTerms(e.target.checked)}
            />
            Approved credit / zero-advance payment terms (allow confirmation before advance receipt)
          </label>
          <Field label="Production / Commercial Remarks">
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </Field>
        </form>
      </Modal>
    </div>
  );
};
