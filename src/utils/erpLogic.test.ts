import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDurationDays,
  calculatePaymentSummary,
  calculateProductionProgress,
  calculateQuotationTotals,
  computeMaterialStockMap,
  deriveMaterialRequestStatus,
  deriveSalesOrderFulfillment,
  formatDocNo,
  getAvailableDispatchQty,
  getRemainingSOAllocatableQty,
  isProductionOrderDelayed,
  validateMaterialIssueLine,
} from './erpLogic';
import type { DeliveryOrder, PaymentEntry, ProductionOrder, SalesOrder, StockTransaction } from '../types/erp';

test('formatDocNo pads numbers to 4 digits', () => {
  assert.equal(formatDocNo('ENQ', 1), 'ENQ-0001');
  assert.equal(formatDocNo('SO', 42), 'SO-0042');
  assert.equal(formatDocNo('PROD', 1234), 'PROD-1234');
});

test('calculateQuotationTotals computes subtotal, discount, GST, and grand total', () => {
  const result = calculateQuotationTotals(
    [
      { quantity: 2, unitPrice: 250000 },
      { quantity: 1, unitPrice: 100000 },
    ],
    10,
    18,
  );
  assert.equal(result.subtotal, 600000);
  assert.equal(result.discountAmount, 60000);
  assert.equal(result.taxableAmount, 540000);
  assert.equal(result.taxAmount, 97200);
  assert.equal(result.totalAmount, 637200);
});

test('calculateDurationDays returns inclusive calendar days and -1 on invalid range', () => {
  assert.equal(calculateDurationDays('2026-11-01', '2026-11-01'), 1);
  assert.equal(calculateDurationDays('2026-11-01', '2026-11-10'), 10);
  assert.equal(calculateDurationDays('2026-11-10', '2026-11-01'), -1);
});

test('computeMaterialStockMap derives balance strictly from ledger transactions', () => {
  const txs: StockTransaction[] = [
    {
      id: 't1',
      materialId: 'm1',
      materialCode: 'MAT-001',
      materialName: 'Compressor',
      unit: 'Nos',
      type: 'Opening Balance',
      quantityDelta: 10,
      balanceAfter: 10,
      linkedDocType: 'Opening',
      linkedDocId: 'op1',
      linkedDocNo: 'OPEN-001',
      remarks: '',
      performedBy: 'Admin',
      timestamp: '2026-11-01T00:00:00Z',
    },
    {
      id: 't2',
      materialId: 'm1',
      materialCode: 'MAT-001',
      materialName: 'Compressor',
      unit: 'Nos',
      type: 'Material Issue',
      quantityDelta: -6,
      balanceAfter: 4,
      linkedDocType: 'MI',
      linkedDocId: 'mi1',
      linkedDocNo: 'MI-0001',
      remarks: '',
      performedBy: 'Store',
      timestamp: '2026-11-02T00:00:00Z',
    },
    {
      id: 't3',
      materialId: 'm1',
      materialCode: 'MAT-001',
      materialName: 'Compressor',
      unit: 'Nos',
      type: 'GRN Accepted',
      quantityDelta: 4,
      balanceAfter: 8,
      linkedDocType: 'GRN',
      linkedDocId: 'grn1',
      linkedDocNo: 'GRN-0001',
      remarks: '',
      performedBy: 'QC',
      timestamp: '2026-11-03T00:00:00Z',
    },
  ];
  const map = computeMaterialStockMap(txs);
  assert.equal(map.m1, 8);
});

