import fs from 'fs';
import path from 'path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  ActivityLogModel,
  BOMModel,
  CompanySettingsModel,
  CustomerModel,
  CustomerPOModel,
  DailyProductionUpdateModel,
  DeliveryIssueModel,
  DeliveryOrderModel,
  DocCounterModel,
  EmployeeModel,
  EnquiryModel,
  FollowUpModel,
  GRNModel,
  MaterialIssueModel,
  MaterialModel,
  MaterialRequestModel,
  NotificationModel,
  PaymentEntryModel,
  ProductModel,
  ProductionOrderModel,
  ProformaInvoiceModel,
  QualityCheckModel,
  QuotationModel,
  ReworkOrderModel,
  RoleModel,
  SalesOrderModel,
  StockTransactionModel,
  SupplierModel,
  SupplierPOModel,
  SupplierReturnModel,
} from '../models';
import type { ERPDatabase } from '../../src/types/erp';

export interface MigrationReport {
  timestamp: string;
  dryRun: boolean;
  backupPath?: string;
  sourceCounts: Record<string, number>;
  migratedCounts: Record<string, number>;
  validationErrors: string[];
  success: boolean;
  durationMs: number;
}

export async function runJsonToMongoMigration(options: { dryRun?: boolean; customUri?: string } = {}): Promise<MigrationReport> {
  const startTime = Date.now();
  const dryRun = Boolean(options.dryRun);
  const dataDir = path.resolve(process.cwd(), 'data');
  const dbFile = path.join(dataDir, 'cryo-erp-db.json');
  const backupDir = path.join(dataDir, 'backups');

  if (!fs.existsSync(dbFile)) {
    throw new Error(`Source JSON database not found at ${dbFile}`);
  }

  // 1. Create Timestamped Backup
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `cryo-erp-db-backup-${timestamp}.json`);
  fs.copyFileSync(dbFile, backupFile);

  const raw = fs.readFileSync(dbFile, 'utf-8');
  const jsonDb = JSON.parse(raw) as ERPDatabase;

  const sourceCounts: Record<string, number> = {
    roles: jsonDb.roles?.length || 0,
    employees: jsonDb.employees?.length || 0,
    company: jsonDb.company ? 1 : 0,
    counters: jsonDb.counters ? Object.keys(jsonDb.counters).length : 0,
    customers: jsonDb.customers?.length || 0,
    products: jsonDb.products?.length || 0,
    materials: jsonDb.materials?.length || 0,
    suppliers: jsonDb.suppliers?.length || 0,
    enquiries: jsonDb.enquiries?.length || 0,
    followUps: jsonDb.followUps?.length || 0,
    quotations: jsonDb.quotations?.length || 0,
    proformaInvoices: jsonDb.proformaInvoices?.length || 0,
    customerPOs: jsonDb.customerPOs?.length || 0,
    payments: jsonDb.payments?.length || 0,
    salesOrders: jsonDb.salesOrders?.length || 0,
    materialRequests: jsonDb.materialRequests?.length || 0,
    materialIssues: jsonDb.materialIssues?.length || 0,
    supplierPOs: jsonDb.supplierPOs?.length || 0,
    grns: jsonDb.grns?.length || 0,
    supplierReturns: jsonDb.supplierReturns?.length || 0,
    stockTransactions: jsonDb.stockTransactions?.length || 0,
    productionOrders: jsonDb.productionOrders?.length || 0,
    boms: jsonDb.boms?.length || 0,
    dailyUpdates: jsonDb.dailyUpdates?.length || 0,
    qualityChecks: jsonDb.qualityChecks?.length || 0,
    reworkOrders: jsonDb.reworkOrders?.length || 0,
    deliveryOrders: jsonDb.deliveryOrders?.length || 0,
    deliveryIssues: jsonDb.deliveryIssues?.length || 0,
    notifications: jsonDb.notifications?.length || 0,
    activityLogs: jsonDb.activityLogs?.length || 0,
  };

  const validationErrors: string[] = [];

  // Validation Checks on Source
  if (!jsonDb.employees || jsonDb.employees.length === 0) {
    validationErrors.push('Source database has no employee records.');
  }
  if (!jsonDb.roles || jsonDb.roles.length === 0) {
    validationErrors.push('Source database has no role records.');
  }

  // Check duplicate IDs in critical collections
  function checkDuplicateIds(items: Array<{ id: string }>, name: string) {
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.id)) {
        validationErrors.push(`Duplicate ID ${it.id} detected in collection ${name}`);
      }
      seen.add(it.id);
    }
  }

  checkDuplicateIds(jsonDb.employees || [], 'employees');
  checkDuplicateIds(jsonDb.customers || [], 'customers');
  checkDuplicateIds(jsonDb.products || [], 'products');
  checkDuplicateIds(jsonDb.salesOrders || [], 'salesOrders');
  checkDuplicateIds(jsonDb.materials || [], 'materials');

  if (validationErrors.length > 0) {
    return {
      timestamp: new Date().toISOString(),
      dryRun,
      backupPath: backupFile,
      sourceCounts,
      migratedCounts: {},
      validationErrors,
      success: false,
      durationMs: Date.now() - startTime,
    };
  }

  if (dryRun) {
    return {
      timestamp: new Date().toISOString(),
      dryRun: true,
      backupPath: backupFile,
      sourceCounts,
      migratedCounts: sourceCounts,
      validationErrors: [],
      success: true,
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Connect to MongoDB
  await connectDatabase(options.customUri);

  const migratedCounts: Record<string, number> = {};

  async function upsertCollection<T extends { id?: string; key?: string }>(
    model: any,
    items: T[],
    keyField = 'id',
  ): Promise<number> {
    let count = 0;
    for (const item of items) {
      const filter: any = {};
      filter[keyField] = (item as any)[keyField];
      await model.findOneAndUpdate(filter, item, { upsert: true, returnDocument: 'after' });
      count++;
    }
    return count;
  }

  // Sequenced Migration Operations
  migratedCounts.roles = await upsertCollection(RoleModel, jsonDb.roles || []);
  migratedCounts.employees = await upsertCollection(EmployeeModel, jsonDb.employees || []);

  if (jsonDb.company) {
    await CompanySettingsModel.findOneAndUpdate({ id: 'company' }, { ...jsonDb.company, id: 'company' }, { upsert: true });
    migratedCounts.company = 1;
  }

  // Doc Counters
  if (jsonDb.counters) {
    const counterItems = Object.entries(jsonDb.counters).map(([key, value]) => ({ key, value }));
    migratedCounts.counters = await upsertCollection(DocCounterModel, counterItems, 'key');
  }

  migratedCounts.customers = await upsertCollection(CustomerModel, jsonDb.customers || []);
  migratedCounts.products = await upsertCollection(ProductModel, jsonDb.products || []);
  migratedCounts.materials = await upsertCollection(MaterialModel, jsonDb.materials || []);
  migratedCounts.suppliers = await upsertCollection(SupplierModel, jsonDb.suppliers || []);
  migratedCounts.enquiries = await upsertCollection(EnquiryModel, jsonDb.enquiries || []);
  migratedCounts.followUps = await upsertCollection(FollowUpModel, jsonDb.followUps || []);
  migratedCounts.quotations = await upsertCollection(QuotationModel, jsonDb.quotations || []);
  migratedCounts.proformaInvoices = await upsertCollection(ProformaInvoiceModel, jsonDb.proformaInvoices || []);
  migratedCounts.customerPOs = await upsertCollection(CustomerPOModel, jsonDb.customerPOs || []);
  migratedCounts.payments = await upsertCollection(PaymentEntryModel, jsonDb.payments || []);
  migratedCounts.salesOrders = await upsertCollection(SalesOrderModel, jsonDb.salesOrders || []);
  migratedCounts.productionOrders = await upsertCollection(ProductionOrderModel, jsonDb.productionOrders || []);
  migratedCounts.boms = await upsertCollection(BOMModel, jsonDb.boms || []);
  migratedCounts.materialRequests = await upsertCollection(MaterialRequestModel, jsonDb.materialRequests || []);
  migratedCounts.materialIssues = await upsertCollection(MaterialIssueModel, jsonDb.materialIssues || []);
  migratedCounts.supplierPOs = await upsertCollection(SupplierPOModel, jsonDb.supplierPOs || []);
  migratedCounts.grns = await upsertCollection(GRNModel, jsonDb.grns || []);
  migratedCounts.supplierReturns = await upsertCollection(SupplierReturnModel, jsonDb.supplierReturns || []);
  migratedCounts.stockTransactions = await upsertCollection(StockTransactionModel, jsonDb.stockTransactions || []);
  migratedCounts.dailyUpdates = await upsertCollection(DailyProductionUpdateModel, jsonDb.dailyUpdates || []);
  migratedCounts.qualityChecks = await upsertCollection(QualityCheckModel, jsonDb.qualityChecks || []);
  migratedCounts.reworkOrders = await upsertCollection(ReworkOrderModel, jsonDb.reworkOrders || []);
  migratedCounts.deliveryOrders = await upsertCollection(DeliveryOrderModel, jsonDb.deliveryOrders || []);
  migratedCounts.deliveryIssues = await upsertCollection(DeliveryIssueModel, jsonDb.deliveryIssues || []);
  migratedCounts.notifications = await upsertCollection(NotificationModel, jsonDb.notifications || []);
  migratedCounts.activityLogs = await upsertCollection(ActivityLogModel, jsonDb.activityLogs || []);

  const durationMs = Date.now() - startTime;

  return {
    timestamp: new Date().toISOString(),
    dryRun: false,
    backupPath: backupFile,
    sourceCounts,
    migratedCounts,
    validationErrors: [],
    success: true,
    durationMs,
  };
}

// CLI Execution entrypoint
const isMain = process.argv[1] && (process.argv[1].endsWith('migrateJsonToMongo.ts') || process.argv[1].endsWith('migrateJsonToMongo.js'));
if (isMain) {
  const isDry = process.argv.includes('--dry-run') || process.argv.includes('-d');
  console.log(`[Migration] Starting JSON-to-MongoDB migration (Dry Run: ${isDry})...`);
  runJsonToMongoMigration({ dryRun: isDry })
    .then((report) => {
      console.log('--------------------------------------------------');
      console.log(`[Migration] Result: ${report.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`[Migration] Duration: ${report.durationMs}ms`);
      console.log(`[Migration] Backup created: ${report.backupPath}`);
      console.log('[Migration] Source Counts vs Migrated Counts:');
      for (const [col, sCount] of Object.entries(report.sourceCounts)) {
        console.log(`  - ${col.padEnd(20)}: source=${sCount}, migrated=${report.migratedCounts[col] ?? 0}`);
      }
      if (report.validationErrors.length > 0) {
        console.error('[Migration] Errors:');
        for (const err of report.validationErrors) {
          console.error(`  ! ${err}`);
        }
      }
      console.log('--------------------------------------------------');
      return disconnectDatabase().then(() => {
        process.exit(report.success ? 0 : 1);
      });
    })
    .catch((err) => {
      console.error('[Migration FATAL ERROR]:', err);
      process.exit(1);
    });
}
