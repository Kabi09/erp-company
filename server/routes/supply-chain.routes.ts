import { Router } from 'express';
import type { GRNItem, SupplierPOItem } from '../../src/types/erp';
import {
  computeMaterialStockMap,
  deriveMaterialRequestStatus,
  round2,
  validateMaterialIssueLine,
} from '../../src/utils/erpLogic';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { addActivity, addNotification, dbStore, generateId, nextDocNo } from '../db';
import { sendError } from '../utils/routeUtils';

export const supplyChainRouter = Router();

supplyChainRouter.post('/supply-chain/materials', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim() || !body.code?.trim()) throw new Error('Material name and code are required.');
    const created = dbStore.mutate((draft) => {
      if (draft.materials.some((m) => m.code.toLowerCase() === body.code.trim().toLowerCase())) {
        throw new Error(`Material code ${body.code} already exists.`);
      }
      const now = new Date().toISOString();
      const mat = {
        id: generateId('mat'),
        code: body.code.trim().toUpperCase(),
        name: body.name.trim(),
        category: body.category?.trim() || 'Components',
        specification: body.specification?.trim() || '',
        unit: body.unit?.trim() || 'Nos',
        minStock: Math.max(0, Number(body.minStock) || 0),
        storageLocation: body.storageLocation?.trim() || 'Main Store',
        preferredSupplierId: body.preferredSupplierId || undefined,
        active: true,
        createdAt: now,
      };
      draft.materials.unshift(mat);
      const openingQty = Number(body.openingStock) || 0;
      if (openingQty > 0) {
        draft.stockTransactions.push({
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
      return mat;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/stock-adjustment', requireAuth, requirePerm('supply_chain', 'approve'), (req: AuthenticatedRequest, res) => {
  try {
    const { materialId, quantityDelta, remarks } = req.body as {
      materialId: string;
      quantityDelta: number;
      remarks: string;
    };
    if (!materialId || !quantityDelta || !remarks?.trim()) {
      throw new Error('Material, non-zero quantity delta, and reason are required.');
    }
    const tx = dbStore.mutate((draft) => {
      const mat = draft.materials.find((m) => m.id === materialId);
      if (!mat) throw new Error('NOT_FOUND:Material not found.');
      const current = computeMaterialStockMap(draft.stockTransactions)[mat.id] || 0;
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
      draft.stockTransactions.push(entry);
      return entry;
    });
    res.status(201).json(tx);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/suppliers', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim()) throw new Error('Supplier name is required.');
    const created = dbStore.mutate((draft) => {
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
      draft.suppliers.unshift(sup);
      return sup;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/material-issues', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const { materialRequestId, issueDate, items, remarks } = req.body as {
      materialRequestId: string;
      issueDate?: string;
      items: Array<{ materialId: string; issuingQty: number }>;
      remarks?: string;
    };
    const created = dbStore.mutate((draft) => {
      const mr = draft.materialRequests.find((m) => m.id === materialRequestId);
      if (!mr) throw new Error('NOT_FOUND:Material request not found.');
      if (mr.status === 'Fully Issued' || mr.status === 'Cancelled') {
        throw new Error(`Material request ${mr.docNo} is already ${mr.status}.`);
      }
      const stockMap = computeMaterialStockMap(draft.stockTransactions);
      const validLines = (items || []).filter((i) => Number(i.issuingQty) > 0);
      if (validLines.length === 0) {
        throw new Error('Enter a positive issuing quantity for at least one material.');
      }

      const issueItems = [];
      for (const line of validLines) {
        const mrItem = mr.items.find((x) => x.materialId === line.materialId);
        if (!mrItem) throw new Error(`Material ${line.materialId} is not on ${mr.docNo}.`);
        const available = stockMap[mrItem.materialId] || 0;
        const check = validateMaterialIssueLine({
          requiredQty: mrItem.requiredQty,
          alreadyIssuedQty: mrItem.issuedQty,
          availableStock: available,
          issuingQty: Number(line.issuingQty),
        });
        if (!check.valid) throw new Error(`${mrItem.materialName}: ${check.error}`);
        stockMap[mrItem.materialId] = check.stockAfter;
        mrItem.issuedQty = round2(mrItem.issuedQty + Number(line.issuingQty));
        issueItems.push({
          materialId: mrItem.materialId,
          materialCode: mrItem.materialCode,
          materialName: mrItem.materialName,
          unit: mrItem.unit,
          issuedQty: Number(line.issuingQty),
          receivedQty: 0,
        });
      }

      const now = new Date().toISOString();
      const mi = {
        id: generateId('mi'),
        docNo: nextDocNo(draft, 'MI'),
        materialRequestId: mr.id,
        materialRequestDocNo: mr.docNo,
        productionOrderId: mr.productionOrderId,
        productionOrderDocNo: mr.productionOrderDocNo,
        issueDate: issueDate || now.slice(0, 10),
        items: issueItems,
        receiptAcknowledged: false,
        issuedBy: req.user!.name,
        remarks: remarks?.trim() || '',
        createdAt: now,
      };
      draft.materialIssues.unshift(mi);

      const runningMap = computeMaterialStockMap(draft.stockTransactions);
      for (const ii of issueItems) {
        const bal = round2((runningMap[ii.materialId] || 0) - ii.issuedQty);
        runningMap[ii.materialId] = bal;
        draft.stockTransactions.push({
          id: generateId('st'),
          materialId: ii.materialId,
          materialCode: ii.materialCode,
          materialName: ii.materialName,
          unit: ii.unit,
          type: 'Material Issue',
          quantityDelta: -ii.issuedQty,
          balanceAfter: bal,
          linkedDocType: 'MI',
          linkedDocId: mi.id,
          linkedDocNo: mi.docNo,
          remarks: `Issued against ${mr.docNo} (${mr.productionOrderDocNo})`,
          performedBy: req.user!.name,
          timestamp: now,
        });
      }

      const derived = deriveMaterialRequestStatus(mr);
      mr.status = derived.status;
      mr.receiptStatus = derived.receiptStatus;
      mr.updatedAt = now;

      addNotification(draft, {
        title: `Materials Issued (${mi.docNo})`,
        message: `${mr.status} for ${mr.productionOrderDocNo}. Please acknowledge physical receipt in Production.`,
        department: 'production',
        severity: mr.status === 'Fully Issued' ? 'success' : 'info',
        link: '/production/material-receipts',
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: 'Issued Materials',
        entityType: 'MaterialIssue',
        entityId: mi.id,
        entityDocNo: mi.docNo,
        details: `Issued ${issueItems.length} material line(s) for ${mr.docNo} (${mr.status}).`,
      });
      return mi;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/supplier-pos', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.supplierId || !Array.isArray(body.items) || body.items.length === 0) {
      throw new Error('Supplier and at least one material line are required.');
    }
    const created = dbStore.mutate((draft) => {
      const sup = draft.suppliers.find((s) => s.id === body.supplierId);
      if (!sup) throw new Error('NOT_FOUND:Supplier not found.');
      const mr = body.materialRequestId
        ? draft.materialRequests.find((m) => m.id === body.materialRequestId)
        : undefined;

      const items: SupplierPOItem[] = body.items.map((it: any) => {
        const mat = draft.materials.find((m) => m.id === it.materialId);
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
      const taxPercent = Number(body.taxPercent ?? draft.company.defaultTaxPercent);
      const taxAmount = round2((subtotal * taxPercent) / 100);
      const totalAmount = round2(subtotal + taxAmount);
      const now = new Date().toISOString();

      const spo = {
        id: generateId('spo'),
        docNo: nextDocNo(draft, 'SPO'),
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
      draft.supplierPOs.unshift(spo);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: 'Created Supplier PO',
        entityType: 'SupplierPO',
        entityId: spo.id,
        entityDocNo: spo.docNo,
        details: `Created ${spo.purchaseType} PO ${spo.docNo} to ${sup.name}.`,
      });
      return spo;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/grns', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.supplierPoId || !body.invoiceOrChallanNo?.trim()) {
      throw new Error('Supplier PO reference and invoice / delivery challan number are required.');
    }
    const created = dbStore.mutate((draft) => {
      const spo = draft.supplierPOs.find((s) => s.id === body.supplierPoId);
      if (!spo) throw new Error('NOT_FOUND:Supplier PO not found.');
      const supReturn = body.supplierReturnId
        ? draft.supplierReturns.find((r) => r.id === body.supplierReturnId)
        : undefined;
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
      }

      const now = new Date().toISOString();
      const grn = {
        id: generateId('grn'),
        docNo: nextDocNo(draft, 'GRN'),
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
      draft.grns.unshift(grn);

      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: isReplacement ? 'Created Replacement GRN' : 'Created GRN',
        entityType: 'GRN',
        entityId: grn.id,
        entityDocNo: grn.docNo,
        details: `Recorded ${grn.docNo} against ${spo.docNo} (${grn.invoiceOrChallanNo}). Pending verification.`,
      });
      return grn;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/grns/:id/verify', requireAuth, requirePerm('supply_chain', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { items, verificationRemarks } = req.body as {
      items: Array<{ materialId: string; acceptedQty: number; rejectedQty: number; rejectionReason?: string }>;
      verificationRemarks?: string;
    };
    const updated = dbStore.mutate((draft) => {
      const grn = draft.grns.find((g) => g.id === req.params.id);
      if (!grn) throw new Error('NOT_FOUND:GRN not found.');
      if (grn.verificationStatus !== 'Pending') {
        throw new Error(`GRN ${grn.docNo} has already been verified (${grn.verificationStatus}).`);
      }
      const spo = draft.supplierPOs.find((s) => s.id === grn.supplierPoId);
      const stockMap = computeMaterialStockMap(draft.stockTransactions);
      const now = new Date().toISOString();

      let totalAccepted = 0;
      let totalRejected = 0;

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
          const nextBal = round2((stockMap[grnItem.materialId] || 0) + acc);
          stockMap[grnItem.materialId] = nextBal;
          draft.stockTransactions.push({
            id: generateId('st'),
            materialId: grnItem.materialId,
            materialCode: grnItem.materialCode,
            materialName: grnItem.materialName,
            unit: grnItem.unit,
            type: 'GRN Accepted',
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

      grn.verificationStatus =
        totalRejected === 0 ? 'Accepted' : totalAccepted === 0 ? 'Rejected' : 'Partially Accepted';
      grn.verifiedBy = req.user!.name;
      grn.verifiedAt = now;
      grn.verificationRemarks = verificationRemarks?.trim() || '';

      if (grn.isReplacement && grn.supplierReturnId) {
        const sr = draft.supplierReturns.find((r) => r.id === grn.supplierReturnId);
        if (sr) {
          sr.replacementStatus = totalAccepted >= sr.returnQty ? 'Replacement Received' : 'Pending Replacement';
          sr.replacementGrnId = grn.id;
          sr.replacementGrnDocNo = grn.docNo;
        }
      }

      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: 'Verified Material GRN',
        entityType: 'GRN',
        entityId: grn.id,
        entityDocNo: grn.docNo,
        details: `${grn.docNo}: ${grn.verificationStatus} (${totalAccepted} accepted into stock, ${totalRejected} rejected).`,
      });
      return grn;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

supplyChainRouter.post('/supply-chain/supplier-returns', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const grn = draft.grns.find((g) => g.id === body.grnId);
      if (!grn) throw new Error('NOT_FOUND:GRN not found.');
      const grnItem = grn.items.find((i) => i.materialId === body.materialId);
      if (!grnItem || grnItem.rejectedQty <= 0) {
        throw new Error('Selected material has no rejected quantity on this GRN.');
      }
      const alreadyReturned = draft.supplierReturns
        .filter((r) => r.grnId === grn.id && r.materialId === grnItem.materialId)
        .reduce((s, r) => s + r.returnQty, 0);
      const eligible = round2(grnItem.rejectedQty - alreadyReturned);
      const returnQty = round2(Number(body.returnQty));
      if (!returnQty || returnQty <= 0 || returnQty > eligible) {
        throw new Error(`Return qty must be between 1 and ${eligible} (eligible rejected units).`);
      }

      const now = new Date().toISOString();
      const replacementRequired = Boolean(body.replacementRequired);
      const sr = {
        id: generateId('sr'),
        docNo: nextDocNo(draft, 'SR'),
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
      draft.supplierReturns.unshift(sr);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: 'Created Supplier Return',
        entityType: 'SupplierReturn',
        entityId: sr.id,
        entityDocNo: sr.docNo,
        details: `Returned ${sr.returnQty} ${sr.unit} of ${sr.materialName} from ${grn.docNo} to ${sr.supplierName}.`,
      });
      return sr;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});
