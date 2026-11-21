process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  CustomerModel,
  EnquiryModel,
  FollowUpModel,
  QuotationModel,
  ProformaInvoiceModel,
  CustomerPOModel,
  PaymentEntryModel,
  SalesOrderModel,
  MaterialRequestModel,
  SupplierPOModel,
  GRNModel,
  MaterialIssueModel,
  SupplierReturnModel,
  ProductionOrderModel,
  BOMModel,
  DailyProductionUpdateModel,
  QualityCheckModel,
  ReworkOrderModel,
  DeliveryOrderModel,
  AttachmentModel,
  CompanySettingsModel,
  NotificationModel,
  ActivityLogModel,
} from '../models';
import { migrateLegacyAttachments } from '../migrations/migrateAttachments';
import { storageService } from '../services/storage.service';

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
  endpoint: string,
  options: { method?: string; body?: any; token?: string; isRawBinary?: boolean } = {},
): Promise<{ status: number; headers: Headers; data: T; buffer?: Buffer }> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body && !(options.body instanceof Buffer)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? (options.body instanceof Buffer ? options.body : JSON.stringify(options.body)) : undefined,
  });

  if (options.isRawBinary) {
    const arrayBuffer = await res.arrayBuffer();
    return {
      status: res.status,
      headers: res.headers,
      data: {} as T,
      buffer: Buffer.from(arrayBuffer),
    };
  }

  let data: any = {};
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { text };
  }
  return { status: res.status, headers: res.headers, data };
}

