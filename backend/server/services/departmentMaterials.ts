import type { ClientSession } from 'mongoose';
import type { Workspace, Values } from '../../../shared/departmentForms';
import type { WorkRecord, WorkEntry } from '../models/department.model';
import { MaterialModel, MaterialIssueModel, MaterialRequestModel, StockTransactionModel } from '../models';
import { mongoERPRepository as repo } from '../repositories/MongoERPRepository';
import { deriveMaterialRequestStatus, validateMaterialUnitQuantity } from '../../src/utils/erpLogic';
import { ensure, latest, money } from './departmentLogic';

export async function materialLines(rows: Values[], session: ClientSession | null) {
  ensure(
    new Set(rows.map((i) => i.materialId)).size === rows.length,
    'Combine repeated materials in one row.',
  );
  const materials = await MaterialModel.find({ id: { $in: rows.map((i) => i.materialId) }, active: true })
    .session(session)
    .lean();
  return rows.map((i) => {
    const m = materials.find((m) => m.id === i.materialId);
    ensure(m, 'Select an active material.');
    ensure(validateMaterialUnitQuantity(m.unit, i.quantity).valid, 'Invalid quantity for ' + m.unit);
    return {
      ...i,
      materialId: m.id,
      materialCode: m.code,
      materialName: m.name,
      unit: m.unit,
      requiredQty: i.quantity,
      issuedQty: 0,
      receivedQty: 0,
      usedQty: 0,
      returnedQty: 0,
    };
  });
}
export async function applyMaterials(dept: Workspace, r: WorkRecord, e: WorkEntry, session: ClientSession) {
  const d = e.data;
  if (e.action === 'parts' || e.action === 'request') {
    let items = await materialLines(
      e.action === 'parts' ? d.items : latest(r, 'bom')?.data.items || [],
      session,
    );
    if (dept === 'rnd') {
      const existing = await MaterialRequestModel.find({
        sourceId: r.id,
        status: { $ne: 'Cancelled' },
      }).session(session);
      items = items
        .map((i) => {
          const requested = existing
            .flatMap((m) => m.items)
            .filter((l) => l.materialId === i.materialId)
            .reduce((s, l) => s + l.requiredQty, 0);
          return { ...i, requiredQty: money(i.requiredQty - requested) };
        })
        .filter((i) => i.requiredQty > 0);
    }
    ensure(items.length, 'There are no outstanding materials to request.');
    const docNo = await repo.getNextDocNo('MR', session);
    await MaterialRequestModel.create(
      [
        {
          id: e.id,
          docNo,
          sourceType: dept,
          sourceId: r.id,
          sourceDocNo: r.docNo,
          productName: r.name,
          priority: r.details.priority,
          items,
          requestedBy: e.actorName,
          requestDate: e.at.slice(0, 10),
        },
      ],
      { session },
    );
    d.requestId = e.id;
    d.docNo = docNo;
    await repo.addNotification(
      {
        department: 'supply_chain',
        title: 'New material request ' + docNo,
        message: r.docNo + ' requires materials.',
        link: '/supply-chain/material-requests',
        severity: 'info',
      },
      session,
    );
    return;
  }
  const mr = await MaterialRequestModel.findOne({
    id: d.requestId,
    sourceId: r.id,
    sourceType: dept,
  }).session(session);
  const item = mr?.items.find((i) => i.materialId === d.materialId);
  ensure(
    item && validateMaterialUnitQuantity(item.unit, d.quantity).valid,
    'Choose a valid request line and quantity.',
  );
  if (e.action === 'receive') {
    ensure(d.quantity <= money(item.issuedQty - item.receivedQty), 'Receipt exceeds issued quantity.');
    // Allocate receipts against actual issue vouchers, oldest first.
    const issues = await MaterialIssueModel.find({ materialRequestId: mr.id, receiptAcknowledged: false })
      .sort({ createdAt: 1 })
      .session(session);
    let remaining = d.quantity;
    for (const issue of issues) {
      const line = issue.items.find((i) => i.materialId === item.materialId);
      if (!line || !remaining) continue;
      const take = Math.min(remaining, money(line.issuedQty - line.receivedQty));
      if (!take) continue;
      line.receivedQty = money(line.receivedQty + take);
      remaining = money(remaining - take);
      issue.receiptAcknowledged = issue.items.every((i) => i.issuedQty === i.receivedQty);
      if (issue.receiptAcknowledged) {
        issue.acknowledgedBy = e.actorName;
        issue.acknowledgedAt = e.at;
      }
      await issue.save({ session });
    }
    ensure(!remaining, 'Issue voucher quantities could not be reconciled.');
    item.receivedQty = money(item.receivedQty + d.quantity);
  } else {
    ensure(
      d.quantity <= money(item.receivedQty - (item.usedQty || 0) - (item.returnedQty || 0)),
      'Quantity exceeds unused, physically received stock.',
    );
    if (e.action === 'use') item.usedQty = money((item.usedQty || 0) + d.quantity);
    else {
      item.returnedQty = money((item.returnedQty || 0) + d.quantity);
      const mat = await MaterialModel.findOneAndUpdate(
        { id: item.materialId },
        { $inc: { currentStock: d.quantity } },
        { returnDocument: 'after', session },
      );
      ensure(mat, 'Material master missing.');
      await StockTransactionModel.create(
        [
          {
            id: e.id,
            materialId: mat.id,
            materialCode: mat.code,
            materialName: mat.name,
            unit: mat.unit,
            type: 'Service Return',
            quantityDelta: d.quantity,
            balanceAfter: mat.currentStock,
            linkedDocType: 'MR',
            linkedDocId: mr.id,
            linkedDocNo: mr.docNo,
            remarks: 'Unused parts from ' + r.docNo,
            performedBy: e.actorName,
            timestamp: e.at,
          },
        ],
        { session },
      );
    }
  }
  Object.assign(mr, deriveMaterialRequestStatus(mr));
  mr.increment();
  await mr.save({ session });
}
