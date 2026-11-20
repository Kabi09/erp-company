import type {
  DeliveryOrder,
  MaterialRequest,
  PaymentEntry,
  ProductionOrder,
  QuotationItem,
  SalesOrder,
  SOPaymentStatus,
  SOFulfillmentStatus,
  StockTransaction,
} from '../types/erp';

export function formatDocNo(prefix: string, num: number): string {
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${symbol}${safe.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function calculateQuotationTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  discountPercent: number,
  taxPercent: number,
): {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
} {
  const subtotal = round2(
    items.reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.unitPrice), 0),
  );
  const clampedDiscount = Math.min(100, Math.max(0, discountPercent || 0));
  const discountAmount = round2((subtotal * clampedDiscount) / 100);
  const taxableAmount = round2(Math.max(0, subtotal - discountAmount));
  const clampedTax = Math.max(0, taxPercent || 0);
  const taxAmount = round2((taxableAmount * clampedTax) / 100);
  const totalAmount = round2(taxableAmount + taxAmount);
  return { subtotal, discountAmount, taxableAmount, taxAmount, totalAmount };
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateDurationDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return -1;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Derive current usable stock per material strictly from stock transactions.
 */
export function computeMaterialStockMap(transactions: StockTransaction[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const tx of transactions) {
    map[tx.materialId] = round2((map[tx.materialId] || 0) + tx.quantityDelta);
  }
  return map;
}

export function getMaterialStock(transactions: StockTransaction[], materialId: string): number {
  return computeMaterialStockMap(transactions)[materialId] || 0;
}

/**
 * Validate a material issue against both available stock and remaining requested qty.
 */
export function validateMaterialIssueLine(params: {
  requiredQty: number;
  alreadyIssuedQty: number;
  availableStock: number;
  issuingQty: number;
}): { valid: boolean; error?: string; pendingAfter: number; stockAfter: number } {
  const { requiredQty, alreadyIssuedQty, availableStock, issuingQty } = params;
  const pendingBefore = round2(requiredQty - alreadyIssuedQty);
  if (issuingQty < 0) {
    return { valid: false, error: 'Issue quantity cannot be negative.', pendingAfter: pendingBefore, stockAfter: availableStock };
  }
  if (issuingQty > pendingBefore) {
    return {
      valid: false,
      error: `Cannot issue ${issuingQty}; only ${pendingBefore} remaining on request.`,
      pendingAfter: pendingBefore,
      stockAfter: availableStock,
    };
  }
  if (issuingQty > availableStock) {
    return {
      valid: false,
      error: `Cannot issue ${issuingQty}; only ${availableStock} available in stock.`,
      pendingAfter: pendingBefore,
      stockAfter: availableStock,
    };
  }
  return {
    valid: true,
    pendingAfter: round2(pendingBefore - issuingQty),
    stockAfter: round2(availableStock - issuingQty),
  };
}

export function deriveMaterialRequestStatus(mr: Pick<MaterialRequest, 'items' | 'status'>): {
  status: MaterialRequest['status'];
  receiptStatus: MaterialRequest['receiptStatus'];
} {
  if (mr.status === 'Cancelled') {
    return { status: 'Cancelled', receiptStatus: 'Pending' };
  }
  const allIssued = mr.items.length > 0 && mr.items.every((i) => i.issuedQty >= i.requiredQty);
  const anyIssued = mr.items.some((i) => i.issuedQty > 0);
  const status: MaterialRequest['status'] = allIssued
    ? 'Fully Issued'
    : anyIssued
      ? 'Partially Issued'
      : 'Pending';

  const allReceived = mr.items.length > 0 && mr.items.every((i) => i.receivedQty >= i.requiredQty);
  const anyReceived = mr.items.some((i) => i.receivedQty > 0);
  const receiptStatus: MaterialRequest['receiptStatus'] = allReceived
    ? 'Fully Received'
    : anyReceived
      ? 'Partially Received'
      : 'Pending';

  return { status, receiptStatus };
}

