import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase, doesSupportTransactions } from '../config/database';
import { registerDepartmentRoles } from '../services/departmentRoles';
import { signToken } from '../middleware/auth.middleware';
import {
  ApprovalWorkflowModel,
  ApprovalRequestModel,
  EmployeeModel,
  RoleModel,
  MaterialModel,
  ProductModel,
  StockTransactionModel,
  ProductionOrderModel,
  MaterialRequestModel,
  DeliveryOrderModel,
  CompanySettingsModel,
} from '../models';
import { warrantyDates } from '../services/deliveredProducts';
import { env } from '../config/environment';
import { ServiceJob, ResearchProject } from '../models/department.model';

test('Unit warranty uses the configured basis and clamps the calendar anniversary', () => {
  const terms = { duration: 1, unit: 'Months', basis: 'Delivery Date' };
  assert.equal(warrantyDates(terms, '2024-01-31', '2024-02-29').end, '2024-02-29');
  assert.equal(warrantyDates(terms, '2024-01-31', '2024-03-01').status, 'Expired');
  assert.equal(warrantyDates({ ...terms, basis: 'Contract Date' }, '2024-01-31').status, 'Not Configured');
});
test('Service and R&D integrated department workflows', async (t) => {
  // Each invocation owns its entire fixture database, including role and stock masters.
  const uri = new URL(env.mongoUri);
  uri.pathname = '/cryo_dept_test_' + randomUUID().replaceAll('-', '');
  const connection = await connectDatabase(uri.toString());
  const server = createApp().listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (connection.connection.name === uri.pathname.slice(1)) await connection.connection.dropDatabase();
    await disconnectDatabase();
  });
  const port =
    (server.address() as AddressInfo)?.port ||
    (await new Promise<number>((resolve) =>
      server.once('listening', () => resolve((server.address() as AddressInfo).port)),
    ));
  await registerDepartmentRoles();
  await RoleModel.create({
    id: 'qa-admin',
    name: 'Test Administrator',
    department: 'admin',
    permissions: { admin: ['manage'] },
  });
  const emps = [
    ['admin', 'admin', 'qa-admin'],
    ['reviewer', 'admin', 'qa-admin'],
    ['tech', 'service', 'role-service-technician'],
    ['other', 'service', 'role-service-technician'],
    ['engineer', 'rnd', 'role-rd-engineer'],
    ['service-manager', 'service', 'role-service-manager'],
    ['rd-manager', 'rnd', 'role-rd-manager'],
  ] as const;
  for (const [id, department, roleId] of emps)
    await EmployeeModel.create({
      id,
      name: id,
      email: id + '@test.invalid',
      employeeId: id,
      department,
      roleId,
      status: 'Active',
      passwordHash: 'unused',
      designation: 'Test',
    });
  const call = async (path: string, body?: any, who = 'admin', expected = 200) => {
    const res = await fetch('http://127.0.0.1:' + port + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + signToken(who), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = res.headers.get('content-type')?.includes('application/pdf')
      ? Buffer.from(await res.arrayBuffer())
      : await res.json();
    assert.equal(res.status, expected, path + ' ' + JSON.stringify(value).slice(0, 350));
    return value;
  };
  const id = randomUUID(),
    pId = randomUUID(),
    job = '/service/jobs/' + id,
    project = '/rnd/projects/' + pId;
  const act = async (base: string, action: string, values: any = {}, who = 'admin', expected = 200) => {
    const r = await call(base);
    return call(base + '/' + action, { revision: r.revision, ...values }, who, expected);
  };
  const today = new Date().toISOString().slice(0, 10);
  const request = {
    id,
    customerName: 'Lab',
    productName: 'Freezer',
    problem: 'Temperature alarm',
    location: 'Customer Site',
    priority: 'Normal',
  };
  await CompanySettingsModel.create({ id: 'company', companyName: 'Test Company' });
  await MaterialModel.create({
    id: 'part',
    code: 'PART',
    name: 'Seal',
    category: 'Parts',
    unit: 'Nos',
    currentStock: 10,
    active: true,
  });
  await StockTransactionModel.create({
    id: 'opening',
    materialId: 'part',
    materialCode: 'PART',
    materialName: 'Seal',
    unit: 'Nos',
    type: 'Opening Balance',
    quantityDelta: 10,
    balanceAfter: 10,
    linkedDocType: 'Opening',
    linkedDocId: 'part',
    linkedDocNo: 'PART',
    performedBy: 'admin',
    timestamp: new Date().toISOString(),
  });
  const del = {
    id: 'delivery',
    docNo: 'DEL-QA',
    salesOrderId: 'so',
    salesOrderDocNo: 'SO-QA',
    productionOrderId: 'po',
    productionOrderDocNo: 'PROD-QA',
    customerId: 'cust',
    customerName: 'Lab',
    productName: 'Freezer',
    quantity: 1,
    serialNumbers: ['SN-1'],
    deliveryAddress: 'Lab site',
    transportMethod: 'Courier' as const,
    plannedDispatchDate: today,
    expectedDeliveryDate: today,
    actualDeliveryDate: today,
    deliveredQty: 1,
    status: 'Delivered' as const,
    createdBy: 'admin',
  };
  await DeliveryOrderModel.create([
    del,
    {
      ...del,
      id: 'partial',
      docNo: 'DEL-P',
      quantity: 2,
      serialNumbers: ['A', 'B'],
      status: 'Partially Delivered',
    },
  ]);
  let assetId: string;
  await t.test(
    'Delivered register matches Production, preserves unknown partial serials and linked order references',
    async () => {
      const a = await call('/service/delivered-products'),
        b = await call('/production/delivered-products');
      assert.deepEqual(a, b);
      assetId = a.find((u) => u.serial === 'SN-1').id;
      assert.equal(a.find((u) => u.deliveryId === 'partial').identifiable, false);
      assert.equal(a[0].salesOrder, 'SO-QA');
    },
  );
  await t.test(
    'Create unverified request, refuse duplicate and unverified warranty claim, then link and review',
    async () => {
      await call('/service/jobs', request, 'admin', 201);
      await call('/service/jobs', request, 'admin', 409);
      await act(job, 'claim', { decision: 'Claim Approved' }, 'admin', 400);
      await act(job, 'link', { assetId });
      await call('/service/warranty', {
        assetId,
        duration: 1,
        unit: 'Years',
        basis: 'Delivery Date',
        notes: 'Seal covered',
      });
      await act(job, 'claim', { decision: 'Claim Rejected' }, 'admin', 400);
      await act(job, 'claim', { decision: 'Claim Rejected', reason: 'Inspection required' });
      await act(job, 'claim', { decision: 'Claim Approved' });
    },
  );
  await t.test(
    'Historical shipment retains its customer and leaves an unconfirmed serial blank',
    async () => {
      const lot = (await call('/service/delivered-products')).find((u) => u.deliveryId === 'partial');
      const created = await call(
        '/service/jobs',
        {
          ...request,
          id: randomUUID(),
          assetId: lot.id,
          customerId: lot.customerId,
          serial: 'Obsolete value',
        },
        'service-manager',
        201,
      );
      const { details } = await call('/service/jobs/' + created.id, undefined, 'service-manager');
      assert.equal(details.customerName, 'Lab');
      assert.equal(details.serial, '');
      assert.equal(details.identifiable, false);
      assert.equal(details.address, 'Lab site');
    },
  );
  const assign = { employeeId: 'tech', date: today, time: '09:00', location: 'Customer Site' };
  await t.test(
    'Active Service employee assignment and schedule enforce object ownership and live overrides',
    async () => {
      await act(job, 'assign', { ...assign, employeeId: 'engineer' }, 'admin', 400);
      await act(job, 'assign', assign);
      await call(job, undefined, 'tech');
      await call(job, undefined, 'other', 404);
      assert.equal((await call('/service/jobs', undefined, 'other')).length, 0);
      await EmployeeModel.updateOne(
        { id: 'other' },
        { $set: { permissionOverrides: { service_team: { view: 'allow' } } } },
      );
      await call(job, undefined, 'other');
      await EmployeeModel.updateOne({ id: 'other' }, { $unset: { permissionOverrides: 1 } });
      await call(job, undefined, 'other', 404);
      await EmployeeModel.updateOne(
        { id: 'tech' },
        { $set: { permissionOverrides: { service_jobs: { edit: 'deny' } } } },
      );
      await act(job, 'checkIn', {}, 'tech', 403);
      await EmployeeModel.updateOne({ id: 'tech' }, { $unset: { permissionOverrides: 1 } });
    },
  );
  await t.test(
    'Multiple visits, chronological inspection and work updates, stale and repeated check-in/out',
    async () => {
      for (let i = 0; i < 2; i++) {
        const revision = (await call(job)).revision;
        await act(job, 'checkIn', {}, 'tech');
        await act(job, 'checkIn', {}, 'tech', 400);
        await call(
          job + '/update',
          { revision, work: 'Old form', date: today, status: 'In Progress' },
          'tech',
          409,
        );
        await act(
          job,
          'update',
          {
            date: today,
            work: 'Replaced seal',
            highlights: ['Leak test', 'Calibration'],
            checks: [{ name: 'Seal', result: 'Pass' }],
            status: 'In Progress',
          },
          'tech',
        );
        await act(job, 'checkOut', { summary: 'Visit finished', status: 'Ready for Inspection' }, 'tech');
        await act(job, 'checkOut', { summary: 'Duplicate', status: 'Ready for Inspection' }, 'tech', 400);
      }
      const r = await call(job);
      assert.equal(r.entries.filter((e) => e.action === 'checkOut' && e.data.minutes >= 0).length, 2);
    },
  );
  await t.test(
    'Technician advance, verified expenses, company-paid exclusion, partial settlement and privacy',
    async () => {
      await act(job, 'advance', { amount: 2000 }, 'tech');
      const first = (await call(job)).entries.find((e) => e.action === 'advance');
      await act(job, 'payAdvance', { entryId: first.id, reference: 'ADV-1' });
      for (const [category, amount, paidBy] of [
        ['Travel', 700, 'Technician'],
        ['Food', 300, 'Technician'],
        ['Local Transport', 400, 'Technician'],
        ['Food', 200, 'Company'],
      ]) {
        await act(job, 'expense', { date: today, category, amount, paidBy }, 'tech');
        const entry = (await call(job)).entries.filter((e) => e.action === 'expense').pop();
        await act(job, 'verify', { entryId: entry.id, decision: 'Approved' }, 'tech', 403);
        await act(job, 'verify', { entryId: entry.id, decision: 'Approved' });
      }
      const a = (await call(job)).accounts[0];
      assert.equal(a.verifiedExpenses, 1600);
      assert.equal(a.alreadySettled, 0);
      assert.equal(a.eligible, 1400);
      assert.equal(a.toReturn, 600);
      await act(job, 'settle', {
        employeeId: 'tech',
        direction: 'Advance returned',
        amount: 600,
        reference: 'SET-1',
      });
      const settled = (await call(job)).accounts[0];
      assert.equal(settled.alreadySettled, 600);
      assert.equal(settled.toReturn, 0);
      await act(
        job,
        'settle',
        { employeeId: 'tech', direction: 'Advance returned', amount: 600, reference: 'SET-2' },
        'admin',
        400,
      );
    },
  );
  await t.test('Paid labour, warranty-covered spare parts and unique customer receipts', async () => {
    await act(job, 'charges', {
      items: [
        { type: 'Spare Parts', description: 'Seal', coverage: 'Warranty-covered', amount: 600 },
        { type: 'Labour', description: 'Visit', coverage: 'Chargeable', amount: 500 },
      ],
      discount: 100,
      tax: 10,
    });
    await act(job, 'payment', { amount: 200, date: today, reference: 'REC-1' });
    await act(job, 'payment', { amount: 200, date: today, reference: 'REC-1' }, 'admin', 400);
    assert.deepEqual((await call(job)).billing, { total: 440, received: 200, outstanding: 240 });
    assert.equal((await call(job, undefined, 'tech')).billing, undefined);
    const otherId = randomUUID(),
      otherJob = '/service/jobs/' + otherId;
    await call('/service/jobs', { ...request, id: otherId }, 'admin', 201);
    await act(otherJob, 'charges', {
      items: [{ type: 'Labour', description: 'Second visit', coverage: 'Chargeable', amount: 500 }],
    });
    await act(otherJob, 'payment', { amount: 100, date: today, reference: 'rec-1' }, 'admin', 409);
    assert.equal((await call(otherJob)).billing.received, 0);
  });
  await ProductModel.create({
    id: 'prototype-master',
    code: 'PROTO',
    name: 'Prototype master',
    category: 'Research',
    sellingPrice: 0,
    bomTemplate: [{ materialId: 'part', quantityPerUnit: 5 }],
  });
  const projectForm = {
    productId: 'prototype-master',
    id: pId,
    name: 'Prototype',
    employeeId: 'engineer',
    start: today,
  };
  await t.test(
    'Independent R&D project, editable specifications, BOM and planning updates before material receipt',
    async () => {
      await call('/rnd/projects', projectForm, 'tech', 403);
      await call('/rnd/projects', projectForm, 'rd-manager', 201);
      const { details } = await call(project, undefined, 'rd-manager');
      assert.equal(details.type, 'New Development');
      assert.equal(details.priority, 'Normal');
      await act(project, 'specs', { items: [{ name: 'Capacity', value: '500', unit: 'L' }] }, 'engineer');
      await act(project, 'bom', { items: [{ materialId: 'part', quantity: 2 }] }, 'engineer');
      await act(
        project,
        'update',
        {
          date: today,
          stages: ['Design', 'Custom stage'],
          highlights: ['Modelled', 'Reviewed'],
          notes: 'Prototype planning',
        },
        'engineer',
      );
      const r = await call(project);
      assert.equal(r.entries.find((e) => e.action === 'update').data.highlights.length, 2);
    },
  );
  await t.test(
    'Service and R&D share store issue vouchers, partial issue, physical receipts, usage and unused return',
    async () => {
      if (!doesSupportTransactions()) {
        await act(project, 'request', {}, 'admin', 400);
        return;
      }
      for (const [base, owner, create] of [
        [job, 'service', 'parts'],
        [project, 'rnd', 'request'],
      ]) {
        await act(
          base,
          create,
          create === 'parts'
            ? { items: [{ materialId: 'part', quantity: 3, coverage: 'Warranty-covered' }] }
            : {},
        );
        const mr = (await call(base)).requests[0];
        assert.equal(mr.sourceType, owner);
        assert.ok(!mr.productionOrderId);
        const issue = {
          items: [{ materialId: 'part', issuingQty: owner === 'service' ? 2 : 1 }],
          version: mr.__v,
        };
        await call('/supply-chain/material-requests/' + mr.id + '/issue', issue, 'tech', 403);
        await call('/supply-chain/material-requests/' + mr.id + '/issue', issue, 'admin', 201);
        await call('/supply-chain/material-requests/' + mr.id + '/issue', issue, 'admin', 409);
        const line = { requestId: mr.id, materialId: 'part', quantity: 1 };
        await act(base, 'receive', { ...line, quantity: issue.items[0].issuingQty });
        await act(base, 'receive', line, 'admin', 400);
        if (owner === 'service') await act(base, 'use', line);
        await act(base, owner === 'service' ? 'return' : 'use', line);
        if (owner === 'rnd') await act(base, 'request', {}, 'admin', 400);
        const row = await MaterialRequestModel.findOne({ id: mr.id });
        assert.equal(row.status, 'Partially Issued');
      }
      assert.equal((await MaterialModel.findOne({ id: 'part' })).currentStock, 8);
    },
  );
  await t.test(
    'Technical completion, material reconciliation flag, independent expense state and report PDF',
    async () => {
      await act(job, 'expense', { date: today, category: 'Other', amount: 50, paidBy: 'Technician' }, 'tech');
      await act(job, 'complete', {
        summary: 'Repaired',
        condition: 'Working',
        inspection: 'Passed',
        acknowledgement: 'Received by customer',
      });
      assert.equal((await call(job)).status, 'Completed');
      assert.ok((await call(job + '/report/pdf')).subarray(0, 4).equals(Buffer.from('%PDF')));
      assert.equal(
        (await call('/service/delivered-products')).find((u) => u.id === assetId).history[0].status,
        'Completed',
      );
    },
  );
  await t.test('Workshop receipt and return, completion without spares', async () => {
    const wId = randomUUID(),
      ws = '/service/jobs/' + wId;
    await call('/service/jobs', { ...request, id: wId, location: 'CRYO Workshop' }, 'admin', 201);
    await act(ws, 'receiveUnit', { date: today, condition: 'Scratched', serial: 'SN-X' });
    await act(ws, 'assign', { ...assign, location: 'CRYO Workshop' });
    await EmployeeModel.updateOne(
      { id: 'tech' },
      { $set: { permissionOverrides: { service_schedule: { view: 'deny' } } } },
    );
    const assigned = await call(ws, undefined, 'tech');
    assert.equal(assigned.location, 'CRYO Workshop');
    assert.equal(
      assigned.entries.some((e) => e.action === 'assign'),
      false,
    );
    await EmployeeModel.updateOne({ id: 'tech' }, { $unset: { permissionOverrides: 1 } });
    const final = { summary: 'Fixed', condition: 'Working', inspection: 'Pass' };
    await act(ws, 'complete', final, 'admin', 400);
    await act(ws, 'returnUnit', { date: today, recipient: 'Client' });
    await act(ws, 'complete', final);
    assert.equal((await call(ws)).status, 'Completed');
  });
  await t.test(
    'Draft, failed attempt, retest, completion permission and no production or product changes',
    async () => {
      const before = await ProductionOrderModel.countDocuments(),
        productBefore = await ProductModel.find().lean();
      const test = { items: [{ name: 'Thermal hold', result: 'Fail', required: 'Yes' }] };
      const final = { date: today, summary: 'Validated prototype' };
      await act(project, 'draft', test);
      await act(project, 'test', test);
      await act(project, 'complete', final, 'admin', 400);
      test.items[0].result = 'Pass';
      await act(project, 'test', test);
      await act(project, 'complete', final, 'engineer', 403);
      await act(project, 'complete', final, 'rd-manager');
      assert.equal((await call(project)).status, 'Successfully Completed');
      assert.equal((await call(project)).entries.filter((e) => e.action === 'test').length, 2);
      assert.equal(await ProductionOrderModel.countDocuments(), before);
      assert.deepEqual(await ProductModel.find().lean(), productBefore);
    },
  );
  await t.test('Optional R&D approval workflow creates a version-bound inbox request', async () => {
    if (!doesSupportTransactions()) {
      t.diagnostic('Configured approval requires a replica set.');
      return;
    }
    await ApprovalWorkflowModel.create({
      id: 'qa-review',
      name: 'Review',
      module: 'rnd_completion',
      department: 'rnd',
      enabled: true,
      triggerAction: 'submit',
      approvalLevels: [
        { levelNumber: 1, levelName: 'Engineering', approverType: 'role', eligibleRoleIds: ['qa-admin'] },
      ],
    });
    const newId = randomUUID();
    await call('/rnd/projects', { ...projectForm, id: newId }, 'admin', 201);
    await act('/rnd/projects/' + newId, 'complete', { date: today, summary: 'Review this project' });
    assert.equal((await ResearchProject.findOne({ id: newId })).status, 'Pending Completion Approval');
    const approval = await ApprovalRequestModel.findOne({ documentId: newId });
    assert.equal(approval.status, 'pending');
    await call(
      '/approvals/requests/' + approval.id + '/decide',
      { decision: 'approved', remarks: 'Validated' },
      'reviewer',
    );
    assert.equal((await ResearchProject.findOne({ id: newId })).status, 'Successfully Completed');
    assert.equal(await ProductionOrderModel.countDocuments(), 0);
  });
});
