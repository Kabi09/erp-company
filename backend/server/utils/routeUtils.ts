import type { Response } from 'express';
import type { ClientSession } from 'mongoose';
import type { DocCounters, ERPDatabase, SalesOrder } from '../../src/types/erp';
import { deriveSalesOrderFulfillment } from '../../src/utils/erpLogic';
import { DeliveryOrderModel, ProductionOrderModel, SalesOrderModel } from '../models';

export const PREFIX_MAP: Record<string, string> = {
  ENQ: 'ENQ',
  QT: 'QT',
  PI: 'PI',
  CPO: 'CPO',
  PAY: 'PAY',
  SO: 'SO',
  PROD: 'PROD',
  BOM: 'BOM',
  MR: 'MR',
  SPO: 'SPO',
  GRN: 'GRN',
  MI: 'MI',
  SR: 'SR',
  QC: 'QC',
  RW: 'RW',
  DEL: 'DEL',
  EMP: 'EMP',
  SRV: 'SRV',
  JOB: 'JOB',
  RND: 'RND',
  SMR: 'SMR',
  EXP: 'EXP',
  ADV: 'ADV',
  SBL: 'SBL',
  DP: 'DP',
};

export const generateId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function sendError(res: Response, err: unknown, defaultStatus = 400): void {
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  const status = message.startsWith('FORBIDDEN:')
    ? 403
    : message.startsWith('NOT_FOUND:')
      ? 404
      : message.startsWith('CONCURRENCY_CONFLICT:')
        ? 409
        : defaultStatus;
  res.status(status).json({ error: message.replace(/^(FORBIDDEN|NOT_FOUND|CONCURRENCY_CONFLICT):/, '').trim() });
}

export function syncSOFulfillment(draft: ERPDatabase, salesOrderId: string): void {
  const so = draft.salesOrders.find((s) => s.id === salesOrderId);
  if (!so) return;
  so.fulfillmentStatus = deriveSalesOrderFulfillment(so, draft.productionOrders, draft.deliveryOrders);
  so.updatedAt = new Date().toISOString();
}

export async function syncSalesOrderFulfillmentMongo(
  salesOrderId: string,
  session?: ClientSession | null,
): Promise<SalesOrder | null> {
  const so = await SalesOrderModel.findOne({ id: salesOrderId }).session(session || null);
  if (!so) return null;
  const prodOrders = await ProductionOrderModel.find({ salesOrderId }).session(session || null).lean();
  const deliveryOrders = await DeliveryOrderModel.find({ salesOrderId }).session(session || null).lean();
  const newStatus = deriveSalesOrderFulfillment(so.toObject() as any, prodOrders as any, deliveryOrders as any);
  if (so.fulfillmentStatus !== newStatus) {
    so.fulfillmentStatus = newStatus;
    await so.save({ session: session || undefined });
  }
  return so.toObject() as any;
}
