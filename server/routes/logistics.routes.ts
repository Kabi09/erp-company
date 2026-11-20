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

// --- Phase 3: Paginated Delivery Orders ---
logisticsRouter.get('/logistics/delivery-orders', requireAuth, requirePerm('logistics', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedDeliveryOrders(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Logistics Dashboard Summary ---
logisticsRouter.get('/logistics/summary', requireAuth, requirePerm('logistics', 'view'), async (_req: AuthenticatedRequest, res) => {
  try {
    const summary = await mongoERPRepository.getLogisticsSummary();
    res.json(summary);
  } catch (err) {
    sendError(res, err);
  }
});

logisticsRouter.post('/logistics/delivery-orders', requireAuth, requirePerm('logistics', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const po = await ProductionOrderModel.findOne({ id: body.productionOrderId });
    if (!po) throw new Error('NOT_FOUND:Production order not found.');
    if (po.status !== 'Completed' || po.qcAcceptedQty <= 0) {
      throw new Error('Only QC-accepted Completed production orders can be dispatched.');
    }

    const existingDeliveries = await DeliveryOrderModel.find({ productionOrderId: po.id }).lean();
    const available = getAvailableDispatchQty(po.toObject() as any, existingDeliveries as any);
    const qty = Number(body.quantity);
    if (!qty || qty <= 0 || qty > available) {
      throw new Error(`Delivery quantity must be between 1 and ${available} (available QC-approved units).`);
    }

    const transportMethod = body.transportMethod === 'Courier' ? 'Courier' : 'Own Vehicle';
    if (transportMethod === 'Own Vehicle') {
      if (!body.vehicleNumber?.trim() || !body.driverName?.trim() || !body.driverPhone?.trim()) {
        throw new Error('Vehicle number, driver name, and driver phone are required for Own Vehicle.');
      }
    } else {
      if (!body.courierCompany?.trim()) {
        throw new Error('Courier company name is required for Courier transport.');
      }
    }

    const so = await SalesOrderModel.findOne({ id: po.salesOrderId }).lean();
    const docNo = await mongoERPRepository.getNextDocNo('DEL');
    const now = new Date().toISOString();

    const del = {
      id: generateId('del'),
      docNo,
      salesOrderId: po.salesOrderId,
      salesOrderDocNo: po.salesOrderDocNo,
      productionOrderId: po.id,
      productionOrderDocNo: po.docNo,
      customerId: po.customerId,
      customerName: po.customerName,
      productName: `${po.productName} (${po.model})`,
      quantity: qty,
      serialNumbers: Array.isArray(body.serialNumbers) && body.serialNumbers.length > 0
        ? body.serialNumbers
        : po.serialNumbers.slice(0, qty),
      deliveryAddress: body.deliveryAddress?.trim() || so?.deliveryAddress || '',
      transportMethod: transportMethod as 'Own Vehicle' | 'Courier',
      vehicleNumber: transportMethod === 'Own Vehicle' ? body.vehicleNumber.trim() : undefined,
      driverName: transportMethod === 'Own Vehicle' ? body.driverName.trim() : undefined,
      driverPhone: transportMethod === 'Own Vehicle' ? body.driverPhone.trim() : undefined,
      courierCompany: transportMethod === 'Courier' ? body.courierCompany.trim() : undefined,
      trackingNumber: transportMethod === 'Courier' ? body.trackingNumber?.trim() || '' : undefined,
      courierContact: transportMethod === 'Courier' ? body.courierContact?.trim() || '' : undefined,
      plannedDispatchDate: body.plannedDispatchDate || now.slice(0, 10),
      expectedDeliveryDate: body.expectedDeliveryDate || now.slice(0, 10),
      deliveredQty: 0,
      status: 'Planned' as const,
      remarks: body.remarks?.trim() || '',
      createdBy: req.user!.name,
      createdAt: now,
      updatedAt: now,
    };

    await DeliveryOrderModel.create(del);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'logistics',
      action: 'Created Delivery Order',
      entityType: 'DeliveryOrder',
      entityId: del.id,
      entityDocNo: del.docNo,
      details: `Created ${del.docNo} (${transportMethod}) for ${qty}x ${del.productName}.`,
    });

    res.status(201).json(del);
  } catch (err) {
    sendError(res, err);
  }
});

