import type { Response } from 'express';
import type { ERPDatabase } from '../../src/types/erp';
import { deriveSalesOrderFulfillment } from '../../src/utils/erpLogic';

export function sendError(res: Response, err: unknown, defaultStatus = 400): void {
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  const status = message.startsWith('FORBIDDEN:') ? 403 : message.startsWith('NOT_FOUND:') ? 404 : defaultStatus;
  res.status(status).json({ error: message.replace(/^(FORBIDDEN|NOT_FOUND):/, '').trim() });
}

export function syncSOFulfillment(draft: ERPDatabase, salesOrderId: string): void {
  const so = draft.salesOrders.find((s) => s.id === salesOrderId);
  if (!so) return;
  so.fulfillmentStatus = deriveSalesOrderFulfillment(so, draft.productionOrders, draft.deliveryOrders);
  so.updatedAt = new Date().toISOString();
}
