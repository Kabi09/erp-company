process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  BOMModel,
  GRNModel,
  MaterialIssueModel,
  MaterialModel,
  MaterialRequestModel,
  ProductionOrderModel,
  ProductionReturnModel,
  SalesOrderModel,
  StockTransactionModel,
  SupplierModel,
  SupplierPOModel,
  SupplierReturnModel,
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

test('CRYO ERP 2.0 Phase 6 — Supply Chain Management Workflow, Inventory & Integrity Test Suite', async (t) => {
  await startTestServer();

  let adminToken = '';
  let scMgrToken = '';
  let prodMgrToken = '';
  let salesExecToken = '';

  const [adminLogin, scLogin, prodLogin, salesLogin] = await Promise.all([
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'admin@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sc.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'prod.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' } }),
  ]);

  adminToken = adminLogin.data.token;
  scMgrToken = scLogin.data.token;
  prodMgrToken = prodLogin.data.token;
  salesExecToken = salesLogin.data.token;

  assert.ok(adminToken, 'Admin token acquired');
  assert.ok(scMgrToken, 'Supply Chain Manager token acquired');
  assert.ok(prodMgrToken, 'Production Manager token acquired');
  assert.ok(salesExecToken, 'Sales Executive token acquired');

  // Helper supplier
  const supRes = await apiRequest('/supply-chain/suppliers', {
    method: 'POST',
    token: scMgrToken,
    body: {
      name: `Cryo Prime Supplier ${Date.now()}`,
      contactPerson: 'Vendor Rep',
      phone: '9876543210',
      email: `vendor_${Date.now()}@testsupplier.com`,
      address: '100 Industrial Estate, Pune',
      gstin: `27AABCU9603R1Z${Math.floor(Math.random() * 9)}`,
    },
  });
  assert.equal(supRes.status, 201);
  const testSupplier = supRes.data;

  // --------------------------------------------------------------------------
  // Scenario 1: Full Material Availability & Complete Issue-to-Receipt
  // --------------------------------------------------------------------------
  await t.test('Scenario 1: Full Material Availability & Issue-to-Receipt Sync', async () => {
    // 1. Create raw material with 20 initial stock
    const matRes = await apiRequest('/supply-chain/materials', {
      method: 'POST',
      token: scMgrToken,
      body: {
        name: `Cascade Compressor Motor S1-${Date.now()}`,
        unit: 'Nos',
        minStock: 2,
        openingStock: 20,
        preferredSupplierId: testSupplier.id,
      },
    });
    assert.equal(matRes.status, 201);
    const mat = matRes.data;
    assert.ok(mat.code.startsWith('MAT-'), 'Material code auto-generated');
    assert.equal(mat.currentStock, 20);

    // 2. Create mock production order
    const now = new Date().toISOString();
    const poDoc = await ProductionOrderModel.create({
      id: `po-s1-${Date.now()}`,
      docNo: `PO-S1-${Date.now().toString().slice(-4)}`,
      salesOrderId: 'so-s1',
      salesOrderDocNo: 'SO-0001',
      customerId: 'cust-1',
      customerName: 'BioHealth Labs',
      productId: 'prod-1',
      productName: 'Cryo Chamber ULT',
      model: 'ULT-700',
      quantity: 1,
      plannedStartDate: now.slice(0, 10),
      plannedEndDate: now.slice(0, 10),
      plannedDurationDays: 1,
      productionInCharge: 'Production Supervisor',
      status: 'Awaiting Materials',
      createdBy: 'Super Admin',
      createdAt: now,
    });

    // 3. Create BOM Material Request for 5 units
    const mrDoc = await MaterialRequestModel.create({
      id: `mr-s1-${Date.now()}`,
      docNo: `MR-S1-${Date.now().toString().slice(-4)}`,
      bomId: 'bom-s1',
      bomDocNo: 'BOM-0001',
      productionOrderId: poDoc.id,
      productionOrderDocNo: poDoc.docNo,
      salesOrderId: poDoc.salesOrderId,
      salesOrderDocNo: poDoc.salesOrderDocNo,
      productName: poDoc.productName,
      priority: 'Normal',
      items: [
        {
          materialId: mat.id,
          materialCode: mat.code,
          materialName: mat.name,
          unit: mat.unit,
          requiredQty: 5,
          issuedQty: 0,
          receivedQty: 0,
        },
      ],
      status: 'Pending',
      receiptStatus: 'Pending',
      requestedBy: 'Production Engineer',
      requestDate: now.slice(0, 10),
      createdAt: now,
    });

    // 4. Issue all 5 units from Store
    const issueRes = await apiRequest('/supply-chain/material-issues', {
      method: 'POST',
      token: scMgrToken,
      body: {
        materialRequestId: mrDoc.id,
        items: [{ materialId: mat.id, issuingQty: 5 }],
        remarks: 'Issued complete requested batch',
      },
    });
    assert.equal(issueRes.status, 201, 'Material issue posted');
    const mi = issueRes.data;
    assert.equal(mi.items[0].issuedQty, 5);

    // 5. Verify stock deduction and ledger balance
    const updatedMat = await MaterialModel.findOne({ id: mat.id });
    assert.equal(updatedMat?.currentStock, 15, 'Usable stock deducted to 15');

    const lastTx = await StockTransactionModel.findOne({ linkedDocId: mi.id });
    assert.ok(lastTx, 'Stock transaction created');
    assert.equal(lastTx?.type, 'Material Issue');
    assert.equal(lastTx?.quantityDelta, -5);
    assert.equal(lastTx?.balanceAfter, 15);

    // 6. Acknowledge physical receipt in Production
    const ackRes = await apiRequest(`/production/material-receipts/${mi.id}/acknowledge`, {
      method: 'POST',
      token: prodMgrToken,
      body: { discrepancyNotes: '' },
    });
    assert.equal(ackRes.status, 200, 'Production acknowledged receipt');

    // 7. Verify MR status is Fully Received and Production Order transitioned to Ready to Start
    const updatedMR = await MaterialRequestModel.findOne({ id: mrDoc.id });
    assert.equal(updatedMR?.status, 'Fully Issued');
    assert.equal(updatedMR?.receiptStatus, 'Fully Received');

    const updatedPO = await ProductionOrderModel.findOne({ id: poDoc.id });
    assert.equal(updatedPO?.status, 'Ready to Start', 'Order is ready to manufacture');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Partial Availability & Shortage Purchasing
  // --------------------------------------------------------------------------
  await t.test('Scenario 2: Partial Availability & Shortage Purchasing Lifecycle', async () => {
    // 1. Raw material with 6 units in stock
    const matRes = await apiRequest('/supply-chain/materials', {
      method: 'POST',
      token: scMgrToken,
      body: {
        name: `Cryogenic Valve Assembly S2-${Date.now()}`,
        unit: 'Nos',
        minStock: 2,
        openingStock: 6,
        preferredSupplierId: testSupplier.id,
      },
    });
    assert.equal(matRes.status, 201);
    const mat = matRes.data;

    // 2. Material Request for 10 units (Shortage of 4)
    const now = new Date().toISOString();
    const mrDoc = await MaterialRequestModel.create({
      id: `mr-s2-${Date.now()}`,
      docNo: `MR-S2-${Date.now().toString().slice(-4)}`,
      bomId: 'bom-s2',
      bomDocNo: 'BOM-0002',
      productionOrderId: 'po-s2',
      productionOrderDocNo: 'PO-0002',
      salesOrderId: 'so-s2',
      salesOrderDocNo: 'SO-0002',
      productName: 'Cryo Ultra Freezer',
      priority: 'High',
      items: [
        {
          materialId: mat.id,
          materialCode: mat.code,
          materialName: mat.name,
          unit: mat.unit,
          requiredQty: 10,
          issuedQty: 0,
          receivedQty: 0,
        },
      ],
      status: 'Pending',
      receiptStatus: 'Pending',
      requestedBy: 'Line Supervisor',
      requestDate: now.slice(0, 10),
      createdAt: now,
    });

    // 3. Issue available 6 units
    const issue1Res = await apiRequest('/supply-chain/material-issues', {
      method: 'POST',
      token: scMgrToken,
      body: {
        materialRequestId: mrDoc.id,
        items: [{ materialId: mat.id, issuingQty: 6 }],
      },
    });
    assert.equal(issue1Res.status, 201);

    // Verify MR is Partially Issued
    let mr = await MaterialRequestModel.findOne({ id: mrDoc.id });
    assert.equal(mr?.status, 'Partially Issued');
    assert.equal(mr?.items[0].issuedQty, 6);

    // 4. Query shortage endpoint
    const shortageRes = await apiRequest(`/supply-chain/material-requests/${mrDoc.id}/shortage`, {
      token: scMgrToken,
    });
    assert.equal(shortageRes.status, 200);
    assert.equal(shortageRes.data.items[0].shortageQty, 4, 'Shortage calculated as 4');

    // 5. Create Request-Based Supplier PO for the shortage of 4 units
    const spoRes = await apiRequest('/supply-chain/purchase-orders', {
      method: 'POST',
      token: scMgrToken,
      body: {
        purchaseType: 'Request-Based',
        materialRequestId: mrDoc.id,
        supplierId: testSupplier.id,
        items: [{ materialId: mat.id, orderedQty: 4, unitPrice: 2500 }],
      },
    });
    assert.equal(spoRes.status, 201, 'Shortage PO created');
    const spo = spoRes.data;
    assert.equal(spo.purchaseType, 'Request-Based');
    assert.equal(spo.materialRequestId, mrDoc.id);

    // 6. Receive GRN for 4 units
    const grnRes = await apiRequest('/supply-chain/grns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierPoId: spo.id,
        invoiceOrChallanNo: `INV-S2-${Date.now()}`,
        items: [{ materialId: mat.id, receivedQty: 4 }],
      },
    });
    assert.equal(grnRes.status, 201);
    const grn = grnRes.data;

    // Before verification, stock is still 0
    let curMat = await MaterialModel.findOne({ id: mat.id });
    assert.equal(curMat?.currentStock, 0, 'Unverified GRN does not increment stock');

    // 7. Verify GRN (accept all 4)
    const verifRes = await apiRequest(`/supply-chain/grns/${grn.id}/verify`, {
      method: 'POST',
      token: scMgrToken,
      body: {
        items: [{ materialId: mat.id, acceptedQty: 4, rejectedQty: 0 }],
      },
    });
    assert.equal(verifRes.status, 200);

    curMat = await MaterialModel.findOne({ id: mat.id });
    assert.equal(curMat?.currentStock, 4, 'Stock increased to 4 upon GRN acceptance');

    // 8. Issue the remaining 4 units to fulfill the request completely
    const issue2Res = await apiRequest('/supply-chain/material-issues', {
      method: 'POST',
      token: scMgrToken,
      body: {
        materialRequestId: mrDoc.id,
        items: [{ materialId: mat.id, issuingQty: 4 }],
      },
    });
    assert.equal(issue2Res.status, 201);

    mr = await MaterialRequestModel.findOne({ id: mrDoc.id });
    assert.equal(mr?.status, 'Fully Issued', 'MR is now Fully Issued');
    assert.equal(mr?.items[0].issuedQty, 10);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Normal Stock Purchasing Workflow
  // --------------------------------------------------------------------------
  await t.test('Scenario 3: Normal Stock Purchasing Workflow (No MR links)', async () => {
    // 1. Create material with 0 stock
    const matRes = await apiRequest('/supply-chain/materials', {
      method: 'POST',
      token: scMgrToken,
      body: {
        name: `General Copper Pipe S3-${Date.now()}`,
        unit: 'Meter',
        minStock: 10,
        openingStock: 0,
        preferredSupplierId: testSupplier.id,
      },
    });
    assert.equal(matRes.status, 201);
    const mat = matRes.data;

    // 2. Create Normal Supplier PO without materialRequestId
    const spoRes = await apiRequest('/supply-chain/purchase-orders', {
      method: 'POST',
      token: scMgrToken,
      body: {
        purchaseType: 'Normal',
        supplierId: testSupplier.id,
        items: [{ materialId: mat.id, orderedQty: 50.5, unitPrice: 320 }],
      },
    });
    assert.equal(spoRes.status, 201);
    const spo = spoRes.data;
    assert.equal(spo.purchaseType, 'Normal');
    assert.equal(spo.materialRequestId, undefined, 'No MR link on Normal purchase');

    // 3. Receive GRN for 50.5 meters
    const grnRes = await apiRequest('/supply-chain/grns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierPoId: spo.id,
        invoiceOrChallanNo: `DC-PIPE-${Date.now()}`,
        items: [{ materialId: mat.id, receivedQty: 50.5 }],
      },
    });
    assert.equal(grnRes.status, 201);

    // 4. Verify GRN
    const verifRes = await apiRequest(`/supply-chain/grns/${grnRes.data.id}/verify`, {
      method: 'POST',
      token: scMgrToken,
      body: {
        items: [{ materialId: mat.id, acceptedQty: 50.5, rejectedQty: 0 }],
      },
    });
    assert.equal(verifRes.status, 200);

    const updatedMat = await MaterialModel.findOne({ id: mat.id });
    assert.equal(updatedMat?.currentStock, 50.5, 'Stock updated with decimal quantity');
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Partial GRN Delivery & PO Status Lifecycle
  // --------------------------------------------------------------------------
  await t.test('Scenario 4: Partial GRN Deliveries and PO Status Tracking', async () => {
    const matRes = await apiRequest('/supply-chain/materials', {
      method: 'POST',
      token: scMgrToken,
      body: {
        name: `Insulation Foam Sheet S4-${Date.now()}`,
        unit: 'Sheets',
        minStock: 20,
        openingStock: 0,
      },
    });
    const mat = matRes.data;

    // Ordered 100 sheets
    const spoRes = await apiRequest('/supply-chain/purchase-orders', {
      method: 'POST',
      token: scMgrToken,
      body: {
        purchaseType: 'Normal',
        supplierId: testSupplier.id,
        items: [{ materialId: mat.id, orderedQty: 100, unitPrice: 450 }],
      },
    });
    const spo = spoRes.data;

    // Delivery 1: 60 sheets
    const grn1Res = await apiRequest('/supply-chain/grns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierPoId: spo.id,
        invoiceOrChallanNo: `INV-1-${Date.now()}`,
        items: [{ materialId: mat.id, receivedQty: 60 }],
      },
    });
    assert.equal(grn1Res.status, 201);

    let updatedSPO = await SupplierPOModel.findOne({ id: spo.id });
    assert.equal(updatedSPO?.status, 'Partially Received');

    // Delivery 2: remaining 40 sheets
    const grn2Res = await apiRequest('/supply-chain/grns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierPoId: spo.id,
        invoiceOrChallanNo: `INV-2-${Date.now()}`,
        items: [{ materialId: mat.id, receivedQty: 40 }],
      },
    });
    assert.equal(grn2Res.status, 201);

    updatedSPO = await SupplierPOModel.findOne({ id: spo.id });
    assert.equal(updatedSPO?.status, 'Received', 'PO fully fulfilled');
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Partial Material Rejection & Replacement Receipt
  // --------------------------------------------------------------------------
  await t.test('Scenario 5: Material Rejection, Supplier Return & Replacement GRN', async () => {
    const matRes = await apiRequest('/supply-chain/materials', {
      method: 'POST',
      token: scMgrToken,
      body: {
        name: `Digital Temp Sensor S5-${Date.now()}`,
        unit: 'Nos',
        minStock: 5,
        openingStock: 0,
      },
    });
    const mat = matRes.data;

    const spoRes = await apiRequest('/supply-chain/purchase-orders', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierId: testSupplier.id,
        items: [{ materialId: mat.id, orderedQty: 10, unitPrice: 1200 }],
      },
    });
    const spo = spoRes.data;

    const grnRes = await apiRequest('/supply-chain/grns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierPoId: spo.id,
        invoiceOrChallanNo: `INV-S5-${Date.now()}`,
        items: [{ materialId: mat.id, receivedQty: 10 }],
      },
    });
    const grn = grnRes.data;

    // Verify: 8 Accepted, 2 Rejected due to calibration drift
    const verifRes = await apiRequest(`/supply-chain/grns/${grn.id}/verify`, {
      method: 'POST',
      token: scMgrToken,
      body: {
        items: [
          {
            materialId: mat.id,
            acceptedQty: 8,
            rejectedQty: 2,
            rejectionReason: 'Calibration error exceeding ±0.5°C threshold',
          },
        ],
      },
    });
    assert.equal(verifRes.status, 200);

    let curMat = await MaterialModel.findOne({ id: mat.id });
    assert.equal(curMat?.currentStock, 8, 'Only 8 accepted units entered usable stock');

    // Create Supplier Return for the 2 rejected units
    const retRes = await apiRequest('/supply-chain/supplier-returns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        grnId: grn.id,
        materialId: mat.id,
        returnQty: 2,
        reason: 'Failed incoming calibration check',
        replacementRequired: true,
      },
    });
    assert.equal(retRes.status, 201);
    const sReturn = retRes.data;
    assert.equal(sReturn.replacementStatus, 'Pending Replacement');

    // Receive Replacement GRN for 2 units
    const replGRNRes = await apiRequest('/supply-chain/grns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierPoId: spo.id,
        supplierReturnId: sReturn.id,
        invoiceOrChallanNo: `REPL-DC-${Date.now()}`,
        items: [{ materialId: mat.id, receivedQty: 2 }],
      },
    });
    assert.equal(replGRNRes.status, 201, 'Replacement GRN accepted without PO limit obstruction');
    const replGRN = replGRNRes.data;
    assert.equal(replGRN.isReplacement, true);

    // Verify Replacement GRN: Accept both 2 units
    const replVerifRes = await apiRequest(`/supply-chain/grns/${replGRN.id}/verify`, {
      method: 'POST',
      token: scMgrToken,
      body: {
        items: [{ materialId: mat.id, acceptedQty: 2, rejectedQty: 0 }],
      },
    });
    assert.equal(replVerifRes.status, 200);

    curMat = await MaterialModel.findOne({ id: mat.id });
    assert.equal(curMat?.currentStock, 10, 'Total stock is now 8 + 2 = 10');

    const updatedSR = await SupplierReturnModel.findOne({ id: sReturn.id });
    assert.equal(updatedSR?.replacementStatus, 'Replacement Received');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Concurrent Stock Issue Race Condition Prevention
  // --------------------------------------------------------------------------
  await t.test('Scenario 6: Concurrent Stock Issue Race Condition Prevention', async () => {
    const matCode = `MAT-RACE-${Date.now().toString().slice(-4)}`;
    const testMat = await MaterialModel.create({
      id: `mat-race-${Date.now()}`,
      code: matCode,
      name: `Race Condition Valve ${matCode}`,
      category: 'Components',
      unit: 'Nos',
      minStock: 1,
      currentStock: 10,
      active: true,
      storageLocation: 'Store R',
      createdAt: new Date().toISOString(),
    });

    const now = new Date().toISOString();
    const mr1 = await MaterialRequestModel.create({
      id: `mr-r1-${Date.now()}`,
      docNo: `MR-R1-${Date.now().toString().slice(-4)}`,
      bomId: 'bom-r',
      bomDocNo: 'BOM-R',
      productionOrderId: 'po-r1',
      productionOrderDocNo: 'PO-R1',
      salesOrderId: 'so-r1',
      salesOrderDocNo: 'SO-R1',
      productName: 'Chamber R1',
      requestDate: now.slice(0, 10),
      requestedBy: 'Supervisor 1',
      status: 'Pending',
      receiptStatus: 'Pending',
      items: [{ materialId: testMat.id, materialCode: testMat.code, materialName: testMat.name, unit: 'Nos', requiredQty: 8, issuedQty: 0, receivedQty: 0 }],
      createdAt: now,
    });

    const mr2 = await MaterialRequestModel.create({
      id: `mr-r2-${Date.now()}`,
      docNo: `MR-R2-${Date.now().toString().slice(-4)}`,
      bomId: 'bom-r',
      bomDocNo: 'BOM-R',
      productionOrderId: 'po-r2',
      productionOrderDocNo: 'PO-R2',
      salesOrderId: 'so-r2',
      salesOrderDocNo: 'SO-R2',
      productName: 'Chamber R2',
      requestDate: now.slice(0, 10),
      requestedBy: 'Supervisor 2',
      status: 'Pending',
      receiptStatus: 'Pending',
      items: [{ materialId: testMat.id, materialCode: testMat.code, materialName: testMat.name, unit: 'Nos', requiredQty: 8, issuedQty: 0, receivedQty: 0 }],
      createdAt: now,
    });

    // Fire two concurrent issues of 8 units against 10 total stock
    const results = await Promise.allSettled([
      mongoERPRepository.issueMaterial(
        mr1.id,
        [{ materialId: testMat.id, issuingQty: 8 }],
        'Concurrent 1',
        now.slice(0, 10),
        { id: 'u1', name: 'Actor 1' },
      ),
      mongoERPRepository.issueMaterial(
        mr2.id,
        [{ materialId: testMat.id, issuingQty: 8 }],
        'Concurrent 2',
        now.slice(0, 10),
        { id: 'u2', name: 'Actor 2' },
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent issue must succeed');
    assert.equal(rejected.length, 1, 'One must fail with INSUFFICIENT_STOCK');

    const finalMat = await MaterialModel.findOne({ id: testMat.id });
    assert.equal(finalMat?.currentStock, 2, 'Remaining stock must be 10 - 8 = 2 units');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Concurrent Material Request Fulfillment Guard
  // --------------------------------------------------------------------------
  await t.test('Scenario 7: Concurrent MR Fulfillment Guard (Cannot exceed requiredQty)', async () => {
    const mat = await MaterialModel.create({
      id: `mat-c7-${Date.now()}`,
      code: `MAT-C7-${Date.now().toString().slice(-4)}`,
      name: 'Bulk Copper Coil',
      category: 'Components',
      unit: 'Nos',
      minStock: 10,
      currentStock: 100, // Plentiful stock
      active: true,
      createdAt: new Date().toISOString(),
    });

    const now = new Date().toISOString();
    // MR requires only 10 units
    const mr = await MaterialRequestModel.create({
      id: `mr-c7-${Date.now()}`,
      docNo: `MR-C7-${Date.now().toString().slice(-4)}`,
      bomId: 'bom-c7',
      bomDocNo: 'BOM-C7',
      productionOrderId: 'po-c7',
      productionOrderDocNo: 'PO-C7',
      salesOrderId: 'so-c7',
      salesOrderDocNo: 'SO-C7',
      productName: 'Chamber C7',
      requestDate: now.slice(0, 10),
      requestedBy: 'Supervisor C7',
      status: 'Pending',
      receiptStatus: 'Pending',
      items: [{ materialId: mat.id, materialCode: mat.code, materialName: mat.name, unit: 'Nos', requiredQty: 10, issuedQty: 0, receivedQty: 0 }],
      createdAt: now,
    });

    // Two concurrent issues of 8 units on the SAME material request (8 + 8 = 16 > 10)
    const results = await Promise.allSettled([
      mongoERPRepository.issueMaterial(
        mr.id,
        [{ materialId: mat.id, issuingQty: 8 }],
        'Competing issue 1',
        now.slice(0, 10),
        { id: 'u1', name: 'Store Worker 1' },
      ),
      mongoERPRepository.issueMaterial(
        mr.id,
        [{ materialId: mat.id, issuingQty: 8 }],
        'Competing issue 2',
        now.slice(0, 10),
        { id: 'u2', name: 'Store Worker 2' },
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    assert.equal(fulfilled.length, 1, 'Exactly one concurrent issue can succeed on the same MR line');

    const updatedMR = await MaterialRequestModel.findOne({ id: mr.id });
    assert.ok(updatedMR!.items[0].issuedQty <= 10, 'Total issued quantity must not exceed required quantity (10)');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Duplicate GRN Verification Block
  // --------------------------------------------------------------------------
  await t.test('Scenario 8: Duplicate GRN Verification Block', async () => {
    const matRes = await apiRequest('/supply-chain/materials', {
      method: 'POST',
      token: scMgrToken,
      body: { name: `Thermal Relay S8-${Date.now()}`, unit: 'Nos', minStock: 2, openingStock: 0 },
    });
    const mat = matRes.data;

    const spoRes = await apiRequest('/supply-chain/purchase-orders', {
      method: 'POST',
      token: scMgrToken,
      body: { supplierId: testSupplier.id, items: [{ materialId: mat.id, orderedQty: 5, unitPrice: 800 }] },
    });

    const grnRes = await apiRequest('/supply-chain/grns', {
      method: 'POST',
      token: scMgrToken,
      body: { supplierPoId: spoRes.data.id, invoiceOrChallanNo: `INV-S8-${Date.now()}`, items: [{ materialId: mat.id, receivedQty: 5 }] },
    });
    const grn = grnRes.data;

    // First verification: success
    const verif1 = await apiRequest(`/supply-chain/grns/${grn.id}/verify`, {
      method: 'POST',
      token: scMgrToken,
      body: { items: [{ materialId: mat.id, acceptedQty: 5, rejectedQty: 0 }] },
    });
    assert.equal(verif1.status, 200);

    // Second verification on same GRN: must fail
    const verif2 = await apiRequest(`/supply-chain/grns/${grn.id}/verify`, {
      method: 'POST',
      token: scMgrToken,
      body: { items: [{ materialId: mat.id, acceptedQty: 5, rejectedQty: 0 }] },
    });
    assert.equal(verif2.status, 400, 'Duplicate verification blocked');
    assert.ok(verif2.data.error.includes('Duplicate verification blocked') || verif2.data.error.includes('already been verified'));
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Transaction Rollback Safety on Standalone and Replica Set
  // --------------------------------------------------------------------------
  await t.test('Scenario 9: Transaction Rollback Safety (All-or-Nothing)', async () => {
    const mat1 = await MaterialModel.create({
      id: `mat-rb1-${Date.now()}`,
      code: `MAT-RB1-${Date.now().toString().slice(-4)}`,
      name: 'Rollback Mat 1',
      category: 'Components',
      unit: 'Nos',
      currentStock: 10,
      active: true,
      createdAt: new Date().toISOString(),
    });

    const mat2 = await MaterialModel.create({
      id: `mat-rb2-${Date.now()}`,
      code: `MAT-RB2-${Date.now().toString().slice(-4)}`,
      name: 'Rollback Mat 2',
      category: 'Components',
      unit: 'Nos',
      currentStock: 0, // Zero stock
      active: true,
      createdAt: new Date().toISOString(),
    });

    const now = new Date().toISOString();
    const mr = await MaterialRequestModel.create({
      id: `mr-rb-${Date.now()}`,
      docNo: `MR-RB-${Date.now().toString().slice(-4)}`,
      bomId: 'bom-rb',
      bomDocNo: 'BOM-RB',
      productionOrderId: 'po-rb',
      productionOrderDocNo: 'PO-RB',
      salesOrderId: 'so-rb',
      salesOrderDocNo: 'SO-RB',
      productName: 'Chamber RB',
      requestDate: now.slice(0, 10),
      requestedBy: 'Supervisor RB',
      status: 'Pending',
      receiptStatus: 'Pending',
      items: [
        { materialId: mat1.id, materialCode: mat1.code, materialName: mat1.name, unit: 'Nos', requiredQty: 5, issuedQty: 0, receivedQty: 0 },
        { materialId: mat2.id, materialCode: mat2.code, materialName: mat2.name, unit: 'Nos', requiredQty: 5, issuedQty: 0, receivedQty: 0 },
      ],
      createdAt: now,
    });

    // Attempt multi-line issue where line 1 has stock (10 >= 5) but line 2 has 0 stock (< 5)
    await assert.rejects(
      async () => {
        await mongoERPRepository.issueMaterial(
          mr.id,
          [
            { materialId: mat1.id, issuingQty: 5 },
            { materialId: mat2.id, issuingQty: 5 },
          ],
          'Partial failure test',
          now.slice(0, 10),
          { id: 'u1', name: 'Tester' },
        );
      },
      /INSUFFICIENT_STOCK/,
    );

    // Verify mat1 stock was NOT left decremented
    const verifiedMat1 = await MaterialModel.findOne({ id: mat1.id });
    assert.equal(verifiedMat1?.currentStock, 10, 'Mat1 stock remained 10 after rollback');
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Production Material Return Workflow
  // --------------------------------------------------------------------------
  await t.test('Scenario 10: Production Material Return Workflow', async () => {
    const mat = await MaterialModel.create({
      id: `mat-prt-${Date.now()}`,
      code: `MAT-PRT-${Date.now().toString().slice(-4)}`,
      name: 'Extra Screws & Fasteners',
      category: 'Components',
      unit: 'Nos',
      currentStock: 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    const now = new Date().toISOString();
    const mr = await MaterialRequestModel.create({
      id: `mr-prt-${Date.now()}`,
      docNo: `MR-PRT-${Date.now().toString().slice(-4)}`,
      bomId: 'bom-prt',
      bomDocNo: 'BOM-PRT',
      productionOrderId: 'po-prt',
      productionOrderDocNo: 'PO-PRT',
      salesOrderId: 'so-prt',
      salesOrderDocNo: 'SO-PRT',
      productName: 'Chamber PRT',
      requestDate: now.slice(0, 10),
      requestedBy: 'Supervisor PRT',
      status: 'Fully Issued',
      receiptStatus: 'Fully Received',
      items: [
        {
          materialId: mat.id,
          materialCode: mat.code,
          materialName: mat.name,
          unit: 'Nos',
          requiredQty: 20,
          issuedQty: 20,
          receivedQty: 20,
          returnedQty: 0,
        },
      ],
      createdAt: now,
    });

    // 1. Production returns 5 unused units
    const retRes = await apiRequest('/supply-chain/production-returns', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        materialRequestId: mr.id,
        materialId: mat.id,
        returnQty: 5,
        reason: 'Unused surplus after final assembly',
      },
    });
    assert.equal(retRes.status, 201, 'Production return recorded');
    const prt = retRes.data;
    assert.equal(prt.returnQty, 5);

    // Verify stock increased by 5
    const updatedMat = await MaterialModel.findOne({ id: mat.id });
    assert.equal(updatedMat?.currentStock, 5, 'Stock increased by 5');

    // Verify ledger entry
    const tx = await StockTransactionModel.findOne({ type: 'Production Return', linkedDocId: mr.id });
    assert.ok(tx, 'Ledger entry created for Production Return');
    assert.equal(tx?.quantityDelta, 5);

    // 2. Excess return rejection test: remaining net returnable is 20 - 5 = 15. Attempting to return 16 must fail.
    const excessRes = await apiRequest('/supply-chain/production-returns', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        materialRequestId: mr.id,
        materialId: mat.id,
        returnQty: 16,
        reason: 'Excess attempt',
      },
    });
    assert.equal(excessRes.status, 400, 'Excess return rejected');
  });

  // --------------------------------------------------------------------------
  // Scenario 11: RBAC Permission Enforcement
  // --------------------------------------------------------------------------
  await t.test('Scenario 11: RBAC Permission Enforcement (View vs Create vs Edit vs Approve)', async () => {
    // Sales Executive without supply_chain approve permission attempting stock adjustment
    const adjRes = await apiRequest('/supply-chain/stock-adjustment', {
      method: 'POST',
      token: salesExecToken,
      body: { materialId: 'mat-any', quantityDelta: 5, remarks: 'Unauthorized' },
    });
    assert.equal(adjRes.status, 403, 'Stock adjustment forbidden for unauthorized user');

    // Sales Executive without supply_chain edit permission attempting GRN verification
    const verifRes = await apiRequest('/supply-chain/grns/grn-any/verify', {
      method: 'POST',
      token: salesExecToken,
      body: { items: [] },
    });
    assert.equal(verifRes.status, 403, 'GRN verification forbidden for unauthorized user');
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Stock Reconciliation Report & Discrepancy Alignment
  // --------------------------------------------------------------------------
  await t.test('Scenario 12: Stock Reconciliation Report & Discrepancy Alignment', async () => {
    // 0. Ensure any pre-existing seed artifacts are reconciled first
    await apiRequest('/supply-chain/stock-reconciliation/reconcile', {
      method: 'POST',
      token: adminToken,
    });

    // 1. Fetch initial reconciliation report
    const initRes = await apiRequest('/supply-chain/stock-reconciliation', {
      token: scMgrToken,
    });
    assert.equal(initRes.status, 200);
    assert.equal(initRes.data.matched, true, 'All materials matched initially');

    // 2. Artificially introduce a discrepancy by tampering with a material's currentStock
    const anyMat = await MaterialModel.findOne({ active: true });
    assert.ok(anyMat, 'Found test material');
    const realLedgerBal = anyMat!.currentStock ?? 0;
    await MaterialModel.updateOne({ id: anyMat!.id }, { $set: { currentStock: realLedgerBal + 99 } });

    // 3. Query report: should detect discrepancy
    const detectRes = await apiRequest('/supply-chain/stock-reconciliation', {
      token: scMgrToken,
    });
    assert.equal(detectRes.status, 200);
    assert.equal(detectRes.data.matched, false, 'Discrepancy detected');
    assert.ok(detectRes.data.discrepanciesCount >= 1);

    // 4. Run reconcile action to align currentStock with the immutable ledger
    const reconcileRes = await apiRequest('/supply-chain/stock-reconciliation/reconcile', {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(reconcileRes.status, 200);
    assert.ok(reconcileRes.data.reconciledCount >= 1, 'Reconciled mismatched material');

    // 5. Verify material currentStock is now restored to ledger balance
    const restoredMat = await MaterialModel.findOne({ id: anyMat!.id });
    assert.equal(restoredMat?.currentStock, realLedgerBal, 'Material stock restored to ledger balance');

    // 6. Report is now fully matched again
    const finalRes = await apiRequest('/supply-chain/stock-reconciliation', {
      token: scMgrToken,
    });
    assert.equal(finalRes.data.matched, true, 'Reconciliation report is clean and matched');
  });

  await stopTestServer();
});
