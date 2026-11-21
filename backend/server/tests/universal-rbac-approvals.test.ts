process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  ApprovalRequestModel,
  ApprovalWorkflowModel,
  CustomerModel,
  EmployeeModel,
  EnquiryModel,
  ProductModel,
  QuotationModel,
  RoleModel,
  SupplierModel,
  SupplierPOModel,
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

test('CRYO ERP 2.0 — Universal Role Permissions, Employee Overrides & Approval Workflows', async (t) => {
  await startTestServer();

  let adminToken = '';
  let salesManagerToken = '';
  let salesExecToken = '';
  let scmManagerToken = '';

  let adminUser: any = null;
  let salesManagerUser: any = null;
  let salesExecUser: any = null;

  await t.test('Bootstrap & Authentication Setup', async () => {
    // 1. Super Admin login
    const adminLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'admin@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(adminLogin.status, 200);
    adminToken = adminLogin.data.token;
    adminUser = adminLogin.data.user;

    // 2. Sales Manager login
    const smLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'sales.mgr@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(smLogin.status, 200);
    salesManagerToken = smLogin.data.token;
    salesManagerUser = smLogin.data.user;

    // 3. Sales Exec login
    const seLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(seLogin.status, 200);
    salesExecToken = seLogin.data.token;
    salesExecUser = seLogin.data.user;

    // 4. SCM Manager login
    const scmLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'sc.mgr@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(scmLogin.status, 200);
    scmManagerToken = scmLogin.data.token;
  });

  // ==========================================
  // PART 1: DYNAMIC ROLE-BASED PERMISSIONS
  // ==========================================

  await t.test('1. Dynamic Role Creation, Permission Matrix & Deletion Safeguards', async () => {
    await RoleModel.deleteMany({ name: /^Test Commercial Auditor/ });
    // 1.1 Create custom role
    const createRoleRes = await apiRequest('/admin/roles', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Test Commercial Auditor',
        department: 'sales',
        description: 'Audits sales quotations and commercial deals',
        permissions: {
          sales: ['view'],
          quotations: ['view', 'export'],
        },
      },
    });
    assert.equal(createRoleRes.status, 201);
    assert.equal(createRoleRes.data.name, 'Test Commercial Auditor');
    const createdRoleId = createRoleRes.data.id;

    // 1.2 Update role permissions (add 'verify')
    const updateRoleRes = await apiRequest(`/admin/roles/${createdRoleId}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        description: 'Audits and verifies sales quotations',
        permissions: {
          sales: ['view'],
          quotations: ['view', 'verify', 'export'],
        },
      },
    });
    assert.equal(updateRoleRes.status, 200);
    assert.deepEqual(updateRoleRes.data.permissions.quotations, ['view', 'verify', 'export']);

    // 1.3 Safeguard: Core role deletion blocked
    const delCoreRole = await apiRequest('/admin/roles/role-super-admin', {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delCoreRole.status, 403);
    assert.match(delCoreRole.data.error, /Built-in core system roles cannot be deleted/);

    // 1.4 Delete custom role successfully
    const delCustomRole = await apiRequest(`/admin/roles/${createdRoleId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delCustomRole.status, 200);
    assert.equal(delCustomRole.data.ok, true);
  });

  // ==========================================
  // PART 2: EMPLOYEE PERMISSION OVERRIDES
  // ==========================================

  await t.test('2. Employee-Specific Permission Overrides & Resolution Hierarchy', async () => {
    // 2.1 Query Sales Exec permissions (inherits from role-sales-exec)
    const empPerms = await apiRequest(`/admin/employees/${salesExecUser.id}/permissions`, {
      token: adminToken,
    });
    assert.equal(empPerms.status, 200);
    assert.equal(empPerms.data.employeeId, salesExecUser.id);
    assert.equal(empPerms.data.role.id, 'role-sales-exec');

    // By default, role-sales-exec has view, create, edit for sales/quotations, but NOT 'approve'
    const initialQuotPerms = empPerms.data.effectivePermissions.quotations || [];
    assert.equal(initialQuotPerms.includes('approve'), false);

    // 2.2 Grant custom 'allow' override for quotations.approve
    const applyAllowOverride = await apiRequest(`/admin/employees/${salesExecUser.id}/permissions`, {
      method: 'PUT',
      token: adminToken,
      body: {
        overrides: {
          quotations: {
            approve: 'allow',
          },
        },
      },
    });
    assert.equal(applyAllowOverride.status, 200);
    assert.equal(applyAllowOverride.data.overrides.quotations.approve, 'allow');
    assert.equal(applyAllowOverride.data.effectivePermissions.quotations.includes('approve'), true);

    // 2.3 Verify session resolution reflects the new override
    // Sales Exec calls /auth/me
    const meRes = await apiRequest('/auth/me', { token: salesExecToken });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.user.permissions.quotations.includes('approve'), true);

    // 2.4 Apply 'deny' override for quotations.delete
    const applyDenyOverride = await apiRequest(`/admin/employees/${salesExecUser.id}/permissions`, {
      method: 'PUT',
      token: adminToken,
      body: {
        overrides: {
          quotations: {
            approve: 'allow',
            delete: 'deny',
          },
        },
      },
    });
    assert.equal(applyDenyOverride.status, 200);
    assert.equal(applyDenyOverride.data.effectivePermissions.quotations.includes('delete'), false);

    // 2.5 Reset employee overrides back to role defaults
    const resetRes = await apiRequest(`/admin/employees/${salesExecUser.id}/permissions/reset`, {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(resetRes.status, 200);
    assert.deepEqual(resetRes.data.overrides, {});
    // approve is no longer in effective permissions
    assert.equal(resetRes.data.effectivePermissions.quotations.includes('approve'), false);

    // 2.6 Safeguard: Non-super-admin user cannot edit their own overrides
    const selfEscalation = await apiRequest(`/admin/employees/${salesExecUser.id}/permissions`, {
      method: 'PUT',
      token: salesExecToken,
      body: {
        overrides: { admin: { manage: 'allow' } },
      },
    });
    assert.equal(selfEscalation.status, 403);
    assert.match(selfEscalation.data.error, /Access denied|FORBIDDEN/);
  });

  // ==========================================
  // PART 3: CONFIGURABLE APPROVAL WORKFLOW ENGINE
  // ==========================================

  await t.test('3. Configurable Multi-Level Approval Workflows & Execution Gates', async () => {
    // 3.1 Configure a strict 2-level Quotation Approval Policy
    // Level 1: Sales Manager Review (role-sales-manager)
    // Level 2: Director Sign-off (role-super-admin)
    // allowSelfApproval: false
    const existingWf = await ApprovalWorkflowModel.findOne({ module: 'quotations', triggerAction: 'submit' });
    let wfId = existingWf?.id || 'wf-test-quote';

    if (existingWf) {
      await apiRequest(`/admin/approval-workflows/${existingWf.id}`, {
        method: 'PUT',
        token: adminToken,
        body: {
          name: 'Quotation Commercial Multi-Level Approval',
          department: 'sales',
          module: 'quotations',
          triggerAction: 'submit',
          enabled: true,
          allowSelfApproval: false,
          approvalLevels: [
            {
              levelNumber: 1,
              levelName: 'Level 1: Sales Manager Review',
              approverType: 'role',
              eligibleRoleIds: ['role-sales-manager'],
              eligibleEmployeeIds: [],
              requiredApprovalCount: 1,
            },
            {
              levelNumber: 2,
              levelName: 'Level 2: Director Sign-off',
              approverType: 'role',
              eligibleRoleIds: ['role-super-admin'],
              eligibleEmployeeIds: [],
              requiredApprovalCount: 1,
            },
          ],
        },
      });
    }

    // 3.2 Create Customer, Qualified Enquiry, and Draft Quotation
    const customer = await CustomerModel.findOne({}).lean();
    assert.ok(customer, 'Customer must exist');

    const enq = await EnquiryModel.create({
      id: `enq-test-${Date.now()}`,
      docNo: `ENQ-TEST-${Date.now()}`,
      customerId: customer.id,
      customerSnapshot: {
        name: customer.name,
        contactPerson: customer.contactPerson,
        phone: customer.phone,
        email: customer.email,
        gstin: customer.gstin,
      },
      source: 'Direct',
      items: [
        {
          id: `item-${Date.now()}`,
          productId: 'prod-test',
          productName: 'Cryo Storage Tank 500L',
          model: 'CST-500',
          quantity: 2,
          requiredSpecifications: 'Vacuum insulated, SS304',
          customerRequirements: 'Delivery in 4 weeks',
        },
      ],
      expectedDeliveryDate: '2026-12-15',
      notes: 'Test enquiry for approval testing',
      status: 'Qualified',
      assignedTo: salesExecUser.name,
      createdBy: salesExecUser.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let product = await ProductModel.findOne({ status: 'Active' });
    if (!product) {
      product = await ProductModel.create({
        id: `prod-test-${Date.now()}`,
        code: `CRYO-TEST-${Date.now()}`,
        name: 'Cryo Storage Tank 500L',
        category: 'Storage',
        model: 'CST-500',
        sellingPrice: 250000,
        status: 'Active',
      });
    }

    const createQtRes = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enq.id,
        items: [
          {
            productId: product.id,
            productName: 'Cryo Storage Tank 500L',
            model: 'CST-500',
            specifications: 'SS304 vacuum insulated',
            quantity: 2,
            unitPrice: 250000,
          },
        ],
        discountPercent: 5,
        taxPercent: 18,
      },
    });
    assert.equal(createQtRes.status, 201);
    const qt = createQtRes.data;
    assert.equal(qt.status, 'Draft');

    // 3.3 Submit Quotation for Approval
    const submitRes = await apiRequest(`/sales/quotations/${qt.id}/submit-approval`, {
      method: 'POST',
      token: salesExecToken,
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.data.approvalRequired, true);
    assert.equal(submitRes.data.quotation.status, 'Pending Approval');

    const approvalReqId = submitRes.data.approvalRequest.id;
    assert.ok(approvalReqId);

    // 3.4 GATE CHECK: Quotation CANNOT be sent while Pending Approval
    const sendBlocked = await apiRequest(`/sales/quotations/${qt.id}/sent`, {
      method: 'POST',
      token: salesExecToken,
    });
    assert.equal(sendBlocked.status, 400);
    assert.match(sendBlocked.data.error, /pending approval/i);

    // 3.5 GATE CHECK: Quotation CANNOT be accepted while Pending Approval
    const acceptBlocked = await apiRequest(`/sales/quotations/${qt.id}/accept`, {
      method: 'POST',
      token: salesExecToken,
    });
    assert.equal(acceptBlocked.status, 400);
    assert.match(acceptBlocked.data.error, /pending approval/i);

    // 3.6 GATE CHECK: Submitter cannot approve their own quotation (Self-Approval Block)
    const selfApproveBlocked = await apiRequest(`/approvals/requests/${approvalReqId}/decide`, {
      method: 'POST',
      token: salesExecToken, // submitter
      body: {
        decision: 'approved',
        remarks: 'Approving my own quote',
      },
    });
    assert.equal(selfApproveBlocked.status, 403);
    assert.match(selfApproveBlocked.data.error, /Self-approval is disabled/i);

    // 3.7 Level 1 Approval: Sales Manager approves Level 1
    const lvl1Approve = await apiRequest(`/approvals/requests/${approvalReqId}/decide`, {
      method: 'POST',
      token: salesManagerToken,
      body: {
        decision: 'approved',
        remarks: 'Pricing and terms verified. Forwarding to Director.',
      },
    });
    assert.equal(lvl1Approve.status, 200);
    assert.equal(lvl1Approve.data.request.status, 'pending'); // Still pending level 2!
    assert.equal(lvl1Approve.data.request.currentLevel, 2);

    // 3.8 SCM Manager (unauthorized role) tries to approve Level 2 -> Blocked (403)
    const unauthorizedLvl2 = await apiRequest(`/approvals/requests/${approvalReqId}/decide`, {
      method: 'POST',
      token: scmManagerToken,
      body: {
        decision: 'approved',
        remarks: 'Trying to approve',
      },
    });
    assert.equal(unauthorizedLvl2.status, 403);
    assert.match(unauthorizedLvl2.data.error, /not authorized/i);

    // 3.9 Level 2 Final Approval: Super Admin approves
    const lvl2Approve = await apiRequest(`/approvals/requests/${approvalReqId}/decide`, {
      method: 'POST',
      token: adminToken,
      body: {
        decision: 'approved',
        remarks: 'Executive authorization granted.',
      },
    });
    assert.equal(lvl2Approve.status, 200);
    assert.equal(lvl2Approve.data.request.status, 'approved');

    // 3.10 Verify target Quotation is now 'Approved'
    const approvedQt = await QuotationModel.findOne({ id: qt.id });
    assert.equal(approvedQt?.status, 'Approved');

    // 3.11 Execution unlocked: Quotation can now be marked Sent and Accepted!
    const markSentRes = await apiRequest(`/sales/quotations/${qt.id}/sent`, {
      method: 'POST',
      token: salesExecToken,
    });
    assert.equal(markSentRes.status, 200);
    assert.equal(markSentRes.data.status, 'Sent');

    const acceptRes = await apiRequest(`/sales/quotations/${qt.id}/accept`, {
      method: 'POST',
      token: salesExecToken,
    });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.data.status, 'Accepted');
  });

  // ==========================================
  // PART 4: CHANGES REQUESTED, REJECTION & WITHDRAWAL
  // ==========================================

  await t.test('4. Changes Requested, Rejection & Withdrawal Lifecycles', async () => {
    const customer = await CustomerModel.findOne({}).lean();
    assert.ok(customer);

    // 4.1 Changes Requested Flow
    const enq2 = await EnquiryModel.create({
      id: `enq-test2-${Date.now()}`,
      docNo: `ENQ-TEST2-${Date.now()}`,
      customerId: customer.id,
      customerSnapshot: { name: customer.name, contactPerson: customer.contactPerson, phone: customer.phone, email: customer.email, gstin: customer.gstin },
      source: 'Direct',
      items: [{ id: 'i1', productId: 'p1', productName: 'Tank', model: 'T-100', quantity: 1, requiredSpecifications: 'Specs', customerRequirements: 'Req' }],
      expectedDeliveryDate: '2026-12-30',
      notes: 'Test',
      status: 'Qualified',
      assignedTo: salesExecUser.name,
      createdBy: salesExecUser.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let product = await ProductModel.findOne({ status: 'Active' });
    if (!product) {
      product = await ProductModel.create({
        id: `prod-test-${Date.now()}`,
        code: `CRYO-TEST-${Date.now()}`,
        name: 'Cryo Storage Tank 500L',
        category: 'Storage',
        model: 'CST-500',
        sellingPrice: 250000,
        status: 'Active',
      });
    }

    const qt2Res = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enq2.id,
        items: [{ productId: product.id, productName: product.name, model: product.model, quantity: 1, unitPrice: 100000 }],
        discountPercent: 15, // high discount
      },
    });
    const qt2 = qt2Res.data;

    // Submit for approval
    const sub2 = await apiRequest(`/sales/quotations/${qt2.id}/submit-approval`, {
      method: 'POST',
      token: salesExecToken,
    });
    const req2Id = sub2.data.approvalRequest.id;

    // Sales manager requests changes (remarks mandatory)
    const missingRemarks = await apiRequest(`/approvals/requests/${req2Id}/decide`, {
      method: 'POST',
      token: salesManagerToken,
      body: { decision: 'changes_requested', remarks: '' },
    });
    assert.equal(missingRemarks.status, 400);

    const changesReq = await apiRequest(`/approvals/requests/${req2Id}/decide`, {
      method: 'POST',
      token: salesManagerToken,
      body: {
        decision: 'changes_requested',
        remarks: 'Discount of 15% is too high for CST standard range. Reduce to maximum 8%.',
      },
    });
    assert.equal(changesReq.status, 200);
    assert.equal(changesReq.data.request.status, 'changes_requested');

    const updatedQt2 = await QuotationModel.findOne({ id: qt2.id });
    assert.equal(updatedQt2?.status, 'Changes Requested');

    // 4.2 Withdrawal Flow: Submitter withdraws pending request
    const enq3 = await EnquiryModel.create({
      id: `enq-test3-${Date.now()}`,
      docNo: `ENQ-TEST3-${Date.now()}`,
      customerId: customer.id,
      customerSnapshot: { name: customer.name, contactPerson: customer.contactPerson, phone: customer.phone, email: customer.email, gstin: customer.gstin },
      source: 'Direct',
      items: [{ id: 'i1', productId: 'p1', productName: 'Tank', model: 'T-100', quantity: 1, requiredSpecifications: 'Specs', customerRequirements: 'Req' }],
      expectedDeliveryDate: '2026-12-30',
      notes: 'Test',
      status: 'Qualified',
      assignedTo: salesExecUser.name,
      createdBy: salesExecUser.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const qt3Res = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesExecToken,
      body: {
        enquiryId: enq3.id,
        items: [{ productId: product.id, productName: product.name, model: product.model, quantity: 1, unitPrice: 80000 }],
      },
    });
    const qt3 = qt3Res.data;

    const sub3 = await apiRequest(`/sales/quotations/${qt3.id}/submit-approval`, {
      method: 'POST',
      token: salesExecToken,
    });
    const req3Id = sub3.data.approvalRequest.id;

    // Submitter withdraws
    const withdrawRes = await apiRequest(`/approvals/requests/${req3Id}/withdraw`, {
      method: 'POST',
      token: salesExecToken,
    });
    assert.equal(withdrawRes.status, 200);
    assert.equal(withdrawRes.data.request.status, 'withdrawn');

    const withdrawnQt = await QuotationModel.findOne({ id: qt3.id });
    assert.equal(withdrawnQt?.status, 'Draft');
  });

  // ==========================================
  // PART 5: UNIVERSAL APPROVAL INBOX
  // ==========================================

  await t.test('5. Universal Approval Inbox Aggregation & Visibility', async () => {
    // 5.1 Sales Manager checks inbox
    const smInbox = await apiRequest('/approvals/inbox', { token: salesManagerToken });
    assert.equal(smInbox.status, 200);
    assert.ok(Array.isArray(smInbox.data.pending));
    assert.ok(Array.isArray(smInbox.data.mySubmissions));
    assert.ok(Array.isArray(smInbox.data.history));

    // 5.2 Super Admin checks inbox (has access to 'all')
    const adminInbox = await apiRequest('/approvals/inbox', { token: adminToken });
    assert.equal(adminInbox.status, 200);
    assert.ok(Array.isArray(adminInbox.data.all));
  });

  await stopTestServer();
});
