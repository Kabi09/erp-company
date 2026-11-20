import { Router } from 'express';
import type { BOMItem, MaterialRequestItem, QCCheckItem } from '../../src/types/erp';
import {
  calculateDurationDays,
  calculateProductionProgress,
  deriveMaterialRequestStatus,
  getRemainingSOAllocatableQty,
  isProductionOrderDelayed,
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
  ProductionReturnModel,
  QualityCheckModel,
  ReworkOrderModel,
  SalesOrderModel,
  StockTransactionModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { generateId, sendError, syncSalesOrderFulfillmentMongo } from '../utils/routeUtils';

export const productionRouter = Router();

// --- Production Orders: List & Pagination ---
productionRouter.get('/production/orders', requireAuth, requirePerm('production', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedProductionOrders(req.query as any);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Production Dashboard Summary ---
productionRouter.get('/production/summary', requireAuth, requirePerm('production', 'view'), async (_req: AuthenticatedRequest, res) => {
  try {
    const summary = await mongoERPRepository.getProductionSummary();
    res.json(summary);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Production Order Details (Centralized) ---
productionRouter.get('/production/orders/:id', requireAuth, requirePerm('production', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const po = await ProductionOrderModel.findOne({ $or: [{ id: req.params.id }, { docNo: req.params.id }] }).lean();
    if (!po) throw new Error('NOT_FOUND:Production order not found.');

    const [bom, materialRequest, issues, dailyUpdates, qualityChecks, reworkOrders, returns, salesOrder] = await Promise.all([
      BOMModel.findOne({ productionOrderId: po.id }).lean(),
      MaterialRequestModel.findOne({ productionOrderId: po.id }).lean(),
      MaterialIssueModel.find({ productionOrderId: po.id }).sort({ createdAt: -1 }).lean(),
      DailyProductionUpdateModel.find({ productionOrderId: po.id }).sort({ workDate: -1, createdAt: -1 }).lean(),
      QualityCheckModel.find({ productionOrderId: po.id }).sort({ attemptNumber: 1 }).lean(),
      ReworkOrderModel.find({ productionOrderId: po.id }).sort({ createdAt: -1 }).lean(),
      ProductionReturnModel.find({ productionOrderId: po.id }).sort({ createdAt: -1 }).lean(),
      SalesOrderModel.findOne({ id: po.salesOrderId }).lean(),
    ]);

    const progress = calculateProductionProgress(po as any, dailyUpdates as any);
    const delayed = isProductionOrderDelayed(po as any);

    res.json({
      order: po,
      salesOrder: salesOrder
        ? {
            id: salesOrder.id,
            docNo: salesOrder.docNo,
            customerName: salesOrder.customerSnapshot.name,
            customerPoNumber: salesOrder.customerPoNumber,
            promisedDeliveryDate: salesOrder.promisedDeliveryDate,
            commercialStatus: salesOrder.commercialStatus,
            fulfillmentStatus: salesOrder.fulfillmentStatus,
          }
        : undefined,
      bom,
      materialRequest,
      issues,
      dailyUpdates,
      qualityChecks,
      reworkOrders,
      returns,
      progress,
      delayed,
      planningHistory: po.planningHistory || [],
    });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Create Production Order (Transaction-safe allocation) ---
productionRouter.post('/production/orders', requireAuth, requirePerm('production', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const po = await mongoERPRepository.createProductionOrderTx(req.body, req.user!);
    res.status(201).json(po);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Reschedule Production Order (Planning with reason) ---
productionRouter.post('/production/orders/:id/reschedule', requireAuth, requirePerm('production', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const updated = await mongoERPRepository.rescheduleProductionOrder(req.params.id, req.body, req.user!);
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// --- BOM Preparation & Material Request ---
productionRouter.get('/production/boms', requireAuth, requirePerm('production', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.productionOrderId) filter.productionOrderId = req.query.productionOrderId;
    const boms = await BOMModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json(boms);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.get('/production/boms/:id', requireAuth, requirePerm('production', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const bom = await BOMModel.findOne({ $or: [{ id: req.params.id }, { docNo: req.params.id }] }).lean();
    if (!bom) throw new Error('NOT_FOUND:BOM not found.');
    res.json(bom);
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

    // Duplicate material line guard
    const seenMaterialIds = new Set<string>();
    for (const it of items) {
      if (seenMaterialIds.has(it.materialId)) {
        throw new Error('Duplicate material line detected in BOM. Each raw material must appear only once.');
      }
      seenMaterialIds.add(it.materialId);
    }

    const existingBom = await BOMModel.findOne({ productionOrderId: po.id });
    if (existingBom && existingBom.requestSent && sendRequest) {
      throw new Error(`BOM ${existingBom.docNo} has already been submitted to Supply Chain.`);
    }

    // Check if MR items already have issued quantities: cannot reduce below issued
    if (existingBom?.materialRequestId) {
      const existingMr = await MaterialRequestModel.findOne({ id: existingBom.materialRequestId });
      if (existingMr) {
        for (const it of items) {
          const mrLine = existingMr.items.find((m) => m.materialId === it.materialId);
          const reqQty = round2(Number(it.qtyPerUnit) * po.quantity);
          if (mrLine && mrLine.issuedQty > reqQty) {
            throw new Error(`Cannot reduce required quantity for ${mrLine.materialName} to ${reqQty}; ${mrLine.issuedQty} units have already been issued.`);
          }
        }
      }
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

// --- Material Receipts: Query & Acknowledge ---
productionRouter.get('/production/material-receipts', requireAuth, requirePerm('production', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.productionOrderId) filter.productionOrderId = req.query.productionOrderId;
    if (req.query.unacknowledged === 'true') filter.receiptAcknowledged = false;
    const issues = await MaterialIssueModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json(issues);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/material-receipts/:issueId/acknowledge', requireAuth, requirePerm('production', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { discrepancyNotes, items: receivedItems } = (req.body || {}) as {
      discrepancyNotes?: string;
      items?: Array<{ materialId: string; receivedQty: number; discrepancyNotes?: string }>;
    };
    const mi = await MaterialIssueModel.findOne({ id: req.params.issueId });
    if (!mi) throw new Error('NOT_FOUND:Material issue record not found.');
    if (mi.receiptAcknowledged) {
      throw new Error(`Material issue ${mi.docNo} receipt has already been acknowledged.`);
    }
    const mr = await MaterialRequestModel.findOne({ id: mi.materialRequestId });
    if (!mr) throw new Error('NOT_FOUND:Linked material request not found.');

    const now = new Date().toISOString();
    let hasLineDiscrepancy = false;

    for (const ii of mi.items) {
      const clientLine = Array.isArray(receivedItems)
        ? receivedItems.find((x) => x.materialId === ii.materialId)
        : undefined;
      const recQty = clientLine !== undefined ? Number(clientLine.receivedQty) : ii.issuedQty;

      if (recQty < 0 || recQty > ii.issuedQty) {
        throw new Error(`Received quantity for ${ii.materialName} must be between 0 and issued quantity (${ii.issuedQty}).`);
      }
      if (recQty < ii.issuedQty) {
        hasLineDiscrepancy = true;
      }
      ii.receivedQty = recQty;

      const mrItem = mr.items.find((x) => x.materialId === ii.materialId);
      if (mrItem) {
        const prevRec = mrItem.receivedQty || 0;
        mrItem.receivedQty = round2(prevRec + ii.receivedQty);
      }
    }

    mi.receiptAcknowledged = true;
    mi.acknowledgedBy = req.user!.name;
    mi.acknowledgedAt = now;
    if (discrepancyNotes?.trim() || hasLineDiscrepancy) {
      mi.receiptDiscrepancyNotes = discrepancyNotes?.trim() || 'Physical receipt discrepancy recorded on line item(s).';
    }
    await mi.save();

    const derived = deriveMaterialRequestStatus(mr.toObject() as any);
    mr.status = derived.status;
    mr.receiptStatus = derived.receiptStatus;
    mr.updatedAt = now;
    await mr.save();

    const po = await ProductionOrderModel.findOne({ id: mi.productionOrderId });
    if (po && (po.status === 'Awaiting Materials' || po.status === 'Planned') && mr.receiptStatus === 'Fully Received') {
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

// --- Start Production ---
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

// --- Daily Production Updates ---
productionRouter.get('/production/daily-updates', requireAuth, requirePerm('production', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.productionOrderId) filter.productionOrderId = req.query.productionOrderId;
    if (req.query.workDate) filter.workDate = req.query.workDate;
    const updates = await DailyProductionUpdateModel.find(filter).sort({ workDate: -1, createdAt: -1 }).lean();
    res.json(updates);
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

// --- Complete Manufacturing ---
const completeManufacturingHandler = async (req: AuthenticatedRequest, res: any) => {
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
};
productionRouter.post('/production/orders/:id/complete-manufacturing', requireAuth, requirePerm('production', 'edit'), completeManufacturingHandler);
productionRouter.post('/production/orders/:id/complete', requireAuth, requirePerm('production', 'edit'), completeManufacturingHandler);

// --- Quality Check: Query & Record ---
productionRouter.get('/production/quality-checks', requireAuth, requirePerm('production', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.productionOrderId) filter.productionOrderId = req.query.productionOrderId;
    if (req.query.finalResult) filter.finalResult = req.query.finalResult;
    const qcs = await QualityCheckModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json(qcs);
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

    const totalManufactured = po.completedManufacturingQty || po.quantity;
    const remainingToAccept = totalManufactured - (po.qcAcceptedQty || 0);
    if (remainingToAccept <= 0) {
      throw new Error('All units on this production order have already passed QC.');
    }

    const inspectedQty = Number(body.inspectedQty ?? remainingToAccept);
    if (!inspectedQty || inspectedQty <= 0 || inspectedQty > remainingToAccept) {
      throw new Error(`Inspected quantity must be between 1 and ${remainingToAccept}.`);
    }

    let acceptedQty: number;
    let rejectedQty: number;
    let finalResult: 'Accepted' | 'Rejected';

    if (body.acceptedQty !== undefined || body.rejectedQty !== undefined) {
      acceptedQty = Number(body.acceptedQty ?? 0);
      rejectedQty = Number(body.rejectedQty ?? 0);
      if (acceptedQty < 0 || rejectedQty < 0) {
        throw new Error('Accepted and rejected quantities must be non-negative.');
      }
      if (round2(acceptedQty + rejectedQty) !== round2(inspectedQty)) {
        throw new Error(`Accepted quantity (${acceptedQty}) + Rejected quantity (${rejectedQty}) must equal Inspected quantity (${inspectedQty}).`);
      }
      finalResult = rejectedQty > 0 ? 'Rejected' : 'Accepted';
    } else {
      finalResult = body.finalResult === 'Accepted' ? 'Accepted' : 'Rejected';
      acceptedQty = finalResult === 'Accepted' ? inspectedQty : 0;
      rejectedQty = finalResult === 'Rejected' ? inspectedQty : 0;
    }

    if (rejectedQty > 0 && !body.rejectionReason?.trim()) {
      throw new Error('Rejection reason is required when rejecting in Quality Check.');
    }

    const prevAttempts = await QualityCheckModel.countDocuments({ productionOrderId: po.id });
    const now = new Date().toISOString();
    const qcId = generateId('qc');
    const qcDocNo = await mongoERPRepository.getNextDocNo('QC');

    let reworkId: string | undefined;
    let reworkDocNo: string | undefined;

    if (rejectedQty > 0) {
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
        affectedSerialNumbers: po.serialNumbers.slice(po.qcAcceptedQty, po.qcAcceptedQty + rejectedQty),
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
      if (acceptedQty > 0) {
        po.qcAcceptedQty = round2((po.qcAcceptedQty || 0) + acceptedQty);
      }
      await po.save();

      await mongoERPRepository.addNotification({
        title: `QC Rejected: ${po.docNo} (${qcDocNo})`,
        message: `Rework ${reworkDocNo} created for ${rejectedQty} unit(s) — Reason: ${body.rejectionReason.trim()}`,
        department: 'production',
        severity: 'error',
        link: '/production/rework',
      });
    } else {
      po.qcAcceptedQty = round2((po.qcAcceptedQty || 0) + acceptedQty);
      po.qcRejectedQty = 0;
      if (po.qcAcceptedQty >= po.quantity) {
        po.status = 'Completed';
      } else {
        po.status = 'QC Pending';
      }
      await po.save();

      if (po.status === 'Completed') {
        await mongoERPRepository.addNotification({
          title: `Ready for Dispatch: ${po.docNo}`,
          message: `${po.quantity}x ${po.productName} for ${po.customerName} passed QC (${qcDocNo}) and is ready for dispatch.`,
          department: 'logistics',
          severity: 'success',
          link: '/logistics/ready',
        });
      }
    }

    const qc = {
      id: qcId,
      docNo: qcDocNo,
      attemptNumber: prevAttempts + 1,
      productionOrderId: po.id,
      productionOrderDocNo: po.docNo,
      productName: `${po.productName} (${po.model})`,
      inspectedQty,
      acceptedQty,
      rejectedQty,
      serialNumbers: po.serialNumbers,
      inspectionDate: body.inspectionDate || now.slice(0, 10),
      inspector: body.inspector?.trim() || req.user!.name,
      checks: Array.isArray(body.checks) ? body.checks : [],
      finalResult: finalResult as 'Accepted' | 'Rejected',
      rejectionReason: rejectedQty > 0 ? body.rejectionReason?.trim() : undefined,
      reworkId,
      reworkDocNo,
      remarks: body.remarks?.trim() || '',
      reportName: body.reportName || undefined,
      reportDataUrl: body.reportDataUrl || undefined,
      createdAt: now,
    };

    await QualityCheckModel.create(qc);
    await syncSalesOrderFulfillmentMongo(po.salesOrderId);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'production',
      action: `QC ${finalResult}`,
      entityType: 'QualityCheck',
      entityId: qc.id,
      entityDocNo: qc.docNo,
      details: `${qc.docNo} (Attempt #${qc.attemptNumber}) for ${po.docNo}: ${finalResult} (Accepted: ${acceptedQty}, Rejected: ${rejectedQty}).`,
    });

    res.status(201).json(qc);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Rework Orders: Query & Complete ---
productionRouter.get('/production/rework', requireAuth, requirePerm('production', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.productionOrderId) filter.productionOrderId = req.query.productionOrderId;
    if (req.query.status) filter.status = req.query.status;
    const reworks = await ReworkOrderModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json(reworks);
  } catch (err) {
    sendError(res, err);
  }
});

productionRouter.post('/production/rework/:id/complete', requireAuth, requirePerm('production', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { completedWork, remarks, assignedEmployee } = (req.body || {}) as {
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

// --- Production Material Returns (Alias for store returns) ---
productionRouter.post('/production/material-returns', requireAuth, requirePerm('production', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { materialRequestId, materialId, returnQty, reason } = req.body || {};
    if (!materialRequestId || !materialId || !returnQty || Number(returnQty) <= 0 || !reason?.trim()) {
      throw new Error('materialRequestId, materialId, positive returnQty, and reason are required.');
    }
    const mr = await MaterialRequestModel.findOne({ id: materialRequestId });
    if (!mr) throw new Error('NOT_FOUND:Material Request not found.');
    const mrItem = mr.items.find((i) => i.materialId === materialId);
    if (!mrItem) throw new Error('Material not found on this Material Request.');

    const alreadyReturned = mrItem.returnedQty || 0;
    const netReceived = round2(mrItem.receivedQty - alreadyReturned);
    const numReturn = round2(Number(returnQty));
    if (numReturn > netReceived) {
      throw new Error(`Cannot return ${numReturn} ${mrItem.unit}; only ${netReceived} net received units available to return.`);
    }

    const mat = await MaterialModel.findOne({ id: materialId });
    if (!mat) throw new Error('NOT_FOUND:Material not found.');

    const condition = (req.body.materialCondition || 'Usable') as 'Usable' | 'Damaged' | 'Unusable';
    let balanceAfter = mat.currentStock;
    if (condition === 'Usable') {
      const updatedMat = await MaterialModel.findOneAndUpdate(
        { id: mat.id },
        { $inc: { currentStock: numReturn } },
        { returnDocument: 'after' },
      );
      balanceAfter = updatedMat?.currentStock ?? balanceAfter;
    }

    const now = new Date().toISOString();
    const prDocNo = await mongoERPRepository.getNextDocNo('PRT');
    const prId = generateId('prt');

    // Immutable Stock Ledger entry
    const stockTx = {
      id: generateId('st'),
      materialId: mat.id,
      materialCode: mat.code,
      materialName: mat.name,
      unit: mat.unit,
      type: 'Production Return' as const,
      quantityDelta: condition === 'Usable' ? numReturn : 0,
      balanceAfter,
      linkedDocType: 'MR',
      linkedDocId: mr.id,
      linkedDocNo: mr.docNo,
      remarks: condition === 'Usable'
        ? `Returned from ${mr.productionOrderDocNo}: ${reason.trim()}`
        : `Damaged/Unusable return from ${mr.productionOrderDocNo} (${condition}): ${reason.trim()}`,
      performedBy: req.user!.name,
      timestamp: now,
    };
    await StockTransactionModel.create(stockTx);

    // Update Material Request line item
    mrItem.returnedQty = round2(alreadyReturned + numReturn);
    const derived = deriveMaterialRequestStatus(mr as any);
    mr.status = derived.status;
    mr.receiptStatus = derived.receiptStatus;
    mr.updatedAt = now;
    await mr.save();

    // Create ProductionReturn record
    const prDoc = {
      id: prId,
      docNo: prDocNo,
      materialRequestId: mr.id,
      materialRequestDocNo: mr.docNo,
      productionOrderId: mr.productionOrderId,
      productionOrderDocNo: mr.productionOrderDocNo,
      materialId: mat.id,
      materialCode: mat.code,
      materialName: mat.name,
      unit: mat.unit,
      returnQty: numReturn,
      materialCondition: condition,
      reason: reason.trim(),
      remarks: req.body.remarks?.trim() || '',
      returnedBy: req.user!.name,
      createdAt: now,
    };
    await ProductionReturnModel.create(prDoc);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'production',
      action: 'Returned Production Materials',
      entityType: 'ProductionReturn',
      entityId: prDoc.id,
      entityDocNo: prDoc.docNo,
      details: `Returned ${numReturn} ${mat.unit} of ${mat.name} (${condition}) from ${mr.productionOrderDocNo} back to store.`,
    });

    res.status(201).json(prDoc);
  } catch (err) {
    sendError(res, err);
  }
});
