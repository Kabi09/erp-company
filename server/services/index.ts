/**
 * Domain Service layer interfaces and orchestration functions for CRYO Enterprise ERP 2.0.
 */

import type { DeliveryOrder, MaterialRequest, PaymentEntry, ProductionOrder, SalesOrder } from '../../src/types/erp';
import {
  calculatePaymentSummary,
  calculateQuotationTotals,
  computeMaterialStockMap,
  deriveMaterialRequestStatus,
  deriveSalesOrderFulfillment,
  getAvailableDispatchQty,
  getRemainingSOAllocatableQty,
  validateMaterialIssueLine,
} from '../../src/utils/erpLogic';
import { dbStore } from '../db';

export class ERPBusinessService {
  public static getStockMap() {
    return computeMaterialStockMap(dbStore.getState().stockTransactions);
  }

  public static getPaymentSummary(totalAmount: number, filter: { piId?: string; salesOrderId?: string }) {
    return calculatePaymentSummary(totalAmount, dbStore.getState().payments, filter);
  }

  public static getRemainingAllocatableQty(so: SalesOrder, productId: string) {
    return getRemainingSOAllocatableQty(so, productId, dbStore.getState().productionOrders);
  }

  public static getAvailableDispatch(po: ProductionOrder) {
    return getAvailableDispatchQty(po, dbStore.getState().deliveryOrders);
  }

  public static calculateTotals(items: Array<{ quantity: number; unitPrice: number }>, discount: number, tax: number) {
    return calculateQuotationTotals(items, discount, tax);
  }
}
