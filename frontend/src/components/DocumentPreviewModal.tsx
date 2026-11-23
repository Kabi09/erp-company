import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Hash,
  Printer,
  RotateCcw,
  ShieldCheck,
  User,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  CompanySettings,
  DeliveryOrder,
  ProductionOrder,
  ProformaInvoice,
  Quotation,
  SalesOrder,
  SupplierPO,
} from '../types/erp';
import { formatCurrency } from '../utils/erpLogic';
import { erpApi } from '../services/api';
import { DeveloperCredit } from './DeveloperCredit';
import { Button, Modal } from './ui';

export type DocUnion =
  | { kind: 'quotation'; doc: Quotation }
  | { kind: 'pi'; doc: ProformaInvoice }
  | { kind: 'so'; doc: SalesOrder }
  | { kind: 'spo'; doc: SupplierPO }
  | { kind: 'production_order'; doc: ProductionOrder }
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

  const [viewMode, setViewMode] = useState<'document' | 'raw_pdf'>('document');
  const [zoom, setZoom] = useState<number>(100);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  if (!open || !payload) return null;

  const isLogistics = payload.kind === 'delivery_order' || payload.kind === 'delivery_challan';
  const isProduction = payload.kind === 'production_order';

  const title =
    payload.kind === 'quotation'
      ? `Commercial Quotation — ${payload.doc.docNo}`
      : payload.kind === 'pi'
        ? `Proforma Invoice — ${payload.doc.docNo}`
        : payload.kind === 'so'
          ? `Sales Order Confirmation — ${payload.doc.docNo}`
          : payload.kind === 'spo'
            ? `Supplier Purchase Order — ${payload.doc.docNo}`
            : payload.kind === 'production_order'
              ? `Production Manufacturing Order — ${payload.doc.docNo}`
              : payload.kind === 'delivery_challan'
                ? `Delivery Challan — ${payload.doc.deliveryChallanNo || payload.doc.docNo}`
                : `Delivery Order — ${payload.doc.docNo}`;

  const typeMap: Record<string, string> = {
    quotation: 'quotation',
    pi: 'proforma-invoice',
    so: 'sales-order',
    spo: 'supplier-po',
    production_order: 'production-order',
    delivery_order: 'delivery-order',
    delivery_challan: 'delivery-challan',
  };
  const docType = typeMap[payload.kind] || payload.kind;
  const docNo = isLogistics
    ? (payload.kind === 'delivery_challan' ? payload.doc.deliveryChallanNo || payload.doc.docNo : payload.doc.docNo)
    : payload.doc.docNo;

  const directPdfUrl = erpApi.getDocumentPDFUrl(docType, payload.doc.id);

  const handlePrint = () => {
    window.print();
  };

  const handleOpenInNewTab = () => {
    window.open(directPdfUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      await erpApi.downloadDocumentPDF(docType, payload.doc.id, docNo);
    } catch (err: any) {
      alert(`PDF Download Error: ${err.message || 'Unable to download PDF'}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Color theme per document type
  const bannerTheme =
    payload.kind === 'quotation'
      ? { bg: 'bg-teal-700', text: 'text-white', badge: 'bg-teal-100 text-teal-800 border-teal-200' }
      : payload.kind === 'pi'
        ? { bg: 'bg-indigo-700', text: 'text-white', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' }
        : payload.kind === 'so'
          ? { bg: 'bg-emerald-700', text: 'text-white', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
          : payload.kind === 'spo'
            ? { bg: 'bg-amber-600', text: 'text-white', badge: 'bg-amber-100 text-amber-800 border-amber-200' }
            : payload.kind === 'production_order'
              ? { bg: 'bg-purple-700', text: 'text-white', badge: 'bg-purple-100 text-purple-800 border-purple-200' }
              : payload.kind === 'delivery_challan'
                ? { bg: 'bg-cyan-700', text: 'text-white', badge: 'bg-cyan-100 text-cyan-800 border-cyan-200' }
                : { bg: 'bg-slate-700', text: 'text-white', badge: 'bg-slate-100 text-slate-800 border-slate-200' };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Official Commercial Document · CRYO Enterprise ERP 2.0"
      size="xl"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
          {/* View mode & Zoom controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setViewMode('document')}
                className={`px-3 py-1 rounded font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'document'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-teal-600" />
                Document View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw_pdf')}
                className={`px-3 py-1 rounded font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'raw_pdf'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                Raw PDF Stream
              </button>
            </div>

            {viewMode === 'document' && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(70, z - 15))}
                  title="Zoom Out"
                  className="p-1 hover:text-slate-950 dark:hover:text-white cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] px-1 font-semibold">{zoom}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(140, z + 15))}
                  title="Zoom In"
                  className="p-1 hover:text-slate-950 dark:hover:text-white cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  title="Reset Zoom"
                  className="p-1 hover:text-slate-950 dark:hover:text-white cursor-pointer ml-1"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleOpenInNewTab}>
              <ExternalLink className="w-4 h-4" />
              Open in Tab
            </Button>
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
      {viewMode === 'raw_pdf' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-md text-xs text-blue-800 dark:text-blue-300">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Vector-rendered binary PDF generated by backend PDFKit engine.</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode('document')}
                className="font-medium underline cursor-pointer hover:text-blue-950 dark:hover:text-blue-100"
              >
                Switch to Document View
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="font-medium underline cursor-pointer hover:text-blue-950 dark:hover:text-blue-100 flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open Full-Screen
              </button>
            </div>
          </div>
          <iframe
            src={`${directPdfUrl}#toolbar=1&navpanes=0`}
            title={title}
            className="w-full h-[700px] rounded-md border border-slate-300 dark:border-slate-700 bg-white shadow-inner"
          />
        </div>
      ) : (
        /* Executive PDF Document View: A4 sheet rendered in viewer desk canvas */
        <div className="bg-slate-800/90 dark:bg-slate-950 p-4 sm:p-8 flex justify-center overflow-auto rounded-md min-h-[700px]">
          <div
            ref={docRef}
            id="printable-document"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
            className="w-full max-w-[800px] min-h-[1050px] bg-white text-slate-900 shadow-2xl rounded-sm p-8 sm:p-12 relative flex flex-col justify-between border border-slate-300 font-sans transition-transform duration-150 shrink-0"
          >
            {/* Top Corporate Branding & Title Header */}
            <div>
              <div className="flex flex-col sm:flex-row justify-between gap-4 border-b-2 border-slate-800 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-teal-700 text-white flex items-center justify-center font-bold text-base shadow-xs">
                      C
                    </div>
                    <div>
                      <div className="text-xl font-black tracking-tight text-slate-950 font-display">
                        {company.companyName}
                      </div>
                      <div className="text-[11px] font-semibold text-teal-800 tracking-wide uppercase">
                        Cryogenic Engineering & Precision Fluid Systems
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 mt-2 max-w-md leading-relaxed">{company.address}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    GSTIN: <span className="font-mono font-semibold text-slate-900">{company.gstin}</span> · {company.phone} · {company.email}
                  </div>
                </div>

                <div className="sm:text-right shrink-0">
                  <div className={`inline-block px-3.5 py-1.5 rounded text-xs font-black tracking-wider uppercase ${bannerTheme.bg} ${bannerTheme.text}`}>
                    {payload.kind === 'quotation'
                      ? `Commercial Quotation (V${(payload.doc as Quotation).version || 1})`
                      : payload.kind === 'pi'
                        ? 'Proforma Invoice'
                        : payload.kind === 'so'
                          ? 'Sales Order Confirmation'
                          : payload.kind === 'spo'
                            ? 'Purchase Order'
                            : payload.kind === 'production_order'
                              ? 'Production Manufacturing Order'
                              : payload.kind === 'delivery_challan'
                                ? 'Delivery Challan'
                                : 'Delivery Order'}
                  </div>
                  <div className="font-mono text-base font-bold text-slate-950 mt-2">
                    {docNo}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    Date:{' '}
                    <span className="font-medium text-slate-900">
                      {payload.kind === 'quotation'
                        ? payload.doc.quotationDate
                        : payload.kind === 'pi'
                          ? payload.doc.piDate
                          : payload.kind === 'so'
                            ? payload.doc.createdAt ? new Date(payload.doc.createdAt).toISOString().slice(0, 10) : ''
                            : payload.kind === 'spo'
                              ? payload.doc.poDate
                              : payload.kind === 'production_order'
                                ? payload.doc.createdAt ? new Date(payload.doc.createdAt).toISOString().slice(0, 10) : ''
                                : payload.doc.actualDispatchDate || payload.doc.plannedDispatchDate}
                    </span>
                  </div>
                  {payload.kind === 'quotation' && (
                    <div className="text-xs text-slate-600">Valid Until: <span className="font-medium">{payload.doc.validityDate}</span></div>
                  )}
                  {payload.kind === 'pi' && (
                    <div className="text-xs text-slate-600">Ref Quotation: <span className="font-medium">{payload.doc.quotationDocNo}</span></div>
                  )}
                  {payload.kind === 'so' && (
                    <div className="text-xs text-slate-600">Customer PO: <span className="font-medium">{payload.doc.customerPoNumber}</span></div>
                  )}
                  {payload.kind === 'spo' && (
                    <div className="text-xs text-slate-600">Expected Delivery: <span className="font-medium">{payload.doc.expectedDeliveryDate}</span></div>
                  )}
                  {payload.kind === 'production_order' && (
                    <div className="text-xs text-slate-600">Sales Order Ref: <span className="font-medium">{payload.doc.salesOrderDocNo}</span></div>
                  )}
                  {isLogistics && (
                    <>
                      <div className="text-xs text-slate-600">Sales Order: <span className="font-medium">{payload.doc.salesOrderDocNo}</span></div>
                      <div className="text-xs text-slate-600">Production Order: <span className="font-medium">{payload.doc.productionOrderDocNo}</span></div>
                    </>
                  )}
                </div>
              </div>

              {/* Counterparty / Consignee / Logistics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded border border-slate-200 mt-5 text-xs">
                {isLogistics ? (
                  <>
                    <div>
                      <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Consignee / Deliver To</div>
                      <div className="font-bold text-slate-950 text-sm mt-0.5">{payload.doc.customerName}</div>
                      <div className="text-slate-700 mt-1 leading-relaxed">{payload.doc.deliveryAddress}</div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Transport & Dispatch Details</div>
                      <div className="text-slate-800 mt-0.5 font-semibold">Method: {payload.doc.transportMethod}</div>
                      {payload.doc.transportMethod === 'Own Vehicle' ? (
                        <div className="text-slate-600 mt-0.5">
                          Vehicle: <span className="font-mono font-bold">{payload.doc.vehicleNumber}</span> · Driver: {payload.doc.driverName} ({payload.doc.driverPhone})
                        </div>
                      ) : (
                        <div className="text-slate-600 mt-0.5">
                          Carrier: <span className="font-medium">{payload.doc.courierCompany}</span> · AWB: <span className="font-mono font-bold">{payload.doc.trackingNumber || 'Pending'}</span>
                        </div>
                      )}
                      <div className="text-slate-600 mt-1">
                        Expected Delivery: <span className="font-medium">{payload.doc.expectedDeliveryDate}</span>
                      </div>
                    </div>
                  </>
                ) : isProduction ? (
                  <>
                    <div>
                      <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Customer & Destination</div>
                      <div className="font-bold text-slate-950 text-sm mt-0.5">{payload.doc.customerName}</div>
                      <div className="text-slate-600 mt-1">Sales Order: {payload.doc.salesOrderDocNo}</div>
                      <div className="text-slate-600 mt-0.5">Priority: <span className="font-semibold text-teal-800">{payload.doc.priority}</span></div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Manufacturing Schedule</div>
                      <div className="text-slate-800 mt-0.5 font-semibold">In-Charge: {payload.doc.productionInCharge}</div>
                      <div className="text-slate-600 mt-0.5">Planned Start: {payload.doc.plannedStartDate}</div>
                      <div className="text-slate-600 mt-0.5">Planned End: {payload.doc.plannedEndDate} ({payload.doc.plannedDurationDays} days)</div>
                    </div>
                  </>
                ) : payload.kind !== 'spo' ? (
                  <>
                    <div>
                      <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Bill To (Customer)</div>
                      <div className="font-bold text-slate-950 text-sm mt-0.5">{payload.doc.customerSnapshot.name}</div>
                      <div className="text-slate-600 mt-0.5">Attn: {payload.doc.customerSnapshot.contactPerson}</div>
                      <div className="text-slate-700 leading-relaxed mt-0.5">{payload.doc.customerSnapshot.billingAddress}</div>
                      <div className="text-slate-700 mt-1">
                        GSTIN: <span className="font-mono font-bold text-slate-900">{payload.doc.customerSnapshot.gstin || 'N/A'}</span>
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Ship To / Delivery Site</div>
                      <div className="text-slate-700 leading-relaxed mt-0.5">{payload.doc.customerSnapshot.shippingAddress}</div>
                      <div className="text-slate-600 mt-1">
                        Contact: {payload.doc.customerSnapshot.phone} · {payload.doc.customerSnapshot.email}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Supplier / Vendor</div>
                      <div className="font-bold text-slate-950 text-sm mt-0.5">{payload.doc.supplierName}</div>
                      <div className="text-slate-600 mt-1">Purchase Type: {payload.doc.purchaseType}</div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Purchase Reference</div>
                      <div className="text-slate-700 mt-0.5">
                        Material Request: {payload.doc.materialRequestDocNo || 'Regular Stock Replenishment'}
                      </div>
                      <div className="text-slate-600 mt-1">Status: <span className="font-semibold">{payload.doc.status}</span></div>
                    </div>
                  </>
                )}
              </div>

              {/* Items Table */}
              <div className="mt-5 overflow-hidden border border-slate-300 rounded">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                      <th className="px-3 py-2.5 text-left w-10">#</th>
                      <th className="px-3 py-2.5 text-left">Description & Technical Specifications</th>
                      <th className="px-3 py-2.5 text-right w-20">Qty</th>
                      {!isLogistics && !isProduction && (
                        <>
                          <th className="px-3 py-2.5 text-right w-28">Unit Price</th>
                          <th className="px-3 py-2.5 text-right w-32">Line Total</th>
                        </>
                      )}
                      {isLogistics && (
                        <th className="px-3 py-2.5 text-left w-48">Serial / Identification Nos</th>
                      )}
                      {isProduction && (
                        <th className="px-3 py-2.5 text-left w-48">Model & Status</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {isLogistics ? (
                      <tr>
                        <td className="px-3 py-2.5 align-top font-mono font-semibold">1</td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="font-bold text-slate-950">{payload.doc.productName}</div>
                          <div className="text-slate-500 mt-0.5">Cryogenic Fluid Equipment · Industrial Standard</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono align-top font-bold text-slate-900">
                          {payload.doc.quantity} Nos
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700 align-top">
                          {payload.doc.serialNumbers?.length ? payload.doc.serialNumbers.join(', ') : 'Factory Batch Assorted'}
                        </td>
                      </tr>
                    ) : isProduction ? (
                      <tr>
                        <td className="px-3 py-2.5 align-top font-mono font-semibold">1</td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="font-bold text-slate-950">{payload.doc.productName}</div>
                          <div className="text-slate-500 mt-0.5">Model: {payload.doc.model || 'Standard Industrial Unit'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono align-top font-bold text-slate-900">
                          {payload.doc.quantity} Units
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700 align-top">
                          Status: {payload.doc.status}
                        </td>
                      </tr>
                    ) : payload.kind !== 'spo' ? (
                      payload.doc.items.map((item, idx) => (
                        <tr key={item.id} className="even:bg-slate-50/70">
                          <td className="px-3 py-2.5 align-top font-mono font-semibold">{idx + 1}</td>
                          <td className="px-3 py-2.5 align-top">
                            <div className="font-bold text-slate-950">
                              {item.productName} {item.model ? `(${item.model})` : ''}
                            </div>
                            {item.specifications && (
                              <div className="text-slate-600 mt-0.5 leading-relaxed">{item.specifications}</div>
                            )}
                            {item.highlights && item.highlights.length > 0 && (
                              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-slate-700">
                                {item.highlights.map((h, i) => (
                                  <li key={i}>{h}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono align-top font-medium">{item.quantity}</td>
                          <td className="px-3 py-2.5 text-right font-mono align-top">
                            {formatCurrency(item.unitPrice, company.currencySymbol)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold align-top text-slate-950">
                            {formatCurrency(item.lineTotal || item.quantity * item.unitPrice, company.currencySymbol)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      payload.doc.items.map((item, idx) => (
                        <tr key={item.materialId} className="even:bg-slate-50/70">
                          <td className="px-3 py-2.5 font-mono font-semibold">{idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-slate-950">{item.materialName}</div>
                            <div className="text-slate-500 font-mono text-[11px]">{item.materialCode}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium">
                            {item.orderedQty} {item.unit}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {formatCurrency(item.unitPrice, company.currencySymbol)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-950">
                            {formatCurrency(item.lineTotal || item.orderedQty * item.unitPrice, company.currencySymbol)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals Card */}
              {!isLogistics && !isProduction ? (
                <div className="flex justify-end mt-4">
                  <div className="w-full sm:w-80 bg-slate-50 rounded border border-slate-200 p-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-medium">Subtotal</span>
                      <span className="font-mono font-semibold">{formatCurrency(payload.doc.subtotal, company.currencySymbol)}</span>
                    </div>
                    {payload.kind === 'quotation' && (payload.doc.discountAmount || 0) > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span className="font-medium">Discount ({payload.doc.discountPercent}%)</span>
                        <span className="font-mono font-semibold">-{formatCurrency(payload.doc.discountAmount, company.currencySymbol)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-medium">GST ({'taxPercent' in payload.doc ? (payload.doc as any).taxPercent || 18 : 18}%)</span>
                      <span className="font-mono font-semibold">{formatCurrency(payload.doc.taxAmount, company.currencySymbol)}</span>
                    </div>
                    <div className="flex justify-between font-black text-sm border-t-2 border-slate-800 pt-2 text-slate-950 bg-teal-50 -mx-3 -mb-3 p-3 rounded-b">
                      <span>Grand Total</span>
                      <span className="font-mono">{formatCurrency(payload.doc.totalAmount, company.currencySymbol)}</span>
                    </div>
                  </div>
                </div>
              ) : isLogistics ? (
                <div className="bg-slate-50 p-4 rounded border border-slate-200 text-xs space-y-1.5 mt-4">
                  <div className="font-bold text-slate-900 uppercase tracking-wide text-[10px]">Dispatch & Handling Notes</div>
                  <div className="text-slate-700 leading-relaxed">
                    {payload.doc.remarks || payload.doc.dispatchRemarks || 'Deliver in upright orientation with moisture-proof packaging. Handle with care. Verify physical seal.'}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Bottom Commercial Terms & Signatures */}
            <div className="mt-8 pt-4 border-t border-slate-200 text-xs space-y-6">
              {/* Bank details & Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 text-slate-700">
                  <div className="font-bold text-slate-950 uppercase tracking-wider text-[10px]">Commercial Terms</div>
                  {payload.kind !== 'spo' && !isLogistics && !isProduction && (
                    <>
                      <div>
                        <span className="text-slate-500 font-medium">Payment Terms:</span> {payload.doc.paymentTerms || company.defaultPaymentTerms}
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Delivery Terms:</span> {payload.doc.deliveryTerms || company.defaultDeliveryTerms}
                      </div>
                    </>
                  )}
                  {payload.kind === 'quotation' && (
                    <div>
                      <span className="text-slate-500 font-medium">Warranty:</span> {payload.doc.warranty || company.defaultWarranty}
                    </div>
                  )}
                  {'remarks' in payload.doc && Boolean((payload.doc as any).remarks) && (
                    <div>
                      <span className="text-slate-500 font-medium">Remarks:</span> {(payload.doc as any).remarks}
                    </div>
                  )}
                </div>

                {/* Bank Remittance Details */}
                <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900 uppercase tracking-wider text-[10px]">Company Remittance Bank Details</div>
                  <div className="text-[11px] text-slate-700">Bank: <span className="font-semibold">{company.bankName}</span></div>
                  <div className="text-[11px] text-slate-700">A/C Name: <span className="font-semibold">{company.bankAccountName || company.companyName}</span></div>
                  <div className="text-[11px] text-slate-700">
                    A/C No: <span className="font-mono font-bold text-slate-900">{company.bankAccountNumber}</span> · IFSC: <span className="font-mono font-bold text-slate-900">{company.bankIfsc}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 italic pt-0.5">
                    Branch: {company.bankBranch}
                  </div>
                </div>
              </div>

              {/* Signatures */}
              {isLogistics ? (
                <div className="grid grid-cols-2 gap-8 pt-4">
                  <div className="space-y-4">
                    <div className="font-bold text-slate-900 text-xs">Dispatched By (CRYO Logistics)</div>
                    <div className="pt-8 border-t border-slate-400">
                      <div className="font-bold text-slate-950">{payload.doc.createdBy}</div>
                      <div className="text-[11px] text-slate-500">Authorized Logistics Officer</div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="font-bold text-slate-900 text-xs">Received By (Consignee)</div>
                    <div className="pt-8 border-t border-slate-400">
                      <div className="font-bold text-slate-950">{payload.doc.receivedBy || 'Customer Signature & Stamp'}</div>
                      <div className="text-[11px] text-slate-500">
                        {payload.doc.actualDeliveryDate ? `Delivered on ${payload.doc.actualDeliveryDate}` : 'Date & Time of Delivery'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-end justify-between pt-4 gap-4">
                  <div className="text-[11px] text-slate-400 space-y-0.5">
                    <div>Digitally certified commercial document generated by CRYO Enterprise ERP 2.0.</div>
                    <div className="font-mono text-[10px]">Document Hash ID: {payload.doc.id}</div>
                  </div>

                  <div className="text-center sm:text-right w-56">
                    <div className="font-bold text-slate-900 text-xs">For {company.companyName}</div>
                    <div className="h-10"></div>
                    <div className="pt-1 border-t border-slate-400">
                      <div className="font-bold text-slate-950 text-xs">Authorized Signatory</div>
                      <div className="text-[10px] text-slate-500">Peenya Works, Bengaluru</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {(payload.kind === 'quotation' || payload.kind === 'pi') && (
              <div className="mt-6 pt-3 border-t border-slate-100">
                <DeveloperCredit className="text-[11px]" />
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
