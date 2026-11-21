import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2, Printer, RefreshCw } from 'lucide-react';
import type { CompanySettings, DeliveryOrder, ProformaInvoice, Quotation, SalesOrder, SupplierPO } from '../types/erp';
import { formatCurrency } from '../utils/erpLogic';
import { erpApi } from '../services/api';
import { Button, Modal } from './ui';

export type DocUnion =
  | { kind: 'quotation'; doc: Quotation }
  | { kind: 'pi'; doc: ProformaInvoice }
  | { kind: 'so'; doc: SalesOrder }
  | { kind: 'spo'; doc: SupplierPO }
  | { kind: 'delivery_order'; doc: DeliveryOrder }
  | { kind: 'delivery_challan'; doc: DeliveryOrder };

const defaultCompany: CompanySettings = {
  companyName: 'CRYO SYSTEMS INDIA PVT LTD',
  legalName: 'CRYO Systems India Private Limited',
  gstin: '29AABCC1234F1Z5',
  address: 'Plot 42, Phase II, Peenya Industrial Area, Bengaluru, Karnataka - 560058',
  phone: '+91 80 2839 0000',
  email: 'info@cryoerp.com',
  website: 'www.cryoerp.com',
  bankName: 'State Bank of India',
  bankAccountName: 'CRYO Systems India Pvt Ltd',
  bankAccountNumber: '38920192837',
  bankIfsc: 'SBIN0001234',
  bankBranch: 'Peenya Industrial Estate, Bengaluru',
  currencySymbol: '₹',
  defaultTaxPercent: 18,
  defaultPaymentTerms: '100% advance against Proforma Invoice or approved commercial credit.',
  defaultDeliveryTerms: 'Ex-Works factory dispatch within promised delivery schedule.',
  defaultWarranty: '12 months comprehensive warranty against manufacturing defects.',
  demoMode: true,
};

