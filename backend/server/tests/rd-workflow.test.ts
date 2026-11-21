process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  RDProjectModel,
  RDSpecificationModel,
  RDBOMModel,
  RDWorkUpdateModel,
  RDTestRecordModel,
  MaterialRequestModel,
  ProductionOrderModel,
  BOMModel,
  ProductModel,
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

test('CRYO ERP 2.0 — Research & Development (R&D) Lifecycle & Isolation Boundary Suite', async (t) => {
  await startTestServer();

  let adminToken = '';
  const adminLogin = await apiRequest('/auth/login', {
    method: 'POST',
    body: { identifier: 'admin@cryoerp.com', password: 'cryo123' },
  });
  adminToken = adminLogin.data.token;

  let projectId = '';
  let bomItemId = '';
  let initialTestId = '';

  await t.test('1. Create R&D Innovation Project', async () => {
    const res = await apiRequest('/rd/projects', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Cascade Ultra-Low Cryo Refrigeration Unit (-150°C)',
        objective: 'Develop non-ozone depleting dual-stage mixed refrigerant cascade system.',
        projectType: 'New Product Development',
        targetCompletionDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budgetEstimated: 850000,
      },
    });

    if (res.status !== 201) {
      console.log('DEBUG RES STATUS:', res.status, res.data);
    }
    assert.equal(res.status, 201);
    assert.ok(res.data.projectCode.startsWith('RND-'));
    assert.equal(res.data.status, 'Initiated');
    assert.equal(res.data.currentStage, 'Concept & Requirements');
    projectId = res.data.id;
  });

  await t.test('2. Establish Product Specifications Baseline', async () => {
    const res = await apiRequest(`/rd/projects/${projectId}/specifications`, {
      method: 'POST',
      token: adminToken,
      body: {
        version: '1.0',
        parameters: [
          { category: 'Thermal', parameterName: 'Minimum Achievable Temperature', targetValue: '-150', tolerance: '±2', unit: '°C', isCritical: true },
          { category: 'Electrical', parameterName: 'Power Consumption at Steady State', targetValue: '1800', tolerance: '+100', unit: 'W', isCritical: false },
          { category: 'Acoustic', parameterName: 'Noise Level at 1 Meter', targetValue: '55', tolerance: 'max', unit: 'dBA', isCritical: false },
        ],
        notes: 'Target specifications formulated with medical bio-banking standards.',
      },
    });

    if (res.status !== 200) {
      console.log('DEBUG SPEC RES:', res.status, res.data);
    }
    assert.equal(res.status, 200);
    assert.equal(res.data.parameters.length, 3);
    assert.equal(res.data.version, '1.0');

    // Project status transitions to Specification Done
    const proj = await RDProjectModel.findOne({ id: projectId });
    assert.equal(proj?.status, 'Specification Done');
  });

  await t.test('3. Define Prototype BOM & Requisition Materials from SCM', async () => {
    const bomRes = await apiRequest(`/rd/projects/${projectId}/bom`, {
      method: 'POST',
      token: adminToken,
      body: {
        version: '1.0',
        items: [
          {
            name: 'Rotary Inverter Hermetic Compressor R290',
            partNumber: 'CMP-ROT-R290',
            category: 'Mechanical',
            quantityRequired: 2,
            unit: 'Nos',
            source: 'Procure',
            estimatedUnitCost: 45000,
          },
          {
            name: 'Brazed Plate Counterflow Heat Exchanger',
            partNumber: 'HEX-BP-500',
            category: 'Mechanical',
            quantityRequired: 1,
            unit: 'Nos',
            source: 'Stock',
            estimatedUnitCost: 32000,
          },
        ],
      },
    });

    if (bomRes.status !== 200) {
      console.log('DEBUG BOM RES:', bomRes.status, bomRes.data);
    }
    assert.equal(bomRes.status, 200);
    assert.equal(bomRes.data.items.length, 2);
    assert.equal(bomRes.data.totalEstimatedCost, 2 * 45000 + 32000);
    bomItemId = bomRes.data.items[0].id;

    // Project transitions to Prototyping
    const proj = await RDProjectModel.findOne({ id: projectId });
    assert.equal(proj?.status, 'Prototyping');

    // Requisition items to Supply Chain
    const reqRes = await apiRequest(`/rd/projects/${projectId}/material-request`, {
      method: 'POST',
      token: adminToken,
      body: {
        items: [
          {
            id: bomItemId,
            name: 'Rotary Inverter Hermetic Compressor R290',
            quantityRequested: 2,
            unit: 'Nos',
          },
        ],
        notes: 'Prototype compressors for R&D test rig assembly.',
      },
    });

    if (reqRes.status !== 201) {
      console.log('DEBUG REQ RES:', reqRes.status, reqRes.data);
    }
    assert.equal(reqRes.status, 201);
    assert.equal(reqRes.data.department, 'rd');
    assert.ok(reqRes.data.docNo.startsWith('MR-'));

    // Record consumption and verify budget utilization
    const consumeRes = await apiRequest(`/rd/projects/${projectId}/bom/${bomItemId}/consume`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        quantityConsumed: 2,
      },
    });

    assert.equal(consumeRes.status, 200);
    const updatedProject = await RDProjectModel.findOne({ id: projectId });
    assert.equal(updatedProject?.budgetUtilized, 2 * 45000);
  });

  await t.test('4. Log Daily R&D Updates with Multi-select Stages & Custom Stage', async () => {
    const updateRes = await apiRequest(`/rd/projects/${projectId}/work-updates`, {
      method: 'POST',
      token: adminToken,
      body: {
        date: new Date().toISOString().split('T')[0],
        selectedStages: ['Prototype Assembly', 'Piping & Vacuum Brazing'],
        customStage: 'Mixed Refrigerant Charge Tuning',
        hoursSpent: 6,
        highlights: [
          'Assembled high-stage and low-stage refrigeration loops onto rig frame',
          'Completed helium leak test on 18 brazed joints at 30 bar',
          'Charged primary loop with R290 refrigerant blend',
        ],
        technicalObservations: 'Evaporation pressure stabilized at 1.4 bar gauge. No oil carryover observed.',
      },
    });

    assert.equal(updateRes.status, 201);
    assert.equal(updateRes.data.selectedStages.length, 2);
    assert.equal(updateRes.data.customStage, 'Mixed Refrigerant Charge Tuning');
    assert.equal(updateRes.data.highlights.length, 3);
  });

  await t.test('5. Prototype Testing, Dynamic Checklists & Retest Iteration', async () => {
    // Test 1: Initial test with 1 failure
    const testRes = await apiRequest(`/rd/projects/${projectId}/tests`, {
      method: 'POST',
      token: adminToken,
      body: {
        testName: 'Cascade Pull-Down & Thermal Equilibrium Protocol',
        testProtocolNumber: 'PROTO-CRYO-001',
        checklist: [
          { parameterOrCheck: 'Chamber pull-down time from +25°C to -80°C (< 45 min)', expectedCondition: '< 45 min', measuredValue: '38 min', result: 'Pass' },
          { parameterOrCheck: 'Chamber pull-down time from -80°C to -150°C (< 90 min)', expectedCondition: '< 90 min', measuredValue: '115 min', result: 'Fail', remarks: 'Capillary tube impedance too high' },
          { parameterOrCheck: 'Compressor discharge temperature (< 95°C)', expectedCondition: '< 95°C', measuredValue: '82°C', result: 'Pass' },
        ],
        environmentalConditions: 'Ambient 24°C, 55% RH',
        testNotes: 'Low-stage expansion device restricts mass flow. Rework expansion orifice.',
      },
    });

    assert.equal(testRes.status, 201);
    assert.equal(testRes.data.status, 'Failed');
    assert.equal(testRes.data.iteration, 1);
    assert.equal(testRes.data.retestRequired, true);
    initialTestId = testRes.data.id;

    // Project transitions to Testing
    const proj = await RDProjectModel.findOne({ id: projectId });
    assert.equal(proj?.status, 'Testing');

    // Retest (Iteration 2): After orifice tuning, all pass!
    const retestRes = await apiRequest(`/rd/projects/${projectId}/tests/${initialTestId}/retest`, {
      method: 'POST',
      token: adminToken,
      body: {
        retestReason: 'Replaced capillary assembly with calibrated thermostatic expansion valve.',
        checklist: [
          { parameterOrCheck: 'Chamber pull-down time from +25°C to -80°C (< 45 min)', expectedCondition: '< 45 min', measuredValue: '35 min', result: 'Pass' },
          { parameterOrCheck: 'Chamber pull-down time from -80°C to -150°C (< 90 min)', expectedCondition: '< 90 min', measuredValue: '72 min', result: 'Pass', remarks: 'Smooth pull-down with new TXV' },
          { parameterOrCheck: 'Compressor discharge temperature (< 95°C)', expectedCondition: '< 95°C', measuredValue: '79°C', result: 'Pass' },
        ],
        testNotes: 'Equilibrium reached at -152.4°C. Complete pass on all safety and performance criteria.',
      },
    });

    assert.equal(retestRes.status, 201);
    assert.equal(retestRes.data.iteration, 2);
    assert.equal(retestRes.data.status, 'Passed');
    assert.equal(retestRes.data.retestRequired, false);
  });

  await t.test('6. Complete Project & STRICT ARCHITECTURAL ISOLATION GATE VERIFICATION', async () => {
    // Record baseline production orders and BOM master counts before completion
    const initialProdOrdersCount = await ProductionOrderModel.countDocuments();
    const initialBOMMasterCount = await BOMModel.countDocuments();
    const initialProductsCount = await ProductModel.countDocuments();

    // Mark R&D project as Successfully Completed
    const completeRes = await apiRequest(`/rd/projects/${projectId}/complete`, {
      method: 'POST',
      token: adminToken,
      body: {
        finalConclusion: 'Ultra-low temperature cascade refrigeration architecture validated at -152.4°C. Ready for patent documentation.',
      },
    });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.data.ok, true);
    assert.equal(completeRes.data.project.status, 'Successfully Completed');
    assert.ok(completeRes.data.project.completedAt);

    // CRITICAL ARCHITECTURAL ISOLATION ASSERTIONS:
    // 1. NO Production Orders created
    const finalProdOrdersCount = await ProductionOrderModel.countDocuments();
    assert.equal(finalProdOrdersCount, initialProdOrdersCount, 'STRICT ISOLATION VIOLATION: Production order was spawned from R&D!');

    // 2. NO Product Master BOM created or modified
    const finalBOMMasterCount = await BOMModel.countDocuments();
    assert.equal(finalBOMMasterCount, initialBOMMasterCount, 'STRICT ISOLATION VIOLATION: Product Master BOM was created from R&D!');

    // 3. NO Product Master catalogue items injected
    const finalProductsCount = await ProductModel.countDocuments();
    assert.equal(finalProductsCount, initialProductsCount, 'STRICT ISOLATION VIOLATION: Product Master was modified from R&D!');
  });

  await t.test('7. R&D Dashboard KPIs and Reports Verification', async () => {
    const dashRes = await apiRequest('/rd/dashboard', { token: adminToken });
    assert.equal(dashRes.status, 200);
    assert.ok(dashRes.data.totalProjects >= 1);
    assert.ok(dashRes.data.completedProjects >= 1);

    const reportsRes = await apiRequest('/rd/reports', { token: adminToken });
    assert.equal(reportsRes.status, 200);
    assert.ok(reportsRes.data.summary.totalProjects >= 1);
    assert.ok(reportsRes.data.summary.totalEngineeringHours >= 6);
    assert.ok(reportsRes.data.summary.passedTests >= 1);
    assert.ok(reportsRes.data.summary.retestIterations >= 1);
  });

  await stopTestServer();
});
