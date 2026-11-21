import { Router } from 'express';
import { getAvailableDispatchQty, round2 } from '../../src/utils/erpLogic';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  DeliveryIssueModel,
  DeliveryOrderModel,
  ProductionOrderModel,
  SalesOrderModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { generateId, sendError, syncSalesOrderFulfillmentMongo } from '../utils/routeUtils';

export const logisticsRouter = Router();

const ALLOWED_ATTACHMENT_TYPES = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp']);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

function validateAttachment(file?: { name?: string; dataUrl?: string; size?: number; type?: string }) {
  if (!file || (!file.name && !file.dataUrl)) return;
  if (file.name) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && !ALLOWED_ATTACHMENT_TYPES.has(ext)) {
      throw new Error(`Unsupported file type ".${ext}". Allowed types: PDF, PNG, JPG, JPEG, WEBP.`);
    }
  }
  if (file.size && file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Attachment exceeds maximum allowed size of 5 MB.');
  }
  if (file.dataUrl && file.dataUrl.length > (MAX_ATTACHMENT_BYTES * 4) / 3 + 1000) {
    throw new Error('Attachment exceeds maximum allowed size of 5 MB.');
  }
}

// ==========================================
// 1. LOGISTICS DASHBOARD SUMMARY
// ==========================================
logisticsRouter.get('/logistics/summary', requireAuth, requirePerm('logistics', 'view'), async (_req: AuthenticatedRequest, res) => {
  try {
    const summary = await mongoERPRepository.getLogisticsSummary();
    res.json(summary);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// 2. READY FOR DISPATCH QUEUE
// ==========================================
logisticsRouter.get('/logistics/ready', requireAuth, requirePerm('logistics', 'view'), async (_req: AuthenticatedRequest, res) => {
  try {
    const [completedPOs, deliveryOrders, salesOrders] = await Promise.all([
      ProductionOrderModel.find({ status: 'Completed', qcAcceptedQty: { $gt: 0 } }).sort({ completedDate: -1, createdAt: -1 }).lean(),
      DeliveryOrderModel.find({ status: { $ne: 'Cancelled' } }).lean(),
      SalesOrderModel.find({}, { id: 1, deliveryAddress: 1, priority: 1, customerSnapshot: 1 }).lean(),
    ]);

    const soMap = new Map(salesOrders.map((so) => [so.id, so]));

    const readyRows = completedPOs.map((po) => {
      const avail = getAvailableDispatchQty(po as any, deliveryOrders as any);
      const allocated = po.qcAcceptedQty - avail;
      const so = soMap.get(po.salesOrderId);
      return {
        id: po.id,
        docNo: po.docNo,
        salesOrderId: po.salesOrderId,
        salesOrderDocNo: po.salesOrderDocNo,
        customerId: po.customerId,
        customerName: po.customerName,
        productName: po.productName,
        model: po.model,
        quantity: po.quantity,
        qcAcceptedQty: po.qcAcceptedQty,
        allocatedQty: allocated,
        availableQty: avail,
        serialNumbers: po.serialNumbers || [],
        deliveryAddress: so?.deliveryAddress || so?.customerSnapshot?.shippingAddress || '',
        expectedDeliveryDate: po.plannedEndDate || '',
        completedDate: po.actualCompletionDate || (po as any).completedDate || '',
        priority: po.priority,
        status: po.status,
      };
    }).filter((row) => row.availableQty > 0);

    res.json(readyRows);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// 3. PAGINATED DELIVERY ORDERS
// ==========================================
logisticsRouter.get('/logistics/delivery-orders', requireAuth, requirePerm('logistics', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedDeliveryOrders(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// 4. DELIVERY ORDER DETAIL
// ==========================================
logisticsRouter.get('/logistics/delivery-orders/:id', requireAuth, requirePerm('logistics', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const del = await DeliveryOrderModel.findOne({ id: req.params.id }).lean();
    if (!del) throw new Error('NOT_FOUND:Delivery order not found.');

    const [so, po, issues] = await Promise.all([
      SalesOrderModel.findOne({ id: del.salesOrderId }).lean(),
      ProductionOrderModel.findOne({ id: del.productionOrderId }).lean(),
      DeliveryIssueModel.find({ deliveryOrderId: del.id }).sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      ...del,
      salesOrder: so,
      productionOrder: po,
      issues,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// 5. CREATE DELIVERY ORDER
// ==========================================
logisticsRouter.post('/logistics/delivery-orders', requireAuth, requirePerm('logistics', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const del = await mongoERPRepository.createDeliveryOrderTx(req.body, req.user!);
    res.status(201).json(del);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// 6. CANCEL DELIVERY ORDER (PRE-DISPATCH)
// ==========================================
logisticsRouter.post('/logistics/delivery-orders/:id/cancel', requireAuth, requirePerm('logistics', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const reason = req.body.reason || req.body.cancellationReason;
    const cancelled = await mongoERPRepository.cancelDeliveryOrderTx(req.params.id as string, reason, req.user!);
    res.json(cancelled);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// 7. CONFIRM DISPATCH
// ==========================================
logisticsRouter.post('/logistics/delivery-orders/:id/dispatch', requireAuth, requirePerm('logistics', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const del = await DeliveryOrderModel.findOne({ id: req.params.id });
    if (!del) throw new Error('NOT_FOUND:Delivery order not found.');

    if (del.status === 'In Transit' || del.status === 'Dispatched') {
      throw new Error(`Delivery order ${del.docNo} has already been dispatched.`);
    }
    if (del.status === 'Delivered') {
      throw new Error(`Delivery order ${del.docNo} is already delivered.`);
    }
    if (del.status === 'Cancelled') {
      throw new Error(`Cancelled delivery order ${del.docNo} cannot be dispatched.`);
    }
    if (del.status !== 'Planned' && del.status !== 'Issue') {
      throw new Error(`Delivery order ${del.docNo} cannot be dispatched from status "${del.status}".`);
    }

    if (!body.deliveryChallanNo?.trim()) {
      throw new Error('Delivery challan number is required to confirm dispatch.');
    }
    if (del.transportMethod === 'Courier' && !(body.trackingNumber?.trim() || del.trackingNumber?.trim())) {
      throw new Error('Tracking / AWB number is required at dispatch for Courier shipments.');
    }

    validateAttachment({
      name: body.attachmentName,
      dataUrl: body.attachmentDataUrl,
      size: body.attachmentSize,
    });

    const now = new Date().toISOString();
    const wasPlanned = del.status === 'Planned';

    if (body.trackingNumber?.trim()) del.trackingNumber = body.trackingNumber.trim();
    del.actualDispatchDate = body.actualDispatchDate || now;
    del.deliveryChallanNo = body.deliveryChallanNo.trim();
    del.dispatchAttachmentName = body.attachmentName || del.dispatchAttachmentName;
    del.dispatchAttachmentDataUrl = body.attachmentDataUrl || del.dispatchAttachmentDataUrl;
    del.dispatchRemarks = body.remarks?.trim() || '';
    del.status = 'In Transit';
    del.updatedAt = now;

    if (!del.history) del.history = [];
    del.history.push({
      timestamp: now,
      action: 'Confirmed Dispatch',
      actorName: req.user!.name,
      details: `Dispatched ${del.quantity}x ${del.productName} via ${del.transportMethod}. Challan: ${del.deliveryChallanNo}.`,
      status: 'In Transit',
    });

    await del.save();

    const po = await ProductionOrderModel.findOne({ id: del.productionOrderId });
    if (po && wasPlanned) {
      po.dispatchedQty = round2((po.dispatchedQty || 0) + del.quantity);
      po.updatedAt = now;
      await po.save();
    }

    await syncSalesOrderFulfillmentMongo(del.salesOrderId);

    await mongoERPRepository.addNotification({
      title: `Dispatched: ${del.docNo} (${del.salesOrderDocNo})`,
      message: `${del.quantity}x ${del.productName} for ${del.customerName} is now In Transit via ${del.transportMethod}.`,
      department: 'sales',
      severity: 'info',
      link: `/tracking/${del.salesOrderId}`,
    });

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'logistics',
      action: 'Confirmed Dispatch',
      entityType: 'DeliveryOrder',
      entityId: del.id,
      entityDocNo: del.docNo,
      details: `Dispatched ${del.docNo} (Challan: ${del.deliveryChallanNo}) — In Transit.`,
    });

    res.json(del.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// 8. CONFIRM DELIVERY
// ==========================================
logisticsRouter.post('/logistics/delivery-orders/:id/deliver', requireAuth, requirePerm('logistics', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const del = await DeliveryOrderModel.findOne({ id: req.params.id });
    if (!del) throw new Error('NOT_FOUND:Delivery order not found.');

    if (del.status === 'Cancelled') {
      throw new Error(`Cannot deliver cancelled delivery order ${del.docNo}.`);
    }
    if (del.status === 'Planned') {
      throw new Error(`Delivery must be dispatched before confirming delivery (current: ${del.status}).`);
    }
    if (del.status === 'Delivered') {
      throw new Error(`Delivery ${del.docNo} has already been confirmed delivered.`);
    }

    const now = new Date().toISOString();

    // Check if user is logging an issue from delivery confirmation modal
    if (body.result === 'Delivery Issue' || body.deliveryCondition === 'Damaged') {
      if (!body.issueReason?.trim()) throw new Error('Issue reason is required when recording a delivery issue.');
      del.status = 'Issue';
      del.deliveryCondition = body.deliveryCondition || 'Damaged';
      del.deliveryRemarks = body.remarks?.trim() || '';
      del.updatedAt = now;

      if (!del.history) del.history = [];
      del.history.push({
        timestamp: now,
        action: 'Delivery Issue Reported',
        actorName: req.user!.name,
        details: `Issue reported: ${body.issueReason.trim()} (${body.issueType || 'Damage'})`,
        status: 'Issue',
      });

      await del.save();

      const issue = {
        id: generateId('di'),
        deliveryOrderId: del.id,
        deliveryOrderDocNo: del.docNo,
        salesOrderDocNo: del.salesOrderDocNo,
        customerName: del.customerName,
        issueType: body.issueType || (body.deliveryCondition === 'Damaged' ? 'Product Damaged' : 'Customer Unavailable'),
        affectedQty: Number(body.affectedQty) || del.quantity,
        reason: body.issueReason.trim(),
        reportedDate: body.deliveryDate || now.slice(0, 10),
        responsibleEmployee: req.user!.name,
        correctiveAction: body.correctiveAction?.trim() || 'Investigating with carrier / driver',
        nextAttemptDate: body.nextAttemptDate || undefined,
        status: 'Open' as const,
        createdAt: now,
      };

      await DeliveryIssueModel.create(issue);

      await mongoERPRepository.addActivity({
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'logistics',
        action: 'Logged Delivery Issue',
        entityType: 'DeliveryOrder',
        entityId: del.id,
        entityDocNo: del.docNo,
        details: `Delivery issue on ${del.docNo}: ${body.issueReason.trim()}`,
      });

      res.json(del.toObject());
      return;
    }

    if (!body.receivedBy?.trim()) throw new Error('Receiver name is required to confirm delivery.');

    validateAttachment({
      name: body.podName,
      dataUrl: body.podDataUrl,
      size: body.podFileSize,
      type: body.podFileType,
    });

    const result = await mongoERPRepository.confirmDelivery(req.params.id as string, body, req.user!);
    res.json(result.deliveryOrder);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// 9. REPORT DELIVERY ISSUE
// ==========================================
async function handleReportIssue(req: AuthenticatedRequest, res: any) {
  try {
    const body = req.body;
    const deliveryOrderId = req.params.id || body.deliveryOrderId;
    const del = await DeliveryOrderModel.findOne({ id: deliveryOrderId });
    if (!del) throw new Error('NOT_FOUND:Delivery order not found.');
    if (del.status === 'Cancelled') {
      throw new Error(`Cannot report issue on cancelled delivery order ${del.docNo}.`);
    }
    if (!body.reason?.trim() && !body.issueReason?.trim()) {
      throw new Error('Issue reason is required.');
    }

    const reason = (body.reason || body.issueReason).trim();
    const issueType = body.issueType || 'Delivery Delayed';
    const affectedQty = Number(body.affectedQty) || del.quantity;
    const now = new Date().toISOString();

    del.status = 'Issue';
    del.updatedAt = now;
    if (!del.history) del.history = [];
    del.history.push({
      timestamp: now,
      action: 'Delivery Issue Reported',
      actorName: req.user!.name,
      details: `${issueType}: ${reason} (Affected: ${affectedQty} units)`,
      status: 'Issue',
    });
    await del.save();

    const issue = {
      id: generateId('di'),
      deliveryOrderId: del.id,
      deliveryOrderDocNo: del.docNo,
      salesOrderDocNo: del.salesOrderDocNo,
      customerName: del.customerName,
      issueType,
      affectedQty,
      reason,
      reportedDate: body.reportedDate || now.slice(0, 10),
      responsibleEmployee: req.user!.name,
      correctiveAction: body.correctiveAction?.trim() || '',
      nextAttemptDate: body.nextAttemptDate || undefined,
      status: 'Open' as const,
      createdAt: now,
    };

    await DeliveryIssueModel.create(issue);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'logistics',
      action: 'Logged Delivery Issue',
      entityType: 'DeliveryOrder',
      entityId: del.id,
      entityDocNo: del.docNo,
      details: `Delivery issue on ${del.docNo}: ${reason}`,
    });

    res.status(201).json(issue);
  } catch (err) {
    sendError(res, err);
  }
}

logisticsRouter.post('/logistics/delivery-orders/:id/report-issue', requireAuth, requirePerm('logistics', 'edit'), handleReportIssue);
logisticsRouter.post('/logistics/delivery-issues', requireAuth, requirePerm('logistics', 'edit'), handleReportIssue);
logisticsRouter.post('/logistics/issues', requireAuth, requirePerm('logistics', 'edit'), handleReportIssue);

// ==========================================
// 10. GET DELIVERY ISSUES
// ==========================================
async function handleGetIssues(req: AuthenticatedRequest, res: any) {
  try {
    const filter: Record<string, any> = {};
    if (req.query.status && req.query.status !== 'All') {
      filter.status = req.query.status;
    }
    if (req.query.deliveryOrderId) {
      filter.deliveryOrderId = req.query.deliveryOrderId;
    }
    if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
      const s = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ deliveryOrderDocNo: s }, { salesOrderDocNo: s }, { customerName: s }, { reason: s }];
    }
    const issues = await DeliveryIssueModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json(issues);
  } catch (err) {
    sendError(res, err);
  }
}

logisticsRouter.get('/logistics/delivery-issues', requireAuth, requirePerm('logistics', 'view'), handleGetIssues);
logisticsRouter.get('/logistics/issues', requireAuth, requirePerm('logistics', 'view'), handleGetIssues);

// ==========================================
// 11. RESOLVE DELIVERY ISSUE
// ==========================================
async function handleResolveIssue(req: AuthenticatedRequest, res: any) {
  try {
    const { resolutionNotes, resolutionOutcome, retryTransit, nextAttemptDate } = req.body as {
      resolutionNotes?: string;
      resolutionOutcome?: 'Retry Delivery' | 'Reschedule Delivery' | 'Delivery Confirmed' | 'Returned to CRYO' | 'Requires Further Action';
      retryTransit?: boolean;
      nextAttemptDate?: string;
    };

    const issue = await DeliveryIssueModel.findOne({ id: req.params.id });
    if (!issue) throw new Error('NOT_FOUND:Delivery issue not found.');

    const outcome = resolutionOutcome || (retryTransit ? 'Retry Delivery' : 'Requires Further Action');
    const now = new Date().toISOString();

    issue.status = 'Resolved';
    issue.resolutionOutcome = outcome;
    issue.resolutionNotes = resolutionNotes?.trim() || 'Resolved';
    issue.resolvedBy = req.user!.name;
    issue.resolvedAt = now;
    await issue.save();

    const del = await DeliveryOrderModel.findOne({ id: issue.deliveryOrderId });
    if (del) {
      if (!del.history) del.history = [];

      if (outcome === 'Retry Delivery' || retryTransit) {
        del.status = 'In Transit';
        del.updatedAt = now;
        del.history.push({
          timestamp: now,
          action: 'Delivery Issue Resolved (Retry)',
          actorName: req.user!.name,
          details: `Issue resolved: ${issue.resolutionNotes}. Returned to In Transit for retry.`,
          status: 'In Transit',
        });
        await del.save();
      } else if (outcome === 'Reschedule Delivery') {
        del.status = 'In Transit';
        if (nextAttemptDate) del.expectedDeliveryDate = nextAttemptDate;
        del.updatedAt = now;
        del.history.push({
          timestamp: now,
          action: 'Delivery Rescheduled',
          actorName: req.user!.name,
          details: `Issue resolved: Rescheduled delivery to ${del.expectedDeliveryDate}. Notes: ${issue.resolutionNotes}.`,
          status: 'In Transit',
        });
        await del.save();
      } else if (outcome === 'Delivery Confirmed') {
        await mongoERPRepository.confirmDelivery(
          del.id,
          {
            actualDeliveryDate: now.slice(0, 10),
            receivedBy: del.customerName,
            deliveredQty: del.quantity - (del.deliveredQty || 0),
            deliveryCondition: 'Good',
            remarks: `Resolved via delivery confirmation: ${issue.resolutionNotes}`,
          },
          req.user!,
        );
      } else if (outcome === 'Returned to CRYO') {
        del.remarks = `${del.remarks ? del.remarks + ' | ' : ''}Returned to CRYO: ${issue.resolutionNotes}`;
        del.updatedAt = now;
        del.history.push({
          timestamp: now,
          action: 'Shipment Returned to CRYO',
          actorName: req.user!.name,
          details: `Products returned to CRYO facility. Condition assessment required. ${issue.resolutionNotes}`,
          status: del.status,
        });
        await del.save();
      }
    }

    res.json(issue.toObject());
  } catch (err) {
    sendError(res, err);
  }
}

logisticsRouter.post('/logistics/delivery-issues/:id/resolve', requireAuth, requirePerm('logistics', 'edit'), handleResolveIssue);
logisticsRouter.post('/logistics/issues/:id/resolve', requireAuth, requirePerm('logistics', 'edit'), handleResolveIssue);

// ==========================================
// 12. LOGISTICS REPORTS
// ==========================================
logisticsRouter.get('/logistics/reports', requireAuth, requirePerm('logistics', 'view'), async (_req: AuthenticatedRequest, res) => {
  try {
    const [deliveries, issues] = await Promise.all([
      DeliveryOrderModel.find().lean(),
      DeliveryIssueModel.find().lean(),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const ownVehicleCount = deliveries.filter((d) => d.transportMethod === 'Own Vehicle').length;
    const courierCount = deliveries.filter((d) => d.transportMethod === 'Courier').length;

    const statusCounts: Record<string, number> = {};
    for (const d of deliveries) {
      statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
    }

    const issuesByType: Record<string, number> = {};
    for (const i of issues) {
      issuesByType[i.issueType] = (issuesByType[i.issueType] || 0) + 1;
    }

    const totalDispatchedUnits = deliveries
      .filter((d) => ['In Transit', 'Dispatched', 'Partially Delivered', 'Delivered'].includes(d.status))
      .reduce((s, d) => s + d.quantity, 0);

    const totalDeliveredUnits = deliveries.reduce((s, d) => s + (d.deliveredQty || 0), 0);

    const delayedCount = deliveries.filter(
      (d) => ['Planned', 'In Transit', 'Dispatched', 'Partially Delivered'].includes(d.status) && d.expectedDeliveryDate < today,
    ).length;

    res.json({
      summary: {
        totalDeliveryOrders: deliveries.length,
        totalDispatchedUnits,
        totalDeliveredUnits,
        delayedCount,
        openIssuesCount: issues.filter((i) => i.status === 'Open').length,
        totalIssuesCount: issues.length,
      },
      transportMethodBreakdown: {
        ownVehicle: ownVehicleCount,
        courier: courierCount,
      },
      statusBreakdown: statusCounts,
      issuesByType,
    });
  } catch (err) {
    sendError(res, err);
  }
});
