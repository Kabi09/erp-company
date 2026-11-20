process.env.NODE_ENV = 'test';
process.env.NO_AUTO_START = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, disconnectDatabase, withTransaction } from '../config/database';
import {
  CustomerModel,
  DocCounterModel,
  EmployeeModel,
  MaterialModel,
  ProductModel,
  RoleModel,
  SalesOrderModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';

test('CRYO ERP 2.0 MongoDB Integration and Optimization Test Suite', async (t) => {
  await connectDatabase();

  await t.test('1. MongoDB Connection and Ping Verification', async () => {
    const isConn = await connectDatabase();
    assert.ok(isConn);
    const count = await RoleModel.countDocuments();
    assert.ok(count >= 6, `Expected at least 6 roles in MongoDB, found ${count}`);
  });

  await t.test('2. Atomic Document Numbering via $inc', async () => {
    const doc1 = await mongoERPRepository.getNextDocNo('ENQ');
    const doc2 = await mongoERPRepository.getNextDocNo('ENQ');
    assert.ok(doc1.startsWith('ENQ-'));
    assert.ok(doc2.startsWith('ENQ-'));
    const num1 = parseInt(doc1.split('-')[1], 10);
    const num2 = parseInt(doc2.split('-')[1], 10);
    assert.equal(num2, num1 + 1, 'Document numbers must increment sequentially');
  });

  await t.test('3. Schema Validation and Unique Constraints', async () => {
    // Unique Material code constraint
    const matCode = `TEST-MAT-${Date.now()}`;
    await MaterialModel.create({
      id: `mat-test-${Date.now()}-1`,
      code: matCode,
      name: 'Test Constraint Material',
      category: 'Electronics',
      unit: 'Nos',
    });

    let threwDuplicate = false;
    try {
      await MaterialModel.create({
        id: `mat-test-${Date.now()}-2`,
        code: matCode,
        name: 'Duplicate Material',
        category: 'Electronics',
        unit: 'Nos',
      });
    } catch (err: any) {
      threwDuplicate = err.code === 11000 || err.message.includes('duplicate key');
    }
    assert.ok(threwDuplicate, 'Duplicate material code must be rejected by unique index');

    // Clean up test material
    await MaterialModel.deleteMany({ code: matCode });
  });

  await t.test('4. Paginated REST Queries', async () => {
    const enquiries = await mongoERPRepository.getPaginatedEnquiries({ page: 1, limit: 3 });
    assert.ok(Array.isArray(enquiries.items));
    assert.ok(enquiries.total >= 0);
    assert.equal(enquiries.page, 1);
    assert.equal(enquiries.limit, 3);
    assert.ok(enquiries.items.length <= 3);

    const materials = await mongoERPRepository.getPaginatedMaterials({ page: 1, limit: 5 });
    assert.ok(Array.isArray(materials.items));
    assert.ok(materials.total >= 8);

    const quotations = await mongoERPRepository.getPaginatedQuotations({ page: 1, limit: 4 });
    assert.ok(Array.isArray(quotations.items));

    const salesOrders = await mongoERPRepository.getPaginatedSalesOrders({ page: 1, limit: 4 });
    assert.ok(Array.isArray(salesOrders.items));

    const deliveryOrders = await mongoERPRepository.getPaginatedDeliveryOrders({ page: 1, limit: 4 });
    assert.ok(Array.isArray(deliveryOrders.items));
  });

  await t.test('5. Lightweight Dropdown Options Projections', async () => {
    const customers = await mongoERPRepository.getCustomerOptions();
    assert.ok(Array.isArray(customers));
    assert.ok(customers.length > 0);
    assert.ok(customers[0].id);
    assert.ok(customers[0].name);

    const products = await mongoERPRepository.getProductOptions();
    assert.ok(Array.isArray(products));
    assert.ok(products.length > 0);
    assert.ok(products[0].id);
    assert.ok(products[0].name);
    assert.ok(typeof products[0].sellingPrice === 'number');

    const materials = await mongoERPRepository.getMaterialOptions();
    assert.ok(Array.isArray(materials));
    assert.ok(materials.length > 0);
    assert.ok(materials[0].code);

    const suppliers = await mongoERPRepository.getSupplierOptions();
    assert.ok(Array.isArray(suppliers));
    assert.ok(suppliers.length > 0);
    assert.ok(suppliers[0].name);
  });

  await t.test('6. Department Dashboard Summary Calculations', async () => {
    const salesSummary = await mongoERPRepository.getSalesSummary();
    assert.ok(typeof salesSummary.totalEnquiries === 'number');
    assert.ok(typeof salesSummary.totalRevenue === 'number');

    const scSummary = await mongoERPRepository.getSupplyChainSummary();
    assert.ok(typeof scSummary.totalMaterials === 'number');
    assert.ok(typeof scSummary.lowStockCount === 'number');

    const prodSummary = await mongoERPRepository.getProductionSummary();
    assert.ok(typeof prodSummary.totalProductionOrders === 'number');

    const logSummary = await mongoERPRepository.getLogisticsSummary();
    assert.ok(typeof logSummary.totalDeliveryOrders === 'number');
  });

  await t.test('7. Multi-Document Transaction Abstraction (withTransaction)', async () => {
    const res = await withTransaction(async (session) => {
      const counter = await DocCounterModel.findOne({ key: 'SO' }).session(session);
      return counter ? counter.value : 0;
    });
    assert.ok(typeof res === 'number');
  });

  await disconnectDatabase();
});
