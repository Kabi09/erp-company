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
  DailyProductionUpdateModel,
  ManufacturingStageDefinitionModel,
  MaterialIssueModel,
  MaterialModel,
  MaterialRequestModel,
  ProductCategoryModel,
  ProductionOrderModel,
  ProductModel,
  QualityCheckModel,
  ReworkOrderModel,
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

test('CRYO ERP 2.0 Production Forms Refinement, BOQ/BOM Pending Updates, Dynamic QC & Product Categories Suite', async (t) => {
  await startTestServer();
  try {
    let adminToken = '';
  let prodMgrToken = '';
  let salesExecToken = '';

  const [adminLogin, prodLogin, salesLogin] = await Promise.all([
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'admin@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'prod.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' } }),
  ]);

  adminToken = adminLogin.data.token;
  prodMgrToken = prodLogin.data.token;
  salesExecToken = salesLogin.data.token;

  assert.ok(adminToken, 'Admin token acquired');
  assert.ok(prodMgrToken, 'Production Manager token acquired');
  assert.ok(salesExecToken, 'Sales Executive token acquired');

  // Common test seed: Product & Production Order
  const prodDoc = await ProductModel.findOne().lean();
  assert.ok(prodDoc, 'Default test product available');

  const customerDoc = await CustomerModel.findOne().lean();
  assert.ok(customerDoc, 'Default test customer available');

  // Create a confirmed sales order directly in Mongo
  const soId = `so_test_${Date.now()}`;
  const nowStamp = Date.now().toString().slice(-4);
  const soDoc = await SalesOrderModel.create({
    id: soId,
    docNo: `SO-TEST-${nowStamp}`,
    enquiryId: `enq_${Date.now()}`,
    enquiryDocNo: `ENQ-${nowStamp}`,
    quotationId: `qt_${Date.now()}`,
    quotationDocNo: `QT-${nowStamp}`,
    piId: `pi_${Date.now()}`,
    piDocNo: `PI-${nowStamp}`,
    customerPoId: `cpo_${Date.now()}`,
    customerPoDocNo: `CPO-${nowStamp}`,
    customerPoNumber: `PO-${nowStamp}`,
    customerId: customerDoc!.id,
    customerSnapshot: {
      name: customerDoc!.name,
      contactPerson: customerDoc!.contactPerson,
      phone: customerDoc!.phone,
      email: customerDoc!.email,
      shippingAddress: '42 Lab Road, Bengaluru',
    },
    items: [
      {
        productId: prodDoc!.id,
        productName: prodDoc!.name,
        model: prodDoc!.model,
        quantity: 2,
        unitPrice: 150000,
        gstPercent: 18,
        specifications: prodDoc!.specifications,
      },
    ],
    subtotal: 300000,
    discountAmount: 0,
    taxAmount: 54000,
    totalAmount: 354000,
    paymentTerms: '100% advance',
    deliveryTerms: 'Ex-works',
    deliveryAddress: '42 Lab Road, Bengaluru',
    promisedDeliveryDate: '2026-12-31',
    priority: 'Normal',
    commercialStatus: 'Confirmed',
    fulfillmentStatus: 'Awaiting Production',
    createdBy: 'Sales Exec',
  });
  const so = soDoc.toObject();

  // Create Production Order in Planned state (BOM pending)
  const poRes = await apiRequest('/production/orders', {
    method: 'POST',
    token: prodMgrToken,
    body: {
      salesOrderId: so.id,
      productId: prodDoc!.id,
      quantity: 2,
      plannedStartDate: '2026-12-01',
      plannedEndDate: '2026-12-10',
      priority: 'Normal',
      productionInCharge: 'Ramesh Patel',
    },
  });
  assert.equal(poRes.status, 201, 'Production Order created in Planned state');
  const po = poRes.data;
  assert.equal(po.status, 'Planned', 'PO begins in Planned state (BOM pending)');

  // -------------------------------------------------------------
  // Test 1: Preliminary work update while BOM/BOQ pending
  // -------------------------------------------------------------
  await t.test('Test 1: Preliminary work update while BOM/BOQ pending is allowed', async () => {
    const res = await apiRequest('/production/daily-updates', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        workType: 'Preliminary Planning / Preparation',
        stage: 'Design Review',
        selectedStages: ['Design Review', 'Material Preparation'],
        workCompleted: 'Reviewed refrigeration schematics and verified fixture availability while BOM is pending.',
        workHours: 4,
        completedQty: 1, // should be forced to 0
        stageStatus: 'In Progress',
        issues: 'Awaiting supplier component lead times',
      },
    });

    assert.equal(res.status, 201, 'Preliminary work update created');
    assert.equal(res.data.workType, 'Preliminary Planning / Preparation');
    assert.equal(res.data.completedQty, 0, 'Completed quantity forced to 0 in preliminary planning');
    assert.deepEqual(res.data.selectedStages, ['Design Review', 'Material Preparation']);

    // Check PO status has NOT changed to In Progress
    const poCheck = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poCheck?.status, 'Planned', 'PO remains in Planned state');
  });

  // -------------------------------------------------------------
  // Test 2: Manufacturing progress blocked before readiness
  // -------------------------------------------------------------
  await t.test('Test 2: Manufacturing progress blocked before order readiness', async () => {
    const res = await apiRequest('/production/daily-updates', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        workType: 'Manufacturing Progress',
        stage: 'Welding',
        selectedStages: ['Welding', 'Assembly'],
        workCompleted: 'Attempting fabrication before materials and BOM are ready',
        workHours: 4,
        completedQty: 1,
      },
    });

    assert.equal(res.status, 400, 'Manufacturing progress rejected before readiness');
    assert.match(res.data.error, /Manufacturing progress cannot be recorded while production is not started/);
  });

  // -------------------------------------------------------------
  // Test 3: Multi-stage selection persistence
  // -------------------------------------------------------------
  await t.test('Test 3: Multi-stage selection persistence on daily update', async () => {
    const stages = ['Cutting', 'Fabrication', 'Welding'];
    const res = await apiRequest('/production/daily-updates', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        workType: 'Preliminary Planning / Preparation',
        selectedStages: stages,
        workCompleted: 'Tooling setup and machine calibrations for multiple stages.',
        workHours: 3,
      },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.data.selectedStages, stages);
    assert.equal(res.data.stage, 'Cutting, Fabrication, Welding');
  });

  // -------------------------------------------------------------
  // Test 4: Custom manufacturing stage creation & duplicate prevention
  // -------------------------------------------------------------
  await t.test('Test 4: Custom manufacturing stage creation and duplicate check', async () => {
    const customStageName = `Cryo Leak Spec Stage ${Date.now()}`;
    const createRes = await apiRequest('/production/stages', {
      method: 'POST',
      token: prodMgrToken,
      body: { name: customStageName },
    });

    assert.equal(createRes.status, 201, 'Custom stage created');
    assert.equal(createRes.data.name, customStageName);
    assert.ok(createRes.data.normalizedName);

    // Duplicate check
    const dupRes = await apiRequest('/production/stages', {
      method: 'POST',
      token: prodMgrToken,
      body: { name: `  ${customStageName.toLowerCase()}  ` },
    });

    assert.equal(dupRes.status, 400, 'Duplicate stage rejected');
    assert.match(dupRes.data.error, /already exists/);

    // List stages includes new stage
    const listRes = await apiRequest('/production/stages', {
      method: 'GET',
      token: prodMgrToken,
    });
    assert.equal(listRes.status, 200);
    const found = listRes.data.find((s: any) => s.name === customStageName);
    assert.ok(found, 'New stage appears in catalog listing');
  });

  // -------------------------------------------------------------
  // Test 5: Multiple work highlights support
  // -------------------------------------------------------------
  await t.test('Test 5: Multiple work highlights saved and retrieved', async () => {
    const highlights = [
      'Completed calibration of temperature test sensors',
      'Checked vacuum valve seals with helium detector',
      'Prepared inner tank isolation fittings',
    ];

    const res = await apiRequest('/production/daily-updates', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        workType: 'Preliminary Planning / Preparation',
        selectedStages: ['Testing Preparation'],
        highlights,
        workHours: 5,
      },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.data.highlights, highlights);
    assert.ok(res.data.workCompleted.includes('Completed calibration'));
  });

  // -------------------------------------------------------------
  // Test 6: Daily update timeline history retrieval
  // -------------------------------------------------------------
  await t.test('Test 6: Daily updates history query by productionOrderId', async () => {
    const res = await apiRequest(`/production/daily-updates?productionOrderId=${po.id}`, {
      method: 'GET',
      token: prodMgrToken,
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length >= 3, 'All logged updates returned for order');
  });

  // -------------------------------------------------------------
  // Transition PO to In Progress for QC and Manufacturing Tests
  // -------------------------------------------------------------
  await t.test('Setup: Advance PO through Ready to Start and In Progress', async () => {
    // Manually advance PO for testing QC flows
    await ProductionOrderModel.updateOne(
      { id: po.id },
      {
        $set: {
          status: 'In Progress',
          actualStartDate: new Date().toISOString().slice(0, 10),
        },
      },
    );

    // Record at least one Manufacturing Progress update
    const mfgUpdate = await apiRequest('/production/daily-updates', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        workType: 'Manufacturing Progress',
        selectedStages: ['Assembly', 'Electrical Wiring'],
        workCompleted: 'Final assembly and wiring completed on both units.',
        completedQty: 2,
        workHours: 8,
      },
    });
    assert.equal(mfgUpdate.status, 201);

    // Complete Manufacturing to transition PO to QC Pending
    const compRes = await apiRequest(`/production/orders/${po.id}/complete-manufacturing`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        completedQty: 2,
        serialNumbers: ['CRYO-TEST-001', 'CRYO-TEST-002'],
      },
    });
    assert.equal(compRes.status, 200, 'Manufacturing completed');
    assert.equal(compRes.data.status, 'QC Pending');
  });

  // -------------------------------------------------------------
  // Test 7: Dynamic QC checklist items saving
  // -------------------------------------------------------------
  await t.test('Test 7: Dynamic QC checklist items with measured and expected values', async () => {
    const checks = [
      {
        id: 'chk-vis',
        name: 'Visual & Mechanical Fabrication Inspection',
        result: 'Pass',
        observation: 'Frame and chassis weld beads smooth without porosity',
        required: true,
      },
      {
        id: 'chk-temp',
        name: 'Thermal Pull-Down & Stability Performance Test',
        result: 'Pass',
        observation: 'Reached setpoint in 3.2 hours',
        measuredValue: '-86.2 °C',
        expectedValue: '<= -80.0 °C',
        required: true,
      },
    ];

    // Draft / Pending Inspection
    const draftRes = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectedQty: 2,
        finalResult: 'Pending',
        checks,
        remarks: 'Preliminary inspection checks passed; electrical safety test pending.',
      },
    });

    assert.equal(draftRes.status, 201, 'QC Draft recorded');
    assert.equal(draftRes.data.finalResult, 'Pending');
    assert.equal(draftRes.data.checks.length, 2);
    assert.equal(draftRes.data.checks[1].measuredValue, '-86.2 °C');

    // PO status remains QC Pending
    const poAfterDraft = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poAfterDraft?.status, 'QC Pending');
  });

  // -------------------------------------------------------------
  // Test 8: Final QC acceptance blocked by failed inspection
  // -------------------------------------------------------------
  await t.test('Test 8: Final QC acceptance blocked when checklist item fails', async () => {
    const checks = [
      {
        id: 'chk-vis',
        name: 'Visual & Mechanical Fabrication Inspection',
        result: 'Pass',
        required: true,
      },
      {
        id: 'chk-elec',
        name: 'Electrical Insulation & Controller Safety Check',
        result: 'Fail',
        observation: 'Ground continuity test failed on main compressor housing',
        measuredValue: '45 MΩ',
        expectedValue: '>= 100 MΩ',
        required: true,
      },
    ];

    const res = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectedQty: 2,
        acceptedQty: 2,
        rejectedQty: 0,
        finalResult: 'Accepted',
        checks,
      },
    });

    assert.equal(res.status, 400, 'Acceptance blocked due to failed check');
    assert.match(res.data.error, /Cannot accept Quality Check: Required check item\(s\) failed/);
  });

  // -------------------------------------------------------------
  // Test 9: Final QC acceptance blocked by pending required inspection
  // -------------------------------------------------------------
  await t.test('Test 9: Final QC acceptance blocked when mandatory item is still Pending', async () => {
    const checks = [
      {
        id: 'chk-vis',
        name: 'Visual Inspection',
        result: 'Pass',
        required: true,
      },
      {
        id: 'chk-cal',
        name: 'Sensor Calibration',
        result: 'Pending',
        required: true,
      },
    ];

    const res = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectedQty: 2,
        finalResult: 'Accepted',
        checks,
      },
    });

    assert.equal(res.status, 400, 'Acceptance blocked due to pending required item');
    assert.match(res.data.error, /Required check item\(s\) are still pending/);
  });

  // -------------------------------------------------------------
  // Test 10: Reinspection and Rework lifecycle preservation
  // -------------------------------------------------------------
  await t.test('Test 10: QC Rejection creates Rework and preserves history on reinspection', async () => {
    // 1. Submit rejection
    const rejectChecks = [
      {
        id: 'chk-vis',
        name: 'Visual Inspection',
        result: 'Pass',
        required: true,
      },
      {
        id: 'chk-braze',
        name: 'Suction Line Vacuum Hold',
        result: 'Fail',
        observation: 'Micro-leak detected at expansion joint',
        required: true,
      },
    ];

    const rejectRes = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectedQty: 2,
        rejectedQty: 2,
        acceptedQty: 0,
        finalResult: 'Rejected',
        rejectionReason: 'Suction line micro-leak detected during vacuum decay test',
        requiredCorrection: 'Re-braze joint and pull 500-micron vacuum hold for 24h',
        checks: rejectChecks,
      },
    });

    assert.equal(rejectRes.status, 201, 'Rejection recorded');
    assert.equal(rejectRes.data.finalResult, 'Rejected');
    assert.ok(rejectRes.data.reworkId, 'Rework Order generated');
    const reworkId = rejectRes.data.reworkId;

    // Check PO moved to Rework state
    const poRework = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poRework?.status, 'Rework');

    // 2. Resolve/Complete the rework
    const rwComplete = await apiRequest(`/production/rework/${reworkId}/complete`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        completedWork: 'Re-brazed expansion joint with silver solder, passed 24h vacuum hold.',
      },
    });
    assert.equal(rwComplete.status, 200, 'Rework marked complete');

    // Check PO returned to QC Pending for reinspection
    const poReinspect = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poReinspect?.status, 'QC Pending');

    // 3. Reinspect with all checks passed
    const passChecks = [
      {
        id: 'chk-vis',
        name: 'Visual Inspection',
        result: 'Pass',
        required: true,
      },
      {
        id: 'chk-braze',
        name: 'Suction Line Vacuum Hold',
        result: 'Pass',
        observation: 'Vacuum held at 480 microns for 24 hours without decay',
        measuredValue: '480 microns',
        expectedValue: '<= 500 microns',
        required: true,
      },
    ];

    const acceptRes = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        productionOrderId: po.id,
        inspectedQty: 2,
        acceptedQty: 2,
        rejectedQty: 0,
        finalResult: 'Accepted',
        checks: passChecks,
      },
    });

    assert.equal(acceptRes.status, 201, 'Reinspection accepted');
    assert.equal(acceptRes.data.attemptNumber, 3, 'Attempt number incremented');

    // Check PO completed and ready for logistics dispatch
    const poDone = await ProductionOrderModel.findOne({ id: po.id });
    assert.equal(poDone?.status, 'Completed');

    // Audit trail: verify all QC attempts are stored
    const allQcs = await QualityCheckModel.find({ productionOrderId: po.id }).sort({ attemptNumber: 1 });
    assert.equal(allQcs.length, 3, 'Full QC inspection history preserved');
    assert.equal(allQcs[0].finalResult, 'Pending');
    assert.equal(allQcs[1].finalResult, 'Rejected');
    assert.equal(allQcs[2].finalResult, 'Accepted');
  });

  // -------------------------------------------------------------
  // Test 11: Product Category Dropdown & Auto-Seeding
  // -------------------------------------------------------------
  await t.test('Test 11: Product Categories listing auto-seeds default categories', async () => {
    const res = await apiRequest('/sales/product-categories', {
      method: 'GET',
      token: salesExecToken,
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length >= 5, 'At least 5 default categories seeded');

    const names = res.data.map((c: any) => c.name);
    assert.ok(names.includes('Ultra Low Temperature Freezers'));
    assert.ok(names.includes('Laboratory Refrigerators'));
    assert.ok(names.includes('Cold Rooms'));
  });

  // -------------------------------------------------------------
  // Test 12: Custom Product Category Creation
  // -------------------------------------------------------------
  await t.test('Test 12: Custom Product Category creation via API', async () => {
    const customCatName = `Cryogenic Storage Vessels ${Date.now()}`;
    const res = await apiRequest('/sales/product-categories', {
      method: 'POST',
      token: salesExecToken,
      body: { name: customCatName },
    });

    assert.equal(res.status, 201, 'Custom product category created');
    assert.equal(res.data.name, customCatName);
    assert.ok(res.data.normalizedName);
    assert.equal(res.data.active, true);

    // Verify it is listed in active categories
    const listRes = await apiRequest('/sales/product-categories', {
      method: 'GET',
      token: salesExecToken,
    });
    const found = listRes.data.find((c: any) => c.name === customCatName);
    assert.ok(found, 'New category appears in active list');
  });

  // -------------------------------------------------------------
  // Test 13: Duplicate Product Category Prevention
  // -------------------------------------------------------------
  await t.test('Test 13: Duplicate product category prevention (case-insensitive)', async () => {
    const existing = 'Ultra Low Temperature Freezers';
    const res = await apiRequest('/sales/product-categories', {
      method: 'POST',
      token: salesExecToken,
      body: { name: '  ultra low temperature freezers  ' },
    });

    assert.equal(res.status, 400, 'Duplicate category rejected');
    assert.match(res.data.error, /already exists/);
  });

  // -------------------------------------------------------------
  // Test 14: Product Category Toggle Active / Inactive
  // -------------------------------------------------------------
  await t.test('Test 14: Product Category toggle activation status', async () => {
    let cat = await ProductCategoryModel.findOne({ name: 'Environmental Chambers' });
    assert.ok(cat, 'Target category exists');
    if (!cat.active) {
      cat.active = true;
      await cat.save();
    }

    const toggleRes = await apiRequest(`/sales/product-categories/${cat.id}/toggle`, {
      method: 'PATCH',
      token: adminToken,
    });

    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.data.active, false, 'Category deactivated');

    // Deactivated category should not appear in active GET listing
    const listRes = await apiRequest('/sales/product-categories', {
      method: 'GET',
      token: salesExecToken,
    });
    const found = listRes.data.find((c: any) => c.id === cat.id);
    assert.equal(found, undefined, 'Deactivated category excluded from active dropdown');

    // Reactivate
    const reactivateRes = await apiRequest(`/sales/product-categories/${cat.id}/toggle`, {
      method: 'PATCH',
      token: adminToken,
    });
    assert.equal(reactivateRes.status, 200);
    assert.equal(reactivateRes.data.active, true, 'Category reactivated');
  });

  // -------------------------------------------------------------
  // Test 15: RBAC Enforcement on Stages and Categories
  // -------------------------------------------------------------
  await t.test('Test 15: RBAC enforcement on product categories and manufacturing stages', async () => {
    // Unauthenticated request should fail
    const unauthCat = await apiRequest('/sales/product-categories', {
      method: 'POST',
      body: { name: 'Unauthorized Category' },
    });
    assert.equal(unauthCat.status, 401, 'Unauthenticated category creation blocked');

    const unauthStage = await apiRequest('/production/stages', {
      method: 'POST',
      body: { name: 'Unauthorized Stage' },
    });
    assert.equal(unauthStage.status, 401, 'Unauthenticated stage creation blocked');

    // Sales Exec should be forbidden from creating production stages
    const forbiddenStage = await apiRequest('/production/stages', {
      method: 'POST',
      token: salesExecToken,
      body: { name: 'Forbidden Stage' },
    });
    assert.equal(forbiddenStage.status, 403, 'Cross-department permission denied');
  });

  // -------------------------------------------------------------
  // Test 16: End-to-end regression check across ERP modules
  // -------------------------------------------------------------
  await t.test('Test 16: Cross-department workflows remain operational', async () => {
    // Verify Sales quotations listing
    const qRes = await apiRequest('/sales/quotations', { method: 'GET', token: salesExecToken });
    assert.equal(qRes.status, 200, 'Sales quotations accessible');

    // Verify Supply Chain purchase orders listing
    const poRes = await apiRequest('/supply-chain/purchase-orders', { method: 'GET', token: adminToken });
    assert.equal(poRes.status, 200, 'Purchase orders accessible');

    // Verify Logistics ready for dispatch listing
    const logRes = await apiRequest('/logistics/ready', { method: 'GET', token: adminToken });
    assert.equal(logRes.status, 200, 'Logistics ready for dispatch accessible');
    assert.ok(Array.isArray(logRes.data));
  });
  } finally {
    await stopTestServer();
  }
});
