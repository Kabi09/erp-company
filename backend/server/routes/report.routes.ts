import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  SalesOrderModel,
  ProductionOrderModel,
  MaterialRequestModel,
  MaterialModel,
  StockTransactionModel,
  QualityCheckModel,
  DeliveryOrderModel,
  PaymentEntryModel,
} from '../models';
import { sendError } from '../utils/routeUtils';

export const reportRouter = Router();

// GET /api/reports/cross-department - Integrated cross-department analytics
reportRouter.get('/reports/cross-department', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.department === 'admin';
    if (!isSuperAdmin) {
      throw new Error('FORBIDDEN: Only administrators have access to cross-department management reports.');
    }
    const canSales = true;

    const [
      soStatusAgg,
      poStatusAgg,
      mrStatusAgg,
      qcAgg,
      deliveryStatusAgg,
      materials,
      stockTxns,
      allPayments,
      allSOs,
    ] = await Promise.all([
      SalesOrderModel.aggregate([{ $group: { _id: '$fulfillmentStatus', count: { $sum: 1 }, totalVal: { $sum: '$totalAmount' } } }]),
      ProductionOrderModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      MaterialRequestModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      QualityCheckModel.aggregate([{ $group: { _id: '$finalResult', count: { $sum: 1 }, totalAccepted: { $sum: '$acceptedQuantity' }, totalRejected: { $sum: '$rejectedQuantity' } } }]),
      DeliveryOrderModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, totalDelivered: { $sum: '$deliveredQty' } } }]),
      MaterialModel.find().lean(),
      StockTransactionModel.find().lean(),
      PaymentEntryModel.find().lean(),
      SalesOrderModel.find().lean(),
    ]);

    // Compute stock valuation
    const stockMap: Record<string, number> = {};
    for (const t of stockTxns) {
      stockMap[t.materialId] = (stockMap[t.materialId] || 0) + (t.quantityDelta || 0);
    }

    let totalInventoryValue = 0;
    let lowStockCount = 0;
    for (const m of materials) {
      const stock = stockMap[m.id] ?? m.currentStock ?? 0;
      totalInventoryValue += stock * ((m as any).unitCost || (m as any).costPerUnit || 0);
      if (stock <= m.minStock) lowStockCount++;
    }

    // Commercial totals
    const totalOrderBook = allSOs.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const verifiedRevenue = allPayments
      .filter((p) => (p as any).verificationStatus === 'Verified' || (p as any).status === 'Verified')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const outstandingCollections = Math.max(0, totalOrderBook - verifiedRevenue);

    res.json({
      salesOrders: soStatusAgg.map((s) => ({
        status: s._id,
        count: s.count,
        totalValue: canSales ? s.totalVal : undefined,
      })),
      productionOrders: poStatusAgg.map((p) => ({ status: p._id, count: p.count })),
      materialRequests: mrStatusAgg.map((m) => ({ status: m._id, count: m.count })),
      qualityChecks: qcAgg.map((q) => ({
        result: q._id,
        count: q.count,
        acceptedQty: q.totalAccepted,
        rejectedQty: q.totalRejected,
      })),
      deliveries: deliveryStatusAgg.map((d) => ({
        status: d._id,
        count: d.count,
        totalDeliveredUnits: d.totalDelivered,
      })),
      inventory: {
        totalMaterials: materials.length,
        lowStockMaterials: lowStockCount,
        totalValuation: isSuperAdmin || user.permissions?.['supply_chain']?.includes('view') ? totalInventoryValue : undefined,
      },
      commercial: canSales
        ? {
            totalOrderBook,
            verifiedRevenue,
            outstandingCollections,
          }
        : undefined,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/reports/cross-department/export - CSV export for shared reporting
reportRouter.get('/reports/cross-department/export', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.department === 'admin';
    if (!isSuperAdmin) {
      throw new Error('FORBIDDEN: Only administrators have access to cross-department reports.');
    }
    const canSales = true;

    const orders = await SalesOrderModel.find().sort({ createdAt: -1 }).lean();

    const rows: string[] = [];
    rows.push(
      canSales
        ? 'Sales Order,Customer,Promise Date,Fulfillment,Commercial Status,Order Value,Items'
        : 'Sales Order,Customer,Promise Date,Fulfillment,Commercial Status,Items',
    );

    for (const so of orders) {
      const itemsStr = so.items.map((i) => `${i.quantity}x ${i.productName}`).join('; ');
      const cleanCustomer = `"${so.customerSnapshot.name.replace(/"/g, '""')}"`;
      const cleanItems = `"${itemsStr.replace(/"/g, '""')}"`;

      if (canSales) {
        rows.push(`${so.docNo},${cleanCustomer},${so.promisedDeliveryDate},${so.fulfillmentStatus},${(so as any).status || so.fulfillmentStatus},${so.totalAmount},${cleanItems}`);
      } else {
        rows.push(`${so.docNo},${cleanCustomer},${so.promisedDeliveryDate},${so.fulfillmentStatus},${(so as any).status || so.fulfillmentStatus},${cleanItems}`);
      }
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="CRYO_Cross_Department_Report.csv"');
    res.send(rows.join('\n'));
  } catch (err) {
    sendError(res, err);
  }
});
