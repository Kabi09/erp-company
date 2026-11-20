process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  BOMModel,
  CustomerModel,
  CustomerPOModel,
  DailyProductionUpdateModel,
  MaterialIssueModel,
  MaterialModel,
  MaterialRequestModel,
  ProductionOrderModel,
  ProductionReturnModel,
  ProductModel,
  QualityCheckModel,
  QuotationModel,
  ReworkOrderModel,
  SalesOrderModel,
  StockTransactionModel,
  SupplierModel,
} from '../models';
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

test('CRYO ERP 2.0 Phase 7 — Production Management Workflow, Concurrency & Manufacturing Integrity Suite', async (t) => {
  await startTestServer();

  let adminToken = '';
  let prodMgrToken = '';
  let scMgrToken = '';
  let salesExecToken = '';

  const [adminLogin, prodLogin, scLogin, salesLogin] = await Promise.all([
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'admin@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'prod.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sc.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' } }),
  ]);

  adminToken = adminLogin.data.token;
  prodMgrToken = prodLogin.data.token;
  scMgrToken = scLogin.data.token;
  salesExecToken = salesLogin.data.token;

  assert.ok(adminToken, 'Admin token acquired');
  assert.ok(prodMgrToken, 'Production Manager token acquired');
  assert.ok(scMgrToken, 'Supply Chain Manager token acquired');
  assert.ok(salesExecToken, 'Sales Executive token acquired');

  // Helper product & materials
  const prodDoc = await ProductModel.findOne().lean();
  assert.ok(prodDoc, 'Default test product available');

  const supRes = await apiRequest('/supply-chain/suppliers', {
    method: 'POST',
    token: scMgrToken,
    body: {
      name: `Cryo Prod Supplier ${Date.now()}`,
      contactPerson: 'Vendor Rep',
      phone: '9876543210',
      email: `vendor_p_${Date.now()}@testsupplier.com`,
      address: '200 Industrial Estate, Pune',
      gstin: `27AABCU9603R1Z${Math.floor(Math.random() * 9)}`,
    },
  });
  assert.equal(supRes.status, 201);
  const testSupplier = supRes.data;

  // Helper raw materials
  const mat1Res = await apiRequest('/supply-chain/materials', {
    method: 'POST',
    token: scMgrToken,
    body: {
      name: `Evaporator Coil PM1-${Date.now()}`,
      unit: 'Nos',
      minStock: 2,
      openingStock: 50,
      preferredSupplierId: testSupplier.id,
    },
  });
  assert.equal(mat1Res.status, 201);
  const rawMat1 = mat1Res.data;

  const mat2Res = await apiRequest('/supply-chain/materials', {
    method: 'POST',
    token: scMgrToken,
    body: {
      name: `Danfoss Microcontroller PM2-${Date.now()}`,
      unit: 'Nos',
      minStock: 2,
      openingStock: 50,
      preferredSupplierId: testSupplier.id,
    },
  });
  assert.equal(mat2Res.status, 201);
  const rawMat2 = mat2Res.data;

  // Helper confirmed sales order
  async function createHelperSalesOrder(qty: number): Promise<any> {
    const soId = `so_prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const soDocNo = `SO-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
    const piId = `pi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const so = await SalesOrderModel.create({
      id: soId,
      docNo: soDocNo,
      enquiryId: `enq_${Date.now()}`,
      enquiryDocNo: `ENQ-${Date.now()}`,
      quotationId: `qt_${Date.now()}`,
      quotationDocNo: `QT-${Date.now()}`,
      piId,
      piDocNo: `PI-${Date.now()}`,
      customerPoId: `cpo_${Date.now()}`,
      customerPoDocNo: `CPO-${Date.now()}`,
      customerPoNumber: `PO-${Date.now()}`,
      customerId: 'cust-1',
      customerSnapshot: {
        name: 'BioLab Testing Services',
        contactPerson: 'Dr. Test',
        phone: '9876543210',
        email: 'biolab@test.org',
        shippingAddress: '42 Lab Road, Bengaluru',
      },
      items: [
        {
          productId: prodDoc!.id,
          productName: prodDoc!.name,
          model: prodDoc!.model,
          quantity: qty,
          unitPrice: 200000,
          gstPercent: 18,
          specifications: '-86°C Ultra Low Temperature Freezer',
        },
      ],
      subtotal: qty * 200000,
      discountAmount: 0,
      taxAmount: qty * 200000 * 0.18,
      totalAmount: qty * 200000 * 1.18,
      paymentTerms: '100% advance',
      deliveryTerms: 'Ex-works',
      deliveryAddress: '42 Lab Road, Bengaluru',
      promisedDeliveryDate: '2026-12-31',
      priority: 'Normal',
      commercialStatus: 'Confirmed',
      fulfillmentStatus: 'Awaiting Production',
      createdBy: 'Sales Lead',
    });
    return so.toObject();
  }

  // --------------------------------------------------------------------------
  // Scenario 1: Sales Order Receipt & Quantity Allocation Guard
  // --------------------------------------------------------------------------
  await t.test('Scenario 1: Sales Order Receipt & Quantity Allocation Guard', async () => {
    const so = await createHelperSalesOrder(5);

    // 1. Allocate 3 units -> succeeds
    const po1Res = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 3,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-10',
        priority: 'Normal',
        productionInCharge: 'Vikas Rao',
        assignedEmployees: ['Technician A', 'Technician B'],
        specifications: '-86°C Dual Cascade specification',
      },
    });
    assert.equal(po1Res.status, 201);
    assert.equal(po1Res.data.quantity, 3);
    assert.equal(po1Res.data.status, 'Planned');

    // 2. Over-allocate: Try allocating 3 more when only 2 remain -> Rejects 400
    const overRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 3,
        plannedStartDate: '2026-12-05',
        plannedEndDate: '2026-12-15',
        priority: 'High',
      },
    });
    assert.equal(overRes.status, 400);
    assert.match(overRes.data.error, /cannot allocate \d+ unit/i);

    // 3. Allocate exact remaining 2 units -> succeeds
    const po2Res = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 2,
        plannedStartDate: '2026-12-11',
        plannedEndDate: '2026-12-20',
        priority: 'Normal',
      },
    });
    assert.equal(po2Res.status, 201);
    assert.equal(po2Res.data.quantity, 2);

    // 4. Try allocating even 1 more -> Rejects
    const fullRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 1,
        plannedStartDate: '2026-12-21',
        plannedEndDate: '2026-12-28',
      },
    });
    assert.equal(fullRes.status, 400);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Duration Planning & Rescheduling Audit Trail
  // --------------------------------------------------------------------------
  await t.test('Scenario 2: Duration Planning & Rescheduling Audit Trail', async () => {
    const so = await createHelperSalesOrder(2);
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 2,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-10',
        priority: 'Normal',
      },
    });
    assert.equal(poRes.status, 201);
    const po = poRes.data;

    // Reschedule dates with mandatory reason
    const resched1 = await apiRequest(`/production/orders/${po.id}/reschedule`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        newStartDate: '2026-12-05',
        newEndDate: '2026-12-18',
        reason: 'Compressor shipment delayed by supplier',
      },
    });
    assert.equal(resched1.status, 200);
    assert.equal(resched1.data.plannedStartDate, '2026-12-05');
    assert.equal(resched1.data.plannedEndDate, '2026-12-18');
    assert.equal(resched1.data.plannedDurationDays, 14);
    assert.equal(resched1.data.planningHistory.length, 1);
    assert.equal(resched1.data.planningHistory[0].reason, 'Compressor shipment delayed by supplier');
    assert.equal(resched1.data.planningHistory[0].previousStartDate, '2026-12-01');

    // Reschedule a second time
    const resched2 = await apiRequest(`/production/orders/${po.id}/reschedule`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        newStartDate: '2026-12-06',
        newEndDate: '2026-12-22',
        reason: 'Customer requested supplementary chamber calibration',
      },
    });
    assert.equal(resched2.status, 200);
    assert.equal(resched2.data.planningHistory.length, 2);
    assert.equal(resched2.data.planningHistory[1].previousStartDate, '2026-12-05');

    // Rejection on invalid date range (endDate before startDate)
    const invalidResched = await apiRequest(`/production/orders/${po.id}/reschedule`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        newStartDate: '2026-12-20',
        newEndDate: '2026-12-10',
        reason: 'Invalid schedule attempt',
      },
    });
    assert.equal(invalidResched.status, 400);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: BOM Preparation & Template Scaling
  // --------------------------------------------------------------------------
  await t.test('Scenario 3: BOM Preparation & Template Scaling (with Duplicate Guard)', async () => {
    const so = await createHelperSalesOrder(2);
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 2,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-10',
      },
    });
    assert.equal(poRes.status, 201);
    const po = poRes.data;

    // 1. Duplicate raw material line guard
    const dupRes = await apiRequest('/production/boms', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        items: [
          { materialId: rawMat1.id, qtyPerUnit: 1 },
          { materialId: rawMat1.id, qtyPerUnit: 2 }, // Duplicate!
        ],
        sendRequest: false,
      },
    });
    assert.equal(dupRes.status, 400);
    assert.match(dupRes.data.error, /duplicate material line detected/i);

    // 2. Clean BOM submission scaling by quantity (2 units * 2 qtyPerUnit = 4 total)
    const bomRes = await apiRequest('/production/boms', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        items: [
          { materialId: rawMat1.id, qtyPerUnit: 2, remarks: 'Suction stage coils' },
          { materialId: rawMat2.id, qtyPerUnit: 1, remarks: 'Main controller board' },
        ],
        sendRequest: true,
      },
    });
    assert.equal(bomRes.status, 201);
    assert.ok(bomRes.data.materialRequestId);
    assert.equal(bomRes.data.items[0].totalRequiredQty, 4);
    assert.equal(bomRes.data.items[1].totalRequiredQty, 2);

    // 3. Verify PO transitioned to Awaiting Materials
    const updatedPo = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(updatedPo?.status, 'Awaiting Materials');
  });

  // --------------------------------------------------------------------------
  // Scenario 4 & 5: Material Issue & Partial Shop-Floor Receipt
  // --------------------------------------------------------------------------
  await t.test('Scenario 4 & 5: Material Issue, Line-Level Partial Receipt & Readiness Gates', async () => {
    const so = await createHelperSalesOrder(2);
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 2,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-10',
      },
    });
    const po = poRes.data;

    const bomRes = await apiRequest('/production/boms', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        items: [
          { materialId: rawMat1.id, qtyPerUnit: 2 },
          { materialId: rawMat2.id, qtyPerUnit: 1 },
        ],
        sendRequest: true,
      },
    });
    const mrId = bomRes.data.materialRequestId;

    // Gate Check: Attempting to start production while Awaiting Materials must fail
    const prematureStart = await apiRequest(`/production/orders/${po.id}/start`, {
      method: 'POST',
      token: prodMgrToken,
      body: { actualStartDate: '2026-12-02' },
    });
    assert.equal(prematureStart.status, 400);
    assert.match(prematureStart.data.error, /cannot start production when order status is "Awaiting Materials"/i);

    // Supply Chain issues partial materials: 4 of rawMat1, but only 1 of rawMat2 (2 required)
    const issue1Res = await apiRequest('/supply-chain/material-issues', {
      method: 'POST',
      token: scMgrToken,
      body: {
        materialRequestId: mrId,
        items: [
          { materialId: rawMat1.id, issuingQty: 4 },
          { materialId: rawMat2.id, issuingQty: 1 },
        ],
      },
    });
    assert.equal(issue1Res.status, 201);
    const issue1 = issue1Res.data;

    // Production floor acknowledges issue 1 with line-level inputs
    const ack1Res = await apiRequest(`/production/material-receipts/${issue1.id}/acknowledge`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        items: [
          { materialId: rawMat1.id, receivedQty: 4 },
          { materialId: rawMat2.id, receivedQty: 1, discrepancyNotes: 'Awaiting second unit from store' },
        ],
        discrepancyNotes: 'Received first batch of controller and all coils',
      },
    });
    assert.equal(ack1Res.status, 200);

    // PO should still be Awaiting Materials because rawMat2 received 1 / 2 required
    const poMid = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poMid?.status, 'Awaiting Materials');

    // Supply Chain issues remaining 1 unit of rawMat2
    const issue2Res = await apiRequest('/supply-chain/material-issues', {
      method: 'POST',
      token: scMgrToken,
      body: {
        materialRequestId: mrId,
        items: [{ materialId: rawMat2.id, issuingQty: 1 }],
      },
    });
    assert.equal(issue2Res.status, 201);
    const issue2 = issue2Res.data;

    // Production acknowledges second issue
    const ack2Res = await apiRequest(`/production/material-receipts/${issue2.id}/acknowledge`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        items: [{ materialId: rawMat2.id, receivedQty: 1 }],
      },
    });
    assert.equal(ack2Res.status, 200);

    // Now MR is Fully Received and PO automatically transitions to Ready to Start!
    const poReady = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poReady?.status, 'Ready to Start');
  });

  // --------------------------------------------------------------------------
  // Scenario 6, 7 & 8: Start, Daily Updates, Cumulative Guards & Complete Mfg
  // --------------------------------------------------------------------------
  await t.test('Scenario 6, 7 & 8: Start Production, Daily Updates, Overflow Guard & Complete Mfg', async () => {
    const so = await createHelperSalesOrder(2);
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 2,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-10',
      },
    });
    const po = poRes.data;

    // Prepare & complete material issue
    const bomRes = await apiRequest('/production/boms', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        items: [{ materialId: rawMat1.id, qtyPerUnit: 1 }],
        sendRequest: true,
      },
    });
    const issueRes = await apiRequest('/supply-chain/material-issues', {
      method: 'POST',
      token: scMgrToken,
      body: {
        materialRequestId: bomRes.data.materialRequestId,
        items: [{ materialId: rawMat1.id, issuingQty: 2 }],
      },
    });
    await apiRequest(`/production/material-receipts/${issueRes.data.id}/acknowledge`, {
      method: 'POST',
      token: prodMgrToken,
    });

    // 1. Start Production
    const startRes = await apiRequest(`/production/orders/${po.id}/start`, {
      method: 'POST',
      token: prodMgrToken,
      body: { actualStartDate: '2026-12-02' },
    });
    assert.equal(startRes.status, 200);
    assert.equal(startRes.data.status, 'In Progress');
    assert.equal(startRes.data.actualStartDate, '2026-12-02');

    // 2. Attempt complete manufacturing without any daily updates -> Rejection
    const prematureComplete = await apiRequest(`/production/orders/${po.id}/complete-manufacturing`, {
      method: 'POST',
      token: prodMgrToken,
      body: { completedQty: 2 },
    });
    assert.equal(prematureComplete.status, 400);
    assert.match(prematureComplete.data.error, /record at least one daily production update/i);

    // 3. Log daily update with cumulative guard
    const du1Res = await apiRequest('/production/daily-updates', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        stage: 'Fabrication',
        workCompleted: 'Completed outer cabinet sheet-metal pressing and polyurethane insulation foaming.',
        workHours: 8,
        completedQty: 1,
        stageStatus: 'Completed',
      },
    });
    assert.equal(du1Res.status, 201);

    const du2Res = await apiRequest('/production/daily-updates', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        stage: 'Assembly',
        workCompleted: 'Installed cascade refrigeration circuits and vacuum hold test verified.',
        workHours: 8,
        completedQty: 2,
        stageStatus: 'Completed',
      },
    });
    assert.equal(du2Res.status, 201);

    // 4. Complete Manufacturing
    const completeRes = await apiRequest(`/production/orders/${po.id}/complete-manufacturing`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        completedQty: 2,
        serialNumbers: ['CRYO-ULT-001', 'CRYO-ULT-002'],
      },
    });
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.data.status, 'QC Pending');
    assert.equal(completeRes.data.completedManufacturingQty, 2);
    assert.equal(completeRes.data.serialNumbers.length, 2);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Successful Quality Check & Logistics Release
  // --------------------------------------------------------------------------
  await t.test('Scenario 9: Successful Quality Check & Logistics Release', async () => {
    const so = await createHelperSalesOrder(1);
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 1,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-05',
      },
    });
    const po = poRes.data;

    // Fast-track setup to QC Pending
    await ProductionOrderModel.updateOne(
      { id: po.id },
      { $set: { status: 'QC Pending', completedManufacturingQty: 1, serialNumbers: ['CRYO-SN-TEST-PASS'] } },
    );

    const qcRes = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectionDate: '2026-12-04',
        inspector: 'Senior QC Eng. Anand',
        inspectedQty: 1,
        acceptedQty: 1,
        rejectedQty: 0,
        checks: [
          { name: 'Pull-down test to -86C', result: 'Pass', observation: 'Reached -86.4C in 210 mins' },
          { name: 'Electrical safety leak test', result: 'Pass', observation: '<0.1 mA' },
        ],
        finalResult: 'Accepted',
      },
    });
    assert.equal(qcRes.status, 201);
    assert.equal(qcRes.data.finalResult, 'Accepted');

    // Order should transition to Completed and be released to Logistics
    const poCompleted = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poCompleted?.status, 'Completed');
    assert.equal(poCompleted?.qcAcceptedQty, 1);
  });

  // --------------------------------------------------------------------------
  // Scenario 10 & 11: QC Rejection, Multiple Rework Cycles & Eventual Acceptance
  // --------------------------------------------------------------------------
  await t.test('Scenario 10 & 11: QC Rejection, Multiple Rework Cycles & Eventual Acceptance', async () => {
    const so = await createHelperSalesOrder(1);
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 1,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-05',
      },
    });
    const po = poRes.data;
    await ProductionOrderModel.updateOne(
      { id: po.id },
      { $set: { status: 'QC Pending', completedManufacturingQty: 1, serialNumbers: ['CRYO-RW-CYCLE-1'] } },
    );

    // Attempt 1: Fails QC
    const qc1Res = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectionDate: '2026-12-04',
        inspectedQty: 1,
        acceptedQty: 0,
        rejectedQty: 1,
        checks: [{ name: 'Thermal Pull-Down', result: 'Fail', observation: 'Stalled at -74C' }],
        rejectionReason: 'Sub-cooling capillary tube restricted',
        requiredCorrection: 'Replace capillary tube and re-charge cascade stage 2',
      },
    });
    assert.equal(qc1Res.status, 201);
    assert.equal(qc1Res.data.finalResult, 'Rejected');
    assert.ok(qc1Res.data.reworkId);
    const rw1Id = qc1Res.data.reworkId;

    let poState = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poState?.status, 'Rework');

    // Complete Rework 1
    const rw1Complete = await apiRequest(`/production/rework/${rw1Id}/complete`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        completedWork: 'Replaced stage 2 capillary tube and ran 4-hr pressure hold.',
      },
    });
    assert.equal(rw1Complete.status, 200);
    assert.equal(rw1Complete.data.status, 'Reinspection');

    poState = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poState?.status, 'QC Pending');

    // Attempt 2: Re-inspection still fails (e.g. sensor drift)
    const qc2Res = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectionDate: '2026-12-05',
        inspectedQty: 1,
        acceptedQty: 0,
        rejectedQty: 1,
        checks: [{ name: 'PT100 Temperature Sensor Calibration', result: 'Fail', observation: '2.5C offset' }],
        rejectionReason: 'PT100 RTD sensor offset outside tolerance',
        requiredCorrection: 'Recalibrate digital controller offset register',
      },
    });
    assert.equal(qc2Res.status, 201);
    assert.equal(qc2Res.data.attemptNumber, 2);
    const rw2Id = qc2Res.data.reworkId;

    // Complete Rework 2
    await apiRequest(`/production/rework/${rw2Id}/complete`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        completedWork: 'Calibrated controller with certified Fluke temperature calibrator.',
      },
    });

    // Attempt 3: Passes QC cleanly!
    const qc3Res = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectionDate: '2026-12-06',
        inspectedQty: 1,
        acceptedQty: 1,
        rejectedQty: 0,
        checks: [
          { name: 'Thermal Pull-Down', result: 'Pass', observation: '-86.8C steady' },
          { name: 'PT100 Temperature Sensor Calibration', result: 'Pass', observation: '<0.1C delta' },
        ],
        finalResult: 'Accepted',
      },
    });
    assert.equal(qc3Res.status, 201);
    assert.equal(qc3Res.data.attemptNumber, 3);
    assert.equal(qc3Res.data.finalResult, 'Accepted');

    poState = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poState?.status, 'Completed');
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Partial QC Inspection Outcome
  // --------------------------------------------------------------------------
  await t.test('Scenario 12: Partial QC Outcome (Partially Accepted + Partially Rejected)', async () => {
    const so = await createHelperSalesOrder(5);
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 5,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-10',
      },
    });
    const po = poRes.data;

    await ProductionOrderModel.updateOne(
      { id: po.id },
      {
        $set: {
          status: 'QC Pending',
          completedManufacturingQty: 5,
          serialNumbers: ['SN-01', 'SN-02', 'SN-03', 'SN-04', 'SN-05'],
        },
      },
    );

    // 5 Inspected: 3 Accepted, 2 Rejected
    const partialQc = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectedQty: 5,
        acceptedQty: 3,
        rejectedQty: 2,
        rejectionReason: 'Gasket vacuum seal leak detected on 2 units',
        requiredCorrection: 'Replace silicone door gaskets and re-test seal',
      },
    });
    assert.equal(partialQc.status, 201);
    assert.equal(partialQc.data.acceptedQty, 3);
    assert.equal(partialQc.data.rejectedQty, 2);
    assert.equal(partialQc.data.finalResult, 'Rejected');

    const poCheck = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poCheck?.status, 'Rework');
    assert.equal(poCheck?.qcAcceptedQty, 3);
    assert.equal(poCheck?.qcRejectedQty, 2);

    const reworkDoc = await ReworkOrderModel.findOne({ id: partialQc.data.reworkId });
    assert.equal(reworkDoc?.affectedQty, 2);
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Production Material Return with Condition Check
  // --------------------------------------------------------------------------
  await t.test('Scenario 13: Production Material Return with Condition Check (Usable vs Damaged)', async () => {
    const so = await createHelperSalesOrder(1);
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 1,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-05',
      },
    });
    const po = poRes.data;

    // BOM requesting 10 rawMat1 units
    const bomRes = await apiRequest('/production/boms', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        items: [{ materialId: rawMat1.id, qtyPerUnit: 10 }],
        sendRequest: true,
      },
    });
    const mrId = bomRes.data.materialRequestId;

    // Issue all 10
    const issueRes = await apiRequest('/supply-chain/material-issues', {
      method: 'POST',
      token: scMgrToken,
      body: {
        materialRequestId: mrId,
        items: [{ materialId: rawMat1.id, issuingQty: 10 }],
      },
    });
    await apiRequest(`/production/material-receipts/${issueRes.data.id}/acknowledge`, {
      method: 'POST',
      token: prodMgrToken,
    });

    const matBefore = await MaterialModel.findOne({ id: rawMat1.id });
    const stockBefore = matBefore?.currentStock ?? 0;

    // 1. Return 3 units in "Usable" condition -> Stock increments by 3
    const returnUsable = await apiRequest('/production/material-returns', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        materialRequestId: mrId,
        materialId: rawMat1.id,
        returnQty: 3,
        materialCondition: 'Usable',
        reason: 'Surplus unconsumed tubing',
      },
    });
    assert.equal(returnUsable.status, 201);
    assert.equal(returnUsable.data.materialCondition, 'Usable');

    const matAfterUsable = await MaterialModel.findOne({ id: rawMat1.id });
    assert.equal(matAfterUsable!.currentStock, stockBefore + 3);

    // 2. Return 2 units in "Damaged" condition -> Stock must NOT increment!
    const returnDamaged = await apiRequest('/production/material-returns', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        materialRequestId: mrId,
        materialId: rawMat1.id,
        returnQty: 2,
        materialCondition: 'Damaged',
        reason: 'Bent during handling on shop-floor',
      },
    });
    assert.equal(returnDamaged.status, 201);
    assert.equal(returnDamaged.data.materialCondition, 'Damaged');

    const matAfterDamaged = await MaterialModel.findOne({ id: rawMat1.id });
    assert.equal(matAfterDamaged!.currentStock, stockBefore + 3, 'Damaged return does not inflate usable store stock');

    // 3. Excess return guard: Only 5 remaining (10 - 3 - 2 = 5). Attempting to return 6 fails!
    const returnExcess = await apiRequest('/production/material-returns', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        materialRequestId: mrId,
        materialId: rawMat1.id,
        returnQty: 6,
        materialCondition: 'Usable',
        reason: 'Attempting excess return',
      },
    });
    assert.equal(returnExcess.status, 400);
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Concurrent Production Allocation Guard
  // --------------------------------------------------------------------------
  await t.test('Scenario 14: Concurrent Production Allocation Guard', async () => {
    const so = await createHelperSalesOrder(3);

    // Fire 2 concurrent allocation requests for 2 units each (2 + 2 = 4 > 3 total)
    const [resA, resB] = await Promise.all([
      apiRequest('/production/orders', {
        method: 'POST',
        token: prodMgrToken,
        body: {
          salesOrderId: so.id,
          productId: prodDoc.id,
          quantity: 2,
          plannedStartDate: '2026-12-01',
          plannedEndDate: '2026-12-05',
        },
      }),
      apiRequest('/production/orders', {
        method: 'POST',
        token: prodMgrToken,
        body: {
          salesOrderId: so.id,
          productId: prodDoc.id,
          quantity: 2,
          plannedStartDate: '2026-12-06',
          plannedEndDate: '2026-12-10',
        },
      }),
    ]);

    const statuses = [resA.status, resB.status];
    assert.ok(statuses.includes(201), 'At least one allocation succeeded');
    assert.ok(statuses.includes(400) || statuses.includes(409), 'One concurrent allocation rejected due to over-allocation guard');

    // Confirm total allocated never exceeds 3
    const createdOrders = await ProductionOrderModel.find({ salesOrderId: so.id });
    const totalAllocated = createdOrders.reduce((sum, o) => sum + o.quantity, 0);
    assert.ok(totalAllocated <= 3, `Total allocated ${totalAllocated} does not exceed 3`);
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Duplicate QC & Rework Guard
  // --------------------------------------------------------------------------
  await t.test('Scenario 15: Duplicate QC & Rework Guard', async () => {
    const so = await createHelperSalesOrder(1);
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 1,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-05',
      },
    });
    const po = poRes.data;

    // 1. Attempt QC on Planned order (not QC Pending) -> Rejection
    const invalidQc = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectedQty: 1,
        acceptedQty: 1,
        rejectedQty: 0,
        finalResult: 'Accepted',
      },
    });
    assert.equal(invalidQc.status, 400);

    // Move to Completed
    await ProductionOrderModel.updateOne(
      { id: po.id },
      { $set: { status: 'Completed', qcAcceptedQty: 1, completedManufacturingQty: 1 } },
    );

    // 2. Attempt complete manufacturing on Completed order -> Rejection
    const doubleComplete = await apiRequest(`/production/orders/${po.id}/complete-manufacturing`, {
      method: 'POST',
      token: prodMgrToken,
      body: { completedQty: 1 },
    });
    assert.equal(doubleComplete.status, 400);
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Transaction Rollback Safety
  // --------------------------------------------------------------------------
  await t.test('Scenario 16: Transaction Rollback Safety in createProductionOrderTx', async () => {
    const so = await createHelperSalesOrder(1);

    // Attempt allocation exceeding unallocated capacity
    await assert.rejects(
      async () => {
        await mongoERPRepository.createProductionOrderTx(
          {
            salesOrderId: so.id,
            productId: prodDoc!.id,
            quantity: 999, // Exceeds 1
            plannedStartDate: '2026-12-01',
            plannedEndDate: '2026-12-10',
          },
          { id: 'usr-1', name: 'Tester' },
        );
      },
      /cannot allocate \d+ unit/i,
    );

    // Ensure no orphan production order created
    const orphanOrders = await ProductionOrderModel.find({ salesOrderId: so.id });
    assert.equal(orphanOrders.length, 0);
  });

  // --------------------------------------------------------------------------
  // Scenario 17: RBAC Permission Enforcement
  // --------------------------------------------------------------------------
  await t.test('Scenario 17: RBAC Permission Enforcement', async () => {
    const so = await createHelperSalesOrder(1);

    // 1. Sales Exec cannot create Production Order (403 Forbidden)
    const unauthorizedProd = await apiRequest('/production/orders', {
      method: 'POST',
      token: salesExecToken,
      body: {
        salesOrderId: so.id,
        productId: prodDoc.id,
        quantity: 1,
        plannedStartDate: '2026-12-01',
        plannedEndDate: '2026-12-05',
      },
    });
    assert.equal(unauthorizedProd.status, 403);

    // 2. Sales Exec cannot record Quality Check (403 Forbidden)
    const unauthorizedQc = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: salesExecToken,
      body: {
        productionOrderId: 'any-id',
        inspectedQty: 1,
        acceptedQty: 1,
        rejectedQty: 0,
      },
    });
    assert.equal(unauthorizedQc.status, 403);

    // 3. Production Manager can view orders
    const authorizedView = await apiRequest('/production/orders', {
      method: 'GET',
      token: prodMgrToken,
    });
    assert.equal(authorizedView.status, 200);
  });

  await stopTestServer();
});
