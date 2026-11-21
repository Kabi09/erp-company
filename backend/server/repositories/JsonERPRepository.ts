import type { ActivityLog, DocCounters, ERPDatabase, NotificationItem } from '../../src/types/erp';
import { addActivity, addNotification, dbStore, nextDocNo } from '../db';
import type { IERPRepository } from './contracts';

export class JsonERPRepository implements IERPRepository {
  public getState(): ERPDatabase {
    return dbStore.getState();
  }

  public mutate<T>(fn: (draft: ERPDatabase) => T): T {
    return dbStore.mutate(fn);
  }

  public resetDemoData(clearOperationalOnly?: boolean): ERPDatabase {
    return dbStore.resetDemoData(clearOperationalOnly);
  }

  public getNextDocNo(key: keyof DocCounters): string {
    return dbStore.mutate((draft) => nextDocNo(draft, key));
  }

  public addActivity(params: Omit<ActivityLog, 'id' | 'timestamp'>): void {
    dbStore.mutate((draft) => {
      addActivity(draft, params);
    });
  }

  public addNotification(params: Omit<NotificationItem, 'id' | 'readBy' | 'createdAt'>): void {
    dbStore.mutate((draft) => {
      addNotification(draft, params);
    });
  }
}

export const erpRepository = new JsonERPRepository();