logisticsRouter.post('/logistics/delivery-orders/:id/dispatch', requireAuth, requirePerm('logistics', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const del = await DeliveryOrderModel.findOne({ id: req.params.id });
    if (!del) throw new Error('NOT_FOUND:Delivery order not found.');
    if (del.status !== 'Planned' && del.status !== 'Issue') {
      throw new Error(`Delivery order ${del.docNo} cannot be dispatched from status "${del.status}".`);
    }
    if (!body.deliveryChallanNo?.trim()) {
      throw new Error('Delivery challan number is required to confirm dispatch.');
    }
    if (del.transportMethod === 'Courier' && !(body.trackingNumber?.trim() || del.trackingNumber?.trim())) {
      throw new Error('Tracking / AWB number is required at dispatch for Courier shipments.');
    }

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
    await del.save();

    const po = await ProductionOrderModel.findOne({ id: del.productionOrderId });
    if (po && wasPlanned) {
      po.dispatchedQty = round2(po.dispatchedQty + del.quantity);
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

logisticsRouter.post('/logistics/delivery-orders/:id/deliver', requireAuth, requirePerm('logistics', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const del = await DeliveryOrderModel.findOne({ id: req.params.id });
    if (!del) throw new Error('NOT_FOUND:Delivery order not found.');
    if (del.status === 'Delivered') {
      throw new Error(`Delivery ${del.docNo} has already been confirmed delivered.`);
    }
    if (del.status !== 'In Transit' && del.status !== 'Dispatched' && del.status !== 'Partially Delivered') {
      throw new Error(`Delivery must be In Transit before confirming delivery (current: ${del.status}).`);
    }
    const now = new Date().toISOString();

    if (body.result === 'Delivery Issue' || body.deliveryCondition === 'Damaged') {
      if (!body.issueReason?.trim()) throw new Error('Issue reason is required when recording a delivery issue.');
      del.status = 'Issue';
      del.deliveryCondition = body.deliveryCondition || 'Damaged';
      del.deliveryRemarks = body.remarks?.trim() || '';
      del.updatedAt = now;
      await del.save();

      const issue = {
        id: generateId('di'),
        deliveryOrderId: del.id,
        deliveryOrderDocNo: del.docNo,
        salesOrderDocNo: del.salesOrderDocNo,
        customerName: del.customerName,
        issueType: body.issueType || (body.deliveryCondition === 'Damaged' ? 'Damage' : 'Failed Attempt'),
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
    const deliveredNow = Number(body.deliveredQty ?? del.quantity);
    if (!deliveredNow || deliveredNow <= 0 || deliveredNow > del.quantity) {
      throw new Error(`Delivered quantity must be between 1 and ${del.quantity}.`);
    }

    const prevDelivered = del.deliveredQty || 0;
    const newDelivered = round2(Math.min(del.quantity, prevDelivered + deliveredNow));
    const delta = round2(newDelivered - prevDelivered);

    del.actualDeliveryDate = body.deliveryDate || now.slice(0, 10);
    del.receivedBy = body.receivedBy.trim();
    del.deliveredQty = newDelivered;
    del.deliveryCondition = 'Good';
    del.podName = body.podName || undefined;
    del.podDataUrl = body.podDataUrl || undefined;
    del.deliveryRemarks = body.remarks?.trim() || '';
    del.status = newDelivered >= del.quantity ? 'Delivered' : 'Partially Delivered';
    del.updatedAt = now;
    await del.save();

    const po = await ProductionOrderModel.findOne({ id: del.productionOrderId });
    if (po) {
      po.deliveredQty = round2(po.deliveredQty + delta);
      po.updatedAt = now;
      await po.save();
    }

    await syncSalesOrderFulfillmentMongo(del.salesOrderId);

    await mongoERPRepository.addNotification({
      title: `Delivered: ${del.docNo} (${del.salesOrderDocNo})`,
      message: `${del.deliveredQty}x ${del.productName} delivered to ${del.customerName} (Received by ${del.receivedBy}).`,
      department: 'sales',
      severity: 'success',
      link: `/tracking/${del.salesOrderId}`,
    });

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'logistics',
      action: 'Confirmed Delivery',
      entityType: 'DeliveryOrder',
      entityId: del.id,
      entityDocNo: del.docNo,
      details: `Confirmed delivery of ${del.deliveredQty}/${del.quantity} units for ${del.salesOrderDocNo} (Received by ${del.receivedBy}).`,
    });

    res.json(del.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

logisticsRouter.post('/logistics/delivery-issues/:id/resolve', requireAuth, requirePerm('logistics', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { resolutionNotes, retryTransit } = req.body as { resolutionNotes?: string; retryTransit?: boolean };
    const issue = await DeliveryIssueModel.findOne({ id: req.params.id });
    if (!issue) throw new Error('NOT_FOUND:Delivery issue not found.');

    issue.status = 'Resolved';
    issue.resolutionNotes = resolutionNotes?.trim() || 'Resolved';
    await issue.save();

    if (retryTransit) {
      const del = await DeliveryOrderModel.findOne({ id: issue.deliveryOrderId });
      if (del && del.status === 'Issue') {
        del.status = 'In Transit';
        del.updatedAt = new Date().toISOString();
        await del.save();
      }
    }

    res.json(issue.toObject());
  } catch (err) {
    sendError(res, err);
  }
});