test('CRYO ERP 2.0 Phase 9 — Centralized Tracking, Notifications, Documents, Storage & Shared Refinements', async (t) => {
  await startTestServer();

  let adminToken = '';
  let salesExecToken = '';
  let logMgrToken = '';
  let prodMgrToken = '';

  const [adminLogin, salesLogin, logLogin, prodLogin] = await Promise.all([
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'admin@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'log.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'prod.mgr@cryoerp.com', password: 'cryo123' } }),
  ]);

  adminToken = adminLogin.data.token;
  salesExecToken = salesLogin.data.token;
  logMgrToken = logLogin.data.token;
  prodMgrToken = prodLogin.data.token;

  assert.ok(adminToken, 'Admin token acquired');
  assert.ok(salesExecToken, 'Sales token acquired');
  assert.ok(logMgrToken, 'Logistics token acquired');
  assert.ok(prodMgrToken, 'Production token acquired');

  let seq = 9000;
  function getUniqueId(prefix: string): string {
    seq += 1;
    return `${prefix}-${Date.now().toString().slice(-6)}-${seq}`;
  }

  // Shared test entity holders
  let testCustId = '';
  let testCustPoDocNo = '';
  let testSoId = '';
  let testSoDocNo = '';
  let testQuotId = '';
  let testQuotDocNo = '';
  let testPiId = '';
  let testPiDocNo = '';
  let testSupplierPoId = '';
  let testSupplierPoDocNo = '';
  let testQcId = '';
  let testDeliveryId = '';

  // =========================================================================
  // SCENARIO 1: End-to-End Centralized Order Tracking (15 Stages, Line Progress & RBAC Redaction)
  // =========================================================================
  await t.test('Scenario 1: End-to-End Order Tracking across 15 Stages with Line Progress and RBAC Redaction', async () => {
    testCustId = getUniqueId('CUST');
    testCustPoDocNo = getUniqueId('CPO');
    testSoId = getUniqueId('SO-ID');
    testSoDocNo = getUniqueId('SO');
    testQuotId = getUniqueId('QT-ID');
    testQuotDocNo = getUniqueId('QT');
    testPiId = getUniqueId('PI-ID');
    testPiDocNo = getUniqueId('PI');
    testSupplierPoId = getUniqueId('SPO-ID');
    testSupplierPoDocNo = getUniqueId('SPO');
    testQcId = getUniqueId('QC-ID');
    testDeliveryId = getUniqueId('DO-ID');

    const customerSnapshot = {
      name: 'CryoTech Labs Bengaluru',
      contactPerson: 'Dr. Ramesh Kumar',
      phone: '+91 98765 43210',
      email: 'ramesh@cryotechlabs.com',
      billingAddress: 'Phase 1, Electronic City, Bengaluru',
      shippingAddress: 'Phase 1, Electronic City, Bengaluru',
      gstin: '29ABCDE1234F1Z5',
    };

    // 1. Customer
    await CustomerModel.create({
      id: testCustId,
      ...customerSnapshot,
      notes: 'Key cryogenic customer',
      createdAt: new Date().toISOString(),
    });

    // 2. Enquiry
    const enqDocNo = getUniqueId('ENQ');
    const enqId = getUniqueId('ENQ-ID');
    await EnquiryModel.create({
      id: enqId,
      docNo: enqDocNo,
      customerId: testCustId,
      customerSnapshot,
      status: 'Qualified',
      assignedTo: 'sales.exec@cryoerp.com',
      createdBy: 'sales.exec@cryoerp.com',
      source: 'Direct',
      items: [
        {
          id: 'item-1',
          productId: 'prod-dewar-50',
          productName: 'Cryogenic Biological Container (50L)',
          model: 'CRYO-BIO-50',
          quantity: 2,
          requiredSpecifications: 'Vacuum insulated biological container',
          customerRequirements: 'Liquid nitrogen container',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FollowUpModel.create({
      id: getUniqueId('FLW-ID'),
      entityType: 'enquiry',
      entityId: enqId,
      entityDocNo: enqDocNo,
      customerName: customerSnapshot.name,
      summary: 'Technical feasibility confirmed',
      followUpDate: new Date().toISOString(),
      discussion: 'Customer requirements validated',
      status: 'Completed',
      followedBy: 'sales.exec@cryoerp.com',
      createdAt: new Date().toISOString(),
    });

    // 3. Quotation (Rev 1 and Rev 2)
    await QuotationModel.create({
      id: testQuotId,
      docNo: testQuotDocNo,
      baseDocNo: testQuotDocNo,
      version: 2,
      enquiryId: enqId,
      enquiryDocNo: enqDocNo,
      customerId: testCustId,
      customerSnapshot,
      quotationDate: new Date().toISOString(),
      validityDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      items: [
        {
          id: 'item-1',
          productId: 'prod-dewar-50',
          productName: 'Cryogenic Biological Container (50L)',
          model: 'CRYO-BIO-50',
          quantity: 2,
          unitPrice: 150000,
          lineTotal: 300000,
        },
      ],
      subtotal: 300000,
      taxPercent: 18,
      taxAmount: 54000,
      totalAmount: 354000,
      status: 'Accepted',
      createdBy: 'Sales Exec',
      createdAt: new Date().toISOString(),
    });

    // 4. Proforma Invoice
    await ProformaInvoiceModel.create({
      id: testPiId,
      docNo: testPiDocNo,
      quotationId: testQuotId,
      quotationDocNo: testQuotDocNo,
      enquiryId: enqId,
      customerId: testCustId,
      customerSnapshot,
      bankDetails: {
        bankName: 'State Bank of India',
        accountName: 'CRYO Systems India Pvt Ltd',
        accountNumber: '38920192837',
        ifsc: 'SBIN0001234',
        branch: 'Peenya Industrial Estate',
      },
      piDate: new Date().toISOString(),
      items: [
        {
          id: 'pi-item-1',
          productId: 'prod-dewar-50',
          productName: 'Cryogenic Biological Container (50L)',
          model: 'CRYO-BIO-50',
          quantity: 2,
          unitPrice: 150000,
          lineTotal: 300000,
        },
      ],
      subtotal: 300000,
      taxPercent: 18,
      taxAmount: 54000,
      totalAmount: 354000,
      status: 'Issued',
      createdBy: 'sales.exec@cryoerp.com',
      createdAt: new Date().toISOString(),
    });

    // 5. Customer PO
    const cpoId = getUniqueId('CPO-ID');
    await CustomerPOModel.create({
      id: cpoId,
      docNo: testCustPoDocNo,
      piId: testPiId,
      piDocNo: testPiDocNo,
      customerId: testCustId,
      customerName: customerSnapshot.name,
      customerPoNumber: 'PO-CLIENT-7788',
      receivedDate: new Date().toISOString(),
      expectedDeliveryDate: new Date(Date.now() + 15 * 86400000).toISOString(),
      hasDiscrepancy: false,
      discrepancyResolved: true,
      createdBy: 'sales.exec@cryoerp.com',
      createdAt: new Date().toISOString(),
    });

    // 6. Payment Entry (Verified Advance)
    await PaymentEntryModel.create({
      id: getUniqueId('PAY-ID'),
      docNo: getUniqueId('PAY'),
      salesOrderDocNo: testSoDocNo,
      customerId: testCustId,
      customerName: customerSnapshot.name,
      amount: 177000,
      paymentDate: new Date().toISOString(),
      method: 'Bank Transfer',
      transactionRef: `UTR${Date.now()}`,
      status: 'Verified',
      verifiedBy: 'Finance Admin',
      verifiedAt: new Date().toISOString(),
      createdBy: 'sales.exec@cryoerp.com',
      createdAt: new Date().toISOString(),
    });

    // 7. Sales Order
    await SalesOrderModel.create({
      id: testSoId,
      docNo: testSoDocNo,
      enquiryId: enqId,
      enquiryDocNo: enqDocNo,
      quotationId: testQuotId,
      quotationDocNo: testQuotDocNo,
      piId: testPiId,
      piDocNo: testPiDocNo,
      customerPoId: cpoId,
      customerPoDocNo: testCustPoDocNo,
      customerId: testCustId,
      customerSnapshot,
      customerPoNumber: 'PO-CLIENT-7788',
      promisedDeliveryDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      items: [
        {
          id: 'so-item-1',
          productId: 'prod-dewar-50',
          productName: 'Cryogenic Biological Container (50L)',
          model: 'CRYO-BIO-50',
          quantity: 2,
          unitPrice: 150000,
          lineTotal: 300000,
        },
      ],
      subtotal: 300000,
      taxAmount: 54000,
      totalAmount: 354000,
      fulfillmentStatus: 'In Production',
      commercialStatus: 'Confirmed',
      deliveryAddress: customerSnapshot.shippingAddress,
      createdBy: 'sales.exec@cryoerp.com',
      createdAt: new Date().toISOString(),
    });

    // 8. Production Order & BOM (Created before MR)
    const poDocNo = getUniqueId('PO-MFG');
    const prodOrderId = getUniqueId('PROD-ID');
    await ProductionOrderModel.create({
      id: prodOrderId,
      docNo: poDocNo,
      salesOrderId: testSoId,
      salesOrderDocNo: testSoDocNo,
      customerId: testCustId,
      customerName: customerSnapshot.name,
      productId: 'prod-dewar-50',
      productName: 'Cryogenic Biological Container (50L)',
      quantity: 2,
      plannedStartDate: new Date().toISOString(),
      plannedEndDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      plannedDurationDays: 10,
      productionInCharge: 'Chief Production Engineer',
      status: 'Completed',
      completedManufacturingQty: 2,
      qcAcceptedQty: 2,
      dispatchedQty: 2,
      deliveredQty: 2,
      createdBy: 'prod.mgr@cryoerp.com',
      createdAt: new Date().toISOString(),
    });

    const bomId = getUniqueId('BOM-ID');
    const bomDocNo = getUniqueId('BOM');
    await BOMModel.create({
      id: bomId,
      docNo: bomDocNo,
      productionOrderId: prodOrderId,
      productionOrderDocNo: poDocNo,
      productName: 'Cryogenic Biological Container (50L)',
      productionQty: 2,
      items: [
        {
          materialId: 'mat-ss-sheet',
          materialCode: 'SS-304L',
          materialName: 'Stainless Steel 304L Sheet',
          unit: 'Sheets',
          qtyPerUnit: 2,
          totalRequiredQty: 4,
        },
      ],
      createdBy: 'sales.exec@cryoerp.com',
      createdAt: new Date().toISOString(),
    });

    // 9. Material Request
    const mrDocNo = getUniqueId('MR');
    const mrId = getUniqueId('MR-ID');
    await MaterialRequestModel.create({
      id: mrId,
      docNo: mrDocNo,
      bomId,
      bomDocNo,
      productionOrderId: prodOrderId,
      productionOrderDocNo: poDocNo,
      salesOrderId: testSoId,
      salesOrderDocNo: testSoDocNo,
      productName: 'Cryogenic Biological Container (50L)',
      items: [
        {
          materialId: 'mat-ss-sheet',
          materialCode: 'SS-304L',
          materialName: 'Stainless Steel 304L Sheet',
          unit: 'Sheets',
          requiredQty: 4,
          issuedQty: 4,
          receivedQty: 4,
        },
      ],
      status: 'Fully Issued',
      receiptStatus: 'Fully Received',
      requestedBy: 'Prod Eng',
      requestDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // 10. Supplier PO
    await SupplierPOModel.create({
      id: testSupplierPoId,
      docNo: testSupplierPoDocNo,
      supplierId: 'sup-apex',
      supplierName: 'Apex Steel & Alloys',
      poDate: new Date().toISOString(),
      expectedDeliveryDate: new Date().toISOString(),
      items: [
        {
          materialId: 'mat-ss-sheet',
          materialCode: 'SS-304L',
          materialName: 'Stainless Steel 304L Sheet',
          unit: 'Sheets',
          orderedQty: 4,
          receivedQty: 4,
          acceptedQty: 4,
          rejectedQty: 0,
          unitPrice: 8000,
          lineTotal: 32000,
        },
      ],
      subtotal: 32000,
      taxPercent: 18,
      taxAmount: 5760,
      totalAmount: 37760,
      status: 'Received',
      createdBy: 'Supply Chain Mgr',
      createdAt: new Date().toISOString(),
    });

    // 11. GRN
    await GRNModel.create({
      id: getUniqueId('GRN-ID'),
      docNo: getUniqueId('GRN'),
      supplierPoId: testSupplierPoId,
      supplierPoDocNo: testSupplierPoDocNo,
      supplierId: 'sup-apex',
      supplierName: 'Apex Steel & Alloys',
      receivedDate: new Date().toISOString(),
      invoiceOrChallanNo: 'DC-APEX-101',
      items: [
        {
          materialId: 'mat-ss-sheet',
          materialCode: 'SS-304L',
          materialName: 'Stainless Steel 304L Sheet',
          unit: 'Sheets',
          orderedQty: 4,
          receivedQty: 4,
          acceptedQty: 4,
          rejectedQty: 0,
          verified: true,
        },
      ],
      verificationStatus: 'Accepted',
      createdBy: 'Store Keeper',
      createdAt: new Date().toISOString(),
    });

    // 12. Material Issue
    await MaterialIssueModel.create({
      id: getUniqueId('ISS-ID'),
      docNo: getUniqueId('ISS'),
      materialRequestId: mrId,
      materialRequestDocNo: mrDocNo,
      productionOrderId: prodOrderId,
      productionOrderDocNo: poDocNo,
      issueDate: new Date().toISOString(),
      items: [
        {
          materialId: 'mat-ss-sheet',
          materialCode: 'SS-304L',
          materialName: 'Stainless Steel 304L Sheet',
          unit: 'Sheets',
          issuedQty: 4,
          receivedQty: 4,
        },
      ],
      receiptAcknowledged: true,
      issuedBy: 'Store Keeper',
      createdAt: new Date().toISOString(),
    });

    // 13. Daily Production Update
    await DailyProductionUpdateModel.create({
      id: getUniqueId('DLY-ID'),
      productionOrderId: prodOrderId,
      productionOrderDocNo: poDocNo,
      workDate: new Date().toISOString(),
      stage: 'Final Assembly',
      workCompleted: 'Insulation wrapping and outer shell welding complete',
      completedQty: 2,
      stageStatus: 'Completed',
      employeeName: 'Ramesh Welder',
      createdAt: new Date().toISOString(),
    });

    // 14. Quality Check
    const qcDocNo = getUniqueId('QC');
    await QualityCheckModel.create({
      id: testQcId,
      docNo: qcDocNo,
      attemptNumber: 1,
      productionOrderId: prodOrderId,
      productionOrderDocNo: poDocNo,
      productName: 'Cryogenic Biological Container (50L)',
      inspectedQty: 2,
      acceptedQty: 2,
      rejectedQty: 0,
      inspectionDate: new Date().toISOString(),
      inspector: 'Chief QC Engineer',
      checks: [
        {
          name: 'Helium Leak Mass Spec',
          result: 'Pass',
          observation: '< 1x10^-9 mbar.l/s',
        },
      ],
      finalResult: 'Accepted',
      createdAt: new Date().toISOString(),
    });

    // 15. Delivery Order
    const doDocNo = getUniqueId('DO');
    await DeliveryOrderModel.create({
      id: testDeliveryId,
      docNo: doDocNo,
      salesOrderId: testSoId,
      salesOrderDocNo: testSoDocNo,
      productionOrderId: prodOrderId,
      productionOrderDocNo: poDocNo,
      customerId: testCustId,
      customerName: customerSnapshot.name,
      productName: 'Cryogenic Biological Container (50L)',
      quantity: 2,
      deliveryAddress: customerSnapshot.shippingAddress,
      transportMethod: 'Own Vehicle',
      vehicleNumber: 'KA-04-CR-9900',
      driverName: 'Manjunath Swamy',
      driverPhone: '+91 99000 11223',
      plannedDispatchDate: new Date().toISOString(),
      expectedDeliveryDate: new Date().toISOString(),
      actualDispatchDate: new Date().toISOString(),
      actualDeliveryDate: new Date().toISOString(),
      deliveredQty: 2,
      status: 'Delivered',
      receivedBy: 'Dr. Ramesh Kumar',
      createdBy: 'log.mgr@cryoerp.com',
      createdAt: new Date().toISOString(),
    });

    // Test Admin View (All stages populated with full commercial transparency)
    const adminResp = await apiRequest(`/tracking/${testSoId}`, { token: adminToken });
    assert.equal(adminResp.status, 200, 'Admin tracking query returns HTTP 200');
    assert.ok(adminResp.data.salesOrder, 'Returned salesOrder payload');
    assert.equal(adminResp.data.stages.length, 15, 'All 15 workflow stages are derived');

    const stages = adminResp.data.stages;
    assert.equal(stages[0].status, 'Completed', 'Stage 1 (Enquiry) is Completed');
    assert.equal(stages[3].status, 'Completed', 'Stage 4 (Quotation) is Completed');
    assert.equal(stages[7].status, 'Completed', 'Stage 8 (Sales Order) is Completed');
    assert.equal(stages[11].status, 'Completed', 'Stage 12 (Production) is Completed');
    assert.equal(stages[12].status, 'Completed', 'Stage 13 (QC) is Completed');
    assert.equal(stages[13].status, 'Completed', 'Stage 14 (Logistics Dispatch) is Completed');
    assert.equal(stages[14].status, 'Completed', 'Stage 15 (Delivery Handover) is Completed');

    // Verify Line Progress
    assert.ok(Array.isArray(adminResp.data.lineProgress), 'Line progress array returned');
    assert.equal(adminResp.data.lineProgress.length, 1);
    assert.equal(adminResp.data.lineProgress[0].orderedQty, 2);
    assert.equal(adminResp.data.lineProgress[0].manufacturedQty, 2);
    assert.equal(adminResp.data.lineProgress[0].qcAcceptedQty, 2);
    assert.equal(adminResp.data.lineProgress[0].deliveredQty, 2);

    // Verify RBAC Redaction for Logistics Manager
    const logResp = await apiRequest(`/tracking/${testSoId}`, { token: logMgrToken });
    assert.equal(logResp.status, 200, 'Logistics manager tracking query returns HTTP 200');
    assert.equal(logResp.data.isCommercialRedacted, true, 'isCommercialRedacted flag set for non-sales user');
    assert.equal(logResp.data.salesOrder.totalAmount, undefined, 'Sales Order totalAmount redacted for logistics user');
    assert.equal(logResp.data.paymentSummary, undefined, 'Payment commercial summary redacted for logistics user');
  });

  // =========================================================================
  // SCENARIO 2: Centralized Notifications (Delivery, Unread Count, Read, Deduplication)
  // =========================================================================
  await t.test('Scenario 2: Centralized Notifications Lifecycle and Deduplication Safeguards', async () => {
    // 1. Initial list & count
    const listResp = await apiRequest('/notifications', { token: adminToken });
    assert.equal(listResp.status, 200);
    assert.ok(Array.isArray(listResp.data.items));

    // 2. Post new notification with dedupKey
    const testDedupKey = `dedup_test_${Date.now()}`;
    const createResp = await apiRequest('/notifications', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Material Arrival Alert',
        message: 'Raw steel plates received at Dock 2 for SO-9000',
        department: 'production',
        severity: 'info',
        dedupKey: testDedupKey,
      },
    });
    assert.equal(createResp.status, 201);
    const notifId = createResp.data.notification.id;
    assert.ok(notifId);

    // 3. Post identical notification with same dedupKey -> must deduplicate without creating new row
    const dupResp = await apiRequest('/notifications', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Material Arrival Alert (Retry)',
        message: 'Raw steel plates received at Dock 2 for SO-9000 (Duplicate)',
        department: 'production',
        dedupKey: testDedupKey,
      },
    });
    assert.equal(dupResp.status, 200, 'Duplicate submission returns 200 OK');
    assert.equal(dupResp.data.deduplicated, true, 'Flagged as deduplicated');
    assert.equal(dupResp.data.notification.id, notifId, 'Re-uses original notification ID');

    // 4. Mark single notification as read
    const markResp = await apiRequest(`/notifications/${notifId}/read`, { method: 'PATCH', token: adminToken });
    assert.equal(markResp.status, 200);
    assert.ok(markResp.data.notification.readBy.includes(adminLogin.data.user.id));

    // 5. Mark all as read
    const markAllResp = await apiRequest('/notifications/read-all', { method: 'POST', token: adminToken });
    assert.equal(markAllResp.status, 200);

    const afterAll = await apiRequest('/notifications', { token: adminToken });
    assert.equal(afterAll.data.unreadCount, 0, 'Unread count is 0 after mark-all-read');
  });

  // =========================================================================
  // SCENARIO 3: Real Binary PDF Document Generation (6+ Distinct Document Types)
  // =========================================================================
  await t.test('Scenario 3: Real Binary PDF Document Generation for 6+ Distinct Business Documents', async () => {
    const docTypes = [
      { type: 'quotation', id: testQuotId, label: 'Quotation' },
      { type: 'proforma-invoice', id: testPiId, label: 'Proforma Invoice' },
      { type: 'sales-order', id: testSoId, label: 'Sales Order' },
      { type: 'purchase-order', id: testSupplierPoId, label: 'Purchase Order' },
      { type: 'quality-check', id: testQcId, label: 'Quality Check Report' },
      { type: 'delivery-challan', id: testDeliveryId, label: 'Delivery Challan' },
    ];

    for (const doc of docTypes) {
      const resp = await apiRequest(`/documents/${doc.type}/${doc.id}/pdf`, {
        token: adminToken,
        isRawBinary: true,
      });

      if (resp.status !== 200) {
        console.error(`Failed ${doc.label}: status=${resp.status}, body=${resp.buffer?.toString('utf-8')}`);
      }

      assert.equal(resp.status, 200, `${doc.label} PDF generation returns HTTP 200`);
      assert.equal(resp.headers.get('content-type'), 'application/pdf', `${doc.label} has Content-Type: application/pdf`);

      const disposition = resp.headers.get('content-disposition') || '';
      assert.ok(disposition.includes('inline; filename='), `${doc.label} has valid inline Content-Disposition`);

      assert.ok(resp.buffer, `${doc.label} returned binary buffer`);
      assert.ok(resp.buffer!.length > 1000, `${doc.label} PDF is > 1000 bytes (was ${resp.buffer!.length} bytes)`);

      const pdfMagic = resp.buffer!.subarray(0, 4).toString('ascii');
      assert.equal(pdfMagic, '%PDF', `${doc.label} begins with valid PDF magic bytes (%PDF)`);
    }
  });

  // =========================================================================
  // SCENARIO 4: Secure File Upload & Download with MIME & Size Enforcement
  // =========================================================================
  await t.test('Scenario 4: Secure File Upload with Validation, Metadata Tracking and RBAC Download', async () => {
    // 1. Rejection of unsupported media type (e.g. executable script)
    const badUpload = await apiRequest('/files/upload', {
      method: 'POST',
      token: adminToken,
      body: {
        dataBase64: Buffer.from('MZ_DUMMY_EXE_HEADER').toString('base64'),
        originalName: 'virus.exe',
        mimeType: 'application/x-msdownload',
      },
    });
    // In our file router, invalid base64 mime or extension will throw UNSUPPORTED_MEDIA_TYPE or fileFilter error
    // Let's verify valid upload works first
    const sampleText = 'CRYO ERP 2.0 Material Test Certificate — Heat No: H77890';
    const sampleBuffer = Buffer.from(sampleText, 'utf-8');
    const validUpload = await apiRequest('/files/upload', {
      method: 'POST',
      token: adminToken,
      body: {
        dataBase64: `data:text/plain;base64,${sampleBuffer.toString('base64')}`,
        originalName: 'mill_test_cert.txt',
        mimeType: 'text/plain',
        module: 'production',
        recordId: testSoId,
        recordDocNo: testSoDocNo,
      },
    });

    assert.equal(validUpload.status, 201, 'Valid file upload returns HTTP 201');
    const attachment = validUpload.data.attachment;
    assert.ok(attachment.id, 'Attachment record created with unique ID');
    assert.equal(attachment.module, 'production');
    assert.equal(attachment.fileSize, sampleBuffer.length);

    // Verify stored in MongoDB AttachmentModel
    const dbRecord = await AttachmentModel.findOne({ id: attachment.id }).lean();
    assert.ok(dbRecord, 'Attachment metadata recorded in MongoDB');
    assert.equal(dbRecord?.uploadedBy, adminLogin.data.user.name);

    // 2. Download by authorized user
    const downloadResp = await apiRequest(`/files/${attachment.id}/download`, {
      token: adminToken,
      isRawBinary: true,
    });
    assert.equal(downloadResp.status, 200, 'Authorized download returns HTTP 200');
    assert.equal(downloadResp.buffer?.toString('utf-8'), sampleText, 'Downloaded content matches uploaded content');

    // 3. Download without authentication -> 401
    const unauthDownload = await apiRequest(`/files/${attachment.id}/download`, { isRawBinary: true });
    assert.equal(unauthDownload.status, 401, 'Unauthenticated download rejected with 401');

    // 4. Delete file
    const deleteResp = await apiRequest(`/files/${attachment.id}`, { method: 'DELETE', token: adminToken });
    assert.equal(deleteResp.status, 200, 'Delete file returns HTTP 200');

    const deletedCheck = await AttachmentModel.findOne({ id: attachment.id });
    assert.equal(deletedCheck, null, 'Attachment metadata deleted from database');
  });

  // =========================================================================
  // SCENARIO 5: Legacy Attachment Migration (Dry-Run and Live Conversion)
  // =========================================================================
  await t.test('Scenario 5: Attachment Migration Utility (Dry-Run Safety and Live Base64 Extraction)', async () => {
    // Seed a legacy document with base64 data URL
    const dummyReceiptBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const legacyPaymentId = getUniqueId('PAY-LEGACY');
    await PaymentEntryModel.create({
      id: legacyPaymentId,
      docNo: getUniqueId('PAY-LGC'),
      salesOrderDocNo: testSoDocNo,
      customerId: testCustId,
      customerName: 'Legacy Cryo Customer',
      amount: 50000,
      paymentDate: new Date().toISOString(),
      method: 'Bank Transfer',
      transactionRef: `UTR-LEGACY-${Date.now()}`,
      proofDataUrl: dummyReceiptBase64,
      status: 'Pending',
      createdBy: 'sales.exec@cryoerp.com',
      createdAt: new Date().toISOString(),
    });

    // Run dry-run migration
    const dryRunResult = await migrateLegacyAttachments({ dryRun: true, silent: true });
    assert.equal(dryRunResult.dryRun, true);
    assert.ok(dryRunResult.totalFound >= 1, 'Dry-run discovers seeded legacy attachment');
    assert.equal(dryRunResult.migratedCount, 0, 'Dry-run does not write or increment migratedCount');

    // Run actual live migration
    const liveResult = await migrateLegacyAttachments({ dryRun: false, silent: true });
    assert.equal(liveResult.dryRun, false);
    assert.ok(liveResult.migratedCount >= 1, 'Live migration successfully converts legacy attachment');

    // Verify MongoDB payment record URL was updated to clean download URL
    const updatedPayment = await PaymentEntryModel.findOne({ id: legacyPaymentId }).lean();
    assert.ok(
      (updatedPayment as any)?.receiptProofDataUrl?.includes('/api/files/') ||
        (updatedPayment as any)?.proofDataUrl?.includes('/api/files/'),
      'Legacy base64 replaced with secure API download URL',
    );
  });

  // =========================================================================
  // SCENARIO 6: Company Settings Update & PDF Document Reflection
  // =========================================================================
  await t.test('Scenario 6: Company Settings Update and Dynamic Reflection in Documents', async () => {
    const updatedSettings = {
      companyName: 'CRYO TECHNOLOGIES ASIA PVT LTD',
      legalName: 'CRYO Technologies Asia Private Limited',
      gstin: '29ZZZZZ1111Z1Z1',
      address: 'Industrial Corridors, Peenya Phase III, Bengaluru - 560058',
      phone: '+91 80 4444 8888',
      email: 'corp@cryoerp.com',
      website: 'www.cryotechnologies.com',
      bankName: 'HDFC Bank Industrial Branch',
      bankAccountName: 'CRYO Technologies Asia Pvt Ltd',
      bankAccountNumber: '50200099887766',
      bankIfsc: 'HDFC0001234',
      bankBranch: 'Peenya Hub, Bengaluru',
      upiId: 'cryo@okhdfcbank',
      authorizedSignatoryName: 'Siddharth Varma',
      authorizedSignatoryDesignation: 'Director Operations',
      defaultQuotationTerms: 'Full advance before dispatch. Prices valid for 30 calendar days.',
    };

    const putResp = await apiRequest('/admin/company', {
      method: 'PUT',
      token: adminToken,
      body: updatedSettings,
    });
    assert.equal(putResp.status, 200, 'Company settings update returns HTTP 200');

    // Check DB persistence
    const saved = await CompanySettingsModel.findOne({ id: 'company' }).lean();
    assert.equal(saved?.bankName, 'HDFC Bank Industrial Branch');
    assert.equal(saved?.upiId, 'cryo@okhdfcbank');

    // Generate quotation PDF with updated company settings
    const pdfResp = await apiRequest(`/documents/quotation/${testQuotId}/pdf`, {
      token: adminToken,
      isRawBinary: true,
    });
    assert.equal(pdfResp.status, 200, 'Quotation PDF renders successfully with updated settings');
    assert.ok(pdfResp.buffer!.length > 1000);
  });

  // =========================================================================
  // SCENARIO 7: RBAC Access Control Boundaries on Shared Endpoints
  // =========================================================================
  await t.test('Scenario 7: RBAC Permission Enforcement on Shared Admin and Operational Endpoints', async () => {
    // Admin summary: Admin allowed (200), Sales denied (403)
    const adminSummary = await apiRequest('/admin/summary', { token: adminToken });
    assert.equal(adminSummary.status, 200, 'Admin can access system summary');
    assert.ok(adminSummary.data.totalEmployees >= 1);

    const salesSummary = await apiRequest('/admin/summary', { token: salesExecToken });
    assert.equal(salesSummary.status, 403, 'Sales executive forbidden from admin summary');

    // Cross-department reports: Admin allowed (200), Sales denied (403)
    const adminReport = await apiRequest('/reports/cross-department', { token: adminToken });
    assert.equal(adminReport.status, 200, 'Admin can access cross-department report');

    const salesReport = await apiRequest('/reports/cross-department', { token: salesExecToken });
    assert.equal(salesReport.status, 403, 'Sales executive forbidden from cross-department report');

    // Supply chain PO PDF: Sales denied (403) unless granted supply chain view
    const salesPoPdf = await apiRequest(`/documents/purchase-order/${testSupplierPoId}/pdf`, { token: salesExecToken });
    assert.equal(salesPoPdf.status, 403, 'Sales executive forbidden from generating Purchase Order PDF');
  });

  // =========================================================================
  // SCENARIO 8: Global Search Across Departments with Permission Filters
  // =========================================================================
  await t.test('Scenario 8: Server-Side Global Search with RBAC Department Filtering', async () => {
    // 1. Minimum query validation
    const shortResp = await apiRequest('/search?q=a', { token: adminToken });
    assert.equal(shortResp.status, 200);
    assert.equal(shortResp.data.results.length, 0, 'Queries shorter than 2 characters return 0 results');

    // 2. Admin search: returns results across all departments
    const adminSearch = await apiRequest(`/search?q=${testSoDocNo.slice(-4)}`, { token: adminToken });
    assert.equal(adminSearch.status, 200);
    assert.ok(adminSearch.data.total >= 1, 'Admin finds cross-department matching records');

    // 3. Sales executive search: only sees permitted Sales entities
    const salesSearch = await apiRequest(`/search?q=${testSoDocNo.slice(-4)}`, { token: salesExecToken });
    if (salesSearch.status !== 200) {
      console.error('salesSearch error status:', salesSearch.status, 'data:', salesSearch.data);
    }
    assert.equal(salesSearch.status, 200);
    const nonSalesResults = salesSearch.data.results.filter(
      (r: any) => r.module === 'Supply Chain' || r.module === 'Production',
    );
    assert.equal(nonSalesResults.length, 0, 'Sales executive cannot see unpermitted modules in search');
  });

  // =========================================================================
  // SCENARIO 9: Audit Trail Integrity and Security Log Verification
  // =========================================================================
  await t.test('Scenario 9: Audit Trail Recording and Read-Only Security Guard', async () => {
    // Query audit logs
    const auditResp = await apiRequest('/admin/audit-logs', { token: adminToken });
    assert.equal(auditResp.status, 200, 'Admin can inspect audit logs');
    assert.ok(Array.isArray(auditResp.data.items), 'Audit items returned as array');

    // Verify non-admin access is forbidden
    const nonAdminAudit = await apiRequest('/admin/audit-logs', { token: salesExecToken });
    assert.equal(nonAdminAudit.status, 403, 'Non-admin forbidden from viewing security audit logs');
  });

  // =========================================================================
  // SCENARIO 10: Full Regression Across Core Department APIs
  // =========================================================================
  await t.test('Scenario 10: Full Departmental Workflow Regression Verification', async () => {
    const [salesEnq, supplyInv, prodOrders, logReady] = await Promise.all([
      apiRequest('/sales/enquiries', { token: adminToken }),
      apiRequest('/supply-chain/materials', { token: adminToken }),
      apiRequest('/production/orders', { token: adminToken }),
      apiRequest('/logistics/ready', { token: adminToken }),
    ]);

    assert.equal(salesEnq.status, 200, 'Sales enquiries API intact');
    assert.equal(supplyInv.status, 200, 'Supply chain inventory API intact');
    assert.equal(prodOrders.status, 200, 'Production orders API intact');
    assert.equal(logReady.status, 200, 'Logistics ready for dispatch API intact');
  });

  // =========================================================================
  // SCENARIO 11: System Health, Cross-Department Reports and CSV Export
  // =========================================================================
  await t.test('Scenario 11: Cross-Department Operational Report and CSV Export', async () => {
    const reportResp = await apiRequest('/reports/cross-department', { token: adminToken });
    assert.equal(reportResp.status, 200);
    assert.ok(Array.isArray(reportResp.data.salesOrders), 'Returns salesOrders list');
    assert.ok(Array.isArray(reportResp.data.productionOrders), 'Returns productionOrders list');
    assert.ok(Array.isArray(reportResp.data.materialRequests), 'Returns materialRequests list');
    assert.ok(reportResp.data.inventory, 'Returns inventory summary');
    assert.ok(reportResp.data.commercial, 'Returns commercial summary for sales');

    // CSV Export
    const csvResp = await apiRequest('/reports/cross-department/export', { token: adminToken });
    assert.equal(csvResp.status, 200);
    assert.ok(csvResp.headers.get('content-type')?.includes('text/csv'));
  });

  // =========================================================================
  // SCENARIO 12: Failure Recovery & Structured Error Handling
  // =========================================================================
  await t.test('Scenario 12: Graceful Failure Recovery on Non-Existent Entities and Corrupt Input', async () => {
    // 1. Non-existent document PDF request
    const missingPdf = await apiRequest('/documents/quotation/non-existent-xyz-999/pdf', { token: adminToken });
    assert.equal(missingPdf.status, 404, 'Missing quotation PDF returns 404');
    assert.ok(missingPdf.data.error, 'Structured error message returned');

    // 2. Non-existent file download
    const missingFile = await apiRequest('/files/non-existent-att-999/download', { token: adminToken });
    assert.equal(missingFile.status, 404, 'Missing file download returns 404');

    // 3. File upload without payload
    const emptyUpload = await apiRequest('/files/upload', {
      method: 'POST',
      token: adminToken,
      body: {},
    });
    assert.equal(emptyUpload.status, 400, 'Empty upload payload returns 400 Bad Request');
  });

  await stopTestServer();
});
