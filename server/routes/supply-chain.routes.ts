import { Router } from 'express';
import type { GRNItem, SupplierPOItem } from '../../src/types/erp';
import {
  computeMaterialStockMap,
  deriveMaterialRequestStatus,
  round2,
  validateMaterialIssueLine,
} from '../../src/utils/erpLogic';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  GRNModel,
  MaterialIssueModel,
  MaterialModel,
  MaterialRequestModel,
  StockTransactionModel,
  SupplierModel,
  SupplierPOModel,
  SupplierReturnModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { generateId, sendError } from '../utils/routeUtils';

export const supplyChainRouter = Router();

// --- Phase 3: Paginated Materials ---
supplyChainRouter.get('/supply-chain/materials', requireAuth, requirePerm('supply_chain', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedMaterials(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Paginated Material Requests ---
supplyChainRouter.get('/supply-chain/material-requests', requireAuth, requirePerm('supply_chain', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedMaterialRequests(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Paginated Supplier POs ---
supplyChainRouter.get('/supply-chain/purchase-orders', requireAuth, requirePerm('supply_chain', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedSupplierPOs(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Paginated GRNs ---
supplyChainRouter.get('/supply-chain/grns', requireAuth, requirePerm('supply_chain', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedGRNs(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Materials Dropdown Options ---
supplyChainRouter.get('/supply-chain/materials/options', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const options = await mongoERPRepository.getMaterialOptions();
    res.json(options);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Suppliers Dropdown Options ---
supplyChainRouter.get('/supply-chain/suppliers/options', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const options = await mongoERPRepository.getSupplierOptions();
    res.json(options);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Supply Chain Dashboard Summary ---
supplyChainRouter.get('/supply-chain/summary', requireAuth, requirePerm('supply_chain', 'view'), async (_req: AuthenticatedRequest, res) => {
  try {
    const summary = await mongoERPRepository.getSupplyChainSummary();
    res.json(summary);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/materials', requireAuth, requirePerm('supply_chain', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim() || !body.code?.trim()) throw new Error('Material name and code are required.');
    const cleanCode = body.code.trim().toUpperCase();

    const existing = await MaterialModel.findOne({ code: cleanCode });
    if (existing) {
      throw new Error(`Material code ${body.code} already exists.`);
    }

    const now = new Date().toISOString();
    const mat = {
      id: generateId('mat'),
      code: cleanCode,
      name: body.name.trim(),
      category: body.category?.trim() || 'Components',
      specification: body.specification?.trim() || '',
      unit: body.unit?.trim() || 'Nos',
      minStock: Math.max(0, Number(body.minStock) || 0),
      storageLocation: body.storageLocation?.trim() || 'Main Store',
      preferredSupplierId: body.preferredSupplierId || undefined,
      currentStock: Math.max(0, Number(body.openingStock) || 0),
      active: true,
      createdAt: now,
    };

    await MaterialModel.create(mat);

    const openingQty = Number(body.openingStock) || 0;
    if (openingQty > 0) {
      await StockTransactionModel.create({
        id: generateId('st'),
        materialId: mat.id,
        materialCode: mat.code,
        materialName: mat.name,
        unit: mat.unit,
        type: 'Opening Balance',
        quantityDelta: openingQty,
        balanceAfter: openingQty,
        linkedDocType: 'Opening',
        linkedDocId: mat.id,
        linkedDocNo: mat.code,
        remarks: 'Initial stock balance on material creation',
        performedBy: req.user!.name,
        timestamp: now,
      });
    }

    res.status(201).json(mat);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/stock-adjustment', requireAuth, requirePerm('supply_chain', 'approve'), async (req: AuthenticatedRequest, res) => {
  try {
    const { materialId, quantityDelta, remarks } = req.body as {
      materialId: string;
      quantityDelta: number;
      remarks: string;
    };
    if (!materialId || !quantityDelta || !remarks?.trim()) {
      throw new Error('Material, non-zero quantity delta, and reason are required.');
    }
    const mat = await MaterialModel.findOne({ id: materialId });
    if (!mat) throw new Error('NOT_FOUND:Material not found.');

    const stockMap = await mongoERPRepository.computeStockMap();
    const current = stockMap[mat.id] || 0;
    const nextBal = round2(current + Number(quantityDelta));
    if (nextBal < 0) {
      throw new Error(`Adjustment would result in negative stock (${nextBal}).`);
    }

    const entry = {
      id: generateId('st'),
      materialId: mat.id,
      materialCode: mat.code,
      materialName: mat.name,
      unit: mat.unit,
      type: 'Stock Adjustment' as const,
      quantityDelta: Number(quantityDelta),
      balanceAfter: nextBal,
      linkedDocType: 'Adjustment',
      linkedDocId: generateId('adj'),
      linkedDocNo: `ADJ-${Date.now().toString().slice(-4)}`,
      remarks: remarks.trim(),
      performedBy: req.user!.name,
      timestamp: new Date().toISOString(),
    };

    await StockTransactionModel.create(entry);
    await MaterialModel.updateOne({ id: mat.id }, { $set: { currentStock: nextBal } });
    res.status(201).json(entry);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/suppliers', requireAuth, requirePerm('supply_chain', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim()) throw new Error('Supplier name is required.');
    const sup = {
      id: generateId('sup'),
      name: body.name.trim(),
      contactPerson: body.contactPerson?.trim() || '',
      phone: body.phone?.trim() || '',
      email: body.email?.trim() || '',
      address: body.address?.trim() || '',
      gstin: body.gstin?.trim() || '',
      suppliedMaterialIds: Array.isArray(body.suppliedMaterialIds) ? body.suppliedMaterialIds : [],
      notes: body.notes?.trim() || '',
      active: true,
      createdAt: new Date().toISOString(),
    };

    await SupplierModel.create(sup);
    res.status(201).json(sup);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/material-issues', requireAuth, requirePerm('supply_chain', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { materialRequestId, issueDate, items, remarks } = req.body as {
      materialRequestId: string;
      issueDate?: string;
      items: Array<{ materialId: string; issuingQty: number }>;
      remarks?: string;
    };
    if (!materialRequestId) throw new Error('materialRequestId is required.');
    const mi = await mongoERPRepository.issueMaterial(
      materialRequestId,
      items || [],
      remarks || '',
      issueDate || '',
      { id: req.user!.id, name: req.user!.name },
    );
    res.status(201).json(mi);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/supplier-pos', requireAuth, requirePerm('supply_chain', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.supplierId || !Array.isArray(body.items) || body.items.length === 0) {
      throw new Error('Supplier and at least one material line are required.');
    }
    const sup = await SupplierModel.findOne({ id: body.supplierId });
    if (!sup) throw new Error('NOT_FOUND:Supplier not found.');

    const mr = body.materialRequestId
      ? await MaterialRequestModel.findOne({ id: body.materialRequestId })
      : null;

    const allMaterials = await MaterialModel.find().lean();
    const materialMap = new Map(allMaterials.map((m) => [m.id, m]));

    const items: SupplierPOItem[] = body.items.map((it: any) => {
      const mat = materialMap.get(it.materialId);
      if (!mat) throw new Error('Invalid material selected.');
      const qty = Number(it.orderedQty);
      const price = Number(it.unitPrice);
      if (!qty || qty <= 0) throw new Error(`Quantity for ${mat.name} must be positive.`);
      return {
        materialId: mat.id,
        materialCode: mat.code,
        materialName: mat.name,
        unit: mat.unit,
        orderedQty: qty,
        receivedQty: 0,
        acceptedQty: 0,
        rejectedQty: 0,
        unitPrice: Math.max(0, price || 0),
        lineTotal: round2(qty * Math.max(0, price || 0)),
      };
    });

    const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
    const taxPercent = Number(body.taxPercent ?? 18);
    const taxAmount = round2((subtotal * taxPercent) / 100);
    const totalAmount = round2(subtotal + taxAmount);
    const now = new Date().toISOString();
    const spoDocNo = await mongoERPRepository.getNextDocNo('SPO');

    const spo = {
      id: generateId('spo'),
      docNo: spoDocNo,
      supplierId: sup.id,
      supplierName: sup.name,
      purchaseType: (body.purchaseType === 'Request-Based' ? 'Request-Based' : 'Normal') as
        | 'Request-Based'
        | 'Normal',
      materialRequestId: mr?.id,
      materialRequestDocNo: mr?.docNo,
      poDate: body.poDate || now.slice(0, 10),
      expectedDeliveryDate: body.expectedDeliveryDate || now.slice(0, 10),
      items,
      subtotal,
      taxPercent,
      taxAmount,
      totalAmount,
      status: 'Ordered' as const,
      remarks: body.remarks?.trim() || '',
      createdBy: req.user!.name,
      createdAt: now,
      updatedAt: now,
    };

    await SupplierPOModel.create(spo);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'supply_chain',
      action: 'Created Supplier PO',
      entityType: 'SupplierPO',
      entityId: spo.id,
      entityDocNo: spo.docNo,
      details: `Created ${spo.purchaseType} PO ${spo.docNo} to ${sup.name}.`,
    });

    res.status(201).json(spo);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/grns', requireAuth, requirePerm('supply_chain', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.supplierPoId || !body.invoiceOrChallanNo?.trim()) {
      throw new Error('Supplier PO reference and invoice / delivery challan number are required.');
    }
    const spo = await SupplierPOModel.findOne({ id: body.supplierPoId });
    if (!spo) throw new Error('NOT_FOUND:Supplier PO not found.');

    const supReturn = body.supplierReturnId
      ? await SupplierReturnModel.findOne({ id: body.supplierReturnId })
      : null;
    const isReplacement = Boolean(supReturn);

    const grnItems: GRNItem[] = [];
    for (const line of body.items || []) {
      const recQty = Number(line.receivedQty);
      if (!recQty || recQty <= 0) continue;
      const poLine = spo.items.find((i) => i.materialId === line.materialId);
      if (!poLine) throw new Error('Material not found on selected Supplier PO.');

      if (isReplacement && supReturn) {
        if (recQty > supReturn.returnQty) {
          throw new Error(`Replacement receipt (${recQty}) cannot exceed returned qty (${supReturn.returnQty}).`);
        }
      } else {
        const remaining = round2(poLine.orderedQty - poLine.receivedQty);
        if (recQty > remaining && !body.authorizeExcess) {
          throw new Error(
            `Received qty (${recQty}) for ${poLine.materialName} exceeds remaining PO qty (${remaining}).`,
          );
        }
        poLine.receivedQty = round2(poLine.receivedQty + recQty);
      }

      grnItems.push({
        materialId: poLine.materialId,
        materialCode: poLine.materialCode,
        materialName: poLine.materialName,
        unit: poLine.unit,
        orderedQty: poLine.orderedQty,
        previouslyReceivedQty: isReplacement ? poLine.receivedQty : round2(poLine.receivedQty - recQty),
        receivedQty: recQty,
        acceptedQty: 0,
        rejectedQty: 0,
        verified: false,
      });
    }

    if (grnItems.length === 0) throw new Error('Enter a received quantity for at least one material.');

    if (!isReplacement) {
      const allReceived = spo.items.every((i) => i.receivedQty >= i.orderedQty);
      spo.status = allReceived ? 'Received' : 'Partially Received';
      spo.updatedAt = new Date().toISOString();
      await spo.save();
    }

    const now = new Date().toISOString();
    const grnDocNo = await mongoERPRepository.getNextDocNo('GRN');
    const grn = {
      id: generateId('grn'),
      docNo: grnDocNo,
      supplierPoId: spo.id,
      supplierPoDocNo: spo.docNo,
      supplierId: spo.supplierId,
      supplierName: spo.supplierName,
      isReplacement,
      supplierReturnId: supReturn?.id,
      supplierReturnDocNo: supReturn?.docNo,
      receivedDate: body.receivedDate || now.slice(0, 10),
      invoiceOrChallanNo: body.invoiceOrChallanNo.trim(),
      items: grnItems,
      attachmentName: body.attachmentName || undefined,
      attachmentDataUrl: body.attachmentDataUrl || undefined,
      verificationStatus: 'Pending' as const,
      remarks: body.remarks?.trim() || '',
      createdBy: req.user!.name,
      createdAt: now,
    };

    await GRNModel.create(grn);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'supply_chain',
      action: isReplacement ? 'Created Replacement GRN' : 'Created GRN',
      entityType: 'GRN',
      entityId: grn.id,
      entityDocNo: grn.docNo,
      details: `Recorded ${grn.docNo} against ${spo.docNo} (${grn.invoiceOrChallanNo}). Pending verification.`,
    });

    res.status(201).json(grn);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/grns/:id/verify', requireAuth, requirePerm('supply_chain', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { items, verificationRemarks } = req.body as {
      items: Array<{ materialId: string; acceptedQty: number; rejectedQty: number; rejectionReason?: string }>;
      verificationRemarks?: string;
    };
    const grn = await GRNModel.findOne({ id: req.params.id });
    if (!grn) throw new Error('NOT_FOUND:GRN not found.');
    if (grn.verificationStatus !== 'Pending') {
      throw new Error(`GRN ${grn.docNo} has already been verified (${grn.verificationStatus}).`);
    }
    const spo = await SupplierPOModel.findOne({ id: grn.supplierPoId });
    const stockMap = await mongoERPRepository.computeStockMap();
    const now = new Date().toISOString();

    let totalAccepted = 0;
    let totalRejected = 0;
    const stockTxDocs = [];

    for (const grnItem of grn.items) {
      const input = (items || []).find((x) => x.materialId === grnItem.materialId);
      if (!input) throw new Error(`Missing verification input for ${grnItem.materialName}.`);
      const acc = round2(Number(input.acceptedQty) || 0);
      const rej = round2(Number(input.rejectedQty) || 0);
      if (acc < 0 || rej < 0 || Math.abs(acc + rej - grnItem.receivedQty) > 0.001) {
        throw new Error(
          `${grnItem.materialName}: Accepted (${acc}) + Rejected (${rej}) must equal Received (${grnItem.receivedQty}).`,
        );
      }
      if (rej > 0 && !input.rejectionReason?.trim()) {
        throw new Error(`Rejection reason is required for rejected ${grnItem.materialName}.`);
      }

      grnItem.acceptedQty = acc;
      grnItem.rejectedQty = rej;
      grnItem.rejectionReason = input.rejectionReason?.trim() || undefined;
      grnItem.verified = true;
      totalAccepted += acc;
      totalRejected += rej;

      const poLine = spo?.items.find((i) => i.materialId === grnItem.materialId);
      if (poLine) {
        poLine.acceptedQty = round2(poLine.acceptedQty + acc);
        poLine.rejectedQty = round2(poLine.rejectedQty + rej);
      }

      if (acc > 0) {
        await MaterialModel.updateOne({ id: grnItem.materialId }, { $inc: { currentStock: acc } });
        const nextBal = round2((stockMap[grnItem.materialId] || 0) + acc);
        stockMap[grnItem.materialId] = nextBal;
        stockTxDocs.push({
          id: generateId('st'),
          materialId: grnItem.materialId,
          materialCode: grnItem.materialCode,
          materialName: grnItem.materialName,
          unit: grnItem.unit,
          type: 'GRN Accepted' as const,
          quantityDelta: acc,
          balanceAfter: nextBal,
          linkedDocType: 'GRN',
          linkedDocId: grn.id,
          linkedDocNo: grn.docNo,
          remarks: grn.isReplacement
            ? `Replacement GRN verified (${grn.supplierReturnDocNo})`
            : `Incoming verification accepted (${rej} rejected)`,
          performedBy: req.user!.name,
          timestamp: now,
        });
      }
    }

    if (stockTxDocs.length > 0) {
      await StockTransactionModel.create(stockTxDocs);
    }

    grn.verificationStatus =
      totalRejected === 0 ? 'Accepted' : totalAccepted === 0 ? 'Rejected' : 'Partially Accepted';
    grn.verifiedBy = req.user!.name;
    grn.verifiedAt = now;
    grn.verificationRemarks = verificationRemarks?.trim() || '';
    await grn.save();

    if (spo) {
      await spo.save();
    }

    if (grn.isReplacement && grn.supplierReturnId) {
      const sr = await SupplierReturnModel.findOne({ id: grn.supplierReturnId });
      if (sr) {
        sr.replacementStatus = totalAccepted >= sr.returnQty ? 'Replacement Received' : 'Pending Replacement';
        sr.replacementGrnId = grn.id;
        sr.replacementGrnDocNo = grn.docNo;
        await sr.save();
      }
    }

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'supply_chain',
      action: 'Verified Material GRN',
      entityType: 'GRN',
      entityId: grn.id,
      entityDocNo: grn.docNo,
      details: `${grn.docNo}: ${grn.verificationStatus} (${totalAccepted} accepted into stock, ${totalRejected} rejected).`,
    });

    res.json(grn.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/supplier-returns', requireAuth, requirePerm('supply_chain', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const grn = await GRNModel.findOne({ id: body.grnId });
    if (!grn) throw new Error('NOT_FOUND:GRN not found.');
    const grnItem = grn.items.find((i) => i.materialId === body.materialId);
    if (!grnItem || grnItem.rejectedQty <= 0) {
      throw new Error('Selected material has no rejected quantity on this GRN.');
    }

    const existingReturns = await SupplierReturnModel.find({
      grnId: grn.id,
      materialId: grnItem.materialId,
    }).lean();
    const alreadyReturned = existingReturns.reduce((s, r) => s + r.returnQty, 0);
    const eligible = round2(grnItem.rejectedQty - alreadyReturned);
    const returnQty = round2(Number(body.returnQty));
    if (!returnQty || returnQty <= 0 || returnQty > eligible) {
      throw new Error(`Return qty must be between 1 and ${eligible} (eligible rejected units).`);
    }

    const now = new Date().toISOString();
    const replacementRequired = Boolean(body.replacementRequired);
    const srDocNo = await mongoERPRepository.getNextDocNo('SR');
    const sr = {
      id: generateId('sr'),
      docNo: srDocNo,
      grnId: grn.id,
      grnDocNo: grn.docNo,
      supplierPoId: grn.supplierPoId,
      supplierPoDocNo: grn.supplierPoDocNo,
      supplierId: grn.supplierId,
      supplierName: grn.supplierName,
      materialId: grnItem.materialId,
      materialCode: grnItem.materialCode,
      materialName: grnItem.materialName,
      unit: grnItem.unit,
      returnQty,
      reason: body.reason?.trim() || grnItem.rejectionReason || 'Rejected in incoming verification',
      returnDate: body.returnDate || now.slice(0, 10),
      replacementRequired,
      replacementStatus: (replacementRequired ? 'Pending Replacement' : 'Not Required') as
        | 'Pending Replacement'
        | 'Not Required',
      attachmentName: body.attachmentName || undefined,
      remarks: body.remarks?.trim() || '',
      createdBy: req.user!.name,
      createdAt: now,
    };

    await SupplierReturnModel.create(sr);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'supply_chain',
      action: 'Created Supplier Return',
      entityType: 'SupplierReturn',
      entityId: sr.id,
      entityDocNo: sr.docNo,
      details: `Returned ${sr.returnQty} ${sr.unit} of ${sr.materialName} from ${grn.docNo} to ${sr.supplierName}.`,
    });

    res.status(201).json(sr);
  } catch (err) {
    sendError(res, err);
  }
});
