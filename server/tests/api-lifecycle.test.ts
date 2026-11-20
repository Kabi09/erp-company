process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { dbStore } from '../db';
import type { Customer, Enquiry, PaymentEntry, Product, ProductionOrder, Quotation, SalesOrder, SupplierPO } from '../../src/types/erp';

// Start a local test server on an ephemeral port
let server: http.Server;
let baseUrl = '';
const dbBackupPath = path.resolve(process.cwd(), 'data', 'cryo-erp-db.json.bak');
const dbFilePath = path.resolve(process.cwd(), 'data', 'cryo-erp-db.json');

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

test('CRYO ERP 2.0 Comprehensive API Smoke, RBAC, and Full Lifecycle Test Suite', async (t) => {
  await startTestServer();

  let adminToken = '';
  let salesMgrToken = '';
  let salesExecToken = '';
  let scMgrToken = '';
  let prodMgrToken = '';
  let logMgrToken = '';

  await t.test('1. Authentication Tests', async () => {
    // 1.1 Super Admin login
    const adminLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'admin@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(adminLogin.status, 200);
    assert.ok(adminLogin.data.token);
    assert.equal(adminLogin.data.user.roleName, 'Super Admin');
    adminToken = adminLogin.data.token;

    // 1.2 Sales Manager login
    const smLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'sales.mgr@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(smLogin.status, 200);
    salesMgrToken = smLogin.data.token;

    // 1.3 Sales Executive login
    const seLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(seLogin.status, 200);
    salesExecToken = seLogin.data.token;

    // 1.4 Supply Chain Manager login
    const scLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'sc.mgr@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(scLogin.status, 200);
    scMgrToken = scLogin.data.token;

    // 1.5 Production Manager login
    const pmLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'prod.mgr@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(pmLogin.status, 200);
    prodMgrToken = pmLogin.data.token;

    // 1.6 Logistics Manager login
    const lmLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'log.mgr@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(lmLogin.status, 200);
    logMgrToken = lmLogin.data.token;

    // 1.7 Invalid credentials
    const badLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'admin@cryoerp.com', password: 'wrongpassword' },
    });
    assert.equal(badLogin.status, 401);

    // 1.8 Missing token
    const noToken = await apiRequest('/erp/bootstrap');
    assert.equal(noToken.status, 401);
  });

  await t.test('2. Role Permission & RBAC Enforcement', async () => {
    // 2.1 Sales Executive attempts to create a Production Order (forbidden)
    const forbiddenProd = await apiRequest('/production/orders', {
      method: 'POST',
      token: salesExecToken,
      body: { salesOrderId: 'dummy', quantity: 1 },
    });
    assert.equal(forbiddenProd.status, 403);
    assert.ok(forbiddenProd.data.error.includes('missing \'create\' permission for production module'));

    // 2.2 Sales Executive attempts to verify Payment (requires 'approve')
    const forbiddenPayVerify = await apiRequest('/sales/payments/pay-1/verify', {
      method: 'POST',
      token: salesExecToken,
      body: { status: 'Verified' },
    });
    assert.equal(forbiddenPayVerify.status, 403);

    // 2.3 Production Manager attempts to create a Supplier PO (forbidden)
    const forbiddenSpo = await apiRequest('/supply-chain/supplier-pos', {
      method: 'POST',
      token: prodMgrToken,
      body: { supplierId: 'sup-1', items: [] },
    });
    assert.equal(forbiddenSpo.status, 403);
  });

  await t.test('3. Complete End-to-End Linked Order Lifecycle', async () => {
    // --- STEP 1: Create Isolated Customer & Product ---
    const custRes = await apiRequest('/sales/customers', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        name: 'Apex Bio-Thermal Labs',
        contactPerson: 'Dr. Siddharth Sen',
        phone: '+91 99887 76655',
        email: 'siddharth@apexbio.in',
        billingAddress: 'Tech Park Zone 4, Whitefield, Bengaluru 560066',
        shippingAddress: 'Tech Park Zone 4, Whitefield, Bengaluru 560066',
        gstin: '29AABCA1234F1Z5',
      },
    });
    assert.equal(custRes.status, 201);
    const customer = custRes.data as Customer;

    const prodRes = await apiRequest('/sales/products', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        code: `PRD-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Cryogenic Freezer CF-200',
        category: 'Cryo Freezers',
        model: 'CF-200',
        specifications: '-86°C ultra-low precision storage, 200L volume',
        highlights: ['Dual hermetic compressors', 'Microprocessor digital PID control'],
        sellingPrice: 320000,
        unit: 'Nos',
      },
    });
    assert.equal(prodRes.status, 201);
    const product = prodRes.data as Product;

    // --- STEP 2: Create Sales Enquiry ---
    const enqRes = await apiRequest('/sales/enquiries', {
      method: 'POST',
      token: salesExecToken,
      body: {
        customerId: customer.id,
        source: 'Direct',
        items: [
          {
            productId: product.id,
            productName: product.name,
            model: product.model,
            quantity: 2,
            requiredSpecifications: product.specifications,
          },
        ],
        expectedDeliveryDate: '2026-12-15',
        notes: 'Urgent pilot testing batch',
      },
    });
    assert.equal(enqRes.status, 201);
    const enquiry = enqRes.data as Enquiry;
    assert.equal(enquiry.status, 'New');

    // --- STEP 3: Add Follow-up & Qualify Enquiry ---
    const fuRes = await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: {
        entityType: 'enquiry',
        entityId: enquiry.id,
        discussion: 'Customer confirmed technical requirements and budget approval.',
        contactMethod: 'Meeting',
        response: 'Accepted',
      },
    });
    assert.equal(fuRes.status, 201);

    // Verify enquiry auto-qualified
    const bootstrap1 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const qualifiedEnq = bootstrap1.data.enquiries.find((e: any) => e.id === enquiry.id);
    assert.equal(qualifiedEnq.status, 'Qualified');

    // --- STEP 4: Create Quotation V1 ---
    const qt1Res = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enquiry.id,
        items: [
          {
            productId: product.id,
            productName: product.name,
            model: product.model,
            specifications: product.specifications,
            quantity: 2,
            unitPrice: 300000,
            highlights: product.highlights,
          },
        ],
        discountPercent: 5,
        taxPercent: 18,
        status: 'Sent',
      },
    });
    assert.equal(qt1Res.status, 201);
    const qt1 = qt1Res.data as Quotation;
    assert.equal(qt1.version, 1);
    assert.ok(qt1.docNo.endsWith('-V1'));
    assert.equal(qt1.subtotal, 600000);
    assert.equal(qt1.discountAmount, 30000);
    assert.equal(qt1.taxAmount, 102600);
    assert.equal(qt1.totalAmount, 672600);

    // --- STEP 5: Negotiate / Revise Quotation to V2 ---
    const qt2Res = await apiRequest(`/sales/quotations/${qt1.id}/revise`, {
      method: 'POST',
      token: salesExecToken,
      body: {
        items: [
          {
            productId: product.id,
            productName: product.name,
            model: product.model,
            specifications: product.specifications,
            quantity: 2,
            unitPrice: 280000, // Reduced price after negotiation
            highlights: product.highlights,
          },
        ],
        discountPercent: 5,
        taxPercent: 18,
      },
    });
    assert.equal(qt2Res.status, 201);
    const qt2 = qt2Res.data as Quotation;
    assert.equal(qt2.version, 2);
    assert.ok(qt2.docNo.endsWith('-V2'));
    assert.equal(qt2.subtotal, 560000);
    assert.equal(qt2.totalAmount, 627760);

    // Verify V1 is marked Superseded
    const bootstrap2 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const prevQt = bootstrap2.data.quotations.find((q: any) => q.id === qt1.id);
    assert.equal(prevQt.status, 'Superseded');

    // --- STEP 6: Accept Quotation V2 ---
    const acceptRes = await apiRequest(`/sales/quotations/${qt2.id}/status`, {
      method: 'POST',
      token: salesMgrToken,
      body: { status: 'Accepted' },
    });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.data.status, 'Accepted');

    // --- STEP 7: Generate Proforma Invoice ---
    const piRes = await apiRequest('/sales/proforma-invoices', {
      method: 'POST',
      token: salesExecToken,
      body: { quotationId: qt2.id },
    });
    assert.equal(piRes.status, 201);
    const pi = piRes.data;
    assert.equal(pi.quotationDocNo, qt2.docNo);
    assert.equal(pi.totalAmount, qt2.totalAmount);

    // --- STEP 8: Record Customer PO with Discrepancy ---
    const cpoRes = await apiRequest('/sales/customer-pos', {
      method: 'POST',
      token: salesExecToken,
      body: {
        piId: pi.id,
        customerPoNumber: 'PO-APEX-2026-99',
        expectedDeliveryDate: '2026-12-20',
        hasDiscrepancy: true,
        discrepancyNotes: 'Delivery term on PO states CIF instead of Ex-Works.',
      },
    });
    assert.equal(cpoRes.status, 201);
    const cpo = cpoRes.data;

    // --- STEP 9: Attempt SO Confirmation with unresolved discrepancy (Must Fail) ---
    const failSoDiscrepancy = await apiRequest('/sales/sales-orders', {
      method: 'POST',
      token: salesMgrToken,
      body: { piId: pi.id },
    });
    assert.equal(failSoDiscrepancy.status, 400);
    assert.ok(failSoDiscrepancy.data.error.includes('unresolved discrepancy'));

    // Resolve discrepancy
    const resolveRes = await apiRequest(`/sales/customer-pos/${cpo.id}/resolve-discrepancy`, {
      method: 'POST',
      token: salesMgrToken,
      body: { resolutionNotes: 'Customer agreed in email to retain Ex-Works Bengaluru terms.' },
    });
    assert.equal(resolveRes.status, 200);

    // --- STEP 10: Attempt SO Confirmation without payment or credit (Must Fail) ---
    const failSoNoPay = await apiRequest('/sales/sales-orders', {
      method: 'POST',
      token: salesMgrToken,
      body: { piId: pi.id },
    });
    assert.equal(failSoNoPay.status, 400);
    assert.ok(failSoNoPay.data.error.includes('verified advance payment is required'));

    // --- STEP 11: Record and Verify Advance Payment (50%) ---
    const advanceAmount = Math.round(pi.totalAmount / 2);
    const payRes = await apiRequest('/sales/payments', {
      method: 'POST',
      token: salesExecToken,
      body: {
        piId: pi.id,
        amount: advanceAmount,
        method: 'Bank Transfer',
        paymentType: 'Advance',
        transactionRef: `UTR-TEST-${Date.now()}`,
      },
    });
    assert.equal(payRes.status, 201);
    const payment = payRes.data as PaymentEntry;

    // Verify payment by Sales Manager
    const verifyPayRes = await apiRequest(`/sales/payments/${payment.id}/verify`, {
      method: 'POST',
      token: salesMgrToken,
      body: { status: 'Verified', remarks: 'Funds credited to HDFC bank account.' },
    });
    assert.equal(verifyPayRes.status, 200);

    // --- STEP 12: Confirm Sales Order ---
    const soRes = await apiRequest('/sales/sales-orders', {
      method: 'POST',
      token: salesMgrToken,
      body: { piId: pi.id },
    });
    assert.equal(soRes.status, 201);
    const so = soRes.data as SalesOrder;
    assert.equal(so.commercialStatus, 'Confirmed');
    assert.equal(so.fulfillmentStatus, 'Awaiting Production');

    // --- STEP 13: Create Production Order ---
    const poRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: product.id,
        quantity: 2,
        plannedStartDate: '2026-11-25',
        plannedEndDate: '2026-12-08',
      },
    });
    assert.equal(poRes.status, 201);
    const prodOrder = poRes.data as ProductionOrder;
    assert.equal(prodOrder.status, 'Planned');
    assert.equal(prodOrder.plannedDurationDays, 14);

    // --- STEP 14: Prepare BOM & Send Material Request ---
    // Pick an existing material from DB
    const stateBeforeBom = dbStore.getState();
    const mat1 = stateBeforeBom.materials[0]; // e.g. Compressor
    const mat2 = stateBeforeBom.materials[1]; // e.g. Controller

    const bomRes = await apiRequest('/production/boms', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: prodOrder.id,
        items: [
          { materialId: mat1.id, qtyPerUnit: 2 }, // Total 4
          { materialId: mat2.id, qtyPerUnit: 1 }, // Total 2
        ],
        sendRequest: true,
      },
    });
    assert.equal(bomRes.status, 201);
    const bom = bomRes.data;
    assert.ok(bom.materialRequestId);

    // Verify Production Order is now Awaiting Materials
    const bootstrap3 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const poAwaiting = bootstrap3.data.productionOrders.find((p: any) => p.id === prodOrder.id);
    assert.equal(poAwaiting.status, 'Awaiting Materials');

    // --- STEP 15: Partial Material Issue by Supply Chain ---
    // Let's ensure mat1 has at least 2 units in stock
    const stockMapBefore = bootstrap3.data.stockMap;
    const mat1Stock = stockMapBefore[mat1.id] || 0;
    if (mat1Stock < 2) {
      await apiRequest('/supply-chain/stock-adjustment', {
        method: 'POST',
        token: scMgrToken,
        body: { materialId: mat1.id, quantityDelta: 10, remarks: 'Test stock injection' },
      });
    }

    const issue1Res = await apiRequest('/supply-chain/material-issues', {
      method: 'POST',
      token: scMgrToken,
      body: {
        materialRequestId: bom.materialRequestId,
        items: [{ materialId: mat1.id, issuingQty: 2 }], // Issue 2 out of 4 required
      },
    });
    assert.equal(issue1Res.status, 201);
    const issue1 = issue1Res.data;

    // Verify stock was deducted in ledger
    const bootstrap4 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const mrPartial = bootstrap4.data.materialRequests.find((m: any) => m.id === bom.materialRequestId);
    assert.equal(mrPartial.status, 'Partially Issued');

    // --- STEP 16: Supply Chain PO, Partial GRN, Verification with Rejection, and Return ---
    const spoRes = await apiRequest('/supply-chain/supplier-pos', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierId: stateBeforeBom.suppliers[0].id,
        purchaseType: 'Request-Based',
        materialRequestId: bom.materialRequestId,
        items: [{ materialId: mat1.id, orderedQty: 5, unitPrice: 12000 }],
      },
    });
    assert.equal(spoRes.status, 201);
    const spo = spoRes.data as SupplierPO;

    // Receive GRN for 5 units
    const grnRes = await apiRequest('/supply-chain/grns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierPoId: spo.id,
        invoiceOrChallanNo: 'CH-DANFOSS-9821',
        items: [{ materialId: mat1.id, receivedQty: 5 }],
      },
    });
    assert.equal(grnRes.status, 201);
    const grn = grnRes.data;

    // Verify GRN with 4 Accepted, 1 Rejected
    const verifyGrnRes = await apiRequest(`/supply-chain/grns/${grn.id}/verify`, {
      method: 'POST',
      token: scMgrToken,
      body: {
        items: [
          {
            materialId: mat1.id,
            acceptedQty: 4,
            rejectedQty: 1,
            rejectionReason: 'Dent on casing; pressure valve compromised.',
          },
        ],
        verificationRemarks: 'Incoming inspection completed. 4 accepted to stock.',
      },
    });
    assert.equal(verifyGrnRes.status, 200);
    assert.equal(verifyGrnRes.data.verificationStatus, 'Partially Accepted');

    // Supplier Return for 1 rejected unit
    const srRes = await apiRequest('/supply-chain/supplier-returns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        grnId: grn.id,
        materialId: mat1.id,
        returnQty: 1,
        reason: 'Physical casing damage',
        replacementRequired: true,
      },
    });
    assert.equal(srRes.status, 201);

    // --- STEP 17: Issue remaining materials for BOM ---
    // Ensure mat2 has stock
    const bootstrap5 = await apiRequest('/erp/bootstrap', { token: adminToken });
    if ((bootstrap5.data.stockMap[mat2.id] || 0) < 2) {
      await apiRequest('/supply-chain/stock-adjustment', {
        method: 'POST',
        token: scMgrToken,
        body: { materialId: mat2.id, quantityDelta: 5, remarks: 'Stock injection for mat2' },
      });
    }

    const issue2Res = await apiRequest('/supply-chain/material-issues', {
      method: 'POST',
      token: scMgrToken,
      body: {
        materialRequestId: bom.materialRequestId,
        items: [
          { materialId: mat1.id, issuingQty: 2 }, // Remaining 2 for mat1
          { materialId: mat2.id, issuingQty: 2 }, // Full 2 for mat2
        ],
      },
    });
    assert.equal(issue2Res.status, 201);
    const issue2 = issue2Res.data;

    const bootstrap6 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const mrFullyIssued = bootstrap6.data.materialRequests.find((m: any) => m.id === bom.materialRequestId);
    assert.equal(mrFullyIssued.status, 'Fully Issued');

    // --- STEP 18: Production acknowledges physical receipts ---
    await apiRequest(`/production/material-receipts/${issue1.id}/acknowledge`, {
      method: 'POST',
      token: prodMgrToken,
    });
    await apiRequest(`/production/material-receipts/${issue2.id}/acknowledge`, {
      method: 'POST',
      token: prodMgrToken,
    });

    // Verify Production Order is now Ready to Start!
    const bootstrap7 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const poReady = bootstrap7.data.productionOrders.find((p: any) => p.id === prodOrder.id);
    assert.equal(poReady.status, 'Ready to Start');

    // --- STEP 19: Start Production & Daily Updates ---
    const startRes = await apiRequest(`/production/orders/${prodOrder.id}/start`, {
      method: 'POST',
      token: prodMgrToken,
      body: { actualStartDate: '2026-11-26' },
    });
    assert.equal(startRes.status, 200);
    assert.equal(startRes.data.status, 'In Progress');

    // Record daily updates
    const duRes = await apiRequest('/production/daily-updates', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: prodOrder.id,
        stage: 'Fabrication',
        workCompleted: 'Chamber chassis welded and vacuum insulation panels installed.',
        completedQty: 2,
        workHours: 8,
        stageStatus: 'Completed',
      },
    });
    assert.equal(duRes.status, 201);

    // --- STEP 20: Complete Manufacturing -> QC Pending ---
    const completeMfgRes = await apiRequest(`/production/orders/${prodOrder.id}/complete-manufacturing`, {
      method: 'POST',
      token: prodMgrToken,
      body: { completedQty: 2 },
    });
    assert.equal(completeMfgRes.status, 200);
    assert.equal(completeMfgRes.data.status, 'QC Pending');

    // --- STEP 21: Quality Check Rejection -> Auto Rework ---
    const qcFailRes = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: prodOrder.id,
        finalResult: 'Rejected',
        rejectionReason: 'Temperature pulldown test reached only -72°C instead of rated -86°C.',
        requiredCorrection: 'Evacuate refrigerant line, recharge cascade stage with R508B.',
      },
    });
    assert.equal(qcFailRes.status, 201);
    const qcFail = qcFailRes.data;
    assert.equal(qcFail.finalResult, 'Rejected');
    assert.ok(qcFail.reworkId);

    // Verify order is now in Rework state
    const bootstrap8 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const poRework = bootstrap8.data.productionOrders.find((p: any) => p.id === prodOrder.id);
    assert.equal(poRework.status, 'Rework');

    // Try to dispatch while in rework (Must Fail)
    const failDispatchRework = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: { productionOrderId: prodOrder.id, quantity: 2 },
    });
    assert.equal(failDispatchRework.status, 400);

    // --- STEP 22: Complete Rework -> Returns to QC Pending ---
    const reworkCompleteRes = await apiRequest(`/production/rework/${qcFail.reworkId}/complete`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        completedWork: 'Refrigerant recharged and capillary expansion valve recalibrated.',
      },
    });
    assert.equal(reworkCompleteRes.status, 200);
    assert.equal(reworkCompleteRes.data.status, 'Reinspection');

    // Verify PO returned to QC Pending
    const bootstrap9 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const poQcPendingAgain = bootstrap9.data.productionOrders.find((p: any) => p.id === prodOrder.id);
    assert.equal(poQcPendingAgain.status, 'QC Pending');

    // --- STEP 23: Second QC Check -> Accepted -> Completed ---
    const qcPassRes = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: prodOrder.id,
        finalResult: 'Accepted',
        remarks: 'Pulldown achieved -86.4°C stably for 24 hours. Calibration verified.',
        checks: [
          { name: 'Thermal Pull-Down', result: 'Pass', observation: '-86.4°C steady' },
          { name: 'Electrical Safety', result: 'Pass', observation: 'Insulation > 100MΩ' },
        ],
      },
    });
    assert.equal(qcPassRes.status, 201);
    assert.equal(qcPassRes.data.finalResult, 'Accepted');

    // Verify order is now Completed with qcAcceptedQty = 2
    const bootstrap10 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const poCompleted = bootstrap10.data.productionOrders.find((p: any) => p.id === prodOrder.id);
    assert.equal(poCompleted.status, 'Completed');
    assert.equal(poCompleted.qcAcceptedQty, 2);

    // --- STEP 24: Logistics Create Delivery Order (Own Vehicle) ---
    const delRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        productionOrderId: prodOrder.id,
        quantity: 2,
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-04-MB-4412',
        driverName: 'Manjunath Gowda',
        driverPhone: '+91 98440 22331',
        plannedDispatchDate: '2026-11-28',
        expectedDeliveryDate: '2026-11-28',
      },
    });
    assert.equal(delRes.status, 201);
    const delivery = delRes.data;
    assert.equal(delivery.status, 'Planned');

    // --- STEP 25: Confirm Dispatch with Delivery Challan ---
    const dispatchRes = await apiRequest(`/logistics/delivery-orders/${delivery.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        deliveryChallanNo: 'DC-CRYO-2026-089',
        remarks: 'Dispatched in insulated dedicated vehicle.',
      },
    });
    assert.equal(dispatchRes.status, 200);
    assert.equal(dispatchRes.data.status, 'In Transit');

    // Verify SO fulfillment is now 'In Transit'
    const bootstrap11 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const soInTransit = bootstrap11.data.salesOrders.find((s: any) => s.id === so.id);
    assert.equal(soInTransit.fulfillmentStatus, 'In Transit');

    // --- STEP 26: Confirm Delivery ---
    const deliverRes = await apiRequest(`/logistics/delivery-orders/${delivery.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        receivedBy: 'Dr. Siddharth Sen (Head of Bio-Thermal)',
        deliveryDate: '2026-11-28',
        deliveredQty: 2,
        remarks: 'Received in pristine operating condition, commissioning acknowledged.',
      },
    });
    assert.equal(deliverRes.status, 200);
    assert.equal(deliverRes.data.status, 'Delivered');

    // --- STEP 27: Final Verification of Order Fulfillment vs Payment Balance ---
    const bootstrap12 = await apiRequest('/erp/bootstrap', { token: adminToken });
    const finalSo = bootstrap12.data.salesOrders.find((s: any) => s.id === so.id);
    assert.equal(finalSo.fulfillmentStatus, 'Delivered');

    // Crucial business rule: verify payment balance is NOT falsely set to Paid!
    const finalPayments = bootstrap12.data.payments.filter((p: any) => p.salesOrderId === so.id);
    const paidSum = finalPayments.filter((p: any) => p.status === 'Verified').reduce((s: number, p: any) => s + p.amount, 0);
    const balance = finalSo.totalAmount - paidSum;
    assert.ok(balance > 0, 'Sales order balance must still have remaining unpaid balance');
    assert.equal(paidSum, advanceAmount);
  });

  await stopTestServer();

  // Restore original business database snapshot from backup
  if (fs.existsSync(dbBackupPath)) {
    fs.copyFileSync(dbBackupPath, dbFilePath);
  }
});
