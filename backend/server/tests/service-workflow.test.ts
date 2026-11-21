process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  DeliveredProductModel,
  ServiceRequestModel,
  ServiceJobModel,
  ServiceWorkUpdateModel,
  ServiceMaterialRequestModel,
  ServiceExpenseModel,
  TechnicianAdvanceModel,
  ServiceBillingModel,
  MaterialRequestModel,
} from '../models';

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

test('CRYO ERP 2.0 — Service Management Complete Lifecycle & Settlement Integrity Suite', async (t) => {
  await startTestServer();

  let adminToken = '';
  let serviceTechToken = '';

  const [adminLogin, techLogin] = await Promise.all([
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'admin@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'service.tech@cryoerp.com', password: 'cryo123' } }),
  ]);

  adminToken = adminLogin.data.token;
  serviceTechToken = techLogin.data.token || adminToken;

  let testSerial = `SN-TEST-${Date.now()}`;
  let deliveredProductId = '';
  let serviceRequestId = '';
  let serviceJobId = '';
  let materialReqId = '';
  let advanceId = '';
  let expenseId = '';

  await t.test('1. Shared Delivered Products Register accessibility', async () => {
    // Register a delivered product
    const createRes = await apiRequest('/service/delivered-products', {
      method: 'POST',
      token: adminToken,
      body: {
        serialNumber: testSerial,
        productName: 'Cryogenic Liquid Nitrogen Storage Freezer 500L',
        customerId: 'cust-demo-1',
        customerName: 'Apex Biotech Laboratories',
        installedAddress: '42 Science Park, Bangalore',
        deliveryDate: new Date().toISOString().split('T')[0],
        warrantyExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
    });

    if (createRes.status !== 201) {
      console.log('DEBUG CREATE RES:', createRes.status, createRes.data);
    }
    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.serialNumber, testSerial);
    assert.equal(createRes.data.warrantyStatus, 'Under Warranty');
    deliveredProductId = createRes.data.id;

    // Both /service and /production endpoints return this product
    const srvList = await apiRequest('/service/delivered-products', { token: adminToken });
    const prodList = await apiRequest('/production/delivered-products', { token: adminToken });

    assert.equal(srvList.status, 200);
    assert.equal(prodList.status, 200);
    assert.ok(srvList.data.some((p: any) => p.serialNumber === testSerial));
    assert.ok(prodList.data.some((p: any) => p.serialNumber === testSerial));
  });

  await t.test('2. Service Request Initiation & Warranty Verification', async () => {
    const reqRes = await apiRequest('/service/requests', {
      method: 'POST',
      token: adminToken,
      body: {
        serialNumber: testSerial,
        customerName: 'Apex Biotech Laboratories',
        customerContact: 'Dr. Ramesh Kumar (+91 98450 11223)',
        serviceLocationType: 'Customer Site Service',
        siteAddress: '42 Science Park, Bangalore',
        issueDescription: 'Temperature sensor fluctuation on chamber display.',
        reportedFault: 'Temperature reading unstable between -145C and -160C',
        priority: 'High',
      },
    });

    assert.equal(reqRes.status, 201);
    assert.ok(reqRes.data.docNo.startsWith('SRV-'));
    assert.equal(reqRes.data.status, 'Open');
    serviceRequestId = reqRes.data.id;

    // Warranty Check
    const checkRes = await apiRequest(`/service/requests/${serviceRequestId}/warranty-check`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        warrantyStatus: 'Under Warranty',
        warrantyRemarks: 'Verified against factory serial records. Within 12-month standard warranty.',
      },
    });

    assert.equal(checkRes.status, 200);
    assert.equal(checkRes.data.warrantyStatus, 'Under Warranty');
  });

  await t.test('3. Assign Technician & Dispatch to Service Job', async () => {
    const assignRes = await apiRequest(`/service/requests/${serviceRequestId}/assign`, {
      method: 'POST',
      token: adminToken,
      body: {
        technicianId: 'emp-service-tech-1',
        technicianName: 'Suresh Kumar',
        scheduledDate: new Date().toISOString().split('T')[0],
        estimatedDurationHours: 4,
        dispatchNotes: 'Inspect RTD PT100 temperature sensor probe and calibrate PID controller.',
      },
    });

    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.data.serviceRequest.status, 'Assigned');
    assert.ok(assignRes.data.serviceJob);
    assert.ok(assignRes.data.serviceJob.docNo.startsWith('JOB-'));
    assert.equal(assignRes.data.serviceJob.status, 'Scheduled');
    serviceJobId = assignRes.data.serviceJob.id;
  });

  await t.test('4. Technician Check-In on Site', async () => {
    const checkInRes = await apiRequest(`/service/jobs/${serviceJobId}/check-in`, {
      method: 'POST',
      token: adminToken,
      body: {
        location: 'Apex Biotech Lab 3, Ground Floor',
      },
    });

    assert.equal(checkInRes.status, 200);
    assert.equal(checkInRes.data.status, 'In Progress');
    assert.ok(checkInRes.data.checkInTime);
  });

  await t.test('5. Service Work Updates & Dynamic Inspection Checklist', async () => {
    const updateRes = await apiRequest(`/service/jobs/${serviceJobId}/work-updates`, {
      method: 'POST',
      token: adminToken,
      body: {
        stage: 'Diagnosis & Sensor Replacement',
        hoursSpent: 2.5,
        highlights: [
          'Opened sensor housing and inspected thermocouple probe lead wires',
          'Found loose terminal connection on thermocouple channel 2',
          'Replaced sensor probe with backup spare',
        ],
        checklist: [
          { item: 'Supply Voltage (230V ± 10V)', result: 'Pass', notes: 'Measured 228V AC' },
          { item: 'Vacuum Insulation Integrity', result: 'Pass', notes: 'Pressure < 0.01 mbar' },
          { item: 'PT100 Temperature Probe Resistance', result: 'Pass', notes: '109.8 ohms at room temp' },
          { item: 'Chamber Target Stability (-150°C)', result: 'Pass', notes: 'Holding steady' },
        ],
        workSummary: 'Defective sensor lead repaired and recalibrated with secondary reference probe.',
      },
    });

    assert.equal(updateRes.status, 201);
    assert.equal(updateRes.data.checklist.length, 4);
    assert.equal(updateRes.data.checklist[0].result, 'Pass');
  });

  await t.test('6. Spare Parts Requisition & SCM Integration', async () => {
    const indentRes = await apiRequest(`/service/jobs/${serviceJobId}/material-requests`, {
      method: 'POST',
      token: adminToken,
      body: {
        items: [
          {
            materialName: 'PT100 Cryogenic Temp Probe 3-Wire',
            partNumber: 'SEN-PT100-CRYO',
            quantityRequested: 1,
            unit: 'Nos',
            estimatedCost: 3500,
          },
        ],
        notes: 'Required for replacement on Apex Biotech warranty service job.',
      },
    });

    assert.equal(indentRes.status, 201);
    assert.ok(indentRes.data.docNo.startsWith('SMR-'));
    assert.equal(indentRes.data.status, 'Requested');
    materialReqId = indentRes.data.id;

    // Verify corresponding SCM MaterialRequest was spawned
    const scmMR = await MaterialRequestModel.findOne({ id: indentRes.data.linkedMaterialRequestId });
    assert.ok(scmMR);
    assert.equal(scmMR.department, 'service');

    // Simulate SCM issuance and Technician Physical Receipt
    await ServiceMaterialRequestModel.updateOne({ id: materialReqId }, { $set: { 'items.0.quantityIssued': 1, status: 'Issued' } });

    const receiveRes = await apiRequest(`/service/material-requests/${materialReqId}/receive`, {
      method: 'PATCH',
      token: adminToken,
    });

    assert.equal(receiveRes.status, 200);
    assert.equal(receiveRes.data.status, 'Received');

    // Reconcile spare usage
    const reconcileRes = await apiRequest(`/service/material-requests/${materialReqId}/reconcile`, {
      method: 'POST',
      token: adminToken,
      body: {
        items: [
          {
            materialName: 'PT100 Cryogenic Temp Probe 3-Wire',
            quantityConsumed: 1,
            quantityReturned: 0,
          },
        ],
      },
    });

    assert.equal(reconcileRes.status, 200);
    assert.equal(reconcileRes.data.status, 'Reconciled');
  });

  await t.test('7. Technician Advances, Expense Claims & Settlement Math', async () => {
    // 1. Disburse advance of 5000
    const advRes = await apiRequest('/service/advances', {
      method: 'POST',
      token: adminToken,
      body: {
        technicianId: 'emp-service-tech-1',
        technicianName: 'Suresh Kumar',
        serviceJobId,
        amount: 5000,
        advanceDate: new Date().toISOString().split('T')[0],
        paymentMode: 'Bank Transfer',
        purpose: 'Site visit fuel and accommodation',
      },
    });

    assert.equal(advRes.status, 201);
    assert.equal(advRes.data.amount, 5000);
    advanceId = advRes.data.id;

    // 2. Technician logs expense of 3500 paid out of pocket
    const expRes = await apiRequest('/service/expenses', {
      method: 'POST',
      token: adminToken,
      body: {
        technicianId: 'emp-service-tech-1',
        technicianName: 'Suresh Kumar',
        serviceJobId,
        category: 'Travel',
        description: 'Outstation fuel and toll receipts',
        amount: 3500,
        paidBy: 'Technician',
      },
    });

    assert.equal(expRes.status, 201);
    assert.equal(expRes.data.status, 'Pending');
    expenseId = expRes.data.id;

    // 3. Manager verifies expense
    const verifyRes = await apiRequest(`/service/expenses/${expenseId}/verify`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        status: 'Verified',
      },
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.status, 'Verified');

    // 4. Calculate Settlement Summary
    const summaryRes = await apiRequest<any>(`/service/expenses/settlement-summary/emp-service-tech-1`, {
      token: adminToken,
    });

    assert.equal(summaryRes.status, 200);
    const summary = summaryRes.data;
    assert.equal(summary.technicianId, 'emp-service-tech-1');
    assert.ok(summary.advancePaid >= 5000);
    assert.ok(summary.employeePaid >= 3500);

    // Settle expenses
    const settleRes = await apiRequest('/service/expenses/settle', {
      method: 'POST',
      token: adminToken,
      body: {
        technicianId: 'emp-service-tech-1',
        settlementNotes: 'Reconciled against bank advance receipt',
      },
    });

    assert.equal(settleRes.status, 200);
    assert.equal(settleRes.data.ok, true);
  });

  await t.test('8. Technician Check-Out, Customer Billing & Job Completion', async () => {
    // Check out
    const checkOutRes = await apiRequest(`/service/jobs/${serviceJobId}/check-out`, {
      method: 'POST',
      token: adminToken,
      body: {
        resolutionSummary: 'Calibrated temperature controller and replaced thermocouple probe.',
        customerSignatoryName: 'Dr. Ramesh Kumar',
        customerSignatoryDesignation: 'Director of Labs',
        customerFeedbackRating: 5,
        customerFeedbackComments: 'Superb and rapid diagnosis. Unit functioning perfectly.',
      },
    });

    assert.equal(checkOutRes.status, 200);
    assert.equal(checkOutRes.data.status, 'Work Completed');

    // Create billing
    const billingRes = await apiRequest(`/service/jobs/${serviceJobId}/billing`, {
      method: 'POST',
      token: adminToken,
      body: {
        items: [
          { description: 'Warranty Sensor Replacement', itemType: 'Spare', quantity: 1, unitRate: 0, amount: 0, warrantyCovered: true },
          { description: 'On-site Diagnostic & Calibration Labor', itemType: 'Labor', quantity: 1, unitRate: 0, amount: 0, warrantyCovered: true },
        ],
        taxPercent: 18,
        notes: '100% Covered under standard equipment warranty.',
      },
    });

    assert.equal(billingRes.status, 201);
    assert.ok(billingRes.data.docNo.startsWith('SBL-'));
    assert.equal(billingRes.data.grandTotal, 0);

    // Complete Job
    const completeRes = await apiRequest(`/service/jobs/${serviceJobId}/complete`, {
      method: 'POST',
      token: adminToken,
    });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.data.ok, true);

    // Verify Service Request is Completed
    const srvCheck = await ServiceRequestModel.findOne({ id: serviceRequestId });
    assert.equal(srvCheck?.status, 'Completed');
  });

  await t.test('9. Binary PDF Service Report Generation', async () => {
    const pdfRes = await fetch(`${baseUrl}/documents/service-report/${serviceJobId}/pdf`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(pdfRes.status, 200);
    const contentType = pdfRes.headers.get('content-type');
    assert.ok(contentType?.includes('application/pdf'));

    const arrayBuffer = await pdfRes.arrayBuffer();
    assert.ok(arrayBuffer.byteLength > 500);
  });

  await stopTestServer();
});
