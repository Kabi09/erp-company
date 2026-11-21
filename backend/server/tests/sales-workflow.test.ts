process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  CustomerModel,
  CustomerPOModel,
  EnquiryModel,
  FollowUpModel,
  NotificationModel,
  PaymentEntryModel,
  ProductModel,
  ProformaInvoiceModel,
  QuotationModel,
  SalesOrderModel,
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

test('CRYO ERP 2.0 Phase 5 — Sales Management Complete Workflow & Integrity Test Suite', async (t) => {
  await startTestServer();

  let adminToken = '';
  let salesMgrToken = '';
  let salesExecToken = '';
  let scMgrToken = '';

  // Auth setup
  const [adminLogin, mgrLogin, execLogin, scLogin] = await Promise.all([
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'admin@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sales.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sc.mgr@cryoerp.com', password: 'cryo123' } }),
  ]);

  adminToken = adminLogin.data.token;
  salesMgrToken = mgrLogin.data.token;
  salesExecToken = execLogin.data.token;
  scMgrToken = scLogin.data.token;

  assert.ok(adminToken, 'Admin token acquired');
  assert.ok(salesMgrToken, 'Sales Manager token acquired');
  assert.ok(salesExecToken, 'Sales Executive token acquired');
  assert.ok(scMgrToken, 'Supply Chain Manager token acquired');

  // Find or create active product for tests
  let product = await ProductModel.findOne({ status: 'Active' });
  if (!product) {
    product = await ProductModel.create({
      id: `prod-test-${Date.now()}`,
      code: `CRYO-TEST-${Date.now()}`,
      name: 'Cryo Ultra Freezer Test Model',
      category: 'Cryo Freezers',
      model: 'ULT-600',
      sellingPrice: 150000,
      unit: 'Nos',
      status: 'Active',
      specifications: '-86°C Cascaded Refrigeration',
      highlights: ['Precision temperature control', 'VIP insulation panels'],
      stages: ['Fabrication', 'Assembly', 'Testing'],
      bomTemplate: [],
    });
  }

  // --------------------------------------------------------------------------
  // Scenario 1: End-to-End Happy Path Workflow
  // --------------------------------------------------------------------------
  await t.test('Scenario 1: Complete Quote-to-Order Sales Lifecycle', async () => {
    // 1.1 Create Customer
    const custRes = await apiRequest('/sales/customers', {
      method: 'POST',
      token: salesExecToken,
      body: {
        name: `Alpha Cryogenics Ltd ${Date.now()}`,
        contactPerson: 'Dr. Ramesh Kumar',
        phone: '+91 98765 43210',
        email: 'ramesh@alphacryo.in',
        billingAddress: '45 Industrial Park, Whitefield, Bengaluru',
        shippingAddress: '45 Industrial Park, Whitefield, Bengaluru',
        gstin: `29ABCDE${Date.now().toString().slice(-4)}F1Z5`,
      },
    });
    assert.equal(custRes.status, 201, 'Customer created successfully');
    const customer = custRes.data;

    // 1.2 Create Enquiry
    const enqRes = await apiRequest('/sales/enquiries', {
      method: 'POST',
      token: salesExecToken,
      body: {
        customerId: customer.id,
        source: 'Direct',
        expectedDeliveryDate: '2026-12-15',
        notes: 'Requirement for cryogenic biomedical storage',
        items: [
          {
            productId: product!.id,
            productName: product!.name,
            model: product!.model,
            quantity: 2,
            requiredSpecifications: '-86°C Ultra Low Temp with LN2 backup',
            customerRequirements: 'Must include calibration certificate',
          },
        ],
      },
    });
    assert.equal(enqRes.status, 201, 'Enquiry created successfully');
    const enquiry = enqRes.data;
    assert.equal(enquiry.status, 'New');

    // 1.3 Follow-up 1 (Pending) -> Enquiry status becomes 'Contacted'
    const fu1Res = await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: {
        entityType: 'enquiry',
        entityId: enquiry.id,
        followUpDate: '2026-11-21',
        contactMethod: 'Call',
        discussion: 'Discussed technical requirements and lead time with Dr. Ramesh.',
        response: 'Pending',
        nextFollowUpDate: '2026-11-23',
      },
    });
    assert.equal(fu1Res.status, 201, 'Follow-up 1 recorded');
    const enqAfterFu1 = await EnquiryModel.findOne({ id: enquiry.id });
    assert.equal(enqAfterFu1?.status, 'Contacted', 'Enquiry transitions to Contacted');

    // 1.4 Follow-up 2 (Accepted) -> Enquiry status becomes 'Qualified'
    const fu2Res = await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: {
        entityType: 'enquiry',
        entityId: enquiry.id,
        followUpDate: '2026-11-23',
        contactMethod: 'Meeting',
        discussion: 'Customer approved technical specs and requested formal commercial quote.',
        response: 'Accepted',
      },
    });
    assert.equal(fu2Res.status, 201, 'Follow-up 2 recorded');
    const enqAfterFu2 = await EnquiryModel.findOne({ id: enquiry.id });
    assert.equal(enqAfterFu2?.status, 'Qualified', 'Enquiry transitions to Qualified');

    // 1.5 Create Quotation V1 from qualified enquiry
    const q1Res = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enquiry.id,
        quotationDate: '2026-11-24',
        validityDate: '2026-12-24',
        discountPercent: 5,
        taxPercent: 18,
        items: [
          {
            productId: product!.id,
            productName: product!.name,
            model: product!.model,
            quantity: 2,
            unitPrice: 150000,
            specifications: '-86°C Ultra Low Temp with LN2 backup',
            highlights: ['Precision temperature control', 'VIP insulation panels'],
          },
        ],
        paymentTerms: '50% Advance with PO, 50% prior to dispatch.',
      },
    });
    assert.equal(q1Res.status, 201, 'Quotation V1 created');
    const q1 = q1Res.data;
    assert.equal(q1.version, 1);
    assert.ok(q1.docNo.endsWith('-V1'));
    // Calculation: Subtotal = 300,000, Discount 5% = 15,000, Net = 285,000, Tax 18% = 51,300, Grand = 336,300
    assert.equal(q1.subtotal, 300000);
    assert.equal(q1.discountAmount, 15000);
    assert.equal(q1.taxAmount, 51300);
    assert.equal(q1.totalAmount, 336300);

    // 1.6 Quotation Follow-up (Negotiation) -> Quotation becomes 'Negotiation'
    const fu3Res = await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: {
        entityType: 'quotation',
        entityId: q1.id,
        followUpDate: '2026-11-25',
        contactMethod: 'Meeting',
        discussion: 'Customer requested 10% discount for institutional purchase order approval.',
        response: 'Negotiation',
      },
    });
    assert.equal(fu3Res.status, 201, 'Follow-up 3 recorded');
    const q1AfterFu3 = await QuotationModel.findOne({ id: q1.id });
    assert.equal(q1AfterFu3?.status, 'Negotiation', 'Quotation status updated to Negotiation');

    // 1.7 Revise Quotation to V2
    const q2Res = await apiRequest(`/sales/quotations/${q1.id}/revise`, {
      method: 'POST',
      token: salesExecToken,
      body: {
        discountPercent: 10,
        remarks: 'Institutional discount approved per management.',
      },
    });
    assert.equal(q2Res.status, 201, 'Quotation V2 created');
    const q2 = q2Res.data;
    assert.equal(q2.version, 2);
    assert.ok(q2.docNo.endsWith('-V2'));
    // V1 must now be Superseded
    const q1Check = await QuotationModel.findOne({ id: q1.id });
    assert.equal(q1Check?.status, 'Superseded', 'Prior quotation marked Superseded');

    // 1.8 Accept Quotation V2
    const acceptRes = await apiRequest(`/sales/quotations/${q2.id}/accept`, {
      method: 'POST',
      token: salesMgrToken,
    });
    assert.equal(acceptRes.status, 200, 'Quotation V2 accepted');
    assert.equal(acceptRes.data.status, 'Accepted');

    // 1.9 Generate Proforma Invoice from accepted V2
    const piRes = await apiRequest('/sales/proforma-invoices', {
      method: 'POST',
      token: salesExecToken,
      body: {
        quotationId: q2.id,
        remarks: 'Advance payment required for fabrication launch',
      },
    });
    assert.equal(piRes.status, 201, 'Proforma Invoice generated');
    const pi = piRes.data;
    assert.ok(pi.docNo.startsWith('PI-'));
    assert.equal(pi.status, 'Issued');
    assert.equal(pi.totalAmount, q2.totalAmount);

    // 1.10 Record Customer PO
    const cpoRes = await apiRequest('/sales/customer-pos', {
      method: 'POST',
      token: salesExecToken,
      body: {
        piId: pi.id,
        customerPoNumber: `PO-ALPHA-${Date.now()}`,
        receivedDate: '2026-11-26',
        expectedDeliveryDate: '2026-12-20',
        hasDiscrepancy: false,
      },
    });
    assert.equal(cpoRes.status, 201, 'Customer PO recorded');
    const cpo = cpoRes.data;
    assert.ok(cpo.docNo.startsWith('CPO-'));

    // 1.11 Record Payment (Advance Payment)
    const payRes = await apiRequest('/sales/payments', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        amount: Math.round(pi.totalAmount * 0.5),
        paymentDate: '2026-11-26',
        method: 'Bank Transfer',
        paymentType: 'Advance',
        transactionRef: `UTR-ALPHA-${Date.now()}`,
        autoVerify: true,
      },
    });
    assert.equal(payRes.status, 201, 'Payment recorded');
    const payment = payRes.data;
    assert.equal(payment.status, 'Verified', 'Payment is verified');

    // 1.12 Confirm Sales Order
    const soRes = await apiRequest('/sales/orders/confirm', {
      method: 'POST',
      token: salesExecToken,
      body: {
        piId: pi.id,
        priority: 'High',
        remarks: 'Urgent institutional deployment for biotechnology laboratory',
      },
    });
    assert.equal(soRes.status, 201, 'Sales Order confirmed');
    const so = soRes.data;
    assert.ok(so.docNo.startsWith('SO-'));
    assert.equal(so.commercialStatus, 'Confirmed');
    assert.equal(so.fulfillmentStatus, 'Awaiting Production');

    // 1.13 Verify linked document statuses and notification to Production
    const piAfterSO = await ProformaInvoiceModel.findOne({ id: pi.id });
    assert.equal(piAfterSO?.status, 'Converted', 'PI status updated to Converted');

    const paymentAfterSO = await PaymentEntryModel.findOne({ id: payment.id });
    assert.equal(paymentAfterSO?.salesOrderId, so.id, 'Payment linked to Sales Order');

    const notif = await NotificationModel.findOne({
      department: 'production',
      title: { $regex: so.docNo },
    });
    assert.ok(notif, 'Notification dispatched to Production department');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Rejected Enquiry Workflow
  // --------------------------------------------------------------------------
  await t.test('Scenario 2: Rejected Enquiry and Quotation Creation Gate', async () => {
    // 2.1 Create Enquiry
    const enqRes = await apiRequest('/sales/enquiries', {
      method: 'POST',
      token: salesExecToken,
      body: {
        isNewCustomer: true,
        newCustomer: {
          name: `Beta Research ${Date.now()}`,
          phone: '+91 99887 76655',
          email: 'purchase@betaresearch.org',
        },
        source: 'Website',
        items: [{ productId: product!.id, productName: product!.name, quantity: 1 }],
      },
    });
    assert.equal(enqRes.status, 201);
    const enquiry = enqRes.data;

    // 2.2 Reject Enquiry via follow-up
    const rejectFu = await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: {
        entityType: 'enquiry',
        entityId: enquiry.id,
        discussion: 'Customer cancelled project due to institutional funding freeze.',
        response: 'Rejected',
        rejectionReason: 'Institutional budget reallocation',
      },
    });
    assert.equal(rejectFu.status, 201);

    const enqCheck = await EnquiryModel.findOne({ id: enquiry.id });
    assert.equal(enqCheck?.status, 'Rejected');
    assert.equal(enqCheck?.rejectionReason, 'Institutional budget reallocation');

    // 2.3 Attempt to create quotation for rejected enquiry -> MUST fail
    const quoteAttempt = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enquiry.id,
        items: [{ productId: product!.id, productName: product!.name, quantity: 1, unitPrice: 100000 }],
      },
    });
    assert.equal(quoteAttempt.status >= 400, true, 'Quotation on rejected enquiry must be blocked');
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Rejected Quotation Workflow
  // --------------------------------------------------------------------------
  await t.test('Scenario 3: Rejected Quotation and PI Creation Gate', async () => {
    // 3.1 Create qualified enquiry
    const enqRes = await apiRequest('/sales/enquiries', {
      method: 'POST',
      token: salesExecToken,
      body: {
        isNewCustomer: true,
        newCustomer: {
          name: `Gamma Diagnostics ${Date.now()}`,
          phone: '+91 91234 56789',
          email: 'procurement@gammadiag.com',
        },
        source: 'Phone',
        items: [{ productId: product!.id, productName: product!.name, quantity: 1 }],
      },
    });
    const enquiry = enqRes.data;
    await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: {
        entityType: 'enquiry',
        entityId: enquiry.id,
        discussion: 'Specs confirmed by lab director.',
        response: 'Accepted',
      },
    });

    // 3.2 Create quotation
    const quoteRes = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enquiry.id,
        items: [{ productId: product!.id, productName: product!.name, quantity: 1, unitPrice: 200000 }],
      },
    });
    const quote = quoteRes.data;

    // 3.3 Reject quotation
    const rejectQuote = await apiRequest(`/sales/quotations/${quote.id}/reject`, {
      method: 'POST',
      token: salesExecToken,
      body: { reason: 'Selected foreign competitor offering bundled cryogenic accessories' },
    });
    assert.equal(rejectQuote.status, 200, 'Quotation rejected successfully');

    const quoteCheck = await QuotationModel.findOne({ id: quote.id });
    assert.equal(quoteCheck?.status, 'Rejected');

    // 3.4 Attempt to generate PI from rejected quotation -> MUST fail
    const piAttempt = await apiRequest('/sales/proforma-invoices', {
      method: 'POST',
      token: salesExecToken,
      body: { quotationId: quote.id },
    });
    assert.equal(piAttempt.status >= 400, true, 'PI on rejected quotation must be blocked');
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Multiple Revisions (V1 -> V2 -> V3) Immutable Chain
  // --------------------------------------------------------------------------
  await t.test('Scenario 4: Quotation Revision Chains and Immutability', async () => {
    // 4.1 Create qualified enquiry
    const enqRes = await apiRequest('/sales/enquiries', {
      method: 'POST',
      token: salesExecToken,
      body: {
        isNewCustomer: true,
        newCustomer: {
          name: `Delta Cryo Pharma ${Date.now()}`,
          phone: '+91 98760 12345',
          email: 'orders@deltacryo.in',
        },
        source: 'Direct',
        items: [{ productId: product!.id, productName: product!.name, quantity: 3 }],
      },
    });
    const enquiry = enqRes.data;
    await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: {
        entityType: 'enquiry',
        entityId: enquiry.id,
        discussion: 'Technical compliance validated.',
        response: 'Accepted',
      },
    });

    // 4.2 Create Quotation V1
    const q1Res = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enquiry.id,
        discountPercent: 0,
        items: [{ productId: product!.id, productName: product!.name, quantity: 3, unitPrice: 150000 }],
      },
    });
    const q1 = q1Res.data;
    assert.equal(q1.version, 1);

    // 4.3 Revise V1 -> V2
    const q2Res = await apiRequest(`/sales/quotations/${q1.id}/revise`, {
      method: 'POST',
      token: salesExecToken,
      body: { discountPercent: 5 },
    });
    assert.equal(q2Res.status, 201);
    const q2 = q2Res.data;
    assert.equal(q2.version, 2);

    // 4.4 Revise V2 -> V3
    const q3Res = await apiRequest(`/sales/quotations/${q2.id}/revise`, {
      method: 'POST',
      token: salesExecToken,
      body: { discountPercent: 8 },
    });
    assert.equal(q3Res.status, 201);
    const q3 = q3Res.data;
    assert.equal(q3.version, 3);

    // 4.5 Verify V1 and V2 are both Superseded
    const q1Check = await QuotationModel.findOne({ id: q1.id });
    const q2Check = await QuotationModel.findOne({ id: q2.id });
    assert.equal(q1Check?.status, 'Superseded', 'V1 must be Superseded');
    assert.equal(q2Check?.status, 'Superseded', 'V2 must be Superseded');

    // 4.6 Attempt to accept Superseded V1 or V2 -> MUST fail
    const acceptV1 = await apiRequest(`/sales/quotations/${q1.id}/accept`, {
      method: 'POST',
      token: salesMgrToken,
    });
    assert.equal(acceptV1.status >= 400, true, 'Accepting Superseded V1 must be blocked');

    const acceptV2 = await apiRequest(`/sales/quotations/${q2.id}/accept`, {
      method: 'POST',
      token: salesMgrToken,
    });
    assert.equal(acceptV2.status >= 400, true, 'Accepting Superseded V2 must be blocked');

    // 4.7 Attempt to revise an already superseded quotation -> MUST fail
    const reviseV1Again = await apiRequest(`/sales/quotations/${q1.id}/revise`, {
      method: 'POST',
      token: salesExecToken,
      body: { discountPercent: 12 },
    });
    assert.equal(reviseV1Again.status >= 400, true, 'Revising Superseded V1 must be blocked');

    // 4.8 Accept active V3 -> Succeeds
    const acceptV3 = await apiRequest(`/sales/quotations/${q3.id}/accept`, {
      method: 'POST',
      token: salesMgrToken,
    });
    assert.equal(acceptV3.status, 200, 'Accepting V3 must succeed');
    assert.equal(acceptV3.data.status, 'Accepted');
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Partial Payments & Overpayment Protection
  // --------------------------------------------------------------------------
  await t.test('Scenario 5: Partial Payments and Overpayment Gate', async () => {
    // 5.1 Create quotation, accept it, generate PI
    const enqRes = await apiRequest('/sales/enquiries', {
      method: 'POST',
      token: salesExecToken,
      body: {
        isNewCustomer: true,
        newCustomer: {
          name: `Epsilon Biobank ${Date.now()}`,
          phone: '+91 97654 32109',
          email: 'lab@epsilonbio.in',
        },
        source: 'Website',
        items: [{ productId: product!.id, productName: product!.name, quantity: 1 }],
      },
    });
    const enquiry = enqRes.data;
    await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: { entityType: 'enquiry', entityId: enquiry.id, discussion: 'Qualified', response: 'Accepted' },
    });

    const quoteRes = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enquiry.id,
        discountPercent: 0,
        taxPercent: 0, // 0 tax for exact clean testing amounts
        items: [{ productId: product!.id, productName: product!.name, quantity: 1, unitPrice: 100000 }],
      },
    });
    const quote = quoteRes.data;
    await apiRequest(`/sales/quotations/${quote.id}/accept`, { method: 'POST', token: salesMgrToken });

    const piRes = await apiRequest('/sales/proforma-invoices', {
      method: 'POST',
      token: salesExecToken,
      body: { quotationId: quote.id },
    });
    const pi = piRes.data;
    assert.equal(pi.totalAmount, 100000);

    // 5.2 Record partial payment of 40,000
    const pay1 = await apiRequest('/sales/payments', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        amount: 40000,
        paymentDate: '2026-11-26',
        transactionRef: `REF-PARTIAL-1-${Date.now()}`,
        autoVerify: true,
      },
    });
    assert.equal(pay1.status, 201, 'Partial payment 1 of 40,000 accepted');

    // 5.3 Attempt overpayment: remaining is 60,000. Try recording 70,000 -> MUST fail
    const overpay = await apiRequest('/sales/payments', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        amount: 70000,
        paymentDate: '2026-11-26',
        transactionRef: `REF-OVERPAY-${Date.now()}`,
      },
    });
    assert.equal(overpay.status >= 400, true, 'Overpayment of 70,000 against 60,000 balance must be rejected');

    // 5.4 Record exact remaining payment of 60,000
    const pay2 = await apiRequest('/sales/payments', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        amount: 60000,
        paymentDate: '2026-11-26',
        transactionRef: `REF-PARTIAL-2-${Date.now()}`,
        autoVerify: true,
      },
    });
    assert.equal(pay2.status, 201, 'Exact remaining payment of 60,000 accepted');

    // 5.5 Attempt any further payment when balance is 0 -> MUST fail
    const extraPay = await apiRequest('/sales/payments', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        amount: 5000,
        paymentDate: '2026-11-26',
        transactionRef: `REF-EXTRA-${Date.now()}`,
      },
    });
    assert.equal(extraPay.status >= 400, true, 'Payment when outstanding balance is 0 must be rejected');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Workflow Gate Violations (Duplicate PI, Discrepancy Gate, Duplicate SO)
  // --------------------------------------------------------------------------
  await t.test('Scenario 6: Strict Workflow Integrity Gates', async () => {
    // 6.1 Setup Enquiry -> Quote -> Accepted
    const enqRes = await apiRequest('/sales/enquiries', {
      method: 'POST',
      token: salesExecToken,
      body: {
        isNewCustomer: true,
        newCustomer: {
          name: `Zeta Therapeutics ${Date.now()}`,
          phone: '+91 95432 10987',
          email: 'purchase@zetatx.com',
        },
        source: 'Email',
        items: [{ productId: product!.id, productName: product!.name, quantity: 1 }],
      },
    });
    const enquiry = enqRes.data;
    await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: { entityType: 'enquiry', entityId: enquiry.id, discussion: 'Qualified', response: 'Accepted' },
    });

    const quoteRes = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enquiry.id,
        items: [{ productId: product!.id, productName: product!.name, quantity: 1, unitPrice: 120000 }],
      },
    });
    const quote = quoteRes.data;
    await apiRequest(`/sales/quotations/${quote.id}/accept`, { method: 'POST', token: salesMgrToken });

    // 6.2 First PI creation succeeds
    const piRes = await apiRequest('/sales/proforma-invoices', {
      method: 'POST',
      token: salesExecToken,
      body: { quotationId: quote.id },
    });
    assert.equal(piRes.status, 201);
    const pi = piRes.data;

    // 6.3 Duplicate PI creation for the same quotation -> MUST be blocked
    const duplicatePI = await apiRequest('/sales/proforma-invoices', {
      method: 'POST',
      token: salesExecToken,
      body: { quotationId: quote.id },
    });
    assert.equal(duplicatePI.status >= 400, true, 'Duplicate PI for same quotation must be blocked');

    // 6.4 Record Customer PO with discrepancy
    const cpoRes = await apiRequest('/sales/customer-pos', {
      method: 'POST',
      token: salesExecToken,
      body: {
        piId: pi.id,
        customerPoNumber: `PO-DISCREPANT-${Date.now()}`,
        receivedDate: '2026-11-26',
        hasDiscrepancy: true,
        discrepancyNotes: 'Payment terms on PO stated 90 days credit instead of agreed 50% advance',
      },
    });
    assert.equal(cpoRes.status, 201);
    const cpo = cpoRes.data;

    // Record advance payment
    await apiRequest('/sales/payments', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        amount: 60000,
        paymentDate: '2026-11-26',
        transactionRef: `REF-GATE-${Date.now()}`,
        autoVerify: true,
      },
    });

    // 6.5 Attempt to confirm SO while PO has unresolved discrepancy -> MUST be blocked
    const confirmAttempt = await apiRequest('/sales/orders/confirm', {
      method: 'POST',
      token: salesExecToken,
      body: { piId: pi.id },
    });
    assert.equal(confirmAttempt.status >= 400, true, 'SO confirmation must be blocked when PO has unresolved discrepancy');

    // 6.6 Resolve discrepancy
    const resolveRes = await apiRequest(`/sales/customer-pos/${cpo.id}/resolve`, {
      method: 'POST',
      token: salesMgrToken,
      body: { resolutionNotes: 'Customer sent amendment letter aligning terms with 50% advance' },
    });
    assert.equal(resolveRes.status, 200, 'Discrepancy resolved');

    // 6.7 Now SO confirmation succeeds
    const confirmSuccess = await apiRequest('/sales/orders/confirm', {
      method: 'POST',
      token: salesExecToken,
      body: { piId: pi.id },
    });
    assert.equal(confirmSuccess.status, 201, 'Sales Order confirmed successfully');

    // 6.8 Duplicate SO confirmation for same PI -> MUST be blocked
    const duplicateSO = await apiRequest('/sales/orders/confirm', {
      method: 'POST',
      token: salesExecToken,
      body: { piId: pi.id },
    });
    assert.equal(duplicateSO.status >= 400, true, 'Duplicate SO confirmation for same PI must be blocked');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: RBAC & Permission Enforcement
  // --------------------------------------------------------------------------
  await t.test('Scenario 7: RBAC Role & Permission Boundary Enforcement', async () => {
    // 7.1 Create a pending payment
    const payment = await PaymentEntryModel.create({
      id: `pay-rbac-${Date.now()}`,
      docNo: `PAY-RBAC-${Date.now()}`,
      customerId: 'cust-demo-1',
      customerName: 'Demo Customer',
      amount: 25000,
      paymentDate: '2026-11-26',
      transactionRef: `UTR-RBAC-${Date.now()}`,
      status: 'Pending',
      createdBy: 'Sales Staff',
      createdAt: new Date().toISOString(),
    });

    // 7.2 Sales Executive (without 'sales:approve') attempts to verify payment -> MUST be 403 Forbidden
    const execVerify = await apiRequest(`/sales/payments/${payment.id}/verify`, {
      method: 'POST',
      token: salesExecToken,
      body: { status: 'Verified' },
    });
    assert.equal(execVerify.status, 403, 'Sales Executive cannot verify payments (requires sales:approve)');

    // 7.3 Sales Manager (with 'sales:approve') verifies payment -> MUST succeed (200 OK)
    const mgrVerify = await apiRequest(`/sales/payments/${payment.id}/verify`, {
      method: 'POST',
      token: salesMgrToken,
      body: { status: 'Verified' },
    });
    assert.equal(mgrVerify.status, 200, 'Sales Manager successfully verifies payment');

    // 7.4 Supply Chain Manager (without 'sales:create') attempts to create customer enquiry -> MUST be 403 Forbidden
    const crossDeptAttempt = await apiRequest('/sales/enquiries', {
      method: 'POST',
      token: scMgrToken,
      body: {
        customerId: 'cust-demo-1',
        items: [{ productId: product!.id, productName: product!.name, quantity: 1 }],
      },
    });
    assert.equal(crossDeptAttempt.status, 403, 'Cross-department user without sales permission cannot create enquiries');
  });

  await stopTestServer();
});
