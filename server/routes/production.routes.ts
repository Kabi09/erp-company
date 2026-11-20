import { Router } from 'express';
import type { BOMItem, MaterialRequestItem } from '../../src/types/erp';
import {
  calculateDurationDays,
  deriveMaterialRequestStatus,
  getRemainingSOAllocatableQty,
  round2,
} from '../../src/utils/erpLogic';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  BOMModel,
  DailyProductionUpdateModel,
  MaterialIssueModel,
  MaterialModel,
  MaterialRequestModel,
  ProductionOrderModel,
  QualityCheckModel,
  ReworkOrderModel,
  SalesOrderModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { generateId, sendError, syncSalesOrderFulfillmentMongo } from '../utils/routeUtils';

export const productionRouter = Router();

// --- Phase 3: Paginated Production Orders ---
productionRouter.get('/production/orders', requireAuth, requirePerm('production', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedProductionOrders(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Production Dashboard Summary ---
productionRouter.get('/production/summary', requireAuth, requirePerm('production', 'view'), async (_req: AuthenticatedRequest, res) => {
  try {
    const summary = await mongoERPRepository.getProductionSummary();
    res.json(summary);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/orders', requireAuth, requirePerm('production', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const so = await SalesOrderModel.findOne({ id: body.salesOrderId });
    if (!so) throw new Error('NOT_FOUND:Confirmed Sales Order not found.');
    if (so.commercialStatus !== 'Confirmed') {
      throw new Error('Cannot create production order for an unconfirmed Sales Order.');
    }
    const soItem = so.items.find((i) => i.productId === body.productId) || so.items[0];
    if (!soItem) throw new Error('Sales order has no product items.');

    const existingPOs = await ProductionOrderModel.find({ salesOrderId: so.id }).lean();
    const remaining = getRemainingSOAllocatableQty(so.toObject() as any, soItem.productId, existingPOs as any);
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
    const docNo = await mongoERPRepository.getNextDocNo('PROD');
    const po = {
      id: generateId('po'),
      docNo,
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

    await ProductionOrderModel.create(po);
    await syncSalesOrderFulfillmentMongo(so.id);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'production',
      action: 'Created Production Order',
      entityType: 'ProductionOrder',
      entityId: po.id,
      entityDocNo: po.docNo,
      details: `Scheduled ${po.docNo} for ${qty}x ${po.productName} (${so.docNo}), duration ${duration} days.`,
    });

    res.status(201).json(po);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/boms', requireAuth, requirePerm('production', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { productionOrderId, items, sendRequest } = req.body as {
      productionOrderId: string;
      items: Array<{ materialId: string; qtyPerUnit: number; remarks?: string }>;
      sendRequest?: boolean;
    };
    const po = await ProductionOrderModel.findOne({ id: productionOrderId });
    if (!po) throw new Error('NOT_FOUND:Production order not found.');
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Add at least one raw material to the BOM.');
    }
    const existingBom = await BOMModel.findOne({ productionOrderId: po.id });
    if (existingBom && existingBom.requestSent) {
      throw new Error(`BOM ${existingBom.docNo} has already been submitted to Supply Chain.`);
    }

    const allMaterials = await MaterialModel.find().lean();
    const materialMap = new Map(allMaterials.map((m) => [m.id, m]));

    const bomItems: BOMItem[] = items.map((it) => {
      const mat = materialMap.get(it.materialId);
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
    let bomDoc: any;

    if (existingBom) {
      existingBom.items = bomItems;
      existingBom.updatedAt = now;
      await existingBom.save();
      bomDoc = existingBom.toObject();
    } else {
      const docNo = await mongoERPRepository.getNextDocNo('BOM');
      const bom = {
        id: generateId('bom'),
        docNo,
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
      await BOMModel.create(bom);
      bomDoc = bom;
    }

    if (sendRequest) {
      const mrItems: MaterialRequestItem[] = bomItems.map((bi) => ({
        materialId: bi.materialId,
        materialCode: bi.materialCode,
        materialName: bi.materialName,
        unit: bi.unit,
        requiredQty: bi.totalRequiredQty,
        issuedQty: 0,
        receivedQty: 0,
      }));
      const mrDocNo = await mongoERPRepository.getNextDocNo('MR');
      const mr = {
        id: generateId('mr'),
        docNo: mrDocNo,
        bomId: bomDoc.id,
        bomDocNo: bomDoc.docNo,
        productionOrderId: po.id,
        productionOrderDocNo: po.docNo,
        salesOrderId: po.salesOrderId,
        salesOrderDocNo: po.salesOrderDocNo,
        productName: bomDoc.productName,
        priority: po.priority,
        items: mrItems,
        status: 'Pending' as const,
        receiptStatus: 'Pending' as const,
        requestedBy: req.user!.name,
        requestDate: now.slice(0, 10),
        createdAt: now,
        updatedAt: now,
      };

      await MaterialRequestModel.create(mr);

      await BOMModel.updateOne(
        { id: bomDoc.id },
        { $set: { requestSent: true, materialRequestId: mr.id, materialRequestDocNo: mr.docNo } },
      );
      po.status = 'Awaiting Materials';
      po.updatedAt = now;
      await po.save();

      bomDoc.requestSent = true;
      bomDoc.materialRequestId = mr.id;
      bomDoc.materialRequestDocNo = mr.docNo;

      await mongoERPRepository.addNotification({
        title: `New BOM Material Request: ${mr.docNo}`,
        message: `${po.docNo} (${bomDoc.productName}) requires ${mrItems.length} material line(s).`,
        department: 'supply_chain',
        severity: po.priority === 'Urgent' ? 'warning' : 'info',
        link: '/supply-chain/material-requests',
      });
      await mongoERPRepository.addActivity({
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Submitted BOM Material Request',
        entityType: 'MaterialRequest',
        entityId: mr.id,
        entityDocNo: mr.docNo,
        details: `Sent ${mr.docNo} (${bomDoc.docNo}) for ${po.docNo} to Supply Chain.`,
      });
    }

    res.status(201).json(bomDoc);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/boms/:id/send-request', requireAuth, requirePerm('production', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const bom = await BOMModel.findOne({ id: req.params.id });
    if (!bom) throw new Error('NOT_FOUND:BOM not found.');
    if (bom.requestSent) throw new Error('Material request already sent for this BOM.');
    const po = await ProductionOrderModel.findOne({ id: bom.productionOrderId });
    if (!po) throw new Error('NOT_FOUND:Production order not found.');
    const now = new Date().toISOString();
    const mrDocNo = await mongoERPRepository.getNextDocNo('MR');
    const mr = {
      id: generateId('mr'),
      docNo: mrDocNo,
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

    await MaterialRequestModel.create(mr);

    bom.requestSent = true;
    bom.materialRequestId = mr.id;
    bom.materialRequestDocNo = mr.docNo;
    await bom.save();

    po.status = 'Awaiting Materials';
    po.updatedAt = now;
    await po.save();

    await mongoERPRepository.addNotification({
      title: `New BOM Material Request: ${mr.docNo}`,
      message: `${po.docNo} (${bom.productName}) requires materials from store.`,
      department: 'supply_chain',
      severity: 'info',
      link: '/supply-chain/material-requests',
    });

    res.status(201).json(mr);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/material-receipts/:issueId/acknowledge', requireAuth, requirePerm('production', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { discrepancyNotes } = req.body as { discrepancyNotes?: string };
    const mi = await MaterialIssueModel.findOne({ id: req.params.issueId });
    if (!mi) throw new Error('NOT_FOUND:Material issue record not found.');
    if (mi.receiptAcknowledged) {
      throw new Error(`Material issue ${mi.docNo} receipt has already been acknowledged.`);
    }
    const mr = await MaterialRequestModel.findOne({ id: mi.materialRequestId });
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
    await mi.save();

    const derived = deriveMaterialRequestStatus(mr.toObject() as any);
    mr.status = derived.status;
    mr.receiptStatus = derived.receiptStatus;
    mr.updatedAt = now;
    await mr.save();

    const po = await ProductionOrderModel.findOne({ id: mi.productionOrderId });
    if (po && po.status === 'Awaiting Materials' && mr.receiptStatus === 'Fully Received') {
      po.status = 'Ready to Start';
      po.updatedAt = now;
      await po.save();

      await mongoERPRepository.addNotification({
        title: `${po.docNo} Ready to Start Production`,
        message: `All BOM materials for ${po.docNo} (${po.productName}) have been received by Production.`,
        department: 'production',
        severity: 'success',
        link: `/production/orders/${po.id}`,
      });
    }

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'production',
      action: 'Acknowledged Material Receipt',
      entityType: 'MaterialIssue',
      entityId: mi.id,
      entityDocNo: mi.docNo,
      details: `Confirmed physical receipt of ${mi.docNo} for ${mi.productionOrderDocNo}.`,
    });

    res.json(mi.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/orders/:id/start', requireAuth, requirePerm('production', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const po = await ProductionOrderModel.findOne({ id: req.params.id });
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
    await po.save();

    await syncSalesOrderFulfillmentMongo(po.salesOrderId);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'production',
      action: 'Started Production',
      entityType: 'ProductionOrder',
      entityId: po.id,
      entityDocNo: po.docNo,
      details: `Started manufacturing ${po.docNo} on ${po.actualStartDate}.`,
    });

    res.json(po.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/daily-updates', requireAuth, requirePerm('production', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.productionOrderId || !body.stage?.trim() || !body.workCompleted?.trim()) {
      throw new Error('Production order, process stage, and work completed description are required.');
    }
    const po = await ProductionOrderModel.findOne({ id: body.productionOrderId });
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

    await DailyProductionUpdateModel.create(du);

    po.updatedAt = now;
    await po.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'production',
      action: 'Logged Daily Update',
      entityType: 'ProductionOrder',
      entityId: po.id,
      entityDocNo: po.docNo,
      details: `${du.stage} (${du.stageStatus}): ${du.workCompleted.slice(0, 80)}`,
    });

    res.status(201).json(du);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/orders/:id/complete-manufacturing', requireAuth, requirePerm('production', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const po = await ProductionOrderModel.findOne({ id: req.params.id });
    if (!po) throw new Error('NOT_FOUND:Production order not found.');
    if (po.status !== 'In Progress') {
      throw new Error('Only orders In Progress can be marked manufacturing completed.');
    }
    const updateCount = await DailyProductionUpdateModel.countDocuments({ productionOrderId: po.id });
    if (updateCount === 0) {
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
    await po.save();

    await syncSalesOrderFulfillmentMongo(po.salesOrderId);

    await mongoERPRepository.addNotification({
      title: `Quality Check Pending: ${po.docNo}`,
      message: `Manufacturing finished for ${po.docNo} (${qty}x ${po.productName}). Ready for QC inspection.`,
      department: 'production',
      severity: 'warning',
      link: '/production/quality-check',
    });
    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'production',
      action: 'Completed Manufacturing',
      entityType: 'ProductionOrder',
      entityId: po.id,
      entityDocNo: po.docNo,
      details: `Completed manufacturing of ${qty} unit(s) (${po.serialNumbers.join(', ')}). Moved to QC Pending.`,
    });

    res.json(po.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/quality-checks', requireAuth, requirePerm('production', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const po = await ProductionOrderModel.findOne({ id: body.productionOrderId });
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

    const prevAttempts = await QualityCheckModel.countDocuments({ productionOrderId: po.id });
    const now = new Date().toISOString();
    const qcId = generateId('qc');
    const qcDocNo = await mongoERPRepository.getNextDocNo('QC');
    const acceptedQty = finalResult === 'Accepted' ? remainingToAccept : 0;
    const rejectedQty = finalResult === 'Rejected' ? remainingToAccept : 0;

    let reworkId: string | undefined;
    let reworkDocNo: string | undefined;

    if (finalResult === 'Rejected') {
      reworkId = generateId('rw');
      reworkDocNo = await mongoERPRepository.getNextDocNo('RW');
      const rw = {
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
        status: 'Open' as const,
        remarks: body.remarks?.trim() || '',
        createdBy: req.user!.name,
        createdAt: now,
        updatedAt: now,
      };
      await ReworkOrderModel.create(rw);

      po.status = 'Rework';
      po.qcRejectedQty = rejectedQty;
      await po.save();

      await mongoERPRepository.addNotification({
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
      await po.save();

      await mongoERPRepository.addNotification({
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

    await QualityCheckModel.create(qc);

    po.updatedAt = now;
    await po.save();
    await syncSalesOrderFulfillmentMongo(po.salesOrderId);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'production',
      action: `QC ${finalResult}`,
      entityType: 'QualityCheck',
      entityId: qc.id,
      entityDocNo: qc.docNo,
      details: `${qc.docNo} (Attempt #${qc.attemptNumber}) for ${po.docNo}: ${finalResult}.`,
    });

    res.status(201).json(qc);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/rework/:id/complete', requireAuth, requirePerm('production', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { completedWork, remarks, assignedEmployee } = req.body as {
      completedWork: string;
      remarks?: string;
      assignedEmployee?: string;
    };
    if (!completedWork?.trim()) throw new Error('Completed corrective work description is required.');

    const rw = await ReworkOrderModel.findOne({ id: req.params.id });
    if (!rw) throw new Error('NOT_FOUND:Rework order not found.');
    if (rw.status === 'Reinspection' || rw.status === 'Completed') {
      throw new Error('This rework has already been sent back for QC reinspection.');
    }
    const po = await ProductionOrderModel.findOne({ id: rw.productionOrderId });
    if (!po) throw new Error('NOT_FOUND:Production order not found.');

    const now = new Date().toISOString();
    rw.completedWork = completedWork.trim();
    if (assignedEmployee?.trim()) rw.assignedEmployee = assignedEmployee.trim();
    if (remarks?.trim()) rw.remarks = remarks.trim();
    rw.actualCompletionDate = now.slice(0, 10);
    rw.status = 'Reinspection';
    rw.updatedAt = now;
    await rw.save();

    po.status = 'QC Pending';
    po.updatedAt = now;
    await po.save();
    await syncSalesOrderFulfillmentMongo(po.salesOrderId);

    await mongoERPRepository.addNotification({
      title: `Rework Complete — Reinspection Required (${po.docNo})`,
      message: `${rw.docNo} completed. ${po.docNo} returned to Quality Check queue.`,
      department: 'production',
      severity: 'warning',
      link: '/production/quality-check',
    });
    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'production',
      action: 'Completed Rework',
      entityType: 'ReworkOrder',
      entityId: rw.id,
      entityDocNo: rw.docNo,
      details: `Completed rework ${rw.docNo} for ${po.docNo}. Sent back to QC for reinspection.`,
    });

    res.json(rw.toObject());
  } catch (err) {
    sendError(res, err);
  }
});
