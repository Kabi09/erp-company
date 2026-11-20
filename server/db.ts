import fs from 'fs';
import path from 'path';
import type { ActivityLog, Department, DocCounters, ERPDatabase, NotificationItem } from '../src/types/erp';
import { formatDocNo } from '../src/utils/erpLogic';
import { createSeedDatabase } from './seedData';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cryo-erp-db.json');

class ERPDatabaseStore {
  private db: ERPDatabase;

  constructor() {
    this.db = this.load();
  }

  private load(): ERPDatabase {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as ERPDatabase;
        if (parsed && parsed.counters && parsed.employees) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to read persisted ERP DB, re-seeding:', err);
    }
    const seeded = createSeedDatabase();
    this.persist(seeded);
    return seeded;
  }

  private persist(data: ERPDatabase): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_FILE);
  }

  public getState(): ERPDatabase {
    return this.db;
  }

  /**
   * Transactional mutation wrapper: clones state, applies mutation, and atomically writes to disk.
   * If mutation throws, state remains completely unchanged.
   */
  public mutate<T>(fn: (draft: ERPDatabase) => T): T {
    const draft = structuredClone(this.db);
    const result = fn(draft);
    this.persist(draft);
    this.db = draft;
    return result;
  }

  public resetDemoData(clearOperationalOnly = false): ERPDatabase {
    const fresh = createSeedDatabase();
    if (clearOperationalOnly) {
      fresh.enquiries = [];
      fresh.followUps = [];
      fresh.quotations = [];
      fresh.proformaInvoices = [];
      fresh.customerPOs = [];
      fresh.payments = [];
      fresh.salesOrders = [];
      fresh.productionOrders = [];
      fresh.boms = [];
      fresh.materialRequests = [];
      fresh.materialIssues = [];
      fresh.supplierPOs = [];
      fresh.grns = [];
      fresh.supplierReturns = [];
      fresh.dailyUpdates = [];
      fresh.qualityChecks = [];
      fresh.reworkOrders = [];
      fresh.deliveryOrders = [];
      fresh.deliveryIssues = [];
      fresh.notifications = [];
      fresh.activityLogs = [];
      fresh.stockTransactions = fresh.stockTransactions.filter((t) => t.type === 'Opening Balance');
      fresh.counters = {
        ENQ: 0,
        QT: 0,
        PI: 0,
        CPO: 0,
        PAY: 0,
        SO: 0,
        PROD: 0,
        BOM: 0,
        MR: 0,
        SPO: 0,
        GRN: 0,
        MI: 0,
        SR: 0,
        QC: 0,
        RW: 0,
        DEL: 0,
      };
      fresh.company.demoMode = false;
    }
    this.persist(fresh);
    this.db = fresh;
    return this.db;
  }
}

export const dbStore = new ERPDatabaseStore();

export function nextDocNo(draft: ERPDatabase, key: keyof DocCounters): string {
  draft.counters[key] = (draft.counters[key] || 0) + 1;
  return formatDocNo(key, draft.counters[key]);
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function addActivity(
  draft: ERPDatabase,
  params: {
    actorId: string;
    actorName: string;
    department: Department;
    action: string;
    entityType: string;
    entityId: string;
    entityDocNo: string;
    details: string;
  },
): void {
  const entry: ActivityLog = {
    id: generateId('act'),
    ...params,
    timestamp: new Date().toISOString(),
  };
  draft.activityLogs.unshift(entry);
  if (draft.activityLogs.length > 500) {
    draft.activityLogs = draft.activityLogs.slice(0, 500);
  }
}

export function addNotification(
  draft: ERPDatabase,
  params: Omit<NotificationItem, 'id' | 'readBy' | 'createdAt'>,
): void {
  const notif: NotificationItem = {
    id: generateId('notif'),
    ...params,
    readBy: [],
    createdAt: new Date().toISOString(),
  };
  draft.notifications.unshift(notif);
  if (draft.notifications.length > 200) {
    draft.notifications = draft.notifications.slice(0, 200);
  }
}
