import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  SalesOrderModel,
  EnquiryModel,
  QuotationModel,
  ProformaInvoiceModel,
  CustomerPOModel,
  PaymentEntryModel,
  ProductionOrderModel,
  BOMModel,
  MaterialRequestModel,
  MaterialIssueModel,
  DailyProductionUpdateModel,
  QualityCheckModel,
  ReworkOrderModel,
  DeliveryOrderModel,
  DeliveryIssueModel,
  CompanySettingsModel,
} from '../models';
import { sendError } from '../utils/routeUtils';
import { calculatePaymentSummary } from '../../src/utils/erpLogic';

export const trackingRouter = Router();

// GET /api/tracking - Paginated overview of traceable Sales Orders
trackingRouter.get('/tracking', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (req.query.status && req.query.status !== 'All') {
      filter.fulfillmentStatus = req.query.status;
    }
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const q = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [
        { docNo: q },
        { enquiryDocNo: q },
        { quotationDocNo: q },
        { customerPoNumber: q },
        { 'customerSnapshot.name': q },
      ];
    }

    const [items, total] = await Promise.all([
      SalesOrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SalesOrderModel.countDocuments(filter),
    ]);

    // Redact financial amounts if user lacks sales/admin permissions
    const canSeeFinancials = req.user?.department === 'admin' || req.user?.permissions?.['sales']?.includes('view');

    const sanitizedItems = items.map((so) => ({
      ...so,
      totalAmount: canSeeFinancials ? so.totalAmount : undefined,
      subtotal: canSeeFinancials ? so.subtotal : undefined,
      taxAmount: canSeeFinancials ? so.taxAmount : undefined,
    }));

    res.json({
      items: sanitizedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/tracking/:salesOrderId - Comprehensive 15-stage lifecycle trace
trackingRouter.get('/tracking/:salesOrderId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { salesOrderId } = req.params;

    // 1. Fetch Sales Order
    const so = await SalesOrderModel.findOne({
      $or: [{ id: salesOrderId }, { docNo: salesOrderId }],
    }).lean();

    if (!so) {
      throw new Error(`NOT_FOUND: Sales Order '${salesOrderId}' not found.`);
    }

    // 2. Fetch all linked relational records in parallel
    const [
      enquiry,
      quotations,
      pi,
      cpo,
      payments,
      productionOrders,
      materialRequests,
      deliveries,
      company,
    ] = await Promise.all([
      EnquiryModel.findOne({ id: so.enquiryId }).lean(),
      QuotationModel.find({ enquiryId: so.enquiryId }).sort({ version: 1 }).lean(),
      ProformaInvoiceModel.findOne({ id: so.piId }).lean(),
      CustomerPOModel.findOne({ id: so.customerPoId }).lean(),
      PaymentEntryModel.find({ salesOrderId: so.id }).lean(),
      ProductionOrderModel.find({ salesOrderId: so.id }).sort({ createdAt: 1 }).lean(),
      MaterialRequestModel.find({ salesOrderId: so.id }).sort({ createdAt: 1 }).lean(),
      DeliveryOrderModel.find({ salesOrderId: so.id }).sort({ createdAt: 1 }).lean(),
      CompanySettingsModel.findOne({ id: 'company' }).lean(),
    ]);

    const poIds = productionOrders.map((p) => p.id);
    const mrIds = materialRequests.map((m) => m.id);
    const delIds = deliveries.map((d) => d.id);

    // 3. Fetch second-tier manufacturing & logistics details in parallel
    const [boms, materialIssues, dailyUpdates, qualityChecks, reworkOrders, deliveryIssues] = await Promise.all([
      BOMModel.find({ productionOrderId: { $in: poIds } }).lean(),
      MaterialIssueModel.find({ materialRequestId: { $in: mrIds } }).lean(),
      DailyProductionUpdateModel.find({ productionOrderId: { $in: poIds } }).sort({ workDate: -1 }).lean(),
      QualityCheckModel.find({ productionOrderId: { $in: poIds } }).sort({ createdAt: -1 }).lean(),
      ReworkOrderModel.find({ productionOrderId: { $in: poIds } }).sort({ createdAt: -1 }).lean(),
      DeliveryIssueModel.find({ deliveryOrderId: { $in: delIds } }).sort({ createdAt: -1 }).lean(),
    ]);

    // 4. Calculate Aggregate Quantities and Fulfillment Rules
    const totalOrderedQty = so.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalManufacturedQty = productionOrders.reduce((sum, p) => sum + (p.actualCompletionDate ? p.quantity : 0), 0);
    const totalQcAcceptedQty = productionOrders.reduce((sum, p) => sum + (p.status === 'Completed' ? p.quantity : (p.qcAcceptedQty || 0)), 0);
    const totalDispatchedQty = deliveries.reduce((sum, d) => sum + (['In Transit', 'Partially Delivered', 'Delivered'].includes(d.status) ? d.quantity : 0), 0);
    const totalDeliveredQty = deliveries.reduce((sum, d) => sum + (d.deliveredQty || (d.status === 'Delivered' ? d.quantity : 0)), 0);

    const isFullyDelivered = totalDeliveredQty >= totalOrderedQty && totalOrderedQty > 0;
    const isPartiallyDelivered = totalDeliveredQty > 0 && !isFullyDelivered;

    // 5. Build 15 Discrete Lifecycle Stages
    const paySummary = calculatePaymentSummary(so.totalAmount, payments as any, { piId: so.piId, salesOrderId: so.id });
    const acceptedQuotation = quotations.find((q) => q.status === 'Accepted') || quotations[quotations.length - 1];

    const allMaterialsIssued = materialRequests.length > 0 && materialRequests.every((m) => m.status === 'Fully Issued');
    const allMaterialsReceived = materialRequests.length > 0 && materialRequests.every((m) => m.receiptStatus === 'Fully Received');
    const anyReworkActive = reworkOrders.some((r) => r.status === 'Open' || r.status === 'In Progress');
    const allQcPassed = productionOrders.length > 0 && productionOrders.every((p) => p.status === 'Completed');

    const stages = [
      {
        stageIndex: 1,
        name: 'Customer Enquiry',
        department: 'Sales',
        status: enquiry ? 'Completed' : 'Pending',
        docNo: so.enquiryDocNo,
        date: enquiry?.createdAt,
        summary: enquiry ? `Enquiry received from ${so.customerSnapshot.name} via ${enquiry.source}` : 'Enquiry linked',
        link: `/sales/enquiries/${so.enquiryId}`,
      },
      {
        stageIndex: 2,
        name: 'Enquiry Follow-ups',
        department: 'Sales',
        status: enquiry?.status === 'Qualified' ? 'Completed' : 'Completed',
        docNo: enquiry?.docNo,
        date: enquiry?.updatedAt,
        summary: `Qualified via sales interaction (${(enquiry as any)?.followUps?.length || 1} follow-ups)`,
        link: `/sales/follow-ups`,
      },
      {
        stageIndex: 3,
        name: 'Qualified Enquiry',
        department: 'Sales',
        status: 'Completed',
        docNo: so.enquiryDocNo,
        date: enquiry?.createdAt,
        summary: 'Commercial requirements verified and approved for quotation',
        link: `/sales/qualified`,
      },
      {
        stageIndex: 4,
        name: 'Quotation & Revisions',
        department: 'Sales',
        status: acceptedQuotation ? 'Completed' : 'Pending',
        docNo: acceptedQuotation ? `${acceptedQuotation.docNo} (V${acceptedQuotation.version})` : so.quotationDocNo,
        date: acceptedQuotation?.quotationDate,
        summary: acceptedQuotation
          ? `Version V${acceptedQuotation.version} accepted (${quotations.length} total revision(s))`
          : 'Quotation submitted',
        revisions: quotations.map((q) => ({
          docNo: q.docNo,
          version: q.version,
          status: q.status,
          date: q.quotationDate,
        })),
        link: `/sales/quotations`,
      },
      {
        stageIndex: 5,
        name: 'Proforma Invoice',
        department: 'Sales',
        status: pi ? 'Completed' : 'Pending',
        docNo: so.piDocNo,
        date: pi?.piDate,
        summary: pi ? `PI generated with 18% GST and bank remittance terms` : 'Proforma Invoice issued',
        link: `/sales/proforma-invoices`,
      },
      {
        stageIndex: 6,
        name: 'Customer Purchase Order',
        department: 'Sales',
        status: cpo ? (cpo.hasDiscrepancy && !cpo.discrepancyResolved ? 'Blocked' : 'Completed') : 'Completed',
        docNo: so.customerPoDocNo || cpo?.customerPoNumber,
        date: cpo?.receivedDate,
        summary: cpo
          ? `PO #${cpo.customerPoNumber} verified (${cpo.hasDiscrepancy ? 'Discrepancy resolved' : 'Discrepancy free'})`
          : `Customer PO confirmed`,
        link: `/sales/customer-pos`,
      },
      {
        stageIndex: 7,
        name: 'Payment Entries',
        department: 'Sales',
        status: paySummary.paymentStatus === 'Paid' ? 'Completed' : paySummary.verifiedReceived > 0 ? 'In Progress' : 'Pending',
        docNo: `${payments.length} Receipt(s)`,
        date: payments[0]?.paymentDate,
        summary: `Status: ${paySummary.paymentStatus} · Verified: ₹${paySummary.verifiedReceived.toLocaleString('en-IN')} / ₹${so.totalAmount.toLocaleString('en-IN')}`,
        link: `/sales/payments`,
      },
      {
        stageIndex: 8,
        name: 'Sales Order Confirmation',
        department: 'Sales',
        status: 'Completed',
        docNo: so.docNo,
        date: so.createdAt,
        summary: `Commercial confirmation gate cleared. Promised delivery: ${so.promisedDeliveryDate}`,
        link: `/sales/sales-orders`,
      },
      {
        stageIndex: 9,
        name: 'Production Order & Duration Plan',
        department: 'Production',
        status: productionOrders.length > 0 ? 'Completed' : 'In Progress',
        docNo: productionOrders.map((p) => p.docNo).join(', ') || 'Pending Creation',
        date: productionOrders[0]?.createdAt,
        summary: productionOrders.length > 0
          ? `${productionOrders.length} order(s) planned (${productionOrders[0].plannedDurationDays} days planned)`
          : 'Awaiting scheduling in Received Orders queue',
        link: productionOrders[0] ? `/production/orders/${productionOrders[0].id}` : `/production/received-orders`,
      },
      {
        stageIndex: 10,
        name: 'BOM & Supply Chain Request',
        department: 'Production → Supply Chain',
        status: materialRequests.length > 0 ? 'Completed' : productionOrders.length > 0 ? 'In Progress' : 'Pending',
        docNo: materialRequests.map((m) => m.docNo).join(', ') || boms.map((b) => b.docNo).join(', ') || undefined,
        date: materialRequests[0]?.requestDate,
        summary: materialRequests.length > 0
          ? `${materialRequests.length} BOM material request(s) issued to Stores`
          : 'Awaiting BOM submission',
        link: `/production/bom`,
      },
      {
        stageIndex: 11,
        name: 'Material Issues & Physical Receipts',
        department: 'Supply Chain → Production',
        status: allMaterialsIssued && allMaterialsReceived ? 'Completed' : materialRequests.length > 0 ? 'In Progress' : 'Pending',
        docNo: materialIssues.map((i) => i.docNo).join(', ') || undefined,
        date: materialIssues[0]?.issueDate,
        summary: allMaterialsReceived
          ? `All store items issued & physically acknowledged (${materialIssues.length} issue vouchers)`
          : `Issued: ${allMaterialsIssued ? 'Fully Issued' : 'Pending Store Issue'} · Received: ${allMaterialsReceived ? 'Fully Received' : 'Awaiting Receipt'}`,
        link: `/production/material-receipts`,
      },
      {
        stageIndex: 12,
        name: 'Manufacturing & Daily Progress',
        department: 'Production',
        status: allQcPassed || productionOrders.some((p) => p.status === 'QC Pending')
          ? 'Completed'
          : anyReworkActive
            ? 'Blocked'
            : productionOrders.some((p) => p.status === 'In Progress' || p.status === 'Ready to Start')
              ? 'In Progress'
              : 'Pending',
        docNo: `${dailyUpdates.length} Floor Log(s)`,
        date: dailyUpdates[0]?.workDate,
        summary: dailyUpdates.length > 0
          ? `Latest: ${dailyUpdates[0].stage} (${dailyUpdates[0].stageStatus}) by ${dailyUpdates[0].employeeName}`
          : 'Shop floor manufacturing pending start',
        link: productionOrders[0] ? `/production/orders/${productionOrders[0].id}` : `/production/active`,
      },
      {
        stageIndex: 13,
        name: 'Quality Check & Rework',
        department: 'Production QC',
        status: allQcPassed ? 'Completed' : anyReworkActive ? 'Blocked' : qualityChecks.length > 0 ? 'In Progress' : 'Pending',
        docNo: qualityChecks.map((q) => q.docNo).join(', ') || (reworkOrders[0] ? reworkOrders[0].docNo : undefined),
        date: qualityChecks[0]?.createdAt,
        summary: allQcPassed
          ? `100% Passed QC (${qualityChecks.length} inspection(s) recorded)`
          : anyReworkActive
            ? `Active Rework Order ${reworkOrders[0].docNo} under corrective action`
            : qualityChecks.length > 0
              ? `QC in progress (${qualityChecks.length} attempt(s))`
              : 'Awaiting manufacturing completion',
        link: `/production/quality-check`,
      },
      {
        stageIndex: 14,
        name: 'Logistics Dispatch',
        department: 'Logistics',
        status: totalDispatchedQty >= totalOrderedQty
          ? 'Completed'
          : totalDispatchedQty > 0
            ? 'In Progress'
            : allQcPassed
              ? 'In Progress'
              : 'Pending',
        docNo: deliveries.map((d) => d.docNo).join(', ') || undefined,
        date: (deliveries[0] as any)?.dispatchDate || (deliveries[0]?.createdAt ? new Date(deliveries[0].createdAt).toISOString() : undefined),
        summary: deliveries.length > 0
          ? deliveries.map((d) => `${d.docNo} (${d.transportMethod}: ${d.status})`).join(' | ')
          : allQcPassed
            ? 'QC Accepted units ready in Logistics dispatch queue'
            : 'Locked until Quality Check release',
        link: `/logistics/delivery-orders`,
      },
      {
        stageIndex: 15,
        name: 'Delivery Confirmation & Handover',
        department: 'Logistics',
        status: isFullyDelivered ? 'Completed' : isPartiallyDelivered ? 'In Progress' : 'Pending',
        docNo: so.fulfillmentStatus,
        date: deliveries[0]?.actualDeliveryDate,
        summary: isFullyDelivered
          ? `Delivered ${totalDeliveredQty} of ${totalOrderedQty} units. Final recipient handover complete.`
          : isPartiallyDelivered
            ? `Partially delivered: ${totalDeliveredQty} of ${totalOrderedQty} units completed`
            : 'Awaiting customer handover & Proof of Delivery (POD)',
        link: `/logistics/completed`,
      },
    ];

    // 6. RBAC Redactions & Line Progress
    const isSalesUser = req.user?.department === 'sales' || req.user?.department === 'admin' || req.user?.permissions?.['sales']?.includes('view');
    const isSupplyChainUser = req.user?.department === 'supply_chain' || req.user?.department === 'admin' || req.user?.permissions?.['supply_chain']?.includes('view');

    const lineProgress = (so.items || []).map((item) => {
      const lineOrdered = item.quantity || 0;
      const lineProd = productionOrders.filter(
        (p) =>
          p.productName === item.productName ||
          p.productName?.includes(item.productName) ||
          item.productName?.includes(p.productName) ||
          (p as any).productId === item.productId ||
          (productionOrders.length === 1 && (so.items || []).length === 1),
      );
      const lineMfg = lineProd.reduce((sum, p) => sum + (p.completedManufacturingQty || 0), 0);
      const lineQc = lineProd.reduce((sum, p) => sum + (p.qcAcceptedQty || 0), 0);
      const lineDels = deliveries.filter(
        (d) =>
          d.productName === item.productName ||
          d.productName?.includes(item.productName) ||
          item.productName?.includes(d.productName) ||
          (d as any).productId === item.productId ||
          ((d as any).items || []).some((di: any) => di.productName === item.productName || di.productId === item.productId) ||
          (deliveries.length === 1 && (so.items || []).length === 1),
      );
      const lineDelivered = lineDels.reduce((sum, d) => sum + (d.deliveredQty || (d.status === 'Delivered' ? d.quantity : 0)), 0);
      return {
        productId: item.productId,
        productName: item.productName,
        orderedQty: lineOrdered,
        manufacturedQty: lineMfg,
        qcAcceptedQty: lineQc,
        deliveredQty: lineDelivered,
        progressPercent: lineOrdered > 0 ? Math.min(100, Math.round((lineDelivered / lineOrdered) * 100)) : 0,
      };
    });

    const sanitizedSO = {
      ...so,
      totalAmount: isSalesUser ? so.totalAmount : undefined,
      subtotal: isSalesUser ? so.subtotal : undefined,
      taxAmount: isSalesUser ? so.taxAmount : undefined,
    };

    const sanitizedPayments = isSalesUser ? payments : [];
    const sanitizedPaymentSummary = isSalesUser
      ? paySummary
      : undefined;

    res.json({
      salesOrder: sanitizedSO,
      stages,
      lineProgress,
      isCommercialRedacted: !isSalesUser,
      metrics: {
        totalOrderedQty,
        totalManufacturedQty,
        totalQcAcceptedQty,
        totalDispatchedQty,
        totalDeliveredQty,
        fulfillmentStatus: so.fulfillmentStatus,
        currentStage: stages.find((s) => s.status === 'In Progress' || s.status === 'Blocked')?.name || (isFullyDelivered ? 'Delivery Confirmation & Handover' : 'Manufacturing & Daily Progress'),
      },
      enquiry,
      quotations: isSalesUser ? quotations : quotations.map((q) => ({ docNo: q.docNo, version: q.version, status: q.status })),
      proformaInvoice: isSalesUser ? pi : (pi ? { docNo: pi.docNo, piDate: pi.piDate } : null),
      customerPO: cpo,
      payments: sanitizedPayments,
      paymentSummary: sanitizedPaymentSummary,
      productionOrders,
      materialRequests: isSupplyChainUser ? materialRequests : materialRequests.map((m) => ({ docNo: m.docNo, status: m.status, receiptStatus: m.receiptStatus })),
      deliveries,
      deliveryIssues,
      company: {
        companyName: company?.companyName || 'CRYO Enterprise ERP 2.0',
        currencySymbol: company?.currencySymbol || '₹',
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});
