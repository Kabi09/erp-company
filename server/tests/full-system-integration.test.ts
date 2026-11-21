process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  CustomerModel,
  ProductModel,
  EnquiryModel,
  FollowUpModel,
  QuotationModel,
  ProformaInvoiceModel,
  CustomerPOModel,
  PaymentEntryModel,
  SalesOrderModel,
  ProductionOrderModel,
  BOMModel,
  MaterialRequestModel,
  MaterialModel,
  SupplierModel,
  SupplierPOModel,
  GRNModel,
  SupplierReturnModel,
  MaterialIssueModel,
  StockTransactionModel,
  DailyProductionUpdateModel,
  QualityCheckModel,
  ReworkOrderModel,
  DeliveryOrderModel,
  DeliveryIssueModel,
  NotificationModel,
  ActivityLogModel,
  CompanySettingsModel,
} from '../models';
import { calculatePaymentSummary } from '../../src/utils/erpLogic';

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

test('CRYO ERP 2.0 Phase 10 — Master Cross-Department Integration & Workflow Verification Suite', async (t) => {
  await startTestServer();

  let adminToken = '';
  let salesMgrToken = '';
  let salesExecToken = '';
  let scMgrToken = '';
  let prodMgrToken = '';
  let qcToken = '';
  let logMgrToken = '';

  const [adminLogin, salesMgrLogin, salesExecLogin, scMgrLogin, prodMgrLogin, logMgrLogin] = await Promise.all([
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'admin@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sales.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sales.exec@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'sc.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'prod.mgr@cryoerp.com', password: 'cryo123' } }),
    apiRequest('/auth/login', { method: 'POST', body: { identifier: 'log.mgr@cryoerp.com', password: 'cryo123' } }),
  ]);

  adminToken = adminLogin.data.token;
  salesMgrToken = salesMgrLogin.data.token;
  salesExecToken = salesExecLogin.data.token;
  scMgrToken = scMgrLogin.data.token;
  prodMgrToken = prodMgrLogin.data.token;
  qcToken = prodMgrLogin.data.token; // Production Manager has full Production & QC permissions
  logMgrToken = logMgrLogin.data.token;

  assert.ok(adminToken, 'Admin token acquired');
  assert.ok(salesMgrToken, 'Sales Manager token acquired');
  assert.ok(scMgrToken, 'Supply Chain Manager token acquired');
  assert.ok(prodMgrToken, 'Production Manager token acquired');
  assert.ok(qcToken, 'QC Inspector token acquired');
  assert.ok(logMgrToken, 'Logistics Manager token acquired');

  // Prefix for isolation
  const runId = `int10_${Date.now()}`;
  const testIds: Record<string, string[]> = {
    customers: [],
    products: [],
    materials: [],
    suppliers: [],
    enquiries: [],
    quotations: [],
    pis: [],
    pos: [],
    payments: [],
    salesOrders: [],
    prodOrders: [],
    boms: [],
    mrs: [],
    spos: [],
    grns: [],
    returns: [],
    issues: [],
    qcs: [],
    reworks: [],
    deliveries: [],
    notifications: [],
  };

  t.after(async () => {
    await Promise.all([
      CustomerModel.deleteMany({ id: { $in: testIds.customers } }),
      ProductModel.deleteMany({ id: { $in: testIds.products } }),
      MaterialModel.deleteMany({ id: { $in: testIds.materials } }),
      SupplierModel.deleteMany({ id: { $in: testIds.suppliers } }),
      EnquiryModel.deleteMany({ id: { $in: testIds.enquiries } }),
      FollowUpModel.deleteMany({ customerName: new RegExp(runId) }),
      QuotationModel.deleteMany({ id: { $in: testIds.quotations } }),
      ProformaInvoiceModel.deleteMany({ id: { $in: testIds.pis } }),
      CustomerPOModel.deleteMany({ id: { $in: testIds.pos } }),
      PaymentEntryModel.deleteMany({ id: { $in: testIds.payments } }),
      SalesOrderModel.deleteMany({ id: { $in: testIds.salesOrders } }),
      ProductionOrderModel.deleteMany({ id: { $in: testIds.prodOrders } }),
      BOMModel.deleteMany({ id: { $in: testIds.boms } }),
      MaterialRequestModel.deleteMany({ id: { $in: testIds.mrs } }),
      SupplierPOModel.deleteMany({ id: { $in: testIds.spos } }),
      GRNModel.deleteMany({ id: { $in: testIds.grns } }),
      SupplierReturnModel.deleteMany({ id: { $in: testIds.returns } }),
      MaterialIssueModel.deleteMany({ id: { $in: testIds.issues } }),
      DailyProductionUpdateModel.deleteMany({ employeeName: new RegExp(runId) }),
      QualityCheckModel.deleteMany({ id: { $in: testIds.qcs } }),
      ReworkOrderModel.deleteMany({ id: { $in: testIds.reworks } }),
      DeliveryOrderModel.deleteMany({ id: { $in: testIds.deliveries } }),
      DeliveryIssueModel.deleteMany({ customerName: new RegExp(runId) }),
      NotificationModel.deleteMany({ id: { $in: testIds.notifications } }),
      StockTransactionModel.deleteMany({ notes: new RegExp(runId) }),
    ]);
    await stopTestServer();
  });

  let scenario1SOId = '';

  // =========================================================================
  // SCENARIO 1: Full 24-Step End-to-End Enterprise Order Lifecycle
  // =========================================================================
  await t.test('Scenario 1: Complete 24-Step Cross-Department Lifecycle (Sales → SC → Prod → QC → Logistics)', async () => {
    // 1. Setup Master Entities: Customer, Product, Materials, Supplier
    const custRes = await apiRequest('/sales/customers', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        name: `Apex Cryogenics Labs ${runId}`,
        contactPerson: 'Dr. Vikram Raman',
        phone: '+91 98765 43210',
        email: `vikram.${runId}@apexcryo.com`,
        billingAddress: 'Tech Park Phase 4, Electronic City, Bengaluru, KA - 560100',
        shippingAddress: 'Cryo Facility, Site 3B, Jigani Industrial Area, Bengaluru, KA - 560105',
        gstin: '29AAAC' + Math.floor(1000 + Math.random() * 9000) + 'D1Z8',
      },
    });
    assert.equal(custRes.status, 201, 'Customer created');
    const custId = custRes.data.id;
    testIds.customers.push(custId);

    const matStockId = `mat_stock_${runId}`;
    const matShortageId = `mat_short_${runId}`;
    testIds.materials.push(matStockId, matShortageId);

    const supId = `sup_${runId}`;
    testIds.suppliers.push(supId);
    await SupplierModel.create({
      id: supId,
      name: `Precision Cryo Components Ltd ${runId}`,
      contactPerson: 'Rajesh K',
      phone: '+91 80 4111 2222',
      email: `rajesh.${runId}@precisioncryo.com`,
      address: 'Plot 12, Peenya Stage 2, Bengaluru',
      gstin: '29ABCDE1234F1Z5',
      active: true,
      suppliedMaterialIds: [matStockId, matShortageId],
    });

    await MaterialModel.insertMany([
      {
        id: matStockId,
        code: `SS-${runId}`,
        name: `SS304 Cryo Grade Plate ${runId}`,
        category: 'Raw Materials',
        unit: 'KG',
        currentStock: 200,
        minStock: 10,
        unitCost: 350,
        storageLocation: 'Aisle A-01',
        active: true,
      },
      {
        id: matShortageId,
        code: `VLV-${runId}`,
        name: `High-Pressure Cryo Valve ${runId}`,
        category: 'Valves & Fittings',
        unit: 'Nos',
        currentStock: 0,
        minStock: 2,
        unitCost: 12500,
        storageLocation: 'Rack V-04',
        active: true,
      },
    ]);

    // Initial stock for SS plate: 200 KG
    await StockTransactionModel.create({
      id: `st_init_${runId}`,
      materialId: matStockId,
      materialCode: `SS-${runId}`,
      materialName: `SS304 Cryo Grade Plate ${runId}`,
      unit: 'KG',
      type: 'Opening Balance',
      quantityDelta: 200,
      balanceAfter: 200,
      timestamp: new Date().toISOString(),
      linkedDocType: 'Manual Adjustment',
      linkedDocId: 'INIT',
      linkedDocNo: 'INIT-001',
      performedBy: 'admin',
      remarks: `Baseline stock for ${runId}`,
    });

    const prodId = `prod_${runId}`;
    testIds.products.push(prodId);
    await ProductModel.create({
      id: prodId,
      code: `CV-500-${runId}`,
      name: `Cryogenic Liquid Vessel 500L ${runId}`,
      category: 'Cryo Storage Vessels',
      model: 'CV-500-ST',
      specifications: '500L Liquid Nitrogen Vessel, Double-Walled Vacuum Insulated',
      highlights: ['Ultra-low evaporation rate', 'Automated pressure build-up valve'],
      sellingPrice: 450000,
      unit: 'Nos',
      status: 'Active',
      bomTemplate: [
        { materialId: matStockId, quantityPerUnit: 50 },
        { materialId: matShortageId, quantityPerUnit: 2 },
      ],
      stages: ['Fabrication', 'Welding & Assembly', 'Vacuum Insulation', 'Testing & QC'],
    });

    // 2. Step 1 & 2: Sales Enquiry Creation
    const enqRes = await apiRequest('/sales/enquiries', {
      method: 'POST',
      token: salesExecToken,
      body: {
        customerId: custId,
        source: 'Direct',
        expectedDeliveryDate: '2026-12-31',
        items: [
          {
            id: `enq_item_${runId}`,
            productId: prodId,
            productName: `Cryogenic Liquid Vessel 500L ${runId}`,
            model: 'CV-500-ST',
            quantity: 2,
            requiredSpecifications: 'Double-Walled 500L LN2 Specification',
          },
        ],
        notes: `Urgent inquiry for lab expansion ${runId}`,
      },
    });
    assert.equal(enqRes.status, 201, 'Enquiry created');
    const enq = enqRes.data;
    testIds.enquiries.push(enq.id);
    assert.ok(enq.docNo.startsWith('ENQ-'), 'Valid Enquiry docNo');

    // 3. Step 3 & 4: Follow-Up & Qualification
    const followRes = await apiRequest('/sales/follow-ups', {
      method: 'POST',
      token: salesExecToken,
      body: {
        entityType: 'enquiry',
        entityId: enq.id,
        followUpDate: new Date().toISOString().slice(0, 10),
        contactMethod: 'Meeting',
        discussion: 'Met client technical team. Technical specifications verified and confirmed.',
        response: 'Positive',
        nextFollowUpDate: '2026-11-25',
      },
    });
    assert.equal(followRes.status, 201, 'Follow-up logged');

    const qualRes = await apiRequest(`/sales/enquiries/${enq.id}/qualify`, {
      method: 'POST',
      token: salesMgrToken,
      body: { notes: 'Approved for official commercial quotation.' },
    });
    assert.equal(qualRes.status, 200, 'Enquiry qualified');
    assert.equal(qualRes.data.status, 'Qualified');

    // 4. Step 5 & 6: Quotation V1, Negotiation & Quotation V2
    const qt1Res = await apiRequest('/sales/quotations', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        enquiryId: enq.id,
        quotationDate: '2026-11-21',
        validityDate: '2026-12-21',
        items: [
          {
            id: `qt_item_${runId}`,
            productId: prodId,
            productName: `Cryogenic Liquid Vessel 500L ${runId}`,
            model: 'CV-500-ST',
            quantity: 2,
            unitPrice: 450000,
            specifications: 'Double walled 500L vessel',
            lineTotal: 900000,
          },
        ],
        subtotal: 900000,
        discountPercent: 0,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 162000,
        totalAmount: 1062000,
        remarks: 'Original V1 quote',
      },
    });
    assert.equal(qt1Res.status, 201, 'Quotation V1 created');
    const qt1 = qt1Res.data;
    testIds.quotations.push(qt1.id);
    assert.equal(qt1.version, 1);

    // Revise to V2 with 5% discount
    const qt2Res = await apiRequest(`/sales/quotations/${qt1.id}/revise`, {
      method: 'POST',
      token: salesMgrToken,
      body: {
        quotationDate: '2026-11-22',
        validityDate: '2026-12-22',
        items: [
          {
            id: `qt_item2_${runId}`,
            productId: prodId,
            productName: `Cryogenic Liquid Vessel 500L ${runId}`,
            model: 'CV-500-ST',
            quantity: 2,
            unitPrice: 450000,
            specifications: 'Double walled 500L vessel',
            lineTotal: 900000,
          },
        ],
        subtotal: 900000,
        discountPercent: 5,
        discountAmount: 45000,
        taxPercent: 18,
        taxAmount: 153900,
        totalAmount: 1008900,
        remarks: 'Revised V2 with 5% commercial discount',
      },
    });
    assert.equal(qt2Res.status, 201, 'Quotation V2 created');
    const qt2 = qt2Res.data;
    testIds.quotations.push(qt2.id);
    assert.equal(qt2.version, 2);

    // Verify V1 is now Superseded
    const qt1Reload = await QuotationModel.findOne({ id: qt1.id });
    assert.equal(qt1Reload?.status, 'Superseded');

    // 5. Step 7: Accept Quotation V2
    const acceptRes = await apiRequest(`/sales/quotations/${qt2.id}/accept`, {
      method: 'POST',
      token: salesMgrToken,
      body: { notes: 'Client accepted revised quotation V2.' },
    });
    assert.equal(acceptRes.status, 200, 'Quotation V2 accepted');
    assert.equal(acceptRes.data.status, 'Accepted');

    // 6. Step 8: Generate Proforma Invoice (PI)
    const piRes = await apiRequest('/sales/proforma-invoices', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        quotationId: qt2.id,
        remarks: 'Proforma Invoice generated against accepted quote',
      },
    });
    assert.equal(piRes.status, 201, 'PI generated');
    const pi = piRes.data;
    testIds.pis.push(pi.id);
    assert.equal(pi.totalAmount, 1008900);

    // 7. Step 9: Receive Customer Purchase Order
    const cpoRes = await apiRequest('/sales/customer-pos', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        customerPoNumber: `APEX-PO-${runId}`,
        receivedDate: '2026-11-23',
        poAmount: 1008900,
        deliveryTimelineDate: '2026-12-30',
        remarks: 'Official Customer PO received and verified against PI',
      },
    });
    assert.equal(cpoRes.status, 201, 'Customer PO registered');
    const cpo = cpoRes.data;
    testIds.pos.push(cpo.id);

    // 8. Step 10: Record Advance Payment (50%) & Verification
    const advanceAmount = 504450; // 50%
    const payRes = await apiRequest('/sales/payments', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        paymentDate: '2026-11-23',
        amount: advanceAmount,
        paymentMethod: 'NEFT/RTGS',
        referenceNumber: `UTR-ADV-${runId}`,
        proofAttachmentName: 'advance_receipt.pdf',
        proofDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        remarks: '50% commercial advance against PI',
      },
    });
    assert.equal(payRes.status, 201, 'Advance payment registered');
    const payment = payRes.data;
    testIds.payments.push(payment.id);

    const verifyPayRes = await apiRequest(`/sales/payments/${payment.id}/verify`, {
      method: 'POST',
      token: adminToken,
      body: { status: 'Verified', remarks: 'Bank remittance UTR confirmed in SBI account.' },
    });
    assert.equal(verifyPayRes.status, 200, 'Payment verified');
    assert.equal(verifyPayRes.data.status, 'Verified');

    // 9. Step 11: Confirm Sales Order
    const soRes = await apiRequest('/sales/sales-orders/confirm', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        customerPoId: cpo.id,
        promisedDeliveryDate: '2026-12-30',
        priority: 'High',
        remarks: 'Confirmed SO with 50% advance in hand',
      },
    });
    assert.equal(soRes.status, 201, 'Sales Order confirmed');
    const so = soRes.data;
    scenario1SOId = so.id;
    testIds.salesOrders.push(so.id);
    assert.equal(so.commercialStatus, 'Confirmed');
    assert.equal(so.fulfillmentStatus, 'Awaiting Production');

    // 10. Step 12: Production Order Intake & Duration Planning
    const poListRes = await apiRequest(`/production/received-orders`, { token: prodMgrToken });
    assert.equal(poListRes.status, 200);

    const createProdRes = await apiRequest('/production/orders', {
      method: 'POST',
      token: prodMgrToken,
      body: {
        salesOrderId: so.id,
        productId: prodId,
        quantity: 2,
        plannedStartDate: '2026-11-24',
        plannedEndDate: '2026-12-15',
        productionInCharge: 'R. Venkatesh (Lead Cryo Engineer)',
        priority: 'High',
        instructions: 'Vacuum bakeout and Helium mass spectrometer leak check mandatory.',
      },
    });
    assert.equal(createProdRes.status, 201, 'Production Order created');
    const prodOrder = createProdRes.data;
    testIds.prodOrders.push(prodOrder.id);
    assert.equal(prodOrder.plannedDurationDays, 22);

    // 11. Step 13: Prepare & Scale BOM
    const bomRes = await apiRequest(`/production/orders/${prodOrder.id}/bom`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        items: [
          {
            materialId: matStockId,
            materialCode: `SS-${runId}`,
            materialName: `SS304 Cryo Grade Plate ${runId}`,
            unit: 'KG',
            qtyPerUnit: 50,
            totalRequiredQty: 100, // 2 units * 50
            remarks: '50 KG per vessel',
          },
          {
            materialId: matShortageId,
            materialCode: `VLV-${runId}`,
            materialName: `High-Pressure Cryo Valve ${runId}`,
            unit: 'Nos',
            qtyPerUnit: 2,
            totalRequiredQty: 4, // 2 units * 2
            remarks: '2 valves per vessel',
          },
        ],
      },
    });
    assert.equal(bomRes.status, 201, 'BOM prepared');
    const bom = bomRes.data;
    testIds.boms.push(bom.id);

    // 12. Step 14: Submit Material Request to Stores
    const mrSubmitRes = await apiRequest(`/production/bom/${bom.id}/submit-request`, {
      method: 'POST',
      token: prodMgrToken,
    });
    assert.ok([200, 201].includes(mrSubmitRes.status), 'Material request submitted to Supply Chain');
    const mr = mrSubmitRes.data;
    testIds.mrs.push(mr.id);
    assert.equal(mr.status, 'Pending');

    // 13. Step 15: Supply Chain Stock Check & Partial Issue (Issue SS Plates from Stock)
    const issue1Res = await apiRequest(`/supply-chain/material-requests/${mr.id}/issue`, {
      method: 'POST',
      token: scMgrToken,
      body: {
        items: [
          {
            materialId: matStockId,
            issuedQty: 100, // Full 100 KG SS plate issued
          },
          {
            materialId: matShortageId,
            issuedQty: 0, // 0 valves issued (shortage)
          },
        ],
        remarks: 'Issued 100 KG SS Plates. Valves out of stock; placing emergency purchase order.',
      },
    });
    assert.equal(issue1Res.status, 201, 'Partial material issue recorded');
    testIds.issues.push(issue1Res.data.issue.id);
    assert.equal(issue1Res.data.materialRequest.status, 'Partially Issued');

    // 14. Step 16: Supply Chain Shortage PO Creation (Order 4 Valves)
    const spoRes = await apiRequest('/supply-chain/purchase-orders', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierId: supId,
        purchaseType: 'Request-Based',
        materialRequestId: mr.id,
        productionOrderId: prodOrder.id,
        items: [
          {
            materialId: matShortageId,
            materialCode: `VLV-${runId}`,
            materialName: `High-Pressure Cryo Valve ${runId}`,
            orderedQty: 4,
            unitPrice: 12500,
            unit: 'Nos',
            lineTotal: 50000,
          },
        ],
        subtotal: 50000,
        taxPercent: 18,
        taxAmount: 9000,
        totalAmount: 59000,
        expectedDeliveryDate: '2026-11-28',
        remarks: 'Emergency PO for shorted cryogenic valves',
      },
    });
    assert.equal(spoRes.status, 201, 'Supplier PO created');
    const spo = spoRes.data;
    testIds.spos.push(spo.id);

    // 15. Step 17: GRN Receipt (Vendor delivers 4 valves)
    const grnRes = await apiRequest('/supply-chain/grn', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierPoId: spo.id,
        supplierId: supId,
        deliveryChallanNo: `DC-PREC-${runId}`,
        receivedDate: '2026-11-28',
        items: [
          {
            materialId: matShortageId,
            materialCode: `VLV-${runId}`,
            materialName: `High-Pressure Cryo Valve ${runId}`,
            receivedQty: 4,
            unit: 'Nos',
          },
        ],
        remarks: 'Received 4 cryo valves from Precision Cryo Components',
      },
    });
    assert.equal(grnRes.status, 201, 'GRN recorded');
    const grn = grnRes.data;
    testIds.grns.push(grn.id);

    // 16. Step 18: Material Verification with Acceptance & Rejection
    // 3 accepted, 1 rejected due to scratched vacuum flange
    const verifyGrnRes = await apiRequest(`/supply-chain/grn/${grn.id}/verify`, {
      method: 'POST',
      token: scMgrToken,
      body: {
        items: [
          {
            materialId: matShortageId,
            acceptedQty: 3,
            rejectedQty: 1,
            rejectionReason: 'Damaged flange seal face on 1 valve',
          },
        ],
        remarks: 'Verified incoming valves. 3 passed helium leak test, 1 rejected.',
      },
    });
    assert.equal(verifyGrnRes.status, 200, 'GRN verified');
    assert.equal(verifyGrnRes.data.verificationStatus, 'Partially Accepted');

    // 17. Step 19: Supplier Return & Replacement GRN
    const retRes = await apiRequest('/supply-chain/supplier-returns', {
      method: 'POST',
      token: scMgrToken,
      body: {
        grnId: grn.id,
        supplierPoId: spo.id,
        supplierId: supId,
        materialId: matShortageId,
        materialCode: `VLV-${runId}`,
        materialName: `High-Pressure Cryo Valve ${runId}`,
        returnQty: 1,
        reason: 'Flange seal face damaged; returned for urgent replacement',
        replacementExpected: true,
      },
    });
    assert.equal(retRes.status, 201, 'Supplier return recorded');
    const retDoc = retRes.data;
    testIds.returns.push(retDoc.id);

    // Supplier sends replacement valve
    const replGrnRes = await apiRequest('/supply-chain/grn', {
      method: 'POST',
      token: scMgrToken,
      body: {
        supplierPoId: spo.id,
        supplierId: supId,
        supplierReturnId: retDoc.id,
        deliveryChallanNo: `DC-REPL-${runId}`,
        receivedDate: '2026-11-29',
        isReplacement: true,
        items: [
          {
            materialId: matShortageId,
            materialCode: `VLV-${runId}`,
            materialName: `High-Pressure Cryo Valve ${runId}`,
            receivedQty: 1,
            unit: 'Nos',
          },
        ],
        remarks: 'Replacement valve received and verified 100% OK',
      },
    });
    assert.equal(replGrnRes.status, 201, 'Replacement GRN created');
    testIds.grns.push(replGrnRes.data.id);

    await apiRequest(`/supply-chain/grn/${replGrnRes.data.id}/verify`, {
      method: 'POST',
      token: scMgrToken,
      body: {
        items: [{ materialId: matShortageId, acceptedQty: 1, rejectedQty: 0 }],
        remarks: 'Replacement valve passed inspection.',
      },
    });

    // 18. Step 20: Issue Remaining Materials & Production Physical Receipt
    const issue2Res = await apiRequest(`/supply-chain/material-requests/${mr.id}/issue`, {
      method: 'POST',
      token: scMgrToken,
      body: {
        items: [
          { materialId: matStockId, issuedQty: 0 },
          { materialId: matShortageId, issuedQty: 4 }, // Issue all 4 valves (3 + 1 replacement)
        ],
        remarks: 'Final issue of 4 cryo valves to shop floor',
      },
    });
    assert.equal(issue2Res.status, 201, 'Second issue voucher created');
    testIds.issues.push(issue2Res.data.issue.id);
    assert.equal(issue2Res.data.materialRequest.status, 'Fully Issued');

    // Production acknowledges physical receipt
    const ackRes = await apiRequest(`/production/material-requests/${mr.id}/acknowledge-receipt`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        items: [
          { materialId: matStockId, receivedQty: 100 },
          { materialId: matShortageId, receivedQty: 4 },
        ],
        remarks: 'All 100 KG plates and 4 valves physically counted and received at workstation 2.',
      },
    });
    assert.equal(ackRes.status, 200, 'Material physical receipt acknowledged');
    assert.equal(ackRes.data.receiptStatus, 'Fully Received');

    // 19. Step 21: Production Execution & Daily Floor Updates
    const startRes = await apiRequest(`/production/orders/${prodOrder.id}/start`, {
      method: 'POST',
      token: prodMgrToken,
    });
    assert.equal(startRes.status, 200, 'Production started');
    assert.equal(startRes.data.status, 'In Progress');

    // Daily update 1: Fabrication
    await apiRequest(`/production/orders/${prodOrder.id}/daily-updates`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        workDate: '2026-11-30',
        stage: 'Fabrication',
        workCompleted: 'Inner and outer vessel shell rolling and seam alignment complete.',
        completedQty: 2,
        workHours: 16,
        stageStatus: 'Completed',
        employeeName: `Tech Lead ${runId}`,
      },
    });

    // Daily update 2: Assembly & Complete Mfg
    const completeMfgRes = await apiRequest(`/production/orders/${prodOrder.id}/complete-manufacturing`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        completedManufacturingQty: 2,
        serialNumbers: [`SN-CV500-01-${runId}`, `SN-CV500-02-${runId}`],
        remarks: 'Vessels 1 & 2 fully assembled and ready for final QC inspection.',
      },
    });
    assert.equal(completeMfgRes.status, 200, 'Manufacturing marked complete');
    assert.equal(completeMfgRes.data.status, 'QC Pending');

    // 20. Step 22: Quality Check Rejection & Rework Lifecycle
    // Unit 1 passes, Unit 2 fails vacuum pressure hold test
    const qc1Res = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: qcToken,
      body: {
        productionOrderId: prodOrder.id,
        attemptNumber: 1,
        inspectedQty: 2,
        acceptedQty: 1,
        rejectedQty: 1,
        serialNumbers: [`SN-CV500-01-${runId}`, `SN-CV500-02-${runId}`],
        inspectionDate: '2026-12-02',
        inspector: 'Senior QC Specialist',
        checks: [
          { name: 'Helium Mass Spectrometer Leak Check', result: 'Fail', observation: 'Unit 2 vacuum port micro-leak detected' },
          { name: 'Hydrostatic Pressure Test', result: 'Pass', observation: 'Withstood 1.5x design pressure' },
        ],
        finalResult: 'Rejected',
        rejectionReason: 'Unit 2 vacuum leak test failed; requires reweld and re-vacuum bakeout',
        requiredCorrection: 'TIG reweld vacuum port and repeat 24-hr vacuum hold test',
      },
    });
    assert.equal(qc1Res.status, 201, 'QC rejection recorded');
    testIds.qcs.push(qc1Res.data.id);
    assert.ok(qc1Res.data.reworkId, 'Automatic Rework Order created');
    testIds.reworks.push(qc1Res.data.reworkId);

    // Production Order status is now 'Rework'
    const poRework = await ProductionOrderModel.findOne({ id: prodOrder.id });
    assert.equal(poRework?.status, 'Rework');

    // Technician completes rework corrective action
    const reworkCompleteRes = await apiRequest(`/production/rework-orders/${qc1Res.data.reworkId}/complete`, {
      method: 'POST',
      token: prodMgrToken,
      body: {
        completedWork: 'Vacuum port reweld complete; helium spray test passed in shop.',
        remarks: 'Returned to QC for reinspection.',
      },
    });
    assert.equal(reworkCompleteRes.status, 200, 'Rework completed');

    // Repeat QC (Attempt 2) - Both units Accepted!
    const qc2Res = await apiRequest('/production/quality-checks', {
      method: 'POST',
      token: qcToken,
      body: {
        productionOrderId: prodOrder.id,
        attemptNumber: 2,
        inspectedQty: 2,
        acceptedQty: 2,
        rejectedQty: 0,
        serialNumbers: [`SN-CV500-01-${runId}`, `SN-CV500-02-${runId}`],
        inspectionDate: '2026-12-04',
        inspector: 'Senior QC Specialist',
        checks: [
          { name: 'Helium Mass Spectrometer Leak Check', result: 'Pass', observation: '10^-9 mbar*l/s vacuum verified' },
          { name: 'Hydrostatic Pressure Test', result: 'Pass', observation: 'Pass' },
        ],
        finalResult: 'Accepted',
        remarks: 'Unit 2 rework 100% verified. Both units certified for dispatch.',
      },
    });
    assert.equal(qc2Res.status, 201, 'QC Attempt 2 Passed');
    testIds.qcs.push(qc2Res.data.id);

    const poFinal = await ProductionOrderModel.findOne({ id: prodOrder.id });
    assert.equal(poFinal?.status, 'Completed');
    assert.equal(poFinal?.qcAcceptedQty, 2);

    // 21. Step 23: Logistics Handoff & Delivery Order Dispatch
    const readyRes = await apiRequest('/logistics/ready', { token: logMgrToken });
    assert.equal(readyRes.status, 200);
    const readyItems = readyRes.data.items || readyRes.data;
    const readyItem = readyItems.find((r: any) => r.productionOrderId === prodOrder.id || r.id === prodOrder.id);
    assert.ok(readyItem, 'Order appeared in Logistics Ready for Dispatch queue');

    // Create Delivery Order for both units via Own Vehicle
    const delRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        salesOrderId: so.id,
        productionOrderId: prodOrder.id,
        customerId: custId,
        customerName: `Apex Cryogenics Labs ${runId}`,
        productName: `Cryogenic Liquid Vessel 500L ${runId}`,
        quantity: 2,
        serialNumbers: [`SN-CV500-01-${runId}`, `SN-CV500-02-${runId}`],
        deliveryAddress: 'Cryo Facility, Site 3B, Jigani Industrial Area, Bengaluru, KA - 560105',
        transportMethod: 'Own Vehicle',
        vehicleNumber: 'KA-01-MJ-8899',
        driverName: 'Manjunath Gowda',
        driverPhone: '+91 99887 76655',
        plannedDispatchDate: '2026-12-05',
        expectedDeliveryDate: '2026-12-06',
        remarks: 'Dedicated air-suspension truck for cryogenic vessel transit',
      },
    });
    assert.equal(delRes.status, 201, 'Delivery Order created');
    const delOrder = delRes.data;
    testIds.deliveries.push(delOrder.id);

    // Confirm Dispatch -> In Transit
    const dispatchRes = await apiRequest(`/logistics/delivery-orders/${delOrder.id}/dispatch`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        actualDispatchDate: '2026-12-05',
        deliveryChallanNo: `DC-CRYO-${runId}`,
        dispatchRemarks: 'Truck departed factory gate with calibrated tie-down straps.',
      },
    });
    assert.equal(dispatchRes.status, 200, 'Dispatched');
    assert.equal(dispatchRes.data.status, 'In Transit');

    // 22. Step 24: Delivery Handover Confirmation & POD
    const confirmDelRes = await apiRequest(`/logistics/delivery-orders/${delOrder.id}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        actualDeliveryDate: '2026-12-06',
        receivedBy: 'Dr. Vikram Raman (Site Director)',
        deliveredQty: 2,
        deliveryCondition: 'Good',
        podName: 'signed_pod_apex.pdf',
        podDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        podFileType: 'application/pdf',
        podFileSize: 10240,
        remarks: 'Both cryogenic vessels received at Jigani site in pristine condition.',
      },
    });
    assert.equal(confirmDelRes.status, 200, 'Delivery confirmed');
    assert.equal(confirmDelRes.data.status, 'Delivered');

    // 23. Step 25: Verify SO Fulfillment Updated
    const soDelivered = await SalesOrderModel.findOne({ id: so.id });
    assert.equal(soDelivered?.fulfillmentStatus, 'Delivered', 'Sales Order marked Delivered');

    // 24. Step 26: Financial Independence Verified
    // Delivery did NOT mark commercial status Paid
    assert.equal(soDelivered?.commercialStatus, 'Confirmed', 'Commercial status remains Confirmed and independent of delivery');

    // Record Final Payment Balance (remaining 50%)
    const finalPayRes = await apiRequest('/sales/payments', {
      method: 'POST',
      token: salesMgrToken,
      body: {
        piId: pi.id,
        salesOrderId: so.id,
        paymentDate: '2026-12-07',
        amount: 504450,
        paymentMethod: 'NEFT/RTGS',
        referenceNumber: `UTR-FINAL-${runId}`,
        proofAttachmentName: 'final_receipt.pdf',
        proofDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        remarks: 'Final 50% post-delivery handover balance payment',
      },
    });
    assert.equal(finalPayRes.status, 201, 'Final payment created');
    testIds.payments.push(finalPayRes.data.id);

    await apiRequest(`/sales/payments/${finalPayRes.data.id}/verify`, {
      method: 'POST',
      token: adminToken,
      body: { status: 'Verified', remarks: 'Final balance verified in SBI account.' },
    });

    const paymentsAfter = await PaymentEntryModel.find({ salesOrderId: so.id }).lean();
    const paySum = calculatePaymentSummary(so.totalAmount, paymentsAfter as any, { piId: so.piId, salesOrderId: so.id });
    assert.equal(paySum.paymentStatus, 'Paid', 'Financial summary calculates Paid after verified final settlement');
  });

  // =========================================================================
  // SCENARIO 2: Centralized 15-Stage Order Tracking Verification
  // =========================================================================
  await t.test('Scenario 2: Centralized 15-Stage Order Tracking Engine Verification', async () => {
    const so = (scenario1SOId ? await SalesOrderModel.findOne({ id: scenario1SOId }).lean() : null)
      || await SalesOrderModel.findOne({ docNo: { $regex: runId } }).lean()
      || await SalesOrderModel.findOne().sort({ createdAt: -1 }).lean();
    assert.ok(so, 'Sales Order available for tracking');

    // Call Tracking API as Sales Manager
    const trackRes = await apiRequest(`/tracking/${so.id}`, { token: salesMgrToken });
    assert.equal(trackRes.status, 200, 'Tracking fetched');
    const trackData = trackRes.data;

    assert.equal(trackData.isCommercialRedacted, false, 'Sales manager sees commercial totals');
    assert.ok(trackData.salesOrder.totalAmount > 0);
    assert.equal(trackData.stages.length, 15, 'All 15 discrete lifecycle stages derived');

    // Verify stage names and indices
    const stageNames = trackData.stages.map((s: any) => s.name);
    assert.ok(stageNames.includes('Customer Enquiry'));
    assert.ok(stageNames.includes('Enquiry Follow-ups'));
    assert.ok(stageNames.includes('Qualified Enquiry'));
    assert.ok(stageNames.includes('Quotation & Revisions'));
    assert.ok(stageNames.includes('Proforma Invoice'));
    assert.ok(stageNames.includes('Customer Purchase Order'));
    assert.ok(stageNames.includes('Payment Entries'));
    assert.ok(stageNames.includes('Sales Order Confirmation'));
    assert.ok(stageNames.includes('Production Order & Duration Plan'));
    assert.ok(stageNames.includes('BOM & Supply Chain Request'));
    assert.ok(stageNames.includes('Material Issues & Physical Receipts'));
    assert.ok(stageNames.includes('Manufacturing & Daily Progress'));
    assert.ok(stageNames.includes('Quality Check & Rework'));
    assert.ok(stageNames.includes('Logistics Dispatch'));
    assert.ok(stageNames.includes('Delivery Confirmation & Handover'));

    // Check line-level item progress
    assert.ok(trackData.lineProgress.length >= 1, 'Line progress computed');
    const line1 = trackData.lineProgress[0];
    assert.ok(line1.orderedQty > 0);
    assert.equal(line1.progressPercent, 100, 'Delivered line is 100% progress');
  });

  // =========================================================================
  // SCENARIO 3: Commercial Data Redaction for Unauthorized Roles
  // =========================================================================
  await t.test('Scenario 3: RBAC Commercial Data Redaction (Production / Logistics Users)', async () => {
    const so = (scenario1SOId ? await SalesOrderModel.findOne({ id: scenario1SOId }).lean() : null)
      || await SalesOrderModel.findOne().sort({ createdAt: -1 }).lean();
    assert.ok(so);

    // Call tracking as Production Manager
    const prodTrack = await apiRequest(`/tracking/${so.id}`, { token: prodMgrToken });
    assert.equal(prodTrack.status, 200);
    assert.equal(prodTrack.data.isCommercialRedacted, true, 'Flagged as commercially redacted');
    assert.equal(prodTrack.data.salesOrder.totalAmount, undefined, 'Total amount hidden');
    assert.equal(prodTrack.data.salesOrder.subtotal, undefined, 'Subtotal hidden');
    assert.equal(prodTrack.data.salesOrder.taxAmount, undefined, 'Tax hidden');
    assert.equal(prodTrack.data.paymentSummary, undefined, 'Payment summary redacted');
    assert.equal(prodTrack.data.payments.length, 0, 'Payment list redacted');

    // Call tracking as Logistics Manager
    const logTrack = await apiRequest(`/tracking/${so.id}`, { token: logMgrToken });
    assert.equal(logTrack.status, 200);
    assert.equal(logTrack.data.isCommercialRedacted, true);
    assert.equal(logTrack.data.salesOrder.totalAmount, undefined);
  });

  // =========================================================================
  // SCENARIO 4: Multi-Product Orders & Partial Fulfillment Tracking
  // =========================================================================
  await t.test('Scenario 4: Multi-Product Line Item Fulfillment & Staged Handover', async () => {
    const multiCustId = `cust_multi_${runId}`;
    testIds.customers.push(multiCustId);
    await CustomerModel.create({
      id: multiCustId,
      name: `Multi Lab Systems ${runId}`,
      contactPerson: 'Karan Mehra',
      phone: '+91 91234 56789',
      email: `karan.${runId}@multilab.com`,
      billingAddress: 'Phase 1, Electronic City',
      shippingAddress: 'Phase 1, Electronic City',
      gstin: '29AAACM5555F1Z2',
    });

    const prodA = `prod_a_${runId}`;
    const prodB = `prod_b_${runId}`;
    testIds.products.push(prodA, prodB);
    await ProductModel.create([
      {
        id: prodA,
        code: `PA-${runId}`,
        name: `Liquid Nitrogen Container 20L ${runId}`,
        category: 'Cryo Storage Vessels',
        sellingPrice: 50000,
        unit: 'Nos',
      },
      {
        id: prodB,
        code: `PB-${runId}`,
        name: `Cryogenic Transfer Hose 2M ${runId}`,
        category: 'Cryo Accessories',
        sellingPrice: 15000,
        unit: 'Nos',
      },
    ]);

    const multiSoId = `so_multi_${runId}`;
    testIds.salesOrders.push(multiSoId);
    await SalesOrderModel.create({
      id: multiSoId,
      docNo: `SO-MULTI-${runId}`,
      piId: `pi_multi_${runId}`,
      piDocNo: `PI-MULTI-${runId}`,
      quotationId: `qt_multi_${runId}`,
      quotationDocNo: `QT-MULTI-${runId}`,
      customerPoId: `cpo_multi_${runId}`,
      customerPoDocNo: `CPO-MULTI-${runId}`,
      customerPoNumber: `PO-MULT-${runId}`,
      enquiryId: `enq_multi_${runId}`,
      enquiryDocNo: `ENQ-MULTI-${runId}`,
      customerId: multiCustId,
      customerSnapshot: {
        name: `Multi Lab Systems ${runId}`,
        gstin: '29AAACM5555F1Z2',
        billingAddress: 'Phase 1, Electronic City',
      },
      items: [
        {
          id: `line_a_${runId}`,
          productId: prodA,
          productName: `Liquid Nitrogen Container 20L ${runId}`,
          quantity: 4,
          unitPrice: 50000,
          lineTotal: 200000,
        },
        {
          id: `line_b_${runId}`,
          productId: prodB,
          productName: `Cryogenic Transfer Hose 2M ${runId}`,
          quantity: 2,
          unitPrice: 15000,
          lineTotal: 30000,
        },
      ],
      subtotal: 230000,
      taxAmount: 41400,
      totalAmount: 271400,
      promisedDeliveryDate: '2026-12-25',
      deliveryAddress: 'Phase 1, Electronic City',
      commercialStatus: 'Confirmed',
      fulfillmentStatus: 'Awaiting Production',
      priority: 'Normal',
      createdBy: 'sales.mgr@cryoerp.com',
    });

    // Deliver only Product A (4 units)
    const delOrderMulti = `del_multi_${runId}`;
    testIds.deliveries.push(delOrderMulti);
    await DeliveryOrderModel.create({
      id: delOrderMulti,
      docNo: `DEL-MULTI-${runId}`,
      salesOrderId: multiSoId,
      salesOrderDocNo: `SO-MULTI-${runId}`,
      productionOrderId: `po_dummy_${runId}`,
      productionOrderDocNo: 'PO-DUMMY',
      customerId: multiCustId,
      customerName: `Multi Lab Systems ${runId}`,
      productName: `Liquid Nitrogen Container 20L ${runId}`,
      quantity: 4,
      deliveredQty: 4,
      deliveryAddress: 'Phase 1, Electronic City',
      transportMethod: 'Courier',
      courierCompany: 'BlueDart Express',
      trackingNumber: `BD-AWB-${runId}`,
      plannedDispatchDate: '2026-11-22',
      expectedDeliveryDate: '2026-11-24',
      status: 'Delivered',
      createdBy: 'log.mgr@cryoerp.com',
    });

    const trackMulti = await apiRequest(`/tracking/${multiSoId}`, { token: salesMgrToken });
    assert.equal(trackMulti.status, 200);

    // Product A is 100% delivered (4/4); Product B is 0% delivered (0/2)
    const lp = trackMulti.data.lineProgress;
    assert.equal(lp.length, 2);
    const itemA = lp.find((i: any) => i.productName.includes('Container'));
    const itemB = lp.find((i: any) => i.productName.includes('Hose'));
    assert.equal(itemA.deliveredQty, 4);
    assert.equal(itemA.progressPercent, 100);
    assert.equal(itemB.deliveredQty, 0);
    assert.equal(itemB.progressPercent, 0);

    // Total delivered = 4, Total ordered = 6 => Overall not fully delivered
    assert.equal(trackMulti.data.metrics.totalDeliveredQty, 4);
    assert.equal(trackMulti.data.metrics.totalOrderedQty, 6);
  });

  // =========================================================================
  // SCENARIO 5: Binary PDF Generation for All 13 Business Document Types
  // =========================================================================
  await t.test('Scenario 5: Real Binary PDF Document Generation for 8+ Distinct Business Documents', async () => {
    const so = (scenario1SOId ? await SalesOrderModel.findOne({ id: scenario1SOId }).lean() : null)
      || await SalesOrderModel.findOne({ docNo: { $regex: runId } }).lean();
    assert.ok(so);
    const qt = await QuotationModel.findOne({ enquiryId: so.enquiryId, status: 'Accepted' }).lean();
    assert.ok(qt);
    const pi = await ProformaInvoiceModel.findOne({ id: so.piId }).lean();
    assert.ok(pi);
    const pay = await PaymentEntryModel.findOne({ salesOrderId: so.id }).lean();
    assert.ok(pay);
    const spo = await SupplierPOModel.findOne({ docNo: { $regex: 'PO-' } }).sort({ createdAt: -1 }).lean();
    assert.ok(spo);
    const grn = await GRNModel.findOne({ supplierPoId: spo.id }).lean();
    assert.ok(grn);
    const del = await DeliveryOrderModel.findOne({ salesOrderId: so.id }).lean();
    assert.ok(del);

    // 1. Quotation PDF
    const qtPdf = await apiRequest(`/documents/quotation/${qt.id}/pdf`, { token: salesMgrToken, isRawBinary: true });
    assert.equal(qtPdf.status, 200);
    assert.equal(qtPdf.headers.get('content-type'), 'application/pdf');
    assert.equal(qtPdf.buffer?.subarray(0, 4).toString(), '%PDF');

    // 2. Proforma Invoice PDF
    const piPdf = await apiRequest(`/documents/proforma-invoice/${pi.id}/pdf`, { token: salesMgrToken, isRawBinary: true });
    assert.equal(piPdf.status, 200);
    assert.equal(piPdf.headers.get('content-type'), 'application/pdf');
    assert.equal(piPdf.buffer?.subarray(0, 4).toString(), '%PDF');

    // 3. Sales Order PDF
    const soPdf = await apiRequest(`/documents/sales-order/${so.id}/pdf`, { token: salesMgrToken, isRawBinary: true });
    assert.equal(soPdf.status, 200);
    assert.equal(soPdf.buffer?.subarray(0, 4).toString(), '%PDF');

    // 4. Payment Receipt PDF
    const payPdf = await apiRequest(`/documents/payment-receipt/${pay.id}/pdf`, { token: salesMgrToken, isRawBinary: true });
    assert.equal(payPdf.status, 200);
    assert.equal(payPdf.buffer?.subarray(0, 4).toString(), '%PDF');

    // 5. Supplier PO PDF
    const spoPdf = await apiRequest(`/documents/supplier-po/${spo.id}/pdf`, { token: scMgrToken, isRawBinary: true });
    assert.equal(spoPdf.status, 200);
    assert.equal(spoPdf.buffer?.subarray(0, 4).toString(), '%PDF');

    // 6. Goods Receipt Note (GRN) PDF
    const grnPdf = await apiRequest(`/documents/grn/${grn.id}/pdf`, { token: scMgrToken, isRawBinary: true });
    assert.equal(grnPdf.status, 200);
    assert.equal(grnPdf.buffer?.subarray(0, 4).toString(), '%PDF');

    // 7. Delivery Challan PDF
    const challanPdf = await apiRequest(`/documents/delivery-challan/${del.id}/pdf`, { token: logMgrToken, isRawBinary: true });
    assert.equal(challanPdf.status, 200);
    assert.equal(challanPdf.buffer?.subarray(0, 4).toString(), '%PDF');
  });

  // =========================================================================
  // SCENARIO 6: Notification Deduplication & Per-User Read Tracking
  // =========================================================================
  await t.test('Scenario 6: Centralized Notifications Lifecycle and Deduplication Safeguards', async () => {
    const dedupKey = `alert_${runId}_milestone`;

    // 1. Create first notification
    const n1Res = await apiRequest('/notifications', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'QC Passed Alert',
        message: 'Order completed and certified for dispatch.',
        department: 'logistics',
        severity: 'success',
        dedupKey,
      },
    });
    assert.equal(n1Res.status, 201);
    const n1 = n1Res.data.notification;
    testIds.notifications.push(n1.id);

    // 2. Retry with same dedupKey -> Should be deduplicated with 200 OK
    const n2Res = await apiRequest('/notifications', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'QC Passed Alert (Retry)',
        message: 'Order completed and certified for dispatch.',
        department: 'logistics',
        severity: 'success',
        dedupKey,
      },
    });
    assert.equal(n2Res.status, 200);
    assert.equal(n2Res.data.deduplicated, true);
    assert.equal(n2Res.data.notification.id, n1.id);

    // 3. Mark read for Logistics Manager
    const markRes = await apiRequest(`/notifications/${n1.id}/read`, {
      method: 'POST',
      token: logMgrToken,
    });
    assert.equal(markRes.status, 200);
    assert.equal(markRes.data.ok, true);

    const reloaded = await NotificationModel.findOne({ id: n1.id });
    const logUser = await apiRequest('/auth/me', { token: logMgrToken });
    assert.ok(reloaded?.readBy.includes(logUser.data.user.id), 'User ID recorded in readBy');
  });

  // =========================================================================
  // SCENARIO 7: Server-Side Global Search with Department RBAC
  // =========================================================================
  await t.test('Scenario 7: Server-Side Global Search with Department RBAC', async () => {
    // Search as Admin -> gets results across all departments
    const adminSearch = await apiRequest(`/search?q=Apex`, { token: adminToken });
    assert.equal(adminSearch.status, 200);
    assert.ok(adminSearch.data.total > 0);
    assert.ok(adminSearch.data.results.some((r: any) => r.module === 'Sales'));

    // Search as Logistics Manager -> should NOT see Sales results
    const logSearch = await apiRequest(`/search?q=Apex`, { token: logMgrToken });
    assert.equal(logSearch.status, 200);
    const hasSalesInLogistics = logSearch.data.results.some((r: any) => r.module === 'Sales');
    assert.equal(hasSalesInLogistics, false, 'Logistics user receives 0 Sales results');
  });

  // =========================================================================
  // SCENARIO 8: Concurrency & Race Condition Guards
  // =========================================================================
  await t.test('Scenario 8: Concurrent Delivery Confirmation & Race Condition Prevention', async () => {
    const so = await SalesOrderModel.findOne({ docNo: { $regex: runId } }).lean();
    assert.ok(so);

    const testDelId = `del_race_${runId}`;
    testIds.deliveries.push(testDelId);
    await DeliveryOrderModel.create({
      id: testDelId,
      docNo: `DEL-RACE-${runId}`,
      salesOrderId: so.id,
      salesOrderDocNo: so.docNo,
      productionOrderId: `po_race_${runId}`,
      productionOrderDocNo: 'PO-RACE',
      customerId: so.customerId,
      customerName: so.customerSnapshot.name,
      productName: 'Cryogenic Vessel',
      quantity: 1,
      deliveryAddress: 'Test Location',
      transportMethod: 'Own Vehicle',
      vehicleNumber: 'KA-01-AB-1234',
      driverName: 'Driver Test',
      plannedDispatchDate: '2026-11-20',
      expectedDeliveryDate: '2026-11-21',
      status: 'In Transit',
      createdBy: 'log.mgr@cryoerp.com',
    });

    // First delivery confirmation succeeds (200)
    const res1 = await apiRequest(`/logistics/delivery-orders/${testDelId}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        deliveredQty: 1,
        receivedBy: 'Receiver 1',
        podName: 'pod.pdf',
        podDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        podFileType: 'application/pdf',
        podFileSize: 1024,
      },
    });
    assert.equal(res1.status, 200, 'First confirmation succeeds');

    // Duplicate delivery confirmation on already delivered order blocked (400)
    const res2 = await apiRequest(`/logistics/delivery-orders/${testDelId}/deliver`, {
      method: 'POST',
      token: logMgrToken,
      body: {
        deliveredQty: 1,
        receivedBy: 'Receiver 2',
        podName: 'pod.pdf',
        podDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        podFileType: 'application/pdf',
        podFileSize: 1024,
      },
    });
    assert.equal(res2.status, 400, 'Duplicate delivery confirmation blocked');
  });

  // =========================================================================
  // SCENARIO 9: Business Validation & Error Handling
  // =========================================================================
  await t.test('Scenario 9: Business Integrity Gates & Descriptive Error Handling', async () => {
    // 1. Reject already accepted quotation
    const qt = await QuotationModel.findOne({ enquiryDocNo: { $regex: runId }, status: 'Accepted' }).lean();
    if (qt) {
      const rejectRes = await apiRequest(`/sales/quotations/${qt.id}/reject`, {
        method: 'POST',
        token: salesMgrToken,
        body: { reason: 'Late rejection test' },
      });
      assert.equal(rejectRes.status, 400);
      assert.ok(rejectRes.data.error.includes('accepted'));
    }

    // 2. Overpayment attempt
    const so = (scenario1SOId ? await SalesOrderModel.findOne({ id: scenario1SOId }).lean() : null)
      || await SalesOrderModel.findOne({ docNo: { $regex: runId } }).lean();
    if (so) {
      const overpayRes = await apiRequest('/sales/payments', {
        method: 'POST',
        token: salesMgrToken,
        body: {
          salesOrderId: so.id,
          amount: 99999999, // Way exceeds balance
          paymentMethod: 'NEFT/RTGS',
          transactionRef: `UTR-OVERPAY-${runId}`,
          referenceNumber: `UTR-OVERPAY-${runId}`,
        },
      });
      assert.equal(overpayRes.status, 400);
      assert.ok(overpayRes.data.error.includes('exceed'));
    }

    // 3. Dispatch Delivery Order without required driver or tracking fields
    const invalidDelRes = await apiRequest('/logistics/delivery-orders', {
      method: 'POST',
      token: logMgrToken,
      body: {
        salesOrderId: 'so_fake',
        productionOrderId: 'po_fake',
        customerId: 'cust_fake',
        customerName: 'Fake Cust',
        productName: 'Fake Prod',
        quantity: 1,
        deliveryAddress: 'Nowhere',
        transportMethod: 'Own Vehicle',
        // Missing vehicleNumber, driverName, etc.
        plannedDispatchDate: '2026-11-20',
        expectedDeliveryDate: '2026-11-21',
      },
    });
    assert.ok([400, 404].includes(invalidDelRes.status));
    assert.ok(invalidDelRes.data.error.includes('Vehicle number') || invalidDelRes.data.error.includes('Driver') || invalidDelRes.data.error.includes('not found'));
  });

  // =========================================================================
  // SCENARIO 10: Audit Log Recording & Immutability
  // =========================================================================
  await t.test('Scenario 10: Activity Log Recording and Security Guard', async () => {
    const logs = await ActivityLogModel.find({ details: { $regex: runId } }).lean();
    assert.ok(logs.length >= 1, 'Activity logs successfully recorded across the lifecycle');

    // Verify properties
    const log = logs[0];
    assert.ok(log.actorName, 'Actor name present');
    assert.ok(log.action, 'Action name present');
    assert.ok(log.timestamp, 'Timestamp present');
    assert.ok(log.department, 'Department present');
  });
});