export const DocumentPreviewModal: React.FC<{
  open: boolean;
  onClose: () => void;
  company?: CompanySettings;
  payload: DocUnion | null;
}> = ({ open, onClose, company: propCompany, payload }) => {
  const company = propCompany || defaultCompany;
  const docRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'pdf' | 'html'>('pdf');
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  if (!open || !payload) return null;

  const isLogistics = payload.kind === 'delivery_order' || payload.kind === 'delivery_challan';

  const title =
    payload.kind === 'quotation'
      ? `Commercial Quotation — ${payload.doc.docNo}`
      : payload.kind === 'pi'
        ? `Proforma Invoice — ${payload.doc.docNo}`
        : payload.kind === 'so'
          ? `Sales Order Confirmation — ${payload.doc.docNo}`
          : payload.kind === 'spo'
            ? `Supplier Purchase Order — ${payload.doc.docNo}`
            : payload.kind === 'delivery_challan'
              ? `Delivery Challan — ${payload.doc.deliveryChallanNo || payload.doc.docNo}`
              : `Delivery Order — ${payload.doc.docNo}`;

  const typeMap: Record<string, string> = {
    quotation: 'quotation',
    pi: 'proforma-invoice',
    so: 'sales-order',
    spo: 'supplier-po',
    delivery_order: 'delivery-order',
    delivery_challan: 'delivery-challan',
  };
  const docType = typeMap[payload.kind] || payload.kind;
  const docNo = isLogistics
    ? (payload.kind === 'delivery_challan' ? payload.doc.deliveryChallanNo || payload.doc.docNo : payload.doc.docNo)
    : payload.doc.docNo;

  const fetchPdf = useCallback(async () => {
    if (!payload) return;
    try {
      setLoadingPdf(true);
      setPdfError(null);
      const blob = await erpApi.getDocumentPDFBlob(docType, payload.doc.id);
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch (err: any) {
      setPdfError(err.message || 'Failed to generate PDF document');
    } finally {
      setLoadingPdf(false);
    }
  }, [docType, payload?.doc?.id]);

  useEffect(() => {
    if (open && payload) {
      fetchPdf();
    }
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [open, payload?.kind, payload?.doc?.id]);

  const handlePrint = () => {
    window.print();
  };

  const handleOpenInNewTab = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, '_blank');
    } else {
      const url = erpApi.getDocumentPDFUrl(docType, payload.doc.id);
      window.open(url, '_blank');
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      await erpApi.downloadDocumentPDF(docType, payload.doc.id, docNo);
    } catch (err: any) {
      alert(`PDF Download Error: ${err.message}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadHtml = () => {
    const html = docRef.current?.innerHTML || '';
    const fullDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;color:#0f172a;padding:32px;max-width:860px;margin:0 auto;}table{width:100%;border-collapse:collapse;margin:16px 0;}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;font-size:13px;}th{background:#f8fafc;}</style></head><body>${html}</body></html>`;
    const blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docNo}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="View vector-rendered binary PDF or formatted printable document"
      size="xl"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-2">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setViewMode('pdf')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                viewMode === 'pdf'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              PDF Document
            </button>
            <button
              type="button"
              onClick={() => setViewMode('html')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                viewMode === 'html'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              HTML View
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleOpenInNewTab}>
              <ExternalLink className="w-4 h-4" />
              Open in Tab
            </Button>
            {viewMode === 'html' && (
              <Button variant="secondary" onClick={handleDownloadHtml}>
                <FileText className="w-4 h-4" />
                Save HTML
              </Button>
            )}
            <Button variant="secondary" onClick={handlePrint}>
              <Printer className="w-4 h-4" />
              Print
            </Button>
            <Button variant="primary" loading={downloadingPdf} onClick={handleDownloadPdf}>
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
          </div>
        </div>
      }
    >
      {viewMode === 'pdf' ? (
        <div className="space-y-3">
          {loadingPdf ? (
            <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800 min-h-[500px]">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Generating official binary PDF document...
              </div>
              <div className="text-xs text-slate-500">Vector layout via PDFKit engine</div>
            </div>
          ) : pdfError ? (
            <div className="p-8 text-center space-y-4 bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800 min-h-[400px] flex flex-col items-center justify-center">
              <div className="text-sm text-red-600 dark:text-red-400 font-medium">
                PDF Preview Error: {pdfError}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={fetchPdf}>
                  <RefreshCw className="w-4 h-4" />
                  Retry PDF Generation
                </Button>
                <Button size="sm" variant="primary" onClick={() => setViewMode('html')}>
                  Switch to HTML View
                </Button>
              </div>
            </div>
          ) : pdfBlobUrl ? (
            <iframe
              src={pdfBlobUrl}
              title={title}
              className="w-full h-[650px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 shadow-inner"
            />
          ) : null}
        </div>
      ) : (
        <div
          ref={docRef}
          className="bg-white text-slate-900 border border-slate-200 rounded-md p-6 sm:p-8 space-y-6 text-sm"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="text-lg font-bold tracking-tight text-slate-900">{company.companyName}</div>
              <div className="text-xs text-slate-600 mt-1 max-w-md">{company.address}</div>
              <div className="text-xs text-slate-600 mt-1">
                GSTIN: <span className="font-mono">{company.gstin}</span> · {company.phone} · {company.email}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-base font-bold text-slate-900">
                {payload.kind === 'quotation'
                  ? 'COMMERCIAL QUOTATION'
                  : payload.kind === 'pi'
                    ? 'PROFORMA INVOICE'
                    : payload.kind === 'so'
                      ? 'SALES ORDER CONFIRMATION'
                      : payload.kind === 'spo'
                        ? 'PURCHASE ORDER'
                        : payload.kind === 'delivery_challan'
                          ? 'DELIVERY CHALLAN'
                          : 'DELIVERY ORDER'}
              </div>
              <div className="font-mono text-sm font-semibold text-teal-700 mt-1">
                {payload.kind === 'delivery_challan'
                  ? payload.doc.deliveryChallanNo || payload.doc.docNo
                  : payload.doc.docNo}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Date:{' '}
                {payload.kind === 'quotation'
                  ? payload.doc.quotationDate
                  : payload.kind === 'pi'
                    ? payload.doc.piDate
                    : payload.kind === 'so'
                      ? payload.doc.createdAt ? new Date(payload.doc.createdAt).toISOString().slice(0, 10) : ''
                      : payload.kind === 'spo'
                        ? payload.doc.poDate
                        : payload.doc.actualDispatchDate || payload.doc.plannedDispatchDate}
              </div>
              {payload.kind === 'quotation' && (
                <div className="text-xs text-slate-600">Valid Until: {payload.doc.validityDate}</div>
              )}
              {payload.kind === 'pi' && (
                <div className="text-xs text-slate-600">Ref Quotation: {payload.doc.quotationDocNo}</div>
              )}
              {payload.kind === 'so' && (
                <div className="text-xs text-slate-600">Customer PO: {payload.doc.customerPoNumber}</div>
              )}
              {payload.kind === 'spo' && (
                <div className="text-xs text-slate-600">Expected Delivery: {payload.doc.expectedDeliveryDate}</div>
              )}
              {isLogistics && (
                <>
                  <div className="text-xs text-slate-600">Sales Order: {payload.doc.salesOrderDocNo}</div>
                  <div className="text-xs text-slate-600">Production Order: {payload.doc.productionOrderDocNo}</div>
                </>
              )}
            </div>
          </div>

          {/* Counterparty / Consignee Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded border border-slate-200">
            {isLogistics ? (
              <>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Consignee / Deliver To</div>
                  <div className="font-semibold text-slate-900 mt-0.5">{payload.doc.customerName}</div>
                  <div className="text-xs text-slate-700 mt-1">{payload.doc.deliveryAddress}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Transport & Dispatch Details</div>
                  <div className="text-xs text-slate-800 mt-0.5 font-medium">Method: {payload.doc.transportMethod}</div>
                  {payload.doc.transportMethod === 'Own Vehicle' ? (
                    <div className="text-xs text-slate-600 mt-0.5">
                      Vehicle: <span className="font-mono">{payload.doc.vehicleNumber}</span> · Driver: {payload.doc.driverName} ({payload.doc.driverPhone})
                    </div>
                  ) : (
                    <div className="text-xs text-slate-600 mt-0.5">
                      Carrier: {payload.doc.courierCompany} · AWB: <span className="font-mono">{payload.doc.trackingNumber || 'Pending'}</span>
                    </div>
                  )}
                  <div className="text-xs text-slate-600 mt-1">
                    Expected Delivery: {payload.doc.expectedDeliveryDate}
                  </div>
                </div>
              </>
            ) : payload.kind !== 'spo' ? (
              <>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Bill To</div>
                  <div className="font-semibold text-slate-900 mt-0.5">{payload.doc.customerSnapshot.name}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{payload.doc.customerSnapshot.contactPerson}</div>
                  <div className="text-xs text-slate-600">{payload.doc.customerSnapshot.billingAddress}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    GSTIN: <span className="font-mono">{payload.doc.customerSnapshot.gstin || 'N/A'}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Ship To / Contact</div>
                  <div className="text-xs text-slate-700 mt-0.5">{payload.doc.customerSnapshot.shippingAddress}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    {payload.doc.customerSnapshot.phone} · {payload.doc.customerSnapshot.email}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Supplier</div>
                  <div className="font-semibold text-slate-900 mt-0.5">{payload.doc.supplierName}</div>
                  <div className="text-xs text-slate-600 mt-1">Purchase Type: {payload.doc.purchaseType}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Reference</div>
                  <div className="text-xs text-slate-700 mt-0.5">
                    Material Request: {payload.doc.materialRequestDocNo || 'Regular Stock Replenishment'}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">Status: {payload.doc.status}</div>
                </div>
              </>
            )}
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border border-slate-200 px-3 py-2 text-left">#</th>
                  <th className="border border-slate-200 px-3 py-2 text-left">Description & Specifications</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">Qty</th>
                  {!isLogistics && (
                    <>
                      <th className="border border-slate-200 px-3 py-2 text-right">Unit Price</th>
                      <th className="border border-slate-200 px-3 py-2 text-right">Line Total</th>
                    </>
                  )}
                  {isLogistics && (
                    <th className="border border-slate-200 px-3 py-2 text-left">Serial / Identification Numbers</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {isLogistics ? (
                  <tr>
                    <td className="border border-slate-200 px-3 py-2 align-top font-mono">1</td>
                    <td className="border border-slate-200 px-3 py-2 align-top">
                      <div className="font-semibold text-slate-900">{payload.doc.productName}</div>
                      <div className="text-slate-500 mt-0.5">Sales Order Item · Cryogenic Systems Standard</div>
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-mono align-top font-semibold">
                      {payload.doc.quantity} Nos
                    </td>
                    <td className="border border-slate-200 px-3 py-2 font-mono text-slate-600 align-top">
                      {payload.doc.serialNumbers?.length ? payload.doc.serialNumbers.join(', ') : 'Factory Batch Assorted'}
                    </td>
                  </tr>
                ) : payload.kind !== 'spo' ? (
                  payload.doc.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="border border-slate-200 px-3 py-2 align-top font-mono">{idx + 1}</td>
                      <td className="border border-slate-200 px-3 py-2 align-top">
                        <div className="font-semibold text-slate-900">
                          {item.productName} {item.model ? `(${item.model})` : ''}
                        </div>
                        <div className="text-slate-600 mt-0.5">{item.specifications}</div>
                        {item.highlights && item.highlights.length > 0 && (
                          <ul className="list-disc pl-4 mt-1.5 space-y-0.5 text-slate-700">
                            {item.highlights.map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-mono align-top">{item.quantity}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-mono align-top">
                        {formatCurrency(item.unitPrice, company.currencySymbol)}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-mono font-medium align-top">
                        {formatCurrency(item.lineTotal || (item.quantity * item.unitPrice), company.currencySymbol)}
                      </td>
                    </tr>
                  ))
                ) : (
                  payload.doc.items.map((item, idx) => (
                    <tr key={item.materialId}>
                      <td className="border border-slate-200 px-3 py-2 font-mono">{idx + 1}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="font-semibold text-slate-900">{item.materialName}</div>
                        <div className="text-slate-500 font-mono">{item.materialCode}</div>
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-mono">
                        {item.orderedQty} {item.unit}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-mono">
                        {formatCurrency(item.unitPrice, company.currencySymbol)}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-mono font-medium">
                        {formatCurrency(item.lineTotal || (item.orderedQty * item.unitPrice), company.currencySymbol)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Totals / Logistics Remarks */}
          {!isLogistics ? (
            <div className="flex justify-end">
              <div className="w-full sm:w-72 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-mono">{formatCurrency(payload.doc.subtotal, company.currencySymbol)}</span>
                </div>
                {payload.kind !== 'spo' && (payload.doc.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span className="font-mono">-{formatCurrency(payload.doc.discountAmount, company.currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">GST</span>
                  <span className="font-mono">{formatCurrency(payload.doc.taxAmount, company.currencySymbol)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-slate-300 pt-2">
                  <span>Grand Total</span>
                  <span className="font-mono">{formatCurrency(payload.doc.totalAmount, company.currencySymbol)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 p-4 rounded border border-slate-200 text-xs space-y-2">
              <div className="font-semibold text-slate-800">Dispatch & Delivery Instructions</div>
              <div className="text-slate-600">
                {payload.doc.remarks || payload.doc.dispatchRemarks || 'Deliver in upright orientation with moisture-proof wrapping. Handle with care.'}
              </div>
            </div>
          )}

          {/* Signatures / Commercial Terms */}
          {isLogistics ? (
            <div className="grid grid-cols-2 gap-8 border-t border-slate-200 pt-8 text-xs">
              <div className="space-y-6">
                <div className="font-semibold text-slate-800">Dispatched By (CRYO Logistics)</div>
                <div className="pt-8 border-t border-slate-300">
                  <div className="font-medium text-slate-900">{payload.doc.createdBy}</div>
                  <div className="text-slate-500">Authorized Dispatch Officer</div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="font-semibold text-slate-800">Received By (Customer / Site Representative)</div>
                <div className="pt-8 border-t border-slate-300">
                  <div className="font-medium text-slate-900">{payload.doc.receivedBy || 'Signature & Official Stamp'}</div>
                  <div className="text-slate-500">
                    {payload.doc.actualDeliveryDate ? `Delivered on ${payload.doc.actualDeliveryDate}` : 'Date & Time of Delivery'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 pt-4 text-xs">
              <div className="space-y-1">
                <div className="font-semibold text-slate-800">Commercial Terms</div>
                {payload.kind !== 'spo' && (
                  <>
                    <div>
                      <span className="text-slate-500">Payment Terms:</span> {payload.doc.paymentTerms}
                    </div>
                    <div>
                      <span className="text-slate-500">Delivery Terms:</span> {payload.doc.deliveryTerms}
                    </div>
                  </>
                )}
                {payload.kind === 'quotation' && (
                  <div>
                    <span className="text-slate-500">Warranty:</span> {payload.doc.warranty}
                  </div>
                )}
                {payload.doc.remarks && (
                  <div>
                    <span className="text-slate-500">Remarks:</span> {payload.doc.remarks}
                  </div>
                )}
              </div>
              {payload.kind === 'pi' && (
                <div className="space-y-1 bg-slate-50 p-3 rounded border border-slate-200">
                  <div className="font-semibold text-slate-800">Bank Remittance Details</div>
                  <div>Bank: {payload.doc.bankDetails.bankName}</div>
                  <div>Account Name: {payload.doc.bankDetails.accountName}</div>
                  <div>
                    Account No: <span className="font-mono">{payload.doc.bankDetails.accountNumber}</span>
                  </div>
                  <div>
                    IFSC: <span className="font-mono">{payload.doc.bankDetails.ifsc}</span> ({payload.doc.bankDetails.branch})
                  </div>
                  <div className="text-[11px] text-slate-500 pt-1">
                    Note: This Proforma Invoice is a commercial payment request, not a final GST Tax Invoice.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
