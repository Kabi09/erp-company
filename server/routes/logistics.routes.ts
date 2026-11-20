import { Router } from 'express';
import { getAvailableDispatchQty, round2 } from '../../src/utils/erpLogic';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { addActivity, addNotification, dbStore, generateId, nextDocNo } from '../db';
import { sendError, syncSOFulfillment } from '../utils/routeUtils';

export const logisticsRouter = Router();

logisticsRouter.post('/logistics/delivery-orders', requireAuth, requirePerm('logistics', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === body.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'Completed' || po.qcAcceptedQty <= 0) {
        throw new Error('Only QC-accepted Completed production orders can be dispatched.');
      }
      const available = getAvailableDispatchQty(po, draft.deliveryOrders);
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

      const so = draft.salesOrders.find((s) => s.id === po.salesOrderId);
      const now = new Date().toISOString();
      const del = {
        id: generateId('del'),
        docNo: nextDocNo(draft, 'DEL'),
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
      draft.deliveryOrders.unshift(del);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'logistics',
        action: 'Created Delivery Order',
        entityType: 'DeliveryOrder',
        entityId: del.id,
        entityDocNo: del.docNo,
        details: `Created ${del.docNo} (${transportMethod}) for ${qty}x ${del.productName}.`,
      });
      return del;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

logisticsRouter.post('/logistics/delivery-orders/:id/dispatch', requireAuth, requirePerm('logistics', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const del = draft.deliveryOrders.find((d) => d.id === req.params.id);
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

      const po = draft.productionOrders.find((p) => p.id === del.productionOrderId);
      if (po && wasPlanned) {
        po.dispatchedQty = round2(po.dispatchedQty + del.quantity);
        po.updatedAt = now;
      }
      syncSOFulfillment(draft, del.salesOrderId);

      addNotification(draft, {
        title: `Dispatched: ${del.docNo} (${del.salesOrderDocNo})`,
        message: `${del.quantity}x ${del.productName} for ${del.customerName} is now In Transit via ${del.transportMethod}.`,
        department: 'sales',
        severity: 'info',
        link: `/tracking/${del.salesOrderId}`,
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'logistics',
        action: 'Confirmed Dispatch',
        entityType: 'DeliveryOrder',
        entityId: del.id,
        entityDocNo: del.docNo,
        details: `Dispatched ${del.docNo} (Challan: ${del.deliveryChallanNo}) — In Transit.`,
      });
      return del;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

logisticsRouter.post('/logistics/delivery-orders/:id/deliver', requireAuth, requirePerm('logistics', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const del = draft.deliveryOrders.find((d) => d.id === req.params.id);
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
        draft.deliveryIssues.unshift({
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
          status: 'Open',
          createdAt: now,
        });
        addActivity(draft, {
          actorId: req.user!.id,
          actorName: req.user!.name,
          department: 'logistics',
          action: 'Logged Delivery Issue',
          entityType: 'DeliveryOrder',
          entityId: del.id,
          entityDocNo: del.docNo,
          details: `Delivery issue on ${del.docNo}: ${body.issueReason.trim()}`,
        });
        return del;
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

      const po = draft.productionOrders.find((p) => p.id === del.productionOrderId);
      if (po) {
        po.deliveredQty = round2(po.deliveredQty + delta);
        po.updatedAt = now;
      }
      syncSOFulfillment(draft, del.salesOrderId);

      addNotification(draft, {
        title: `Delivered: ${del.docNo} (${del.salesOrderDocNo})`,
        message: `${del.deliveredQty}x ${del.productName} delivered to ${del.customerName} (Received by ${del.receivedBy}).`,
        department: 'sales',
        severity: 'success',
        link: `/tracking/${del.salesOrderId}`,
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'logistics',
        action: 'Confirmed Delivery',
        entityType: 'DeliveryOrder',
        entityId: del.id,
        entityDocNo: del.docNo,
        details: `Confirmed delivery of ${del.deliveredQty}/${del.quantity} units for ${del.salesOrderDocNo} (Received by ${del.receivedBy}).`,
      });
      return del;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

logisticsRouter.post('/logistics/delivery-issues/:id/resolve', requireAuth, requirePerm('logistics', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { resolutionNotes, retryTransit } = req.body as { resolutionNotes?: string; retryTransit?: boolean };
    const updated = dbStore.mutate((draft) => {
      const issue = draft.deliveryIssues.find((i) => i.id === req.params.id);
      if (!issue) throw new Error('NOT_FOUND:Delivery issue not found.');
      issue.status = 'Resolved';
      issue.resolutionNotes = resolutionNotes?.trim() || 'Resolved';
      if (retryTransit) {
        const del = draft.deliveryOrders.find((d) => d.id === issue.deliveryOrderId);
        if (del && del.status === 'Issue') {
          del.status = 'In Transit';
          del.updatedAt = new Date().toISOString();
        }
      }
      return issue;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});
