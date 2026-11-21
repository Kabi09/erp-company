import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  CompanySettingsModel,
  QuotationModel,
  ProformaInvoiceModel,
  SalesOrderModel,
  PaymentEntryModel,
  SupplierPOModel,
  GRNModel,
  MaterialIssueModel,
  SupplierReturnModel,
  ProductionOrderModel,
  BOMModel,
  QualityCheckModel,
  DeliveryOrderModel,
} from '../models';
import { pdfService, type PDFDocData } from '../services/pdf.service';
import { sendError } from '../utils/routeUtils';

export const documentRouter = Router();

const toIsoDate = (val: any) => {
  try {
    return val ? new Date(val).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10);
  } catch {
    return new Date().toISOString().substring(0, 10);
  }
};

// GET /api/documents/:type/:id/pdf - Generate actual binary PDF document
documentRouter.get('/documents/:type/:id/pdf', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const type = String(req.params.type || '');
    const id = String(req.params.id || '');
    const user = req.user!;
    const isSuperAdmin = user.department === 'admin';

    // Module RBAC Check
    const checkPerm = (module: string) => {
      if (isSuperAdmin) return true;
      const perms = (user.permissions as any)?.[module] || [];
      return perms.includes('view') || user.department === module;
    };

    const company = (await CompanySettingsModel.findOne({ id: 'company' }).lean()) || {
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

    let docData: PDFDocData | null = null;

    switch (type.toLowerCase()) {
      // 1. COMMERCIAL QUOTATION
      case 'quotation': {
        if (!checkPerm('sales')) throw new Error('FORBIDDEN: You do not have permission to generate Sales documents.');
        const rawQ = await QuotationModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawQ) throw new Error(`NOT_FOUND: Quotation '${id}' not found.`);
        const q = rawQ as any;

        docData = {
          title: `Commercial Quotation (V${q.version})`,
          docNo: q.docNo,
          date: q.quotationDate,
          status: q.status,
          referenceNo: q.enquiryDocNo,
          partyType: 'Customer',
          partyName: q.customerSnapshot.name,
          partyAddress: q.customerSnapshot.shippingAddress || q.customerSnapshot.billingAddress,
          partyGstin: q.customerSnapshot.gstin,
          items: (q.items || []).map((i: any) => ({
            name: i.productName,
            description: i.specifications || i.model || '',
            quantity: i.quantity,
            rate: i.unitPrice,
            amount: i.lineTotal || (i.quantity * i.unitPrice),
          })),
          subtotal: q.subtotal,
          taxPercent: q.taxPercent,
          taxAmount: q.taxAmount,
          grandTotal: q.totalAmount,
          bankDetails: true,
          terms: q.termsAndConditions || [company.defaultPaymentTerms, company.defaultDeliveryTerms, company.defaultWarranty],
        };
        break;
      }

      // 2. PROFORMA INVOICE
      case 'pi':
      case 'proforma-invoice': {
        if (!checkPerm('sales')) throw new Error('FORBIDDEN: You do not have permission to generate Sales documents.');
        const rawPi = await ProformaInvoiceModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawPi) throw new Error(`NOT_FOUND: Proforma Invoice '${id}' not found.`);
        const pi = rawPi as any;

        docData = {
          title: 'Proforma Invoice',
          docNo: pi.docNo,
          date: pi.piDate,
          status: pi.status,
          referenceNo: pi.quotationDocNo,
          partyType: 'Customer',
          partyName: pi.customerSnapshot.name,
          partyAddress: pi.customerSnapshot.billingAddress,
          partyGstin: pi.customerSnapshot.gstin,
          items: (pi.items || []).map((i: any) => ({
            name: i.productName,
            description: i.specifications || i.model || '',
            quantity: i.quantity,
            rate: i.unitPrice,
            amount: i.lineTotal || (i.quantity * i.unitPrice),
          })),
          subtotal: pi.subtotal,
          taxPercent: pi.taxPercent,
          taxAmount: pi.taxAmount,
          grandTotal: pi.totalAmount,
          bankDetails: true,
          terms: [company.defaultPaymentTerms, company.defaultDeliveryTerms, company.defaultWarranty],
        };
        break;
      }

      // 3. SALES ORDER SUMMARY
      case 'sales-order':
      case 'so': {
        if (!checkPerm('sales')) throw new Error('FORBIDDEN: You do not have permission to generate Sales documents.');
        const rawSO = await SalesOrderModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawSO) throw new Error(`NOT_FOUND: Sales Order '${id}' not found.`);
        const so = rawSO as any;

        docData = {
          title: 'Sales Order Confirmation',
          docNo: so.docNo,
          date: so.createdAt ? new Date(so.createdAt).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
          status: so.fulfillmentStatus,
          referenceNo: `PI: ${so.piDocNo} | PO: ${so.customerPoNumber}`,
          partyType: 'Customer',
          partyName: so.customerSnapshot.name,
          partyAddress: so.deliveryAddress,
          partyGstin: so.customerSnapshot.gstin,
          items: (so.items || []).map((i: any) => ({
            name: `${i.productName} (${i.model || ''})`,
            quantity: i.quantity,
            rate: i.unitPrice,
            amount: i.lineTotal || (i.quantity * i.unitPrice),
          })),
          subtotal: so.subtotal,
          taxPercent: 18,
          taxAmount: so.taxAmount,
          grandTotal: so.totalAmount,
          notes: `Promised Delivery Date: ${so.promisedDeliveryDate} | Priority: ${so.priority}`,
          bankDetails: false,
        };
        break;
      }

      // 4. PAYMENT RECEIPT
      case 'payment-receipt':
      case 'payment': {
        if (!checkPerm('sales')) throw new Error('FORBIDDEN: You do not have permission to generate Payment documents.');
        const rawPay = await PaymentEntryModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawPay) throw new Error(`NOT_FOUND: Payment Entry '${id}' not found.`);
        const pay = rawPay as any;

        docData = {
          title: 'Payment Receipt Voucher',
          docNo: pay.docNo,
          date: pay.paymentDate,
          status: pay.verificationStatus || pay.status || 'Verified',
          referenceNo: pay.salesOrderDocNo || pay.piDocNo,
          partyType: 'Customer',
          partyName: pay.customerName,
          items: [
            {
              name: `Commercial Payment Remittance (${pay.method || 'Bank Transfer'})`,
              description: `Transaction Ref: ${pay.transactionRef || 'N/A'}`,
              quantity: 1,
              rate: pay.amount,
              amount: pay.amount,
            },
          ],
          grandTotal: pay.amount,
          notes: `Verified by: ${pay.verifiedBy || 'Finance Dept'} | Payment Type: ${pay.paymentType || 'Commercial'}`,
          bankDetails: true,
        };
        break;
      }

      // 5. SUPPLIER PURCHASE ORDER
      case 'supplier-po':
      case 'purchase-order':
      case 'po':
      case 'spo': {
        if (!checkPerm('supply_chain')) throw new Error('FORBIDDEN: You do not have permission to generate Supply Chain documents.');
        const rawSpo = await SupplierPOModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawSpo) throw new Error(`NOT_FOUND: Supplier PO '${id}' not found.`);
        const spo = rawSpo as any;

        docData = {
          title: 'Supplier Purchase Order',
          docNo: spo.docNo,
          date: spo.poDate,
          status: spo.status,
          referenceNo: spo.materialRequestDocNo || 'Stock Replenishment',
          partyType: 'Supplier',
          partyName: spo.supplierName,
          items: (spo.items || []).map((i: any) => ({
            name: `${i.materialCode} - ${i.materialName}`,
            quantity: i.orderedQty || i.orderedQuantity || 0,
            rate: i.unitPrice,
            amount: i.lineTotal || ((i.orderedQty || i.orderedQuantity || 0) * i.unitPrice),
          })),
          subtotal: spo.subtotal,
          taxPercent: spo.taxPercent || 18,
          taxAmount: spo.taxAmount,
          grandTotal: spo.totalAmount,
          terms: [company.defaultPaymentTerms, company.defaultDeliveryTerms],
        };
        break;
      }

      // 6. GOODS RECEIPT NOTE (GRN)
      case 'grn': {
        if (!checkPerm('supply_chain')) throw new Error('FORBIDDEN: You do not have permission to generate Supply Chain documents.');
        const rawGrn = await GRNModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawGrn) throw new Error(`NOT_FOUND: GRN '${id}' not found.`);
        const grn = rawGrn as any;

        docData = {
          title: 'Goods Receipt Note (GRN)',
          docNo: grn.docNo,
          date: grn.receivedDate,
          status: grn.verificationStatus,
          referenceNo: `PO: ${grn.supplierPoDocNo || ''} | Challan: ${grn.challanNumber || grn.deliveryChallanNo || ''}`,
          partyType: 'Supplier',
          partyName: grn.supplierName,
          items: (grn.items || []).map((i: any) => ({
            name: `${i.materialCode} - ${i.materialName}`,
            description: `Accepted: ${i.acceptedQty ?? i.acceptedQuantity} | Rejected: ${i.rejectedQty ?? i.rejectedQuantity} ${i.rejectionReason ? `(${i.rejectionReason})` : ''}`,
            quantity: i.receivedQty ?? i.receivedQuantity,
            unit: i.unit,
          })),
          notes: `Verified By: ${grn.verifiedBy || 'Pending Inspection'}`,
        };
        break;
      }

      // 7. MATERIAL ISSUE VOUCHER
      case 'material-issue':
      case 'issue-voucher': {
        if (!checkPerm('supply_chain') && !checkPerm('production')) {
          throw new Error('FORBIDDEN: You do not have permission to generate Material Issue documents.');
        }
        const rawMi = await MaterialIssueModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawMi) throw new Error(`NOT_FOUND: Material Issue Voucher '${id}' not found.`);
        const mi = rawMi as any;

        docData = {
          title: 'Material Issue Voucher',
          docNo: mi.docNo,
          date: mi.issueDate,
          status: mi.receiptAcknowledged ? 'Acknowledged' : 'Pending Receipt',
          referenceNo: `MR: ${mi.materialRequestDocNo} | PO: ${mi.productionOrderDocNo}`,
          partyType: 'Internal',
          partyName: `Shop Floor (Production Dept)`,
          items: (mi.items || []).map((i: any) => ({
            name: `${i.materialCode} - ${i.materialName}`,
            quantity: i.issuedQty || i.issuedQuantity || 0,
            unit: i.unit,
          })),
          notes: `Issued by Store In-Charge: ${mi.issuedBy} | Acknowledgement: ${mi.acknowledgedAt ? `Received on ${toIsoDate(mi.acknowledgedAt)} by ${mi.acknowledgedBy}` : 'Pending Physical Receipt'}`,
        };
        break;
      }

      // 8. SUPPLIER RETURN VOUCHER
      case 'supplier-return': {
        if (!checkPerm('supply_chain')) throw new Error('FORBIDDEN: You do not have permission to generate Supply Chain documents.');
        const rawRet = await SupplierReturnModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawRet) throw new Error(`NOT_FOUND: Supplier Return '${id}' not found.`);
        const ret = rawRet as any;

        docData = {
          title: 'Supplier Return Note',
          docNo: ret.docNo,
          date: ret.returnDate,
          status: ret.replacementStatus || 'Processed',
          referenceNo: `GRN: ${ret.grnDocNo} | PO: ${ret.supplierPoDocNo}`,
          partyType: 'Supplier',
          partyName: ret.supplierName,
          items: [
            {
              name: `${ret.materialCode} - ${ret.materialName}`,
              description: `Reason: ${ret.rejectionReason || ret.reason || 'Material defect'}`,
              quantity: ret.returnQty || ret.returnQuantity || 0,
              unit: ret.unit,
            },
          ],
          notes: `Return authorized by: ${ret.createdBy}`,
        };
        break;
      }

      // 9. PRODUCTION ORDER
      case 'production-order':
      case 'production': {
        if (!checkPerm('production')) throw new Error('FORBIDDEN: You do not have permission to generate Production documents.');
        const rawPo = await ProductionOrderModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawPo) throw new Error(`NOT_FOUND: Production Order '${id}' not found.`);
        const po = rawPo as any;

        docData = {
          title: 'Production Manufacturing Order',
          docNo: po.docNo,
          date: toIsoDate(po.createdAt),
          status: po.status,
          referenceNo: `Sales Order: ${po.salesOrderDocNo}`,
          partyType: 'Customer',
          partyName: po.customerName,
          items: [
            {
              name: `${po.productName} (${po.model || ''})`,
              description: `Priority: ${po.priority} | Planned Start: ${po.plannedStartDate} | Planned End: ${po.plannedEndDate}`,
              quantity: po.quantity,
              unit: 'Units',
            },
          ],
          notes: `Production In-Charge: ${po.productionInCharge} | Duration: ${po.plannedDurationDays} days`,
        };
        break;
      }

      // 10. BILL OF MATERIALS (BOM)
      case 'bom': {
        if (!checkPerm('production')) throw new Error('FORBIDDEN: You do not have permission to generate Production documents.');
        const rawBom = await BOMModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawBom) throw new Error(`NOT_FOUND: BOM '${id}' not found.`);
        const bom = rawBom as any;

        docData = {
          title: 'Bill of Materials Specification',
          docNo: bom.docNo,
          date: toIsoDate(bom.createdAt),
          status: bom.requestSent ? 'MR Sent' : 'Draft',
          referenceNo: `PO: ${bom.productionOrderDocNo}`,
          partyType: 'Internal',
          partyName: `Manufacturing Unit: ${bom.productName}`,
          items: (bom.items || []).map((i: any) => ({
            name: `${i.materialCode} - ${i.materialName}`,
            description: `Qty Per Unit: ${i.qtyPerUnit}`,
            quantity: i.totalRequiredQty || i.totalRequiredQuantity || 0,
            unit: i.unit,
          })),
          notes: `Prepared by: ${bom.createdBy}`,
        };
        break;
      }

      // 11. QUALITY CHECK REPORT
      case 'quality-check':
      case 'qc': {
        if (!checkPerm('production')) throw new Error('FORBIDDEN: You do not have permission to generate QC documents.');
        const rawQc = await QualityCheckModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawQc) throw new Error(`NOT_FOUND: Quality Check '${id}' not found.`);
        const qc = rawQc as any;

        docData = {
          title: 'Quality Inspection Report',
          docNo: qc.docNo,
          date: qc.inspectionDate || toIsoDate(qc.createdAt),
          status: qc.finalResult,
          referenceNo: `Production Order: ${qc.productionOrderDocNo}`,
          partyType: 'Internal',
          partyName: `Equipment: ${qc.productName}`,
          items: [
            {
              name: `Inspection Batch (Total: ${qc.inspectedQty} units)`,
              description: `Accepted: ${qc.acceptedQty} units | Rejected: ${qc.rejectedQty} units | Serials: ${(qc.serialNumbers || []).join(', ')}`,
              quantity: qc.inspectedQty,
              unit: 'Units',
            },
          ],
          qcDetails: {
            visualCheck: (qc.checks || []).find((c: any) => c.parameter?.toLowerCase().includes('visual'))?.status || 'Pass',
            electricalCheck: (qc.checks || []).find((c: any) => c.parameter?.toLowerCase().includes('electrical'))?.status || 'Pass',
            thermalCheck: (qc.checks || []).find((c: any) => c.parameter?.toLowerCase().includes('thermal'))?.status || 'Pass',
            calibrationCheck: (qc.checks || []).find((c: any) => c.parameter?.toLowerCase().includes('pressure') || c.parameter?.toLowerCase().includes('calibration'))?.status || 'Pass',
            finalResult: qc.finalResult,
            inspectedBy: qc.inspector,
          },
          notes: qc.rejectionReason || qc.remarks || `QC Result: ${qc.finalResult}`,
        };
        break;
      }

      // 12. DELIVERY ORDER & CHALLAN
      case 'delivery-order':
      case 'delivery': {
        if (!checkPerm('logistics')) throw new Error('FORBIDDEN: You do not have permission to generate Logistics documents.');
        const rawDel = await DeliveryOrderModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawDel) throw new Error(`NOT_FOUND: Delivery Order '${id}' not found.`);
        const del = rawDel as any;

        docData = {
          title: 'Logistics Delivery Order',
          docNo: del.docNo,
          date: del.actualDispatchDate || del.plannedDispatchDate || toIsoDate(del.createdAt),
          status: del.status,
          referenceNo: `SO: ${del.salesOrderDocNo} | PO: ${del.productionOrderDocNo}`,
          partyType: 'Consignee',
          partyName: del.customerName,
          partyAddress: del.deliveryAddress,
          items: [
            {
              name: del.productName,
              description: del.serialNumbers?.length ? `Serials: ${del.serialNumbers.join(', ')}` : '',
              quantity: del.quantity,
              unit: 'Units',
            },
          ],
          transportDetails: {
            method: del.transportMethod,
            vehicleNo: del.vehicleNumber,
            driverName: del.driverName,
            driverPhone: del.driverPhone,
            courierName: del.courierCompany,
            trackingNo: del.trackingNumber,
          },
          notes: `Receiver: ${del.receivedBy || 'Pending Handover'} | Delivered Qty: ${del.deliveredQty || 0} of ${del.quantity}`,
        };
        break;
      }

      case 'delivery-challan':
      case 'challan': {
        if (!checkPerm('logistics')) throw new Error('FORBIDDEN: You do not have permission to generate Logistics documents.');
        const rawDel = await DeliveryOrderModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
        if (!rawDel) throw new Error(`NOT_FOUND: Delivery Challan for '${id}' not found.`);
        const del = rawDel as any;

        docData = {
          title: 'Delivery Challan',
          docNo: del.deliveryChallanNo || `CHAL-${del.docNo.replace(/\D/g, '')}`,
          date: del.actualDispatchDate || del.plannedDispatchDate || toIsoDate(del.createdAt),
          status: del.status,
          referenceNo: `Delivery Order: ${del.docNo}`,
          partyType: 'Consignee',
          partyName: del.customerName,
          partyAddress: del.deliveryAddress,
          items: [
            {
              name: del.productName,
              description: del.serialNumbers?.length ? `Serial Nos: ${del.serialNumbers.join(', ')}` : '',
              quantity: del.quantity,
              unit: 'Units',
            },
          ],
          transportDetails: {
            method: del.transportMethod,
            vehicleNo: del.vehicleNumber,
            driverName: del.driverName,
            driverPhone: del.driverPhone,
            courierName: del.courierCompany,
            trackingNo: del.trackingNumber,
          },
          terms: [
            'Goods once dispatched are under transit insurance as per standard CRYO policy.',
            'Please verify seal and package integrity before signing receipt acknowledgement.',
          ],
        };
        break;
      }

      default:
        throw new Error(`BAD_REQUEST: Unsupported document type '${type}'. Supported types: quotation, pi, sales-order, payment-receipt, supplier-po, grn, material-issue, supplier-return, production-order, bom, quality-check, delivery-order, delivery-challan.`);
    }

    // Generate valid binary PDF
    const pdfBuffer = await pdfService.generatePDF(docData, company as any);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${docData.docNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    sendError(res, err);
  }
});
