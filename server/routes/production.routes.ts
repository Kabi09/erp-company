import { Router } from 'express';
import type { BOMItem, MaterialRequestItem } from '../../src/types/erp';
import { calculateDurationDays, deriveMaterialRequestStatus, getRemainingSOAllocatableQty, round2 } from '../../src/utils/erpLogic';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { addActivity, addNotification, dbStore, generateId, nextDocNo } from '../db';
import { sendError, syncSOFulfillment } from '../utils/routeUtils';

export const productionRouter = Router();

productionRouter.post('/production/orders', requireAuth, requirePerm('production', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const so = draft.salesOrders.find((s) => s.id === body.salesOrderId);
      if (!so) throw new Error('NOT_FOUND:Confirmed Sales Order not found.');
      if (so.commercialStatus !== 'Confirmed') {
        throw new Error('Cannot create production order for an unconfirmed Sales Order.');
      }
      const soItem = so.items.find((i) => i.productId === body.productId) || so.items[0];
      if (!soItem) throw new Error('Sales order has no product items.');

      const remaining = getRemainingSOAllocatableQty(so, soItem.productId, draft.productionOrders);
      const qty = Number(body.quantity);
      if (!qty || qty <= 0) throw new Error('Production quantity must be greater than zero.');
      if (qty > remaining) {
        throw new Error(
          `Cannot allocate ${qty} unit(s); only ${remaining} unit(s) remaining on ${so.docNo}.`,
        );
      }
      const duration = calculateDurationDays(body.plannedStartDate, body.plannedEndDate);
      if (duration <= 0) {
        throw new Error('Planned completion date must be on or after planned start date.');
      }

      const now = new Date().toISOString();
      const po = {
        id: generateId('po'),
        docNo: nextDocNo(draft, 'PROD'),
        salesOrderId: so.id,
        salesOrderDocNo: so.docNo,
        customerId: so.customerId,
        customerName: so.customerSnapshot.name,
        productId: soItem.productId,
        productName: soItem.productName,
        model: soItem.model,
        specifications: soItem.specifications,
        highlights: soItem.highlights,
        quantity: qty,
        plannedStartDate: body.plannedStartDate,
        plannedEndDate: body.plannedEndDate,
        plannedDurationDays: duration,
        productionInCharge: body.productionInCharge?.trim() || req.user!.name,
        assignedEmployees: Array.isArray(body.assignedEmployees) ? body.assignedEmployees : [],
        priority: body.priority || so.priority,
        instructions: body.instructions?.trim() || '',
        status: 'Planned' as const,
        completedManufacturingQty: 0,
        serialNumbers: [],
        qcAcceptedQty: 0,
        qcRejectedQty: 0,
        dispatchedQty: 0,
        deliveredQty: 0,
        createdBy: req.user!.name,
        createdAt: now,
        updatedAt: now,
      };
      draft.productionOrders.unshift(po);
      syncSOFulfillment(draft, so.id);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Created Production Order',
        entityType: 'ProductionOrder',
        entityId: po.id,
        entityDocNo: po.docNo,
        details: `Scheduled ${po.docNo} for ${qty}x ${po.productName} (${so.docNo}), duration ${duration} days.`,
      });
      return po;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/boms', requireAuth, requirePerm('production', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const { productionOrderId, items, sendRequest } = req.body as {
      productionOrderId: string;
      items: Array<{ materialId: string; qtyPerUnit: number; remarks?: string }>;
      sendRequest?: boolean;
    };
    const result = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Add at least one raw material to the BOM.');
      }
      const existingBom = draft.boms.find((b) => b.productionOrderId === po.id);
      if (existingBom && existingBom.requestSent) {
        throw new Error(`BOM ${existingBom.docNo} has already been submitted to Supply Chain.`);
      }

      const bomItems: BOMItem[] = items.map((it) => {
        const mat = draft.materials.find((m) => m.id === it.materialId);
        if (!mat) throw new Error('Invalid material in BOM.');
        const perUnit = Number(it.qtyPerUnit);
        if (!perUnit || perUnit <= 0) throw new Error(`Quantity per unit for ${mat.name} must be positive.`);
        return {
          materialId: mat.id,
          materialCode: mat.code,
          materialName: mat.name,
          unit: mat.unit,
          qtyPerUnit: perUnit,
          totalRequiredQty: round2(perUnit * po.quantity),
          remarks: it.remarks?.trim() || undefined,
        };
      });

      const now = new Date().toISOString();
      let bom = existingBom;
      if (bom) {
        bom.items = bomItems;
        bom.updatedAt = now;
      } else {
        bom = {
          id: generateId('bom'),
          docNo: nextDocNo(draft, 'BOM'),
          productionOrderId: po.id,
          productionOrderDocNo: po.docNo,
          productName: `${po.productName} (${po.model})`,
          productionQty: po.quantity,
          items: bomItems,
          requestSent: false,
          createdBy: req.user!.name,
          createdAt: now,
          updatedAt: now,
        };
        draft.boms.unshift(bom);
      }

      if (sendRequest) {
        const mrItems: MaterialRequestItem[] = bom.items.map((bi) => ({
          materialId: bi.materialId,
          materialCode: bi.materialCode,
          materialName: bi.materialName,
          unit: bi.unit,
          requiredQty: bi.totalRequiredQty,
          issuedQty: 0,
          receivedQty: 0,
        }));
        const mr = {
          id: generateId('mr'),
          docNo: nextDocNo(draft, 'MR'),
          bomId: bom.id,
          bomDocNo: bom.docNo,
          productionOrderId: po.id,
          productionOrderDocNo: po.docNo,
          salesOrderId: po.salesOrderId,
          salesOrderDocNo: po.salesOrderDocNo,
          productName: bom.productName,
          priority: po.priority,
          items: mrItems,
          status: 'Pending' as const,
          receiptStatus: 'Pending' as const,
          requestedBy: req.user!.name,
          requestDate: now.slice(0, 10),
          createdAt: now,
          updatedAt: now,
        };
        draft.materialRequests.unshift(mr);
        bom.requestSent = true;
        bom.materialRequestId = mr.id;
        bom.materialRequestDocNo = mr.docNo;
        po.status = 'Awaiting Materials';
        po.updatedAt = now;

        addNotification(draft, {
          title: `New BOM Material Request: ${mr.docNo}`,
          message: `${po.docNo} (${bom.productName}) requires ${mrItems.length} material line(s).`,
          department: 'supply_chain',
          severity: po.priority === 'Urgent' ? 'warning' : 'info',
          link: '/supply-chain/material-requests',
        });
        addActivity(draft, {
          actorId: req.user!.id,
          actorName: req.user!.name,
          department: 'production',
          action: 'Submitted BOM Material Request',
          entityType: 'MaterialRequest',
          entityId: mr.id,
          entityDocNo: mr.docNo,
          details: `Sent ${mr.docNo} (${bom.docNo}) for ${po.docNo} to Supply Chain.`,
        });
      }

      return bom;
    });
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/boms/:id/send-request', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const result = dbStore.mutate((draft) => {
      const bom = draft.boms.find((b) => b.id === req.params.id);
      if (!bom) throw new Error('NOT_FOUND:BOM not found.');
      if (bom.requestSent) throw new Error('Material request already sent for this BOM.');
      const po = draft.productionOrders.find((p) => p.id === bom.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      const now = new Date().toISOString();
      const mr = {
        id: generateId('mr'),
        docNo: nextDocNo(draft, 'MR'),
        bomId: bom.id,
        bomDocNo: bom.docNo,
        productionOrderId: po.id,
        productionOrderDocNo: po.docNo,
        salesOrderId: po.salesOrderId,
        salesOrderDocNo: po.salesOrderDocNo,
        productName: bom.productName,
        priority: po.priority,
        items: bom.items.map((bi) => ({
          materialId: bi.materialId,
          materialCode: bi.materialCode,
          materialName: bi.materialName,
          unit: bi.unit,
          requiredQty: bi.totalRequiredQty,
          issuedQty: 0,
          receivedQty: 0,
        })),
        status: 'Pending' as const,
        receiptStatus: 'Pending' as const,
        requestedBy: req.user!.name,
        requestDate: now.slice(0, 10),
        createdAt: now,
        updatedAt: now,
      };
      draft.materialRequests.unshift(mr);
      bom.requestSent = true;
      bom.materialRequestId = mr.id;
      bom.materialRequestDocNo = mr.docNo;
      po.status = 'Awaiting Materials';
      po.updatedAt = now;
      addNotification(draft, {
        title: `New BOM Material Request: ${mr.docNo}`,
        message: `${po.docNo} (${bom.productName}) requires materials from store.`,
        department: 'supply_chain',
        severity: 'info',
        link: '/supply-chain/material-requests',
      });
      return mr;
    });
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/material-receipts/:issueId/acknowledge', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { discrepancyNotes } = req.body as { discrepancyNotes?: string };
    const updated = dbStore.mutate((draft) => {
      const mi = draft.materialIssues.find((x) => x.id === req.params.issueId);
      if (!mi) throw new Error('NOT_FOUND:Material issue record not found.');
      if (mi.receiptAcknowledged) {
        throw new Error(`Material issue ${mi.docNo} receipt has already been acknowledged.`);
      }
      const mr = draft.materialRequests.find((m) => m.id === mi.materialRequestId);
      if (!mr) throw new Error('NOT_FOUND:Linked material request not found.');

      const now = new Date().toISOString();
      for (const ii of mi.items) {
        ii.receivedQty = ii.issuedQty;
        const mrItem = mr.items.find((x) => x.materialId === ii.materialId);
        if (mrItem) {
          mrItem.receivedQty = round2(Math.min(mrItem.issuedQty, mrItem.receivedQty + ii.receivedQty));
        }
      }
      mi.receiptAcknowledged = true;
      mi.acknowledgedBy = req.user!.name;
      mi.acknowledgedAt = now;
      if (discrepancyNotes?.trim()) mi.receiptDiscrepancyNotes = discrepancyNotes.trim();

      const derived = deriveMaterialRequestStatus(mr);
      mr.status = derived.status;
      mr.receiptStatus = derived.receiptStatus;
      mr.updatedAt = now;

      const po = draft.productionOrders.find((p) => p.id === mi.productionOrderId);
      if (po && po.status === 'Awaiting Materials' && mr.receiptStatus === 'Fully Received') {
        po.status = 'Ready to Start';
        po.updatedAt = now;
        addNotification(draft, {
          title: `${po.docNo} Ready to Start Production`,
          message: `All BOM materials for ${po.docNo} (${po.productName}) have been received by Production.`,
          department: 'production',
          severity: 'success',
          link: `/production/orders/${po.id}`,
        });
      }

      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Acknowledged Material Receipt',
        entityType: 'MaterialIssue',
        entityId: mi.id,
        entityDocNo: mi.docNo,
        details: `Confirmed physical receipt of ${mi.docNo} for ${mi.productionOrderDocNo}.`,
      });
      return mi;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/orders/:id/start', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === req.params.id);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'Ready to Start') {
        throw new Error(`Cannot start production when order status is "${po.status}". All required materials must be received first.`);
      }
      const now = new Date().toISOString();
      po.actualStartDate = body.actualStartDate || now.slice(0, 10);
      if (body.productionInCharge?.trim()) po.productionInCharge = body.productionInCharge.trim();
      if (Array.isArray(body.assignedEmployees) && body.assignedEmployees.length > 0) {
        po.assignedEmployees = body.assignedEmployees;
      }
      po.status = 'In Progress';
      po.updatedAt = now;
      syncSOFulfillment(draft, po.salesOrderId);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Started Production',
        entityType: 'ProductionOrder',
        entityId: po.id,
        entityDocNo: po.docNo,
        details: `Started manufacturing ${po.docNo} on ${po.actualStartDate}.`,
      });
      return po;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/daily-updates', requireAuth, requirePerm('production', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.productionOrderId || !body.stage?.trim() || !body.workCompleted?.trim()) {
      throw new Error('Production order, process stage, and work completed description are required.');
    }
    const created = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === body.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'In Progress' && po.status !== 'Rework') {
        throw new Error(`Daily updates can only be added for Active or Rework orders (current: ${po.status}).`);
      }
      const now = new Date().toISOString();
      const du = {
        id: generateId('du'),
        productionOrderId: po.id,
        productionOrderDocNo: po.docNo,
        workDate: body.workDate || now.slice(0, 10),
        stage: body.stage.trim(),
        workCompleted: body.workCompleted.trim(),
        completedQty: Math.min(po.quantity, Math.max(0, Number(body.completedQty) || 0)),
        workHours: Math.max(0, Number(body.workHours) || 0),
        stageStatus: body.stageStatus || 'In Progress',
        issues: body.issues?.trim() || '',
        remarks: body.remarks?.trim() || '',
        photoName: body.photoName || undefined,
        photoDataUrl: body.photoDataUrl || undefined,
        employeeName: req.user!.name,
        createdAt: now,
      };
      draft.dailyUpdates.unshift(du);
      po.updatedAt = now;
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Logged Daily Update',
        entityType: 'ProductionOrder',
        entityId: po.id,
        entityDocNo: po.docNo,
        details: `${du.stage} (${du.stageStatus}): ${du.workCompleted.slice(0, 80)}`,
      });
      return du;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/orders/:id/complete-manufacturing', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === req.params.id);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'In Progress') {
        throw new Error('Only orders In Progress can be marked manufacturing completed.');
      }
      const hasUpdates = draft.dailyUpdates.some((d) => d.productionOrderId === po.id);
      if (!hasUpdates) {
        throw new Error('Record at least one daily production update before completing manufacturing.');
      }
      const qty = Number(body.completedQty ?? po.quantity);
      if (!qty || qty <= 0 || qty > po.quantity) {
        throw new Error(`Completed quantity must be between 1 and ${po.quantity}.`);
      }
      const serials = Array.isArray(body.serialNumbers)
        ? body.serialNumbers.map((s: string) => s.trim()).filter(Boolean)
        : typeof body.serialNumbers === 'string'
          ? body.serialNumbers.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];

      const now = new Date().toISOString();
      po.completedManufacturingQty = qty;
      po.actualCompletionDate = body.actualCompletionDate || now.slice(0, 10);
      po.serialNumbers =
        serials.length > 0
          ? serials
          : Array.from({ length: qty }, (_, idx) => `CRYO-${po.model.replace(/[^A-Z0-9]/gi, '')}-${po.docNo.slice(-3)}${idx + 1}`);
      po.status = 'QC Pending';
      po.updatedAt = now;
      syncSOFulfillment(draft, po.salesOrderId);

      addNotification(draft, {
        title: `Quality Check Pending: ${po.docNo}`,
        message: `Manufacturing finished for ${po.docNo} (${qty}x ${po.productName}). Ready for QC inspection.`,
        department: 'production',
        severity: 'warning',
        link: '/production/quality-check',
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Completed Manufacturing',
        entityType: 'ProductionOrder',
        entityId: po.id,
        entityDocNo: po.docNo,
        details: `Completed manufacturing of ${qty} unit(s) (${po.serialNumbers.join(', ')}). Moved to QC Pending.`,
      });
      return po;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/quality-checks', requireAuth, requirePerm('production', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === body.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'QC Pending') {
        throw new Error(`Order ${po.docNo} is not in QC Pending state (current: ${po.status}).`);
      }
      const remainingToAccept = po.quantity - po.qcAcceptedQty;
      if (remainingToAccept <= 0) {
        throw new Error('All units on this production order have already passed QC.');
      }

      const finalResult = body.finalResult === 'Accepted' ? 'Accepted' : 'Rejected';
      if (finalResult === 'Rejected' && !body.rejectionReason?.trim()) {
        throw new Error('Rejection reason is required when rejecting in Quality Check.');
      }

      const prevAttempts = draft.qualityChecks.filter((q) => q.productionOrderId === po.id).length;
      const now = new Date().toISOString();
      const qcId = generateId('qc');
      const qcDocNo = nextDocNo(draft, 'QC');
      const acceptedQty = finalResult === 'Accepted' ? remainingToAccept : 0;
      const rejectedQty = finalResult === 'Rejected' ? remainingToAccept : 0;

      let reworkId: string | undefined;
      let reworkDocNo: string | undefined;

      if (finalResult === 'Rejected') {
        reworkId = generateId('rw');
        reworkDocNo = nextDocNo(draft, 'RW');
        draft.reworkOrders.unshift({
          id: reworkId,
          docNo: reworkDocNo,
          productionOrderId: po.id,
          productionOrderDocNo: po.docNo,
          qcId,
          qcDocNo,
          affectedQty: rejectedQty,
          affectedSerialNumbers: po.serialNumbers,
          rejectionReason: body.rejectionReason.trim(),
          requiredCorrection: body.requiredCorrection?.trim() || body.rejectionReason.trim(),
          assignedEmployee: body.assignedEmployee?.trim() || po.assignedEmployees[0] || po.productionInCharge,
          expectedCompletionDate: body.expectedCompletionDate || now.slice(0, 10),
          status: 'Open',
          remarks: body.remarks?.trim() || '',
          createdBy: req.user!.name,
          createdAt: now,
          updatedAt: now,
        });
        po.status = 'Rework';
        po.qcRejectedQty = rejectedQty;
        addNotification(draft, {
          title: `QC Rejected: ${po.docNo} (${qcDocNo})`,
          message: `Rework ${reworkDocNo} created — Reason: ${body.rejectionReason.trim()}`,
          department: 'production',
          severity: 'error',
          link: '/production/rework',
        });
      } else {
        po.qcAcceptedQty = round2(po.qcAcceptedQty + acceptedQty);
        po.qcRejectedQty = 0;
        po.status = 'Completed';
        addNotification(draft, {
          title: `Ready for Dispatch: ${po.docNo}`,
          message: `${po.quantity}x ${po.productName} for ${po.customerName} passed QC (${qcDocNo}) and is ready for dispatch.`,
          department: 'logistics',
          severity: 'success',
          link: '/logistics/ready',
        });
      }

      const qc = {
        id: qcId,
        docNo: qcDocNo,
        attemptNumber: prevAttempts + 1,
        productionOrderId: po.id,
        productionOrderDocNo: po.docNo,
        productName: `${po.productName} (${po.model})`,
        inspectedQty: remainingToAccept,
        acceptedQty,
        rejectedQty,
        serialNumbers: po.serialNumbers,
        inspectionDate: body.inspectionDate || now.slice(0, 10),
        inspector: body.inspector?.trim() || req.user!.name,
        checks: Array.isArray(body.checks) ? body.checks : [],
        finalResult: finalResult as 'Accepted' | 'Rejected',
        rejectionReason: finalResult === 'Rejected' ? body.rejectionReason.trim() : undefined,
        reworkId,
        reworkDocNo,
        remarks: body.remarks?.trim() || '',
        reportName: body.reportName || undefined,
        reportDataUrl: body.reportDataUrl || undefined,
        createdAt: now,
      };
      draft.qualityChecks.unshift(qc);
      po.updatedAt = now;
      syncSOFulfillment(draft, po.salesOrderId);

      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: `QC ${finalResult}`,
        entityType: 'QualityCheck',
        entityId: qc.id,
        entityDocNo: qc.docNo,
        details: `${qc.docNo} (Attempt #${qc.attemptNumber}) for ${po.docNo}: ${finalResult}.`,
      });
      return qc;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/rework/:id/complete', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { completedWork, remarks, assignedEmployee } = req.body as {
      completedWork: string;
      remarks?: string;
      assignedEmployee?: string;
    };
    if (!completedWork?.trim()) throw new Error('Completed corrective work description is required.');
    const updated = dbStore.mutate((draft) => {
      const rw = draft.reworkOrders.find((r) => r.id === req.params.id);
      if (!rw) throw new Error('NOT_FOUND:Rework order not found.');
      if (rw.status === 'Reinspection' || rw.status === 'Completed') {
        throw new Error('This rework has already been sent back for QC reinspection.');
      }
      const po = draft.productionOrders.find((p) => p.id === rw.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      const now = new Date().toISOString();
      rw.completedWork = completedWork.trim();
      if (assignedEmployee?.trim()) rw.assignedEmployee = assignedEmployee.trim();
      if (remarks?.trim()) rw.remarks = remarks.trim();
      rw.actualCompletionDate = now.slice(0, 10);
      rw.status = 'Reinspection';
      rw.updatedAt = now;

      po.status = 'QC Pending';
      po.updatedAt = now;
      syncSOFulfillment(draft, po.salesOrderId);

      addNotification(draft, {
        title: `Rework Complete — Reinspection Required (${po.docNo})`,
        message: `${rw.docNo} completed. ${po.docNo} returned to Quality Check queue.`,
        department: 'production',
        severity: 'warning',
        link: '/production/quality-check',
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Completed Rework',
        entityType: 'ReworkOrder',
        entityId: rw.id,
        entityDocNo: rw.docNo,
        details: `Completed rework ${rw.docNo} for ${po.docNo}. Sent back to QC for reinspection.`,
      });
      return rw;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});
