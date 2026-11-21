import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Eye, PackagePlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
import type { GRN, SupplierPO, SupplierReturn } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

// ==========================================
// SUPPLIER PURCHASE ORDERS
// ==========================================

export const SupplierPOsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [previewPO, setPreviewPO] = useState<SupplierPO | null>(null);

  const [purchaseType, setPurchaseType] = useState<'Request-Based' | 'Normal'>('Normal');
  const [materialRequestId, setMaterialRequestId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [taxPercent, setTaxPercent] = useState(18);
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<Array<{ materialId: string; orderedQty: number; unitPrice: number }>>([
    { materialId: '', orderedQty: 1, unitPrice: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const prefillFromMR = (mrId: string) => {
    if (!data) return;
    setMaterialRequestId(mrId);
    const mr = data.materialRequests.find((m) => m.id === mrId);
    if (!mr) return;
    const shortageLines = mr.items
      .map((item) => {
        const pending = Math.max(0, item.requiredQty - item.issuedQty);
        const avail = data.stockMap[item.materialId] || 0;
        const shortage = Math.max(0, pending - avail);
        return shortage > 0 ? { materialId: item.materialId, orderedQty: shortage, unitPrice: 5000 } : null;
      })
      .filter(Boolean) as Array<{ materialId: string; orderedQty: number; unitPrice: number }>;
    if (shortageLines.length > 0) {
      setLines(shortageLines);
      const firstMat = data.materials.find((m) => m.id === shortageLines[0].materialId);
      if (firstMat?.preferredSupplierId) setSupplierId(firstMat.preferredSupplierId);
    }
  };

  useEffect(() => {
    if (!data) return;
    if (searchParams.get('create') === '1') {
      const mrId = searchParams.get('mrId');
      if (mrId) {
        setPurchaseType('Request-Based');
        prefillFromMR(mrId);
      } else {
        setPurchaseType('Normal');
      }
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, data]);

  if (!data) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const spo: any = await erpApi.createSupplierPO({
        supplierId,
        purchaseType,
        materialRequestId: purchaseType === 'Request-Based' ? materialRequestId || undefined : undefined,
        expectedDeliveryDate,
        taxPercent,
        items: lines.filter((l) => l.materialId && l.orderedQty > 0),
        remarks,
      });
      await refresh();
      toast('success', `Supplier PO ${spo.docNo} created`, `Total: ${formatCurrency(spo.totalAmount)}`);
      setCreateOpen(false);
      setLines([{ materialId: '', orderedQty: 1, unitPrice: 0 }]);
      setRemarks('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create Supplier PO');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = data.supplierPOs.filter((p) => {
    if (statusFilter !== 'All' && p.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || p.docNo.toLowerCase().includes(q) || p.supplierName.toLowerCase().includes(q) || (p.materialRequestDocNo || '').toLowerCase().includes(q);
  });

  const columns: ColumnDef<SupplierPO>[] = [
    {
      key: 'docNo',
      header: 'Supplier PO',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-xs">{r.docNo}</div>
          <div className="text-[11px] text-slate-500">
            {r.purchaseType}{r.materialRequestDocNo ? ` · ${r.materialRequestDocNo}` : ''}
          </div>
        </div>
      ),
    },
    { key: 'supplier', header: 'Supplier', render: (r) => r.supplierName },
    {
      key: 'items',
      header: 'Materials (Rec / Ord)',
      render: (r) => (
        <div className="text-xs space-y-0.5">
          {r.items.map((i) => (
            <div key={i.materialId}>
              {i.materialName}: <span className="font-mono">{i.receivedQty}/{i.orderedQty} {i.unit}</span>
            </div>
          ))}
        </div>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="font-mono font-medium">{formatCurrency(r.totalAmount)}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setPreviewPO(r)}>
            <Eye className="w-3.5 h-3.5" />
            PDF
          </Button>
          {(r.status === 'Ordered' || r.status === 'Partially Received') && can('supply_chain', 'create') && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/supply-chain/grn?create=1&poId=${r.id}`)}>
              <PackagePlus className="w-3.5 h-3.5" />
              Create GRN
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Supplier Purchase Orders"
        subtitle="Create Request-Based shortage POs or Normal stock replenishment POs."
        actions={
          can('supply_chain', 'create') && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              New Supplier PO
            </Button>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search PO number, supplier, or MR..."
        statuses={['All', 'Ordered', 'Partially Received', 'Received', 'Closed']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold">{r.docNo} · {r.purchaseType}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="font-medium text-sm">{r.supplierName}</div>
            <div className="flex items-center justify-between text-xs">
              <span>{r.items.length} line(s)</span>
              <span className="font-mono font-semibold">{formatCurrency(r.totalAmount)}</span>
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button variant="secondary" size="sm" onClick={() => setPreviewPO(r)}>PDF</Button>
              {(r.status === 'Ordered' || r.status === 'Partially Received') && (
                <Button size="sm" onClick={() => navigate(`/supply-chain/grn?create=1&poId=${r.id}`)}>Record GRN</Button>
              )}
            </div>
          </div>
        )}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Supplier Purchase Order"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="spo-form" loading={submitting}>Issue Purchase Order</Button>
          </>
        }
      >
        <form id="spo-form" onSubmit={handleSave} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Purchase Type" required>
              <Select value={purchaseType} onChange={(e) => setPurchaseType(e.target.value as any)}>
                <option value="Normal">Normal Stock Replenishment</option>
                <option value="Request-Based">Request-Based (Production Shortage)</option>
              </Select>
            </Field>
            {purchaseType === 'Request-Based' && (
              <Field label="Material Request Reference">
                <Select value={materialRequestId} onChange={(e) => prefillFromMR(e.target.value)}>
                  <option value="">Select Material Request...</option>
                  {data.materialRequests.filter((m) => m.status !== 'Fully Issued').map((m) => (
                    <option key={m.id} value={m.id}>{m.docNo} ({m.productionOrderDocNo})</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Supplier" required>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                <option value="">Select supplier...</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Expected Delivery Date">
              <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
            </Field>
            <Field label="GST / Tax (%)">
              <Input type="number" min={0} value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value))} />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Order Line Items</span>
              <Button variant="secondary" size="sm" onClick={() => setLines((p) => [...p, { materialId: '', orderedQty: 1, unitPrice: 0 }])}>
                + Add Line
              </Button>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded">
                <div className="sm:col-span-6">
                  <Field label="Material" required>
                    <Select
                      value={line.materialId}
                      onChange={(e) => setLines((p) => p.map((x, i) => (i === idx ? { ...x, materialId: e.target.value } : x)))}
                      required
                    >
                      <option value="">Select material...</option>
                      {data.materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.code} — {m.name} ({m.unit})</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Qty" required>
                    <Input
                      type="number"
                      step="any"
                      min={0.01}
                      value={line.orderedQty}
                      onChange={(e) => setLines((p) => p.map((x, i) => (i === idx ? { ...x, orderedQty: Number(e.target.value) } : x)))}
                      required
                    />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Unit Price (₹)" required>
                    <Input
                      type="number"
                      min={0}
                      value={line.unitPrice}
                      onChange={(e) => setLines((p) => p.map((x, i) => (i === idx ? { ...x, unitPrice: Number(e.target.value) } : x)))}
                      required
                    />
                  </Field>
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                      className="p-2 text-red-600 cursor-pointer"
                      aria-label="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Field label="Remarks">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </form>
      </Modal>

      <DocumentPreviewModal
        open={Boolean(previewPO)}
        onClose={() => setPreviewPO(null)}
        company={data.company}
        payload={previewPO ? { kind: 'spo', doc: previewPO } : null}
      />
    </div>
  );
};

// ==========================================
// GRN & MATERIAL VERIFICATION
// ==========================================

export const GRNAndVerificationPage: React.FC<{ mode: 'grn' | 'verification' }> = ({ mode }) => {
  const { data, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(mode === 'verification' ? 'Pending' : 'All');

  // Create GRN state
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierPoId, setSupplierPoId] = useState('');
  const [supplierReturnId, setSupplierReturnId] = useState('');
  const [invoiceOrChallanNo, setInvoiceOrChallanNo] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [grnQtys, setGrnQtys] = useState<Record<string, number>>({});
  const [attachmentName, setAttachmentName] = useState('');
  const [remarks, setRemarks] = useState('');

  // Verify GRN state
  const [verifyingGRN, setVerifyingGRN] = useState<GRN | null>(null);
  const [verifInputs, setVerifInputs] = useState<Record<string, { acceptedQty: number; rejectedQty: number; rejectionReason: string }>>({});
  const [verifRemarks, setVerifRemarks] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectPO = (poId: string, returnId = '') => {
    if (!data) return;
    setSupplierPoId(poId);
    setSupplierReturnId(returnId);
    const spo = data.supplierPOs.find((p) => p.id === poId);
    const sr = returnId ? data.supplierReturns.find((r) => r.id === returnId) : undefined;
    if (!spo) return;
    const init: Record<string, number> = {};
    if (sr) {
      init[sr.materialId] = sr.returnQty;
    } else {
      for (const item of spo.items) {
        init[item.materialId] = Math.max(0, item.orderedQty - item.receivedQty);
      }
    }
    setGrnQtys(init);
  };

  useEffect(() => {
    if (!data) return;
    if (searchParams.get('create') === '1' && mode === 'grn') {
      const poId = searchParams.get('poId') || '';
      const returnId = searchParams.get('returnId') || '';
      if (poId) selectPO(poId, returnId);
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, data, mode]);

  if (!data) return null;

  const openVerify = (grn: GRN) => {
    const init: Record<string, { acceptedQty: number; rejectedQty: number; rejectionReason: string }> = {};
    for (const item of grn.items) {
      init[item.materialId] = { acceptedQty: item.receivedQty, rejectedQty: 0, rejectionReason: '' };
    }
    setVerifInputs(init);
    setVerifRemarks('');
    setErr(null);
    setVerifyingGRN(grn);
  };

  const handleCreateGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const items = Object.entries(grnQtys)
        .filter(([, q]) => q > 0)
        .map(([materialId, receivedQty]) => ({ materialId, receivedQty }));
      const grn: any = await erpApi.createGRN({
        supplierPoId,
        supplierReturnId: supplierReturnId || undefined,
        receivedDate,
        invoiceOrChallanNo,
        items,
        attachmentName: attachmentName || undefined,
        remarks,
      });
      await refresh();
      toast('success', `GRN ${grn.docNo} recorded`, 'Awaiting Material Verification before stock update.');
      setCreateOpen(false);
      setInvoiceOrChallanNo('');
      setRemarks('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create GRN');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingGRN) return;
    setErr(null);
    setSubmitting(true);
    try {
      const items = verifyingGRN.items.map((item) => ({
        materialId: item.materialId,
        acceptedQty: verifInputs[item.materialId]?.acceptedQty ?? 0,
        rejectedQty: verifInputs[item.materialId]?.rejectedQty ?? 0,
        rejectionReason: verifInputs[item.materialId]?.rejectionReason || '',
      }));
      const res: any = await erpApi.verifyGRN(verifyingGRN.id, { items, verificationRemarks: verifRemarks });
      await refresh();
      toast('success', `Verification saved for ${res.docNo}`, `Status: ${res.verificationStatus}. Accepted qty added to usable stock.`);
      setVerifyingGRN(null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPO = data.supplierPOs.find((p) => p.id === supplierPoId);
  const filtered = data.grns.filter((g) => {
    if (statusFilter !== 'All' && g.verificationStatus !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || g.docNo.toLowerCase().includes(q) || g.supplierPoDocNo.toLowerCase().includes(q) || g.supplierName.toLowerCase().includes(q);
  });

  const columns: ColumnDef<GRN>[] = [
    {
      key: 'docNo',
      header: 'GRN / PO Ref',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-xs">{r.docNo} {r.isReplacement && <span className="text-amber-600">(Replacement)</span>}</div>
          <div className="text-[11px] text-slate-500">{r.supplierPoDocNo} · Inv: {r.invoiceOrChallanNo}</div>
        </div>
      ),
    },
    { key: 'supplier', header: 'Supplier', render: (r) => r.supplierName },
    {
      key: 'items',
      header: 'Received / Accepted / Rejected',
      render: (r) => (
        <div className="text-xs space-y-0.5">
          {r.items.map((i) => (
            <div key={i.materialId}>
              {i.materialName}: <span className="font-mono">Rec {i.receivedQty}</span>
              {i.verified && (
                <span className="font-mono text-slate-500">
                  {' '}· <span className="text-emerald-700 dark:text-emerald-400">Acc {i.acceptedQty}</span>
                  {i.rejectedQty > 0 && <span className="text-red-600 dark:text-red-400"> · Rej {i.rejectedQty}</span>}
                </span>
              )}
            </div>
          ))}
        </div>
      ),
    },
    { key: 'date', header: 'Received', render: (r) => <span className="font-mono text-xs">{r.receivedDate}</span> },
    { key: 'status', header: 'Verification', render: (r) => <StatusBadge status={r.verificationStatus} /> },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) => {
        const hasRejected = r.items.some((i) => i.rejectedQty > 0);
        return (
          <div className="flex justify-end gap-1.5">
            {r.verificationStatus === 'Pending' && can('supply_chain', 'edit') && (
              <Button size="sm" onClick={() => openVerify(r)}>
                <ClipboardCheck className="w-3.5 h-3.5" />
                Verify
              </Button>
            )}
            {hasRejected && r.verificationStatus !== 'Pending' && can('supply_chain', 'create') && (
              <Button variant="secondary" size="sm" onClick={() => navigate(`/supply-chain/returns?create=1&grnId=${r.id}`)}>
                <RotateCcw className="w-3.5 h-3.5" />
                Return Rejected
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
        title={mode === 'grn' ? 'GRN — Goods Receipt Notes' : 'Incoming Material Verification'}
        subtitle={
          mode === 'grn'
            ? 'Record incoming supplier shipments (partial or full). Unverified receipts do not increase usable stock.'
            : 'Inspect received goods. Only accepted quantities enter usable inventory; rejected items route to Supplier Returns.'
        }
        actions={
          mode === 'grn' &&
          can('supply_chain', 'create') && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Create GRN
            </Button>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search GRN, PO, or supplier..."
        statuses={['All', 'Pending', 'Accepted', 'Partially Accepted', 'Rejected']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold">{r.docNo} · {r.supplierPoDocNo}</span>
              <StatusBadge status={r.verificationStatus} />
            </div>
            <div className="font-medium text-sm">{r.supplierName}</div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {r.items.map((i) => `${i.materialName} (Rec ${i.receivedQty})`).join(', ')}
            </div>
            {r.verificationStatus === 'Pending' && can('supply_chain', 'edit') && (
              <Button size="sm" onClick={() => openVerify(r)}>Verify Materials</Button>
            )}
          </div>
        )}
      />

      {/* Create GRN Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={supplierReturnId ? 'Record Replacement GRN' : 'Record Goods Receipt Note (GRN)'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="grn-form" loading={submitting}>Save GRN</Button>
          </>
        }
      >
        <form id="grn-form" onSubmit={handleCreateGRN} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Supplier Purchase Order" required>
              <Select value={supplierPoId} onChange={(e) => selectPO(e.target.value)} required disabled={Boolean(supplierReturnId)}>
                <option value="">Select Supplier PO...</option>
                {data.supplierPOs
                  .filter((p) => supplierReturnId ? p.id === supplierPoId : p.status === 'Ordered' || p.status === 'Partially Received')
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.docNo} — {p.supplierName}</option>
                  ))}
              </Select>
            </Field>
            <Field label="Received Date" required>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
            </Field>
            <Field label="Supplier Invoice / DC #" required>
              <Input value={invoiceOrChallanNo} onChange={(e) => setInvoiceOrChallanNo(e.target.value)} placeholder="INV/2026/..." required />
            </Field>
          </div>

          {selectedPO && (
            <div className="space-y-2">
              <div className="text-xs font-semibold">Received Quantities</div>
              {selectedPO.items
                .filter((i) => !supplierReturnId || grnQtys[i.materialId] !== undefined)
                .map((item) => {
                  const remaining = Math.max(0, item.orderedQty - item.receivedQty);
                  return (
                    <div key={item.materialId} className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between gap-3">
                      <div className="text-xs">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.materialName}</div>
                        <div className="text-slate-500 font-mono">
                          Ordered: {item.orderedQty} · Previously Rec: {item.receivedQty} · Remaining: {remaining}
                        </div>
                      </div>
                      <div className="w-28">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          max={supplierReturnId ? grnQtys[item.materialId] : remaining}
                          value={grnQtys[item.materialId] ?? 0}
                          onChange={(e) => setGrnQtys((prev) => ({ ...prev, [item.materialId]: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          <FileUploadInput label="Delivery Challan / Invoice Attachment" fileName={attachmentName} onFileSelected={(n) => setAttachmentName(n)} />
          <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        </form>
      </Modal>

      {/* Material Verification Modal */}
      <Modal
        open={Boolean(verifyingGRN)}
        onClose={() => setVerifyingGRN(null)}
        title={`Verify Received Materials — ${verifyingGRN?.docNo || ''}`}
        subtitle="Accepted + Rejected must equal Received quantity. Only Accepted units increase usable stock."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVerifyingGRN(null)}>Cancel</Button>
            <Button type="submit" form="verif-form" loading={submitting}>Complete Verification</Button>
          </>
        }
      >
        {verifyingGRN && (
          <form id="verif-form" onSubmit={handleVerifyGRN} className="space-y-4">
            {err && <ErrorBanner message={err} />}
            {verifyingGRN.items.map((item) => {
              const cur = verifInputs[item.materialId] || { acceptedQty: item.receivedQty, rejectedQty: 0, rejectionReason: '' };
              return (
                <div key={item.materialId} className="p-3.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{item.materialName}</span>
                    <span className="font-mono text-xs font-semibold">Received: {item.receivedQty} {item.unit}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Accepted Qty (Adds to Stock)" required>
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        max={item.receivedQty}
                        value={cur.acceptedQty}
                        onChange={(e) => {
                          const acc = Math.min(item.receivedQty, Math.max(0, Number(e.target.value)));
                          setVerifInputs((prev) => ({
                            ...prev,
                            [item.materialId]: { ...cur, acceptedQty: acc, rejectedQty: item.receivedQty - acc },
                          }));
                        }}
                      />
                    </Field>
                    <Field label="Rejected Qty (Supplier Return)" required>
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        max={item.receivedQty}
                        value={cur.rejectedQty}
                        onChange={(e) => {
                          const rej = Math.min(item.receivedQty, Math.max(0, Number(e.target.value)));
                          setVerifInputs((prev) => ({
                            ...prev,
                            [item.materialId]: { ...cur, rejectedQty: rej, acceptedQty: item.receivedQty - rej },
                          }));
                        }}
                      />
                    </Field>
                  </div>
                  {cur.rejectedQty > 0 && (
                    <Field label="Rejection Reason" required>
                      <Input
                        value={cur.rejectionReason}
                        onChange={(e) =>
                          setVerifInputs((prev) => ({
                            ...prev,
                            [item.materialId]: { ...cur, rejectionReason: e.target.value },
                          }))
                        }
                        placeholder="Describe physical damage, spec mismatch, or calibration failure..."
                        required
                      />
                    </Field>
                  )}
                </div>
              );
            })}
            <Field label="Verification Remarks">
              <Input value={verifRemarks} onChange={(e) => setVerifRemarks(e.target.value)} />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
};

// ==========================================
// SUPPLIER RETURNS
// ==========================================

export const SupplierReturnsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [grnId, setGrnId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [returnQty, setReturnQty] = useState(1);
  const [reason, setReason] = useState('');
  const [replacementRequired, setReplacementRequired] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const preGrn = searchParams.get('grnId') || '';
      if (preGrn) setGrnId(preGrn);
      setOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (!data) return null;

  const rejectedGRNs = data.grns.filter((g) => g.items.some((i) => i.rejectedQty > 0));
  const selectedGRN = data.grns.find((g) => g.id === grnId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const sr: any = await erpApi.createSupplierReturn({
        grnId,
        materialId,
        returnQty: Number(returnQty),
        reason,
        replacementRequired,
        remarks,
      });
      await refresh();
      toast('success', `Supplier Return ${sr.docNo} created`);
      setOpen(false);
      setReason('');
      setRemarks('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create supplier return');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<SupplierReturn>[] = [
    {
      key: 'docNo',
      header: 'Return ID',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-xs">{r.docNo}</div>
          <div className="text-[11px] text-slate-500">GRN: {r.grnDocNo} · PO: {r.supplierPoDocNo}</div>
        </div>
      ),
    },
    { key: 'sup', header: 'Supplier', render: (r) => r.supplierName },
    {
      key: 'mat',
      header: 'Rejected Material',
      render: (r) => (
        <div>
          <div className="font-medium">{r.materialName}</div>
          <div className="text-xs text-slate-500">Qty: {r.returnQty} {r.unit} · {r.reason}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Replacement Status', render: (r) => <StatusBadge status={r.replacementStatus} /> },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (r) =>
        r.replacementStatus === 'Pending Replacement' && can('supply_chain', 'create') ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/supply-chain/grn?create=1&poId=${r.supplierPoId}&returnId=${r.id}`)}
          >
            Receive Replacement GRN
          </Button>
        ) : (
          <span className="font-mono text-xs text-slate-500">{r.replacementGrnDocNo || '—'}</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Supplier Returns & Replacements"
        subtitle="Manage rejected incoming materials. Replacements arrive through a new GRN and incoming verification."
        actions={
          can('supply_chain', 'create') && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Return
            </Button>
          )
        }
      />
      <DataTable
        rows={data.supplierReturns}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold">{r.docNo} · {r.grnDocNo}</span>
              <StatusBadge status={r.replacementStatus} />
            </div>
            <div className="text-sm font-medium">{r.materialName} ({r.returnQty} {r.unit})</div>
            <div className="text-xs text-slate-500">{r.supplierName} · {r.reason}</div>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create Supplier Return"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="sr-form" loading={submitting}>Record Return</Button>
          </>
        }
      >
        <form id="sr-form" onSubmit={handleSave} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <Field label="GRN with Rejected Materials" required>
            <Select value={grnId} onChange={(e) => { setGrnId(e.target.value); setMaterialId(''); }} required>
              <option value="">Select GRN...</option>
              {rejectedGRNs.map((g) => (
                <option key={g.id} value={g.id}>{g.docNo} — {g.supplierName}</option>
              ))}
            </Select>
          </Field>
          {selectedGRN && (
            <Field label="Rejected Material" required>
              <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
                <option value="">Select material...</option>
                {selectedGRN.items.filter((i) => i.rejectedQty > 0).map((i) => (
                  <option key={i.materialId} value={i.materialId}>
                    {i.materialName} (Rejected: {i.rejectedQty} {i.unit})
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Return Quantity" required>
            <Input type="number" min={0.01} step="any" value={returnQty} onChange={(e) => setReturnQty(Number(e.target.value))} required />
          </Field>
          <Field label="Return Reason" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input type="checkbox" checked={replacementRequired} onChange={(e) => setReplacementRequired(e.target.checked)} />
            Replacement material required from supplier
          </label>
          <Field label="Remarks">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
};
