process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  CustomerModel,
  DeliveryIssueModel,
  DeliveryOrderModel,
  PaymentEntryModel,
  ProductionOrderModel,
  ProductModel,
  SalesOrderModel,
} from '../models';
import { calculatePaymentSummary } from '../../src/utils/erpLogic';
import { mongoERPRepository } from '../repositories/MongoERPRepository';

let server: http.Server;
let baseUrl = '';

async function startTestServer(): Promise<void> {
  await connectDatabase();
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}/api`;
      resolve();
    });
  });
}

async function stopTestServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await disconnectDatabase();
}

async function apiRequest<T = any>(
  path: string,
  options: { method?: string; body?: any; token?: string } = {},
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data: any = {};
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { text };
  }
  return { status: res.status, data };
}

test('CRYO ERP 2.0 Phase 8 — Logistics & Delivery Management Workflow Suite', async (t) => {
  await startTestServer();

  let adminToken = '';
  let logMgrToken = '';
  let salesExecToken = '';

  const [adminLogin, logLogin, salesLogin] = await Promise.all([
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'admin@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'log.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' } }),
  ]);

  adminToken = adminLogin.data.token;
  logMgrToken = logLogin.data.token;
  salesExecToken = salesLogin.data.token;

  assert.ok(adminToken, 'Admin token acquired');
  assert.ok(logMgrToken, 'Logistics Manager token acquired');
  assert.ok(salesExecToken, 'Sales Executive token acquired');

  const prodDoc = await ProductModel.findOne().lean();
  assert.ok(prodDoc, 'Default test product available');

  let helperSeq = 1000;
  function getUniqueTestId(prefix: string): string {
    helperSeq += 1;
    return `${prefix}-${Date.now().toString().slice(-6)}-${helperSeq}`;
  }

  // Helper builder for Sales Order + Completed Production Order
  async function createHelperCompletedPO(options: {
    qty?: number;
    qcAcceptedQty?: number;
    status?: any;
    paidAmount?: number;
    totalAmount?: number;
  } = {}): Promise<{ so: any; po: any }> {
    const qty = options.qty ?? 10;
    const qcAccepted = options.qcAcceptedQty !== undefined ? options.qcAcceptedQty : qty;
    const poStatus = options.status || 'Completed';
    const totalAmt = options.totalAmount ?? 500000;
    const paidAmt = options.paidAmount ?? 200000;

    const soId = `so_log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const soDocNo = getUniqueTestId('SO-LOG');
    const now = new Date().toISOString();

    const so: any = await SalesOrderModel.create({
      id: soId,
      docNo: soDocNo,
      enquiryId: `enq_${Date.now()}`,
      enquiryDocNo: `ENQ-${Date.now()}`,
      quotationId: `qt_${Date.now()}`,
      quotationDocNo: `QT-${Date.now()}`,
      piId: `pi_${Date.now()}`,
      piDocNo: `PI-${Date.now()}`,
      customerPoId: `cpo_${Date.now()}`,
      customerPoDocNo: `CPO-${Date.now()}`,
      customerPoNumber: `PO-EXT-${Date.now()}`,
      customerId: 'cust-1',
      customerSnapshot: {
        id: 'cust-1',
        name: 'ISRO Satellite Center',
        contactPerson: 'Dr. Radhakrishnan',
        phone: '+91 98450 12345',
        email: 'procurement@isro.gov.in',
        billingAddress: 'HAL Airport Road, Bengaluru',
        shippingAddress: 'Payload Integration Facility, ISRO Bangalore',
        gstin: '29AAATI1234M1Z5',
      },
      items: [
        {
          id: `so_item_${Date.now()}`,
          productId: prodDoc!.id,
          productName: prodDoc!.name,
          model: prodDoc!.model,
          specifications: prodDoc!.description,
          quantity: qty,
          unitPrice: Math.round(totalAmt / qty),
          lineTotal: totalAmt,
          highlights: ['Cryogenic Rated', 'Vacuum Insulated'],
        },
      ],
      subtotal: totalAmt,
      discountAmount: 0,
      taxAmount: totalAmt * 0.18,
      totalAmount: totalAmt * 1.18,
      paymentTerms: '40% advance, balance on delivery',
      deliveryTerms: 'Ex-Works Bengaluru',
      deliveryAddress: 'Payload Integration Facility, ISRO Bangalore',
      promisedDeliveryDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      commercialStatus: 'Confirmed',
      fulfillmentStatus: 'Ready for Dispatch',
      priority: 'High',
      remarks: 'Automated test sales order for Logistics Phase 8',
      createdBy: 'Sales Lead',
      createdAt: now,
      updatedAt: now,
    });

    const poId = `po_log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const poDocNo = getUniqueTestId('PO-LOG');

    const po: any = await ProductionOrderModel.create({
      id: poId,
      docNo: poDocNo,
      salesOrderId: so.id,
      salesOrderDocNo: so.docNo,
      customerId: so.customerId,
      customerName: so.customerSnapshot.name,
      productId: prodDoc!.id,
      productName: prodDoc!.name,
      model: prodDoc!.model,
      quantity: qty,
      plannedStartDate: now.slice(0, 10),
      plannedEndDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      plannedDurationDays: 7,
      productionInCharge: 'Suresh Kumar',
      actualStartDate: now.slice(0, 10),
      actualCompletionDate: now.slice(0, 10),
      status: poStatus,
      priority: 'High',
      qcAcceptedQty: qcAccepted,
      dispatchedQty: 0,
      deliveredQty: 0,
      serialNumbers: Array.from({ length: qty }, (_, i) => `CRYO-SN-${Date.now()}-${i + 1}`),
      instructions: 'Test completed production order for logistics',
      createdBy: 'Production Manager',
      createdAt: now,
      updatedAt: now,
    });

    return { so, po };
  }

  // =========================================================================
  // SCENARIO 1: Production Handoff & Auto-Appearance in Ready for Dispatch
  // =========================================================================
  await t.test('Scenario 1: Production Handoff — QC-Accepted Orders Appear in Ready for Dispatch', async () => {
    const { so, po } = await createHelperCompletedPO({ qty: 5, qcAcceptedQty: 5 });

    const res = await apiRequest<any[]>('/logistics/ready', {
      method: 'GET',
      token: logMgrToken,
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data), 'Ready for dispatch returns array');

    const matched = res.data.find((item) => item.id === po.id);
    assert.ok(matched, `PO ${po.docNo} must automatically appear in ready for dispatch`);
    assert.equal(matched.salesOrderId, so.id);
    assert.equal(matched.salesOrderDocNo, so.docNo);
    assert.equal(matched.qcAcceptedQty, 5);
    assert.equal(matched.availableQty, 5);
    assert.equal(matched.allocatedQty, 0);
    assert.equal(matched.serialNumbers.length, 5);
  });

  // =========================================================================
  // SCENARIO 2: QC Rejection Gate
  // =========================================================================
  await t.test('Scenario 2: QC Rejection Gate — Rejected / Incomplete POs Cannot Be Dispatched', async () => {
    // Zero accepted units
    const { po: zeroQcPo } = await createHelperCompletedPO({ qty: 5, qcAcceptedQty: 0 });
    // In progress PO
    const { po: inProgPo } = await createHelperCompletedPO({ qty: 5, qcAcceptedQty: 0, status: 'In Progress' });

    const res = await apiRequest<any[]>('/logistics/ready', {
      method: 'GET',
      token: logMgrToken,
    });

    assert.ok(!res.data.some((r) => r.id === zeroQcPo.id), 'PO with 0 QC accepted units must not appear');
    assert.ok(!res.data.some((r) => r.id === inProgPo.id), 'In Progress PO must not appear in ready list');

    // Attempt direct API creation on zero QC accepted order
    const attempt1 = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: zeroQcPo.id,
        quantity: 1,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-1122',
        driverName: 'Ramesh',
        driverPhone: '9845011223',
      },
    });

    assert.equal(attempt1.status, 400);
    assert.match(attempt1.data.error, /Only QC-accepted Completed production orders/i);
  });

  // =========================================================================
  // SCENARIO 3: Own Vehicle Delivery Workflow (Create -> Dispatch -> Deliver)
  // =========================================================================
  await t.test('Scenario 3: Own Vehicle Delivery — Full Dispatch, In Transit, and Handover', async () => {
    const { so, po } = await createHelperCompletedPO({ qty: 4, qcAcceptedQty: 4 });

    // 1. Create Delivery Order
    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 4,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-05-CR-9080',
        driverName: 'Manjunath',
        driverPhone: '+91 98450 12345',
        deliveryAddress: so.deliveryAddress,
      },
    });

    assert.equal(createRes.status, 201);
    const del = createRes.data;
    assert.ok(del.docNo.startsWith('DEL-'), 'DocNo generated');
    assert.equal(del.status, 'Planned');
    assert.equal(del.transportMethod, 'Own Vehicle');
    assert.equal(del.quantity, 4);

    // 2. Confirm Dispatch
    const dispatchRes = await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        deliveryChallanNo: 'DC-2026-9080',
        remarks: 'Loaded onto vehicle, nitrogen line secured.',
      },
    });

    assert.equal(dispatchRes.status, 200);
    assert.equal(dispatchRes.data.status, 'In Transit');
    assert.equal(dispatchRes.data.deliveryChallanNo, 'DC-2026-9080');

    // Verify PO dispatchedQty updated
    const updatedPO = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(updatedPO?.dispatchedQty, 4);

    // Verify SO fulfillment status updated
    const updatedSO = await SalesOrderModel.findOne({ id: so.id });
    assert.equal(updatedSO?.fulfillmentStatus, 'In Transit');

    // 3. Confirm Delivery
    const deliverRes = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        receivedBy: 'Dr. Radhakrishnan (Director PIF)',
        deliveredQty: 4,
        deliveryCondition: 'Good',
        remarks: 'All 4 cryogenic units inspected and accepted at payload bay.',
      },
    });

    assert.equal(deliverRes.status, 200);
    assert.equal(deliverRes.data.status, 'Delivered');
    assert.equal(deliverRes.data.deliveredQty, 4);

    // Verify PO deliveredQty
    const finalPO = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(finalPO?.deliveredQty, 4);

    // Verify SO final fulfillment status
    const finalSO = await SalesOrderModel.findOne({ id: so.id });
    assert.equal(finalSO?.fulfillmentStatus, 'Delivered');
  });

  // =========================================================================
  // SCENARIO 4: Courier Delivery Workflow (AWB Tracking & History)
  // =========================================================================
  await t.test('Scenario 4: Courier Delivery — Courier AWB Verification and Delivery Record', async () => {
    const { so, po } = await createHelperCompletedPO({ qty: 3, qcAcceptedQty: 3 });

    // Create Courier DO
    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 3,
        transportMethod: 'Courier',
        courierCompany: 'Blue Dart Aviation',
      },
    });

    assert.equal(createRes.status, 201);
    const del = createRes.data;
    assert.equal(del.transportMethod, 'Courier');

    // Dispatch requires AWB/tracking number for courier
    const dispatchFail = await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        deliveryChallanNo: 'DC-2026-7788',
      },
    });
    assert.equal(dispatchFail.status, 400);
    assert.match(dispatchFail.data.error, /Tracking \/ AWB number is required/i);

    // Successful Courier dispatch with AWB
    const dispatchOk = await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        deliveryChallanNo: 'DC-2026-7788',
        trackingNumber: 'AWB-BLUEDART-9921',
      },
    });
    assert.equal(dispatchOk.status, 200);
    assert.equal(dispatchOk.data.status, 'In Transit');
    assert.equal(dispatchOk.data.trackingNumber, 'AWB-BLUEDART-9921');

    // Confirm delivery
    const deliverRes = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        receivedBy: 'Receiving Dock Lead',
        deliveredQty: 3,
      },
    });
    assert.equal(deliverRes.status, 200);
    assert.equal(deliverRes.data.status, 'Delivered');

    // Check history trace on delivery detail endpoint
    const detailRes = await apiRequest(`/logistics/delivery-orders/${del.id}`, {
      method: 'GET',
      token: logMgrToken,
    });
    assert.equal(detailRes.status, 200);
    assert.ok(detailRes.data.history.length >= 3, 'Creation, dispatch, and delivery recorded in history');
  });

  // =========================================================================
  // SCENARIO 5: Conditional Transportation Validation
  // =========================================================================
  await t.test('Scenario 5: Conditional Transportation Validation — Field Separation', async () => {
    const { po } = await createHelperCompletedPO({ qty: 5, qcAcceptedQty: 5 });

    // Own Vehicle missing driver info
    const failOwn = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 2,
        transportMethod: 'Own Vehicle',
        // missing vehicleNumber, driverName, driverPhone
      },
    });
    assert.equal(failOwn.status, 400);
    assert.match(failOwn.data.error, /Vehicle number, driver name, and driver phone are required/i);

    // Courier missing company name
    const failCourier = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 2,
        transportMethod: 'Courier',
        // missing courierCompany
      },
    });
    assert.equal(failCourier.status, 400);
    assert.match(failCourier.data.error, /Courier company name is required/i);
  });

  // =========================================================================
  // SCENARIO 6: Partial Delivery Handling
  // =========================================================================
  await t.test('Scenario 6: Partial Delivery — Staged Handover & Obligation Integrity', async () => {
    const { so, po } = await createHelperCompletedPO({ qty: 10, qcAcceptedQty: 10 });

    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 10,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-4400',
        driverName: 'Kumar',
        driverPhone: '9845099881',
      },
    });
    const del = createRes.data;

    await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: { deliveryChallanNo: 'DC-2026-PARTIAL' },
    });

    // 1st Partial Delivery: 6 of 10 units
    const partRes = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        receivedBy: 'Floor Supervisor',
        deliveredQty: 6,
      },
    });

    assert.equal(partRes.status, 200);
    assert.equal(partRes.data.status, 'Partially Delivered');
    assert.equal(partRes.data.deliveredQty, 6);

    const checkSO = await SalesOrderModel.findOne({ id: so.id });
    assert.equal(checkSO?.fulfillmentStatus, 'Partially Delivered');

    // Attempt to deliver 5 units (exceeds remaining 4)
    const excessRes = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        receivedBy: 'Floor Supervisor',
        deliveredQty: 5,
      },
    });
    assert.equal(excessRes.status, 400);
    assert.match(excessRes.data.error, /only 4 unit\(s\) remaining/i);

    // 2nd Delivery: Remaining 4 units
    const finalRes = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        receivedBy: 'Site Manager',
        deliveredQty: 4,
      },
    });
    assert.equal(finalRes.status, 200);
    assert.equal(finalRes.data.status, 'Delivered');
    assert.equal(finalRes.data.deliveredQty, 10);

    const finalSO = await SalesOrderModel.findOne({ id: so.id });
    assert.equal(finalSO?.fulfillmentStatus, 'Delivered');
  });

  // =========================================================================
  // SCENARIO 7: Over-Allocation Guard
  // =========================================================================
  await t.test('Scenario 7: Over-Allocation Guard — Cannot Exceed Available QC Units', async () => {
    const { po } = await createHelperCompletedPO({ qty: 5, qcAcceptedQty: 5 });

    // Allocate 3 units
    const del1 = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 3,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-1111',
        driverName: 'Driver A',
        driverPhone: '9845011111',
      },
    });
    assert.equal(del1.status, 201);

    // Attempt to allocate 4 units (only 2 left)
    const del2 = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 4,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-2222',
        driverName: 'Driver B',
        driverPhone: '9845022222',
      },
    });
    assert.equal(del2.status, 400);
    assert.match(del2.data.error, /only 2 available/i);

    // Allocate exact remaining 2 units
    const del3 = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 2,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-2222',
        driverName: 'Driver B',
        driverPhone: '9845022222',
      },
    });
    assert.equal(del3.status, 201);

    // Ready list must now exclude this PO
    const readyRes = await apiRequest<any[]>('/logistics/ready', { method: 'GET', token: logMgrToken });
    assert.ok(!readyRes.data.some((r) => r.id === po.id), 'Fully allocated PO must not appear in ready list');
  });

  // =========================================================================
  // SCENARIO 8: Concurrent Delivery Allocation
  // =========================================================================
  await t.test('Scenario 8: Concurrent Delivery Allocation — Race Condition Prevention', async () => {
    const { po } = await createHelperCompletedPO({ qty: 10, qcAcceptedQty: 10 });

    // Two simultaneous requests attempting to allocate 8 units each (Total 16 > 10)
    const [res1, res2] = await Promise.all([
      apiRequest('/logistics/delivery-orders', {
        method: 'POST',
        token: logMgrToken,
        body: {
          productionOrderId: po.id,
          quantity: 8,
          transportMethod: 'Own Vehicle',
          vehicleNumber: 'KA-02-C-101',
          driverName: 'Driver 1',
          driverPhone: '9876543210',
        },
      }),
      apiRequest('/logistics/delivery-orders', {
        method: 'POST',
        token: logMgrToken,
        body: {
          productionOrderId: po.id,
          quantity: 8,
          transportMethod: 'Own Vehicle',
          vehicleNumber: 'KA-02-C-102',
          driverName: 'Driver 2',
          driverPhone: '9876543211',
        },
      }),
    ]);

    const statuses = [res1.status, res2.status];
    const successCount = statuses.filter((s) => s === 201).length;
    const failCount = statuses.filter((s) => s === 400 || s === 409).length;

    assert.equal(successCount, 1, 'Exactly one concurrent request must succeed');
    assert.equal(failCount, 1, 'The competing request must fail');

    // Total allocations in database must not exceed 10
    const allDel = await DeliveryOrderModel.find({ productionOrderId: po.id, status: { $ne: 'Cancelled' } });
    const totalAllocated = allDel.reduce((sum, d) => sum + d.quantity, 0);
    assert.equal(totalAllocated, 8, 'Total allocated quantity must remain strictly 8');
  });

  // =========================================================================
  // SCENARIO 9: Duplicate Dispatch Guard
  // =========================================================================
  await t.test('Scenario 9: Duplicate Dispatch Guard — Cannot Dispatch Twice', async () => {
    const { po } = await createHelperCompletedPO({ qty: 4, qcAcceptedQty: 4 });

    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 4,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-03-CR-9900',
        driverName: 'Ravi',
        driverPhone: '9845012345',
      },
    });
    const del = createRes.data;

    const dispatch1 = await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: { deliveryChallanNo: 'DC-2026-DUP-1' },
    });
    assert.equal(dispatch1.status, 200);

    // Second dispatch must fail
    const dispatch2 = await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: { deliveryChallanNo: 'DC-2026-DUP-2' },
    });
    assert.equal(dispatch2.status, 400);
    assert.match(dispatch2.data.error, /already been dispatched/i);

    // Verify PO dispatchedQty was incremented only once
    const updatedPO = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(updatedPO?.dispatchedQty, 4);
  });

  // =========================================================================
  // SCENARIO 10: Invalid Delivery Confirmation Gates
  // =========================================================================
  await t.test('Scenario 10: Invalid Delivery Confirmation Gates', async () => {
    const { po } = await createHelperCompletedPO({ qty: 5, qcAcceptedQty: 5 });

    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 5,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-8877',
        driverName: 'Gopal',
        driverPhone: '9845011999',
      },
    });
    const del = createRes.data;

    // 1. Cannot deliver before dispatch (status: Planned)
    const deliverEarly = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: { receivedBy: 'Receiver', deliveredQty: 5 },
    });
    assert.equal(deliverEarly.status, 400);
    assert.match(deliverEarly.data.error, /must be dispatched before confirming delivery/i);

    // Now dispatch
    await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: { deliveryChallanNo: 'DC-2026-GATE' },
    });

    // 2. Cannot deliver without receivedBy
    const missingRec = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: { receivedBy: '', deliveredQty: 5 },
    });
    assert.equal(missingRec.status, 400);
    assert.match(missingRec.data.error, /Receiver name is required/i);

    // 3. Cannot deliver negative or zero quantity
    const zeroQty = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: { receivedBy: 'Receiver', deliveredQty: 0 },
    });
    assert.equal(zeroQty.status, 400);
  });

  // =========================================================================
  // SCENARIO 11: Delivery Issue and Retry Transit
  // =========================================================================
  await t.test('Scenario 11: Delivery Issue & Retry — Lifecycle Continuity', async () => {
    const { po } = await createHelperCompletedPO({ qty: 6, qcAcceptedQty: 6 });

    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 6,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-04-CR-7766',
        driverName: 'Shankar',
        driverPhone: '9845077665',
      },
    });
    const del = createRes.data;

    await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: { deliveryChallanNo: 'DC-2026-ISSUE' },
    });

    // Report delivery issue
    const issueRes = await apiRequest(`/logistics/delivery-orders/${del.id}/report-issue`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        issueType: 'Customer Unavailable',
        reason: 'Client site closed due to public holiday',
        affectedQty: 6,
      },
    });
    assert.equal(issueRes.status, 201);
    const issue = issueRes.data;
    assert.equal(issue.status, 'Open');

    // DO status must be Issue
    const delIssue = await DeliveryOrderModel.findOne({ id: del.id });
    assert.equal(delIssue?.status, 'Issue');

    // Resolve issue with Retry Delivery
    const resolveRes = await apiRequest(`/logistics/delivery-issues/${issue.id}/resolve`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        resolutionOutcome: 'Retry Delivery',
        resolutionNotes: 'Customer confirmed availability tomorrow 10am',
        retryTransit: true,
      },
    });
    assert.equal(resolveRes.status, 200);
    assert.equal(resolveRes.data.status, 'Resolved');

    // DO must return to In Transit
    const delRetry = await DeliveryOrderModel.findOne({ id: del.id });
    assert.equal(delRetry?.status, 'In Transit');

    // Confirm delivery on retry
    const deliverFinal = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: { receivedBy: 'Site Engineer', deliveredQty: 6 },
    });
    assert.equal(deliverFinal.status, 200);
    assert.equal(deliverFinal.data.status, 'Delivered');
  });

  // =========================================================================
  // SCENARIO 12: Damaged Product Delivery Report
  // =========================================================================
  await t.test('Scenario 12: Damaged Product Delivery Report — Condition Flagging', async () => {
    const { po } = await createHelperCompletedPO({ qty: 2, qcAcceptedQty: 2 });

    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 2,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-05-CR-3344',
        driverName: 'Devraj',
        driverPhone: '9845033445',
      },
    });
    const del = createRes.data;

    await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: { deliveryChallanNo: 'DC-2026-DMG' },
    });

    // Delivery confirmation with damage result
    const dmgRes = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        result: 'Delivery Issue',
        deliveryCondition: 'Damaged',
        issueReason: 'Packaging punctured, temperature gauge shattered',
        issueType: 'Product Damaged',
      },
    });

    assert.equal(dmgRes.status, 200);
    assert.equal(dmgRes.data.status, 'Issue');
    assert.equal(dmgRes.data.deliveryCondition, 'Damaged');

    // Units must NOT be marked delivered
    const checkDel = await DeliveryOrderModel.findOne({ id: del.id });
    assert.equal(checkDel?.deliveredQty, 0);

    // Resolve with Return to CRYO
    const openIssue = await DeliveryIssueModel.findOne({ deliveryOrderId: del.id });
    assert.ok(openIssue);

    const resolveRes = await apiRequest(`/logistics/delivery-issues/${openIssue.id}/resolve`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        resolutionOutcome: 'Returned to CRYO',
        resolutionNotes: 'Returned to plant for rework and defect analysis',
      },
    });
    assert.equal(resolveRes.status, 200);

    const updatedDO = await DeliveryOrderModel.findOne({ id: del.id });
    assert.match(updatedDO?.remarks || '', /Returned to CRYO/i);
  });

  // =========================================================================
  // SCENARIO 13: Cancellation Before Dispatch
  // =========================================================================
  await t.test('Scenario 13: Safe Cancellation Before Dispatch — Allocation Released', async () => {
    const { po } = await createHelperCompletedPO({ qty: 8, qcAcceptedQty: 8 });

    // Create Planned DO for 5 units
    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 5,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-5544',
        driverName: 'Driver X',
        driverPhone: '9845055443',
      },
    });
    const del = createRes.data;

    // Check ready list: remaining available should be 3
    const ready1 = await apiRequest<any[]>('/logistics/ready', { method: 'GET', token: logMgrToken });
    const match1 = ready1.data.find((r) => r.id === po.id);
    assert.equal(match1?.availableQty, 3);

    // Cancel Planned DO
    const cancelRes = await apiRequest(`/logistics/delivery-orders/${del.id}/cancel`, {
      method: 'POST',
      token: logMgrToken,
      body: { reason: 'Customer requested reschedule of shipment to next month' },
    });

    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.data.status, 'Cancelled');
    assert.equal(cancelRes.data.cancellationReason, 'Customer requested reschedule of shipment to next month');

    // Check ready list: available must be back to 8!
    const ready2 = await apiRequest<any[]>('/logistics/ready', { method: 'GET', token: logMgrToken });
    const match2 = ready2.data.find((r) => r.id === po.id);
    assert.equal(match2?.availableQty, 8, 'Full 8 units available again after cancellation');

    // Cannot cancel already dispatched order
    const { po: po2 } = await createHelperCompletedPO({ qty: 2, qcAcceptedQty: 2 });
    const createRes2 = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po2.id,
        quantity: 2,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-1212',
        driverName: 'Driver Y',
        driverPhone: '9845012121',
      },
    });
    const del2 = createRes2.data;

    await apiRequest(`/logistics/delivery-orders/${del2.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: { deliveryChallanNo: 'DC-2026-NOCANCEL' },
    });

    const cancelDispatched = await apiRequest(`/logistics/delivery-orders/${del2.id}/cancel`, {
      method: 'POST',
      token: logMgrToken,
      body: { reason: 'Try cancel' },
    });
    assert.equal(cancelDispatched.status, 400);
    assert.match(cancelDispatched.data.error, /cannot be cancelled because it is already In Transit/i);
  });

  // =========================================================================
  // SCENARIO 14: Proof of Delivery (POD) Validation
  // =========================================================================
  await t.test('Scenario 14: Proof of Delivery (POD) — Attachment Type & Size Validation', async () => {
    const { po } = await createHelperCompletedPO({ qty: 3, qcAcceptedQty: 3 });

    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 3,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-02-CR-8899',
        driverName: 'Driver Z',
        driverPhone: '9845088990',
      },
    });
    const del = createRes.data;

    await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: { deliveryChallanNo: 'DC-2026-POD' },
    });

    // 1. Unsupported file extension
    const badExt = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        receivedBy: 'Receiver',
        deliveredQty: 3,
        podName: 'invoice_virus.exe',
        podDataUrl: 'data:application/octet-stream;base64,AAA=',
      },
    });
    assert.equal(badExt.status, 400);
    assert.match(badExt.data.error, /Unsupported file type/i);

    // 2. Oversized attachment (> 5MB)
    const oversized = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        receivedBy: 'Receiver',
        deliveredQty: 3,
        podName: 'huge_document.pdf',
        podFileSize: 6 * 1024 * 1024,
      },
    });
    assert.equal(oversized.status, 400);
    assert.match(oversized.data.error, /exceeds maximum allowed size of 5 MB/i);

    // 3. Valid PDF attachment
    const validPod = await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        receivedBy: 'Receiver',
        deliveredQty: 3,
        podName: 'signed_delivery_challan.pdf',
        podDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK...',
        podFileSize: 102400,
      },
    });
    assert.equal(validPod.status, 200);
    assert.equal(validPod.data.status, 'Delivered');
    assert.equal(validPod.data.podName, 'signed_delivery_challan.pdf');
  });

  // =========================================================================
  // SCENARIO 15: Sales Payment Independence
  // =========================================================================
  await t.test('Scenario 15: Sales Payment Independence — Delivery Does Not Alter Financial Balances', async () => {
    // SO total: Rs. 500,000, advance paid: Rs. 200,000
    const { so, po } = await createHelperCompletedPO({
      qty: 4,
      qcAcceptedQty: 4,
      totalAmount: 500000,
      paidAmount: 200000,
    });

    // Record verified payment entry
    await PaymentEntryModel.create({
      id: `pe_${Date.now()}`,
      docNo: `PAY-${Date.now()}`,
      salesOrderId: so.id,
      salesOrderDocNo: so.docNo,
      customerId: so.customerId,
      customerName: so.customerSnapshot.name,
      amount: 200000,
      paymentDate: new Date().toISOString().slice(0, 10),
      transactionRef: `UTR-${Date.now()}`,
      status: 'Verified',
      verifiedBy: 'Finance Manager',
      verifiedAt: new Date().toISOString(),
      createdBy: 'Finance Manager',
      createdAt: new Date().toISOString(),
    });

    const createRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 4,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-7777',
        driverName: 'Driver W',
        driverPhone: '9845077777',
      },
    });
    const del = createRes.data;

    await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: { deliveryChallanNo: 'DC-2026-INDEP' },
    });

    await apiRequest(`/logistics/delivery-orders/${del.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: { receivedBy: 'Receiver', deliveredQty: 4 },
    });

    // Check SO state
    const verifiedSO = await SalesOrderModel.findOne({ id: so.id });
    assert.equal(verifiedSO?.fulfillmentStatus, 'Delivered', 'Fulfillment becomes Delivered');

    // Verify payments & balances remain independent
    const payments = await PaymentEntryModel.find({ salesOrderId: so.id }).lean();
    const paySummary = calculatePaymentSummary(
      verifiedSO?.totalAmount || 500000,
      payments as any,
      { salesOrderId: so.id },
    );

    assert.equal(paySummary.paymentStatus, 'Partial', 'Payment status remains strictly Partial');
    assert.equal(paySummary.verifiedReceived, 200000, 'Total verified payment remains unchanged');
    assert.ok(paySummary.outstandingBalance > 0, 'Outstanding balance is retained');
  });

  // =========================================================================
  // SCENARIO 16: Transaction Rollback Safety
  // =========================================================================
  await t.test('Scenario 16: Transaction Rollback Safety — Atomicity on Failure', async () => {
    const { po } = await createHelperCompletedPO({ qty: 2, qcAcceptedQty: 2 });

    // Attempt allocation exceeding available
    const failRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 5, // exceeds 2
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-9999',
        driverName: 'Driver F',
        driverPhone: '9845099999',
      },
    });
    assert.equal(failRes.status, 400);

    // Ensure no orphaned delivery order was created
    const createdDOs = await DeliveryOrderModel.find({ productionOrderId: po.id });
    assert.equal(createdDOs.length, 0, 'No delivery order must exist after rollback');
  });

  // =========================================================================
  // SCENARIO 17: RBAC Role & Permission Boundary Enforcement
  // =========================================================================
  await t.test('Scenario 17: RBAC Permission Boundaries — Enforced on API Endpoints', async () => {
    const { po } = await createHelperCompletedPO({ qty: 3, qcAcceptedQty: 3 });

    // Sales Executive lacks logistics:create
    const unauthorizedCreate = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: salesExecToken,
      body: {
        productionOrderId: po.id,
        quantity: 3,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-1122',
        driverName: 'Driver E',
        driverPhone: '9845011223',
      },
    });
    assert.equal(unauthorizedCreate.status, 403, 'Sales Executive blocked from creating Delivery Order');

    // Logistics Manager can create
    const authorizedCreate = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: po.id,
        quantity: 3,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-CR-1122',
        driverName: 'Driver E',
        driverPhone: '9845011223',
      },
    });
    assert.equal(authorizedCreate.status, 201, 'Logistics Manager authorized to create');
    const del = authorizedCreate.data;

    // Sales Executive lacks logistics:edit (cannot dispatch)
    const unauthorizedDispatch = await apiRequest(`/logistics/delivery-orders/${del.id}/dispatch`, {
      method: 'POST',
      token: salesExecToken,
      body: { deliveryChallanNo: 'DC-UNAUTH' },
    });
    assert.equal(unauthorizedDispatch.status, 403, 'Sales Executive blocked from confirming dispatch');

    // Logistics Manager can access reports and summary
    const summaryRes = await apiRequest('/logistics/summary', { method: 'GET', token: logMgrToken });
    assert.equal(summaryRes.status, 200);

    const reportRes = await apiRequest('/logistics/reports', { method: 'GET', token: logMgrToken });
    assert.equal(reportRes.status, 200);
    assert.ok(reportRes.data.transportMethodBreakdown);
  });

  await stopTestServer();
});
