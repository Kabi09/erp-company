/**
 * CRYO ERP 2.0 Repository Contracts
 * Defines abstract data access boundaries preparing for Phase 3 MongoDB / Mongoose repository swap.
 */

import type {
  ActivityLog,
  AuthUser,
  BOM,
  CompanySettings,
  Customer,
  CustomerPO,
  DailyProductionUpdate,
  DeliveryIssue,
  DeliveryOrder,
  DocCounters,
  Employee,
  Enquiry,
  ERPDatabase,
  FollowUp,
  GRN,
  Material,
  MaterialIssue,
  MaterialRequest,
  NotificationItem,
  PaymentEntry,
  Product,
  ProductionOrder,
  ProformaInvoice,
  QualityCheck,
  Quotation,
  ReworkOrder,
  Role,
  SalesOrder,
  StockTransaction,
  Supplier,
  SupplierPO,
  SupplierReturn,
} from '../../src/types/erp';

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
  department?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DropdownOption {
  id: string;
  label: string;
  subLabel?: string;
  data?: Record<string, any>;
}

export interface IERPRepository {
  // Snapshot / State
  getState(): ERPDatabase | Promise<ERPDatabase>;
  mutate?<T>(fn: (draft: ERPDatabase) => T): T | Promise<T>;
  resetDemoData?(clearOperationalOnly?: boolean): ERPDatabase | Promise<ERPDatabase>;

  // Document Numbering
  getNextDocNo(key: keyof DocCounters): string | Promise<string>;

  // Activities & Notifications
  addActivity(params: Omit<ActivityLog, 'id' | 'timestamp'>): void | Promise<ActivityLog>;
  addNotification(params: Omit<NotificationItem, 'id' | 'readBy' | 'createdAt'>): void | Promise<NotificationItem>;
}

export interface IEmployeeRepository {
  findById(id: string): Promise<Employee | null>;
  findByEmailOrCode(identifier: string): Promise<Employee | null>;
  create(emp: Employee): Promise<Employee>;
  update(id: string, updates: Partial<Employee>): Promise<Employee>;
}

export interface ISalesRepository {
  findCustomerById(id: string): Promise<Customer | null>;
  findEnquiryById(id: string): Promise<Enquiry | null>;
  findQuotationById(id: string): Promise<Quotation | null>;
  findProformaInvoiceById(id: string): Promise<ProformaInvoice | null>;
  findSalesOrderById(id: string): Promise<SalesOrder | null>;
}

export interface ISupplyChainRepository {
  findMaterialById(id: string): Promise<Material | null>;
  findMaterialRequestById(id: string): Promise<MaterialRequest | null>;
  findSupplierPOById(id: string): Promise<SupplierPO | null>;
  findGRNById(id: string): Promise<GRN | null>;
  getStockTransactions(materialId?: string): Promise<StockTransaction[]>;
}

export interface IProductionRepository {
  findProductionOrderById(id: string): Promise<ProductionOrder | null>;
  findBOMByProductionOrderId(poId: string): Promise<BOM | null>;
  getDailyUpdates(poId: string): Promise<DailyProductionUpdate[]>;
  getQualityChecks(poId: string): Promise<QualityCheck[]>;
  getReworkOrders(poId: string): Promise<ReworkOrder[]>;
}

export interface ILogisticsRepository {
  findDeliveryOrderById(id: string): Promise<DeliveryOrder | null>;
  findDeliveryIssues(deliveryOrderId?: string): Promise<DeliveryIssue[]>;
}
