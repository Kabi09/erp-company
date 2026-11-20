/**
 * CRYO Enterprise ERP 2.0 — MongoDB Data Migration Strategy & Verification Plan (Phase 3 Preparation)
 *
 * This module specifies:
 * 1. Extraction from data/cryo-erp-db.json.
 * 2. Referential integrity validation before insertion.
 * 3. Atomic document insertion ordering to respect parent-child foreign key constraints.
 * 4. Index creation and counter synchronization.
 * 5. Dry-run verification script.
 */

import { MONGO_COLLECTIONS_SPEC } from '../models/mongoSchemas';

export interface MigrationStep {
  order: number;
  collection: string;
  sourceKey: string;
  description: string;
  validationRules: string[];
}

export const MIGRATION_EXECUTION_SEQUENCE: MigrationStep[] = [
  {
    order: 1,
    collection: 'roles',
    sourceKey: 'roles',
    description: 'Insert RBAC roles with module-action permissions maps',
    validationRules: ['Each role must have unique id and name', 'Permissions map must be valid JSON'],
  },
  {
    order: 2,
    collection: 'employees',
    sourceKey: 'employees',
    description: 'Insert staff members with hashed credentials',
    validationRules: ['roleId must reference an existing role', 'email and employeeId must be unique'],
  },
  {
    order: 3,
    collection: 'company_settings',
    sourceKey: 'company',
    description: 'Insert singleton organization settings and commercial defaults',
    validationRules: ['Single document in collection', 'Tax rates and bank details must be present'],
  },
  {
    order: 4,
    collection: 'doc_counters',
    sourceKey: 'counters',
    description: 'Insert initial document counters for atomic sequencing',
    validationRules: ['All 16 counter prefixes (ENQ, QT, PI, SO, PROD, etc.) initialized'],
  },
  {
    order: 5,
    collection: 'customers',
    sourceKey: 'customers',
    description: 'Insert customer directory with contact and address details',
    validationRules: ['name is required', 'Addresses and GSTIN preserved'],
  },
  {
    order: 6,
    collection: 'products',
    sourceKey: 'products',
    description: 'Insert product catalog with default BOM templates and stages',
    validationRules: ['code must be unique', 'sellingPrice must be non-negative'],
  },
  {
    order: 7,
    collection: 'materials',
    sourceKey: 'materials',
    description: 'Insert raw materials catalog',
    validationRules: ['code must be unique', 'unit must be valid string'],
  },
  {
    order: 8,
    collection: 'suppliers',
    sourceKey: 'suppliers',
    description: 'Insert supplier vendors master',
    validationRules: ['name is required'],
  },
  {
    order: 9,
    collection: 'enquiries',
    sourceKey: 'enquiries',
    description: 'Insert customer enquiries with embedded product line items',
    validationRules: ['customerId must exist', 'items array must have >= 1 line'],
  },
  {
    order: 10,
    collection: 'follow_ups',
    sourceKey: 'followUps',
    description: 'Insert chronological enquiry and quotation follow-ups',
    validationRules: ['entityType and entityId must reference valid enquiry or quotation'],
  },
  {
    order: 11,
    collection: 'quotations',
    sourceKey: 'quotations',
    description: 'Insert quotation revisions (V1, V2, V3)',
    validationRules: ['enquiryId must exist', 'docNo must be unique', 'Totals must be mathematically consistent'],
  },
  {
    order: 12,
    collection: 'proforma_invoices',
    sourceKey: 'proformaInvoices',
    description: 'Insert proforma invoices generated from accepted quotations',
    validationRules: ['quotationId must exist and be Accepted', 'docNo must be unique'],
  },
  {
    order: 13,
    collection: 'customer_pos',
    sourceKey: 'customerPOs',
    description: 'Insert customer purchase orders',
    validationRules: ['piId must exist', 'customerPoNumber is required'],
  },
  {
    order: 14,
    collection: 'payments',
    sourceKey: 'payments',
    description: 'Insert payment receipts',
    validationRules: ['transactionRef must be unique across non-rejected payments', 'amount must be positive'],
  },
  {
    order: 15,
    collection: 'sales_orders',
    sourceKey: 'salesOrders',
    description: 'Insert confirmed sales orders',
    validationRules: ['piId must exist', 'docNo must be unique', 'commercialStatus must be valid'],
  },
  {
    order: 16,
    collection: 'production_orders',
    sourceKey: 'productionOrders',
    description: 'Insert shopfloor production orders',
    validationRules: ['salesOrderId must exist', 'Allocated quantity <= SO quantity'],
  },
  {
    order: 17,
    collection: 'boms',
    sourceKey: 'boms',
    description: 'Insert custom production order BOMs',
    validationRules: ['productionOrderId must exist', 'totalRequiredQty = qtyPerUnit * productionQty'],
  },
  {
    order: 18,
    collection: 'material_requests',
    sourceKey: 'materialRequests',
    description: 'Insert store material requests',
    validationRules: ['bomId must exist', 'productionOrderId must exist'],
  },
  {
    order: 19,
    collection: 'material_issues',
    sourceKey: 'materialIssues',
    description: 'Insert material issue store vouchers',
    validationRules: ['materialRequestId must exist', 'Items issuedQty must be positive'],
  },
  {
    order: 20,
    collection: 'supplier_pos',
    sourceKey: 'supplierPOs',
    description: 'Insert purchase orders to suppliers',
    validationRules: ['supplierId must exist', 'items must be valid materials'],
  },
  {
    order: 21,
    collection: 'grns',
    sourceKey: 'grns',
    description: 'Insert Goods Receipt Notes and inspection verifications',
    validationRules: ['supplierPoId must exist', 'acceptedQty + rejectedQty == receivedQty'],
  },
  {
    order: 22,
    collection: 'supplier_returns',
    sourceKey: 'supplierReturns',
    description: 'Insert debit notes for rejected materials',
    validationRules: ['grnId must exist', 'returnQty <= rejectedQty'],
  },
  {
    order: 23,
    collection: 'stock_transactions',
    sourceKey: 'stockTransactions',
    description: 'Insert immutable stock movement ledger',
    validationRules: ['materialId must exist', 'Balance after must match running delta'],
  },
  {
    order: 24,
    collection: 'daily_updates',
    sourceKey: 'dailyUpdates',
    description: 'Insert floor progress logs',
    validationRules: ['productionOrderId must exist'],
  },
  {
    order: 25,
    collection: 'quality_checks',
    sourceKey: 'qualityChecks',
    description: 'Insert QC inspection attempts',
    validationRules: ['productionOrderId must exist', 'finalResult is Accepted or Rejected'],
  },
  {
    order: 26,
    collection: 'rework_orders',
    sourceKey: 'reworkOrders',
    description: 'Insert corrective action orders',
    validationRules: ['qcId must exist', 'productionOrderId must exist'],
  },
  {
    order: 27,
    collection: 'delivery_orders',
    sourceKey: 'deliveryOrders',
    description: 'Insert delivery orders for QC accepted products',
    validationRules: ['productionOrderId must exist', 'quantity <= qcAcceptedQty'],
  },
  {
    order: 28,
    collection: 'delivery_issues',
    sourceKey: 'deliveryIssues',
    description: 'Insert transit and delivery exception reports',
    validationRules: ['deliveryOrderId must exist'],
  },
  {
    order: 29,
    collection: 'notifications',
    sourceKey: 'notifications',
    description: 'Insert system and department notifications',
    validationRules: ['id is unique'],
  },
  {
    order: 30,
    collection: 'activity_logs',
    sourceKey: 'activityLogs',
    description: 'Insert enterprise audit trail',
    validationRules: ['id is unique'],
  },
];
