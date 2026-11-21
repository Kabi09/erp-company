import React, { useRef } from 'react';
import { Download, Printer } from 'lucide-react';
import type { CompanySettings, DeliveryOrder, ProformaInvoice, Quotation, SupplierPO } from '../types/erp';
import { formatCurrency } from '../utils/erpLogic';
import { Button, Modal } from './ui';

export type DocUnion =
  | { kind: 'quotation'; doc: Quotation }
  | { kind: 'pi'; doc: ProformaInvoice }
  | { kind: 'spo'; doc: SupplierPO }
  | { kind: 'delivery_order'; doc: DeliveryOrder }
  | { kind: 'delivery_challan'; doc: DeliveryOrder };

export const DocumentPreviewModal: React.FC<{
  open: boolean;
  onClose: () => void;
  company: CompanySettings;
  payload: DocUnion | null;
}> = ({ open, onClose, company, payload }) => {
  const docRef = useRef<HTMLDivElement>(null);

  if (!open || !payload) return null;

  const isLogistics = payload.kind === 'delivery_order' || payload.kind === 'delivery_challan';

  const title =
    payload.kind === 'quotation'
      ? `Commercial Quotation — ${payload.doc.docNo}`
      : payload.kind === 'pi'
        ? `Proforma Invoice — ${payload.doc.docNo}`
        : payload.kind === 'spo'
          ? `Supplier Purchase Order — ${payload.doc.docNo}`
          : payload.kind === 'delivery_challan'
            ? `Delivery Challan — ${payload.doc.deliveryChallanNo || payload.doc.docNo}`
            : `Delivery Order — ${payload.doc.docNo}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    const html = docRef.current?.innerHTML || '';
    const fullDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;color:#0f172a;padding:32px;max-width:860px;margin:0 auto;}table{width:100%;border-collapse:collapse;margin:16px 0;}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;font-size:13px;}th{background:#f8fafc;}</style></head><body>${html}</body></html>`;
    const blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const downloadName = isLogistics
      ? (payload.kind === 'delivery_challan' ? payload.doc.deliveryChallanNo || payload.doc.docNo : payload.doc.docNo)
      : payload.doc.docNo;
    a.download = `${downloadName}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Print to PDF or download formatted enterprise document"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleDownloadHtml}>
            <Download className="w-4 h-4" />
            Download Document
          </Button>
          <Button variant="primary" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            Print / Save as PDF
          </Button>
        </>
      }
    >
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
                ? 'QUOTATION'
                : payload.kind === 'pi'
                  ? 'PROFORMA INVOICE'
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
                      {item.highlights.length > 0 && (
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
                      {formatCurrency(item.lineTotal, company.currencySymbol)}
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
                      {formatCurrency(item.lineTotal, company.currencySymbol)}
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
              {payload.kind !== 'spo' && payload.doc.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-mono">-{formatCurrency(payload.doc.discountAmount, company.currencySymbol)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">GST ({payload.doc.taxPercent}%)</span>
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
    </Modal>
  );
};
