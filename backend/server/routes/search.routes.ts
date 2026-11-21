import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  EnquiryModel,
  CustomerModel,
  QuotationModel,
  ProformaInvoiceModel,
  CustomerPOModel,
  SalesOrderModel,
  ProductionOrderModel,
  BOMModel,
  MaterialRequestModel,
  MaterialModel,
  SupplierPOModel,
  GRNModel,
  DeliveryOrderModel,
} from '../models';
import { sendError } from '../utils/routeUtils';

export const searchRouter = Router();

// GET /api/search?q=... - Server-side Global Search respecting RBAC
searchRouter.get('/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const rawQuery = (req.query.q as string || '').trim();
    if (!rawQuery || rawQuery.length < 2) {
      return res.json({ query: rawQuery, results: [], total: 0 });
    }

    const q = new RegExp(rawQuery, 'i');
    const user = req.user!;
    const isSuperAdmin = user.department === 'admin';

    const checkPerm = (mod: string) => {
      if (isSuperAdmin) return true;
      const perms = (user.permissions as any)?.[mod] || [];
      return perms.includes('view') || user.department === mod;
    };

    interface SearchResult {
      id: string;
      docNo: string;
      title: string;
      subtitle: string;
      module: 'Sales' | 'Production' | 'Supply Chain' | 'Logistics';
      path: string;
      date?: string;
    }

    const results: Record<string, SearchResult[]> = {
      Sales: [],
      Production: [],
      'Supply Chain': [],
      Logistics: [],
    };

    const queries: Promise<void>[] = [];

    // --- SALES SEARCH ---
    if (checkPerm('sales')) {
      queries.push(
        (async () => {
          const [enquiries, quotations, pis, pos, sos, customers] = await Promise.all([
            EnquiryModel.find({ $or: [{ docNo: q }, { 'customerSnapshot.name': q }] }).limit(3).lean(),
            QuotationModel.find({ $or: [{ docNo: q }, { 'customerSnapshot.name': q }] }).limit(3).lean(),
            ProformaInvoiceModel.find({ $or: [{ docNo: q }, { 'customerSnapshot.name': q }] }).limit(3).lean(),
            CustomerPOModel.find({ $or: [{ customerPoNumber: q }, { piDocNo: q }, { customerName: q }] }).limit(3).lean(),
            SalesOrderModel.find({ $or: [{ docNo: q }, { 'customerSnapshot.name': q }, { customerPoNumber: q }] }).limit(3).lean(),
            CustomerModel.find({ $or: [{ name: q }, { gstin: q }, { contactPerson: q }] }).limit(3).lean(),
          ]);

          enquiries.forEach((e) => {
            results.Sales.push({
              id: e.id,
              docNo: e.docNo,
              title: e.docNo,
              subtitle: `${e.customerSnapshot?.name || (e as any).customerName || 'Customer'} · ${e.status}`,
              module: 'Sales',
              path: `/sales/enquiries/${e.id}`,
              date: e.createdAt ? new Date(e.createdAt).toISOString().substring(0, 10) : undefined,
            });
          });

          quotations.forEach((qt) => {
            results.Sales.push({
              id: qt.id,
              docNo: qt.docNo,
              title: `${qt.docNo} (V${qt.version})`,
              subtitle: `${qt.customerSnapshot?.name || 'Customer'} · ${qt.status}`,
              module: 'Sales',
              path: `/sales/quotations`,
              date: qt.quotationDate,
            });
          });

          pis.forEach((p) => {
            results.Sales.push({
              id: p.id,
              docNo: p.docNo,
              title: p.docNo,
              subtitle: `${p.customerSnapshot?.name || 'Customer'} · ${p.status}`,
              module: 'Sales',
              path: `/sales/proforma-invoices`,
              date: p.piDate,
            });
          });

          pos.forEach((c) => {
            results.Sales.push({
              id: c.id,
              docNo: c.customerPoNumber,
              title: `Customer PO #${c.customerPoNumber}`,
              subtitle: `${c.customerName || 'Customer'} · Ref: ${c.piDocNo}`,
              module: 'Sales',
              path: `/sales/customer-pos`,
              date: c.receivedDate,
            });
          });

          sos.forEach((s) => {
            results.Sales.push({
              id: s.id,
              docNo: s.docNo,
              title: `Sales Order ${s.docNo}`,
              subtitle: `${s.customerSnapshot?.name || 'Customer'} · Fulfillment: ${s.fulfillmentStatus}`,
              module: 'Sales',
              path: `/tracking/${s.id}`,
              date: s.promisedDeliveryDate,
            });
          });

          customers.forEach((c) => {
            results.Sales.push({
              id: c.id,
              docNo: c.gstin || 'CUST',
              title: c.name,
              subtitle: `${c.billingAddress || ''} · Contact: ${c.contactPerson || c.phone}`,
              module: 'Sales',
              path: `/sales/customers`,
            });
          });
        })(),
      );
    }

    // --- PRODUCTION SEARCH ---
    if (checkPerm('production')) {
      queries.push(
        (async () => {
          const [orders, boms] = await Promise.all([
            ProductionOrderModel.find({ $or: [{ docNo: q }, { productName: q }, { salesOrderDocNo: q }, { customerName: q }] }).limit(4).lean(),
            BOMModel.find({ $or: [{ docNo: q }, { productName: q }, { productionOrderDocNo: q }] }).limit(3).lean(),
          ]);

          orders.forEach((po) => {
            results.Production.push({
              id: po.id,
              docNo: po.docNo,
              title: `${po.docNo} — ${po.productName}`,
              subtitle: `${po.customerName} · Status: ${po.status} (${po.priority})`,
              module: 'Production',
              path: `/production/orders/${po.id}`,
              date: po.plannedStartDate,
            });
          });

          boms.forEach((b) => {
            results.Production.push({
              id: b.id,
              docNo: b.docNo,
              title: `BOM ${b.docNo}`,
              subtitle: `${b.productName} · Ref: ${b.productionOrderDocNo}`,
              module: 'Production',
              path: `/production/bom`,
              date: b.createdAt ? new Date(b.createdAt).toISOString() : undefined,
            });
          });
        })(),
      );
    }

    // --- SUPPLY CHAIN SEARCH ---
    if (checkPerm('supply_chain')) {
      queries.push(
        (async () => {
          const [mrs, spos, grns, mats] = await Promise.all([
            MaterialRequestModel.find({ $or: [{ docNo: q }, { productionOrderDocNo: q }, { salesOrderDocNo: q }] }).limit(3).lean(),
            SupplierPOModel.find({ $or: [{ docNo: q }, { supplierName: q }] }).limit(3).lean(),
            GRNModel.find({ $or: [{ docNo: q }, { supplierName: q }, { deliveryChallanNo: q }] }).limit(3).lean(),
            MaterialModel.find({ $or: [{ code: q }, { name: q }, { category: q }] }).limit(3).lean(),
          ]);

          mrs.forEach((mr) => {
            results['Supply Chain'].push({
              id: mr.id,
              docNo: mr.docNo,
              title: `Material Request ${mr.docNo}`,
              subtitle: `PO: ${mr.productionOrderDocNo} · Issue: ${mr.status}`,
              module: 'Supply Chain',
              path: `/supply-chain/material-requests`,
              date: mr.requestDate,
            });
          });

          spos.forEach((spo) => {
            results['Supply Chain'].push({
              id: spo.id,
              docNo: spo.docNo,
              title: `Supplier PO ${spo.docNo}`,
              subtitle: `${spo.supplierName} · Status: ${spo.status}`,
              module: 'Supply Chain',
              path: `/supply-chain/purchase-orders`,
              date: spo.poDate,
            });
          });

          grns.forEach((grn) => {
            results['Supply Chain'].push({
              id: grn.id,
              docNo: grn.docNo,
              title: `GRN ${grn.docNo}`,
              subtitle: `${grn.supplierName} · Status: ${grn.verificationStatus}`,
              module: 'Supply Chain',
              path: `/supply-chain/grn`,
              date: grn.receivedDate,
            });
          });

          mats.forEach((m) => {
            results['Supply Chain'].push({
              id: m.id,
              docNo: m.code,
              title: `${m.code} — ${m.name}`,
              subtitle: `Category: ${m.category} · Min Stock: ${m.minStock} ${m.unit}`,
              module: 'Supply Chain',
              path: `/supply-chain/materials`,
            });
          });
        })(),
      );
    }

    // --- LOGISTICS SEARCH ---
    if (checkPerm('logistics')) {
      queries.push(
        (async () => {
          const dels = await DeliveryOrderModel.find({
            $or: [
              { docNo: q },
              { customerName: q },
              { deliveryChallanNo: q },
              { trackingNumber: q },
              { vehicleNumber: q },
              { salesOrderDocNo: q },
            ],
          }).limit(5).lean();

          dels.forEach((d) => {
            results.Logistics.push({
              id: d.id,
              docNo: d.docNo,
              title: `Delivery ${d.docNo}`,
              subtitle: `${d.customerName} · ${d.transportMethod}: ${d.status}${d.trackingNumber ? ` (AWB ${d.trackingNumber})` : ''}`,
              module: 'Logistics',
              path: `/logistics/delivery-orders/${d.id}`,
              date: (d as any).dispatchDate || (d as any).actualDeliveryDate || (d.createdAt ? new Date(d.createdAt).toISOString() : undefined),
            });
          });
        })(),
      );
    }

    await Promise.all(queries);

    const flatResults = [
      ...results.Sales,
      ...results.Production,
      ...results['Supply Chain'],
      ...results.Logistics,
    ];

    res.json({
      query: rawQuery,
      grouped: results,
      results: flatResults,
      total: flatResults.length,
    });
  } catch (err) {
    sendError(res, err);
  }
});