test('validateMaterialIssueLine blocks negative stock and excess issuance', () => {
  const ok = validateMaterialIssueLine({
    requiredQty: 10,
    alreadyIssuedQty: 0,
    availableStock: 6,
    issuingQty: 6,
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.pendingAfter, 4);
  assert.equal(ok.stockAfter, 0);

  const overStock = validateMaterialIssueLine({
    requiredQty: 10,
    alreadyIssuedQty: 0,
    availableStock: 6,
    issuingQty: 7,
  });
  assert.equal(overStock.valid, false);

  const overReq = validateMaterialIssueLine({
    requiredQty: 10,
    alreadyIssuedQty: 6,
    availableStock: 20,
    issuingQty: 5,
  });
  assert.equal(overReq.valid, false);
});

test('deriveMaterialRequestStatus distinguishes issue status and physical receipt status', () => {
  const partial = deriveMaterialRequestStatus({
    status: 'Pending',
    items: [
      { materialId: 'm1', materialCode: 'C1', materialName: 'Comp', unit: 'Nos', requiredQty: 10, issuedQty: 6, receivedQty: 6 },
    ],
  });
  assert.equal(partial.status, 'Partially Issued');
  assert.equal(partial.receiptStatus, 'Partially Received');

  const fullIssuedNotReceived = deriveMaterialRequestStatus({
    status: 'Partially Issued',
    items: [
      { materialId: 'm1', materialCode: 'C1', materialName: 'Comp', unit: 'Nos', requiredQty: 10, issuedQty: 10, receivedQty: 6 },
    ],
  });
  assert.equal(fullIssuedNotReceived.status, 'Fully Issued');
  assert.equal(fullIssuedNotReceived.receiptStatus, 'Partially Received');
});

test('calculatePaymentSummary only counts Verified payments toward outstanding balance', () => {
  const payments: PaymentEntry[] = [
    {
      id: 'p1',
      docNo: 'PAY-0001',
      piId: 'pi1',
      salesOrderId: 'so1',
      customerId: 'c1',
      customerName: 'Test',
      amount: 200000,
      paymentDate: '2026-11-01',
      method: 'Bank Transfer',
      paymentType: 'Advance',
      transactionRef: 'UTR1',
      status: 'Verified',
      remarks: '',
      createdBy: 'Sales',
      createdAt: '2026-11-01',
    },
    {
      id: 'p2',
      docNo: 'PAY-0002',
      piId: 'pi1',
      salesOrderId: 'so1',
      customerId: 'c1',
      customerName: 'Test',
      amount: 100000,
      paymentDate: '2026-11-02',
      method: 'UPI',
      paymentType: 'Partial',
      transactionRef: 'UTR2',
      status: 'Pending',
      remarks: '',
      createdBy: 'Sales',
      createdAt: '2026-11-02',
    },
  ];
  const summary = calculatePaymentSummary(500000, payments, { piId: 'pi1', salesOrderId: 'so1' });
  assert.equal(summary.verifiedReceived, 200000);
  assert.equal(summary.pendingAmount, 100000);
  assert.equal(summary.outstandingBalance, 300000);
  assert.equal(summary.paymentStatus, 'Partial');
});

test('deriveSalesOrderFulfillment and allocation quantities follow production & delivery records', () => {
  const so = {
    id: 'so1',
    items: [{ id: 'i1', productId: 'prod1', productName: 'ULT', model: 'ULT-500', specifications: '', quantity: 2, unitPrice: 100, highlights: [], lineTotal: 200 }],
  } as unknown as SalesOrder;

  const prod = {
    id: 'po1',
    salesOrderId: 'so1',
    productId: 'prod1',
    quantity: 2,
    status: 'Completed',
    qcAcceptedQty: 2,
    dispatchedQty: 1,
  } as ProductionOrder;

  assert.equal(getRemainingSOAllocatableQty(so, 'prod1', [prod]), 0);

  const del1 = {
    id: 'd1',
    salesOrderId: 'so1',
    productionOrderId: 'po1',
    quantity: 1,
    deliveredQty: 1,
    status: 'Delivered',
  } as DeliveryOrder;

  assert.equal(getAvailableDispatchQty(prod, [del1]), 1);
  assert.equal(deriveSalesOrderFulfillment(so, [prod], [del1]), 'Partially Delivered');

  const del2 = {
    id: 'd2',
    salesOrderId: 'so1',
    productionOrderId: 'po1',
    quantity: 1,
    deliveredQty: 1,
    status: 'Delivered',
  } as DeliveryOrder;
  assert.equal(deriveSalesOrderFulfillment(so, [prod], [del1, del2]), 'Delivered');
});

test('calculateProductionProgress derives quantity and stage progress correctly', () => {
  const poPlanned = { id: 'p1', quantity: 10, completedManufacturingQty: 0, status: 'Planned' } as ProductionOrder;
  assert.equal(calculateProductionProgress(poPlanned).percent, 0);

  const poActive = { id: 'p2', quantity: 10, completedManufacturingQty: 4, status: 'In Progress' } as ProductionOrder;
  const activeProg = calculateProductionProgress(poActive);
  assert.equal(activeProg.percent, 40);
  assert.equal(activeProg.method, 'quantity');

  const poCompleted = { id: 'p3', quantity: 10, completedManufacturingQty: 10, status: 'Completed' } as ProductionOrder;
  assert.equal(calculateProductionProgress(poCompleted).percent, 100);
});

test('isProductionOrderDelayed detects overdue orders', () => {
  const po1 = { status: 'In Progress', plannedEndDate: '2026-11-01' } as ProductionOrder;
  assert.equal(isProductionOrderDelayed(po1, '2026-11-20'), true);

  const po2 = { status: 'In Progress', plannedEndDate: '2026-11-30' } as ProductionOrder;
  assert.equal(isProductionOrderDelayed(po2, '2026-11-20'), false);

  const po3 = { status: 'Completed', plannedEndDate: '2026-11-01' } as ProductionOrder;
  assert.equal(isProductionOrderDelayed(po3, '2026-11-20'), false);
});
