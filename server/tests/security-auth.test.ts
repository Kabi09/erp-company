process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import mongoose from 'mongoose';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase, withTransaction } from '../config/database';
import {
  ActivityLogModel,
  DocCounterModel,
  EmployeeModel,
  MaterialModel,
  MaterialRequestModel,
  SessionModel,
  StockTransactionModel,
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

test('CRYO ERP 2.0 Phase 4 - Authentication, RBAC, Security & Concurrency Verification', async (t) => {
  await startTestServer();

  let adminToken = '';
  let salesExecToken = '';
  let superAdminId = '';
  let salesExecId = '';

  await t.test('1. Authentication & Anti-Enumeration Security', async () => {
    // 1.1 Non-existent user login
    const nonExistent = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'ghost.user@unknown-domain.com', password: 'SomePassword123' },
    });
    assert.equal(nonExistent.status, 401);
    assert.equal(nonExistent.data.error, 'Invalid email/employee ID or password.');

    // 1.2 Existing user with wrong password
    const wrongPass = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'admin@cryoerp.com', password: 'TotallyWrongPassword' },
    });
    assert.equal(wrongPass.status, 401);
    // Anti-enumeration: exact same error message
    assert.equal(wrongPass.data.error, 'Invalid email/employee ID or password.');

    // 1.3 Successful Super Admin login
    const loginRes = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'admin@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.data.token, 'Must return JWT access token');
    assert.ok(loginRes.data.refreshToken, 'Must return JWT refresh token');
    assert.equal(loginRes.data.user.email, 'admin@cryoerp.com');
    adminToken = loginRes.data.token;
    superAdminId = loginRes.data.user.id;

    // 1.4 Successful Sales Executive login
    const salesLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' },
    });
    assert.equal(salesLogin.status, 200);
    salesExecToken = salesLogin.data.token;
    salesExecId = salesLogin.data.user.id;
  });

  await t.test('2. Refresh Token Rotation & Session Lifecycle', async () => {
    // 2.1 Login fresh user to test refresh lifecycle
    const login = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' },
    });
    const firstRefreshToken = login.data.refreshToken;

    // 2.2 Refresh token
    const refreshRes = await apiRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: firstRefreshToken },
    });
    assert.equal(refreshRes.status, 200);
    assert.ok(refreshRes.data.token, 'Must return rotated access token');
    assert.ok(refreshRes.data.refreshToken, 'Must return new rotated refresh token');
    const secondRefreshToken = refreshRes.data.refreshToken;
    assert.notEqual(firstRefreshToken, secondRefreshToken, 'Refresh token must be rotated');

    // 2.3 Replay detection: attempting to reuse old refresh token
    const replayRes = await apiRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: firstRefreshToken },
    });
    assert.equal(replayRes.status, 401, 'Reusing revoked refresh token must be rejected');

    // 2.4 Logout with current refresh token
    const logoutRes = await apiRequest('/auth/logout', {
      method: 'POST',
      token: refreshRes.data.token,
      body: { refreshToken: secondRefreshToken },
    });
    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.data.ok, true);

    // 2.5 Refresh after logout must fail
    const refreshAfterLogout = await apiRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: secondRefreshToken },
    });
    assert.equal(refreshAfterLogout.status, 401);
  });

  await t.test('3. Password Change Policy & Session Revocation', async () => {
    // 3.1 Create test employee
    const newEmpRes = await apiRequest('/admin/employees', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Security Test Officer',
        email: `sec.test.${Date.now()}@cryoerp.com`,
        department: 'sales',
        roleId: 'role-sales-exec',
        password: 'InitialPassword@2026',
      },
    });
    assert.equal(newEmpRes.status, 201);
    const testEmp = newEmpRes.data;

    // Login with initial password
    const testLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: testEmp.email, password: 'InitialPassword@2026' },
    });
    assert.equal(testLogin.status, 200);
    const testToken = testLogin.data.token;
    const testRefreshToken = testLogin.data.refreshToken;

    // 3.2 Change password with incorrect current password
    const wrongCurrent = await apiRequest('/auth/change-password', {
      method: 'POST',
      token: testToken,
      body: { currentPassword: 'WrongPassword', newPassword: 'BrandNewSecure@2027' },
    });
    assert.equal(wrongCurrent.status, 400);

    // 3.3 Change password with too short password
    const tooShort = await apiRequest('/auth/change-password', {
      method: 'POST',
      token: testToken,
      body: { currentPassword: 'InitialPassword@2026', newPassword: 'short' },
    });
    assert.equal(tooShort.status, 400);

    // 3.4 Valid password change
    const validChange = await apiRequest('/auth/change-password', {
      method: 'POST',
      token: testToken,
      body: { currentPassword: 'InitialPassword@2026', newPassword: 'BrandNewSecure@2027' },
    });
    assert.equal(validChange.status, 200);
    assert.equal(validChange.data.ok, true);

    // 3.5 Old refresh token must be invalidated
    const oldRefresh = await apiRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: testRefreshToken },
    });
    assert.equal(oldRefresh.status, 401, 'Old session must be invalidated upon password change');

    // 3.6 Login with new password succeeds
    const newLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier: testEmp.email, password: 'BrandNewSecure@2027' },
    });
    assert.equal(newLogin.status, 200);
  });

  await t.test('4. RBAC Authorization & Safeguards', async () => {
    // 4.1 Unauthenticated request rejected
    const unauth = await apiRequest('/sales/enquiries');
    assert.equal(unauth.status, 401);

    // 4.2 Cross-module permission restriction: Sales Executive cannot create employee
    const forbidden = await apiRequest('/admin/employees', {
      method: 'POST',
      token: salesExecToken,
      body: { name: 'Intruder', email: 'intruder@cryoerp.com' },
    });
    assert.equal(forbidden.status, 403);

    // 4.3 Self-privilege escalation block: Super Admin cannot demote self or change own department
    const selfEscalation = await apiRequest(`/admin/employees/${superAdminId}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'Inactive' },
    });
    assert.equal(selfEscalation.status, 403);
    assert.ok(selfEscalation.data.error.includes('own account'));

    // 4.4 Last Super Admin protection: Cannot deactivate the last Super Admin
    const activeAdminCount = await EmployeeModel.countDocuments({ roleId: 'role-super-admin', status: 'Active' });
    if (activeAdminCount === 1) {
      const deactAdmin = await apiRequest(`/admin/employees/${superAdminId}`, {
        method: 'PUT',
        token: adminToken,
        body: { roleId: 'role-sales-exec' },
      });
      assert.ok([400, 403].includes(deactAdmin.status));
    }

    // 4.5 Soft deactivation: Cannot hard-delete employee with transaction history
    const hardDelete = await apiRequest(`/admin/employees/${salesExecId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.ok([400, 403, 409].includes(hardDelete.status));
    assert.ok(hardDelete.data.error.includes('CONFLICT') || hardDelete.data.error.includes('historical'));
  });

  await t.test('5. Bootstrap API Security & Department Scoping', async () => {
    // 5.1 Sales executive bootstrap
    const salesBootstrap = await apiRequest('/erp/bootstrap', {
      token: salesExecToken,
    });
    assert.equal(salesBootstrap.status, 200);
    // Must NOT leak password hashes
    for (const emp of salesBootstrap.data.employees) {
      assert.equal((emp as any).passwordHash, undefined, 'passwordHash must never be exposed');
    }
    // Must NOT include supply chain procurement lists
    assert.equal(salesBootstrap.data.suppliers.length, 0, 'Sales executive must not receive supplier directory');
    assert.equal(salesBootstrap.data.supplierPOs.length, 0, 'Sales executive must not receive supplier purchase orders');
  });

  await t.test('6. Concurrent Inventory Safety & Race Condition Prevention', async () => {
    // 6.1 Create isolated test material with exactly 10 units
    const matCode = `MAT-CONC-${Date.now().toString().slice(-4)}`;
    const testMat = await MaterialModel.create({
      id: `mat-conc-${Date.now()}`,
      code: matCode,
      name: `Concurrency Test Cylinder ${matCode}`,
      category: 'Components',
      unit: 'Nos',
      minStock: 2,
      currentStock: 10,
      active: true,
      storageLocation: 'Test Store',
      createdAt: new Date().toISOString(),
    });

    await StockTransactionModel.create({
      id: `st-conc-${Date.now()}`,
      materialId: testMat.id,
      materialCode: testMat.code,
      materialName: testMat.name,
      unit: 'Nos',
      type: 'Opening Balance',
      quantityDelta: 10,
      balanceAfter: 10,
      linkedDocType: 'Opening',
      linkedDocId: testMat.id,
      linkedDocNo: testMat.code,
      remarks: 'Initial concurrency test stock',
      performedBy: 'Test Runner',
      timestamp: new Date().toISOString(),
    });

    // 6.2 Create two Material Requests, each asking for 8 units
    const mr1 = await MaterialRequestModel.create({
      id: `mr-c1-${Date.now()}`,
      docNo: `MR-C1-${Date.now().toString().slice(-4)}`,
      bomId: 'bom-test',
      bomDocNo: 'BOM-0001',
      productionOrderId: 'prod-test-1',
      productionOrderDocNo: 'PROD-0001',
      salesOrderId: 'so-test-1',
      salesOrderDocNo: 'SO-0001',
      productName: 'Cryo Chamber Test',
      requestDate: new Date().toISOString().slice(0, 10),
      requestedBy: 'Assembly Line Supervisor',
      status: 'Pending',
      receiptStatus: 'Pending',
      items: [
        {
          materialId: testMat.id,
          materialCode: testMat.code,
          materialName: testMat.name,
          unit: 'Nos',
          requiredQty: 8,
          issuedQty: 0,
          receivedQty: 0,
        },
      ],
      createdAt: new Date().toISOString(),
    });

    const mr2 = await MaterialRequestModel.create({
      id: `mr-c2-${Date.now()}`,
      docNo: `MR-C2-${Date.now().toString().slice(-4)}`,
      bomId: 'bom-test',
      bomDocNo: 'BOM-0001',
      productionOrderId: 'prod-test-2',
      productionOrderDocNo: 'PROD-0002',
      salesOrderId: 'so-test-2',
      salesOrderDocNo: 'SO-0002',
      productName: 'Cryo Chamber Test',
      requestDate: new Date().toISOString().slice(0, 10),
      requestedBy: 'Assembly Line Supervisor',
      status: 'Pending',
      receiptStatus: 'Pending',
      items: [
        {
          materialId: testMat.id,
          materialCode: testMat.code,
          materialName: testMat.name,
          unit: 'Nos',
          requiredQty: 8,
          issuedQty: 0,
          receivedQty: 0,
        },
      ],
      createdAt: new Date().toISOString(),
    });

    // 6.3 Execute two concurrent material issues for 8 units simultaneously against 10 total stock
    const results = await Promise.allSettled([
      mongoERPRepository.issueMaterial(
        mr1.id,
        [{ materialId: testMat.id, issuingQty: 8 }],
        'Concurrent Request 1',
        new Date().toISOString().slice(0, 10),
        { id: superAdminId, name: 'Super Admin' },
      ),
      mongoERPRepository.issueMaterial(
        mr2.id,
        [{ materialId: testMat.id, issuingQty: 8 }],
        'Concurrent Request 2',
        new Date().toISOString().slice(0, 10),
        { id: superAdminId, name: 'Super Admin' },
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent issue request must succeed');
    assert.equal(rejected.length, 1, 'The competing concurrent request must fail with INSUFFICIENT_STOCK');

    const err = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(
      err.message.includes('INSUFFICIENT_STOCK') || err.message.includes('insufficient stock'),
      `Error must indicate insufficient stock, got: ${err.message}`,
    );

    // Verify stock balance was never negative
    const finalMat = await MaterialModel.findOne({ id: testMat.id });
    assert.equal(finalMat?.currentStock, 2, 'Remaining stock must be exactly 10 - 8 = 2 units (NEVER negative)');
  });

  await stopTestServer();
});

test('CRYO ERP 2.0 Phase 4 - Real Replica Set ACID Multi-Document Transaction Rollback', async () => {
  // Connect to the local test replica set on port 27018
  const replUri = 'mongodb://127.0.0.1:27018/cryo_erp_rollback_test?replicaSet=rs0';
  const conn = await mongoose.createConnection(replUri, { serverSelectionTimeoutMS: 3000 }).asPromise();

  const CounterTestModel = conn.model('TestDocCounter', DocCounterModel.schema);
  const testKey = `ROLLBACK_TEST_${Date.now()}`;

  // Execute a transaction that deliberately fails midway
  let caughtError = false;
  const session = await conn.startSession();
  try {
    await session.withTransaction(async () => {
      // Step 1: Create a document in replica set
      await CounterTestModel.create([{ key: testKey, value: 999 }], { session });

      // Step 2: Deliberate failure triggering rollback
      throw new Error('SIMULATED_TRANSACTION_FAILURE: Abort multi-doc transaction');
    });
  } catch (err: any) {
    if (err.message.includes('SIMULATED_TRANSACTION_FAILURE')) {
      caughtError = true;
    }
  } finally {
    await session.endSession();
  }

  assert.equal(caughtError, true, 'Deliberate transaction failure must throw error');

  // Verify rollback: document must NOT exist in the database!
  const persisted = await CounterTestModel.findOne({ key: testKey });
  assert.equal(persisted, null, 'Document must be rolled back and not persisted in replica set');

  await conn.close();
});