/**
 * Payment summary calculated strictly from Verified payments.
 */
export function calculatePaymentSummary(
  totalAmount: number,
  payments: PaymentEntry[],
  filter: { piId?: string; salesOrderId?: string },
): {
  totalAmount: number;
  verifiedReceived: number;
  pendingAmount: number;
  outstandingBalance: number;
  paymentStatus: SOPaymentStatus;
} {
  const relevant = payments.filter((p) => {
    if (filter.salesOrderId && p.salesOrderId === filter.salesOrderId) return true;
    if (filter.piId && p.piId === filter.piId) return true;
    return false;
  });

  const verifiedReceived = round2(
    relevant.filter((p) => p.status === 'Verified').reduce((s, p) => s + p.amount, 0),
  );
  const pendingAmount = round2(
    relevant.filter((p) => p.status === 'Pending').reduce((s, p) => s + p.amount, 0),
  );
  const outstandingBalance = round2(Math.max(0, totalAmount - verifiedReceived));
  const paymentStatus: SOPaymentStatus =
    verifiedReceived <= 0
      ? 'Unpaid'
      : outstandingBalance <= 0.01
        ? 'Paid'
        : 'Partial';

  return {
    totalAmount: round2(totalAmount),
    verifiedReceived,
    pendingAmount,
    outstandingBalance,
    paymentStatus,
  };
}

/**
 * Derive Sales Order fulfillment status from linked production orders and delivery orders.
 * Keeps payment status completely separate from fulfillment.
 */
export function deriveSalesOrderFulfillment(
  so: SalesOrder,
  prodOrders: ProductionOrder[],
  deliveries: DeliveryOrder[],
): SOFulfillmentStatus {
  const orderedQty = so.items.reduce((s, i) => s + i.quantity, 0);
  const linkedProd = prodOrders.filter((p) => p.salesOrderId === so.id);
  const linkedDel = deliveries.filter((d) => d.salesOrderId === so.id && d.status !== 'Cancelled');

  const deliveredQty = linkedDel.reduce((s, d) => s + (d.deliveredQty || 0), 0);
  if (orderedQty > 0 && deliveredQty >= orderedQty) {
    return 'Delivered';
  }
  if (deliveredQty > 0) {
    return 'Partially Delivered';
  }
  if (linkedDel.some((d) => d.status === 'In Transit' || d.status === 'Dispatched')) {
    return 'In Transit';
  }
  if (linkedProd.some((p) => p.status === 'Completed' && p.qcAcceptedQty > p.dispatchedQty)) {
    return 'Ready for Dispatch';
  }
  if (linkedProd.some((p) => p.status === 'QC Pending' || p.status === 'Rework')) {
    return 'QC Pending';
  }
  if (linkedProd.length > 0) {
    return 'In Production';
  }
  return 'Awaiting Production';
}

export function getRemainingSOAllocatableQty(
  so: SalesOrder,
  productId: string,
  existingProdOrders: ProductionOrder[],
): number {
  const ordered = so.items
    .filter((i) => i.productId === productId)
    .reduce((sum, i) => sum + i.quantity, 0);
  const allocated = existingProdOrders
    .filter((p) => p.salesOrderId === so.id && p.productId === productId)
    .reduce((sum, p) => sum + p.quantity, 0);
  return Math.max(0, ordered - allocated);
}

export function getAvailableDispatchQty(
  prodOrder: ProductionOrder,
  existingDeliveries: DeliveryOrder[],
): number {
  const allocated = existingDeliveries
    .filter((d) => d.productionOrderId === prodOrder.id && d.status !== 'Cancelled')
    .reduce((sum, d) => sum + d.quantity, 0);
  return Math.max(0, prodOrder.qcAcceptedQty - allocated);
}

export function normalizeQuotationItems(
  items: Array<Omit<QuotationItem, 'lineTotal'>>,
): QuotationItem[] {
  return items.map((item) => ({
    ...item,
    lineTotal: round2(Math.max(0, item.quantity) * Math.max(0, item.unitPrice)),
  }));
}
