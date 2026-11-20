/**
 * Domain Service layer interfaces and orchestration functions for CRYO Enterprise ERP 2.0.
 */

import type { DeliveryOrder, PaymentEntry, ProductionOrder, SalesOrder } from '../../src/types/erp';
import {
  calculatePaymentSummary,
  calculateQuotationTotals,
  getAvailableDispatchQty,
  getRemainingSOAllocatableQty,
} from '../../src/utils/erpLogic';
import { DeliveryOrderModel, PaymentEntryModel, ProductionOrderModel } from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';

export class ERPBusinessService {
  public static async getStockMap() {
    return mongoERPRepository.computeStockMap();
  }

  public static async getPaymentSummary(totalAmount: number, filter: { piId?: string; salesOrderId?: string }) {
    const query: Record<string, any> = {};
    if (filter.salesOrderId) query.salesOrderId = filter.salesOrderId;
    else if (filter.piId) query.piId = filter.piId;
    const payments = await PaymentEntryModel.find(query).lean();
    return calculatePaymentSummary(totalAmount, payments as unknown as PaymentEntry[], filter);
  }

  public static async getRemainingAllocatableQty(so: SalesOrder, productId: string) {
    const prodOrders = await ProductionOrderModel.find({ salesOrderId: so.id }).lean();
    return getRemainingSOAllocatableQty(so, productId, prodOrders as unknown as ProductionOrder[]);
  }

  public static async getAvailableDispatch(po: ProductionOrder) {
    const deliveryOrders = await DeliveryOrderModel.find({ productionOrderId: po.id }).lean();
    return getAvailableDispatchQty(po, deliveryOrders as unknown as DeliveryOrder[]);
  }

  public static calculateTotals(items: Array<{ quantity: number; unitPrice: number }>, discount: number, tax: number) {
    return calculateQuotationTotals(items, discount, tax);
  }
}
