import type { ClientSession, Model } from 'mongoose';
import type {
  ActivityLog,
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
  MaterialIssueItem,
  MaterialRequest,
  NotificationItem,
  PaymentEntry,
  Product,
  ProductionOrder,
  ProductionReturn,
  ProformaInvoice,
  QualityCheck,
  Quotation,
  QuotationItem,
  ReworkOrder,
  Role,
  SalesOrder,
  StockTransaction,
  Supplier,
  SupplierPO,
  SupplierReturn,
} from '../../src/types/erp';
import {
  calculateDurationDays,
  calculatePaymentSummary,
  calculateQuotationTotals,
  computeMaterialStockMap,
  deriveMaterialRequestStatus,
  getRemainingSOAllocatableQty,
  normalizeQuotationItems,
  round2,
  validateMaterialUnitQuantity,
  validateMaterialIssueLine,
} from '../../src/utils/erpLogic';
import { withTransaction } from '../config/database';
import {
  ActivityLogModel,
  ApprovalRequestModel,
  ApprovalWorkflowModel,
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
  ProductionReturnModel,
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
import { generateId, PREFIX_MAP, syncSalesOrderFulfillmentMongo } from '../utils/routeUtils';
import type { IERPRepository, PaginatedResult, PaginationQuery } from './contracts';

export class MongoERPRepository implements IERPRepository {
  /**
   * Atomically generate document numbers using MongoDB $inc
   */
  public async getNextDocNo(key: keyof DocCounters, session?: ClientSession): Promise<string> {
    const updated = await DocCounterModel.findOneAndUpdate(
      { key },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after', session: session || undefined },
    );
    const prefix = PREFIX_MAP[key] || key;
    return `${prefix}-${String(updated?.value || 1).padStart(4, '0')}`;
  }

  /**
   * Record an activity log entry atomically
   */
  public async addActivity(
    params: Omit<ActivityLog, 'id' | 'timestamp'>,
    session?: ClientSession,
  ): Promise<ActivityLog> {
    const doc: ActivityLog = {
      id: generateId('act'),
      ...params,
      timestamp: new Date().toISOString(),
    };
    if (session) {
      await ActivityLogModel.create([doc], { session });
    } else {
      await ActivityLogModel.create(doc);
    }
    return doc;
  }

  /**
   * Dispatch a notification
   */
  public async addNotification(
    params: Omit<NotificationItem, 'id' | 'readBy' | 'createdAt'>,
    session?: ClientSession,
  ): Promise<NotificationItem> {
    const doc: NotificationItem = {
      id: generateId('notif'),
      ...params,
      readBy: [],
      createdAt: new Date().toISOString(),
    };
    if (session) {
      await NotificationModel.create([doc], { session });
    } else {
      await NotificationModel.create(doc);
    }
    return doc;
  }

  /**
   * Reconstruct ERPDatabase state snapshot for bootstrap or backup
   */
  public async getState(): Promise<ERPDatabase> {
    const [
      roles,
      employees,
      companyDoc,
      countersDocs,
      customers,
      products,
      materials,
      suppliers,
      enquiries,
      followUps,
      quotations,
      proformaInvoices,
      customerPOs,
      payments,
      salesOrders,
      productionOrders,
      boms,
      materialRequests,
      materialIssues,
      supplierPOs,
      grns,
      supplierReturns,
      stockTransactions,
      dailyUpdates,
      qualityChecks,
      reworkOrders,
      productionReturns,
      deliveryOrders,
      deliveryIssues,
      notifications,
      activityLogs,
      approvalWorkflows,
      approvalRequests,
    ] = await Promise.all([
      RoleModel.find().lean(),
      EmployeeModel.find().lean(),
      CompanySettingsModel.findOne({ id: 'company' }).lean(),
      DocCounterModel.find().lean(),
      CustomerModel.find().sort({ createdAt: -1 }).lean(),
      ProductModel.find().lean(),
      MaterialModel.find().lean(),
      SupplierModel.find().lean(),
      EnquiryModel.find().sort({ createdAt: -1 }).lean(),
      FollowUpModel.find().sort({ createdAt: -1 }).lean(),
      QuotationModel.find().sort({ createdAt: -1 }).lean(),
      ProformaInvoiceModel.find().sort({ createdAt: -1 }).lean(),
      CustomerPOModel.find().sort({ createdAt: -1 }).lean(),
      PaymentEntryModel.find().sort({ createdAt: -1 }).lean(),
      SalesOrderModel.find().sort({ createdAt: -1 }).lean(),
      ProductionOrderModel.find().sort({ createdAt: -1 }).lean(),
      BOMModel.find().sort({ createdAt: -1 }).lean(),
      MaterialRequestModel.find().sort({ createdAt: -1 }).lean(),
      MaterialIssueModel.find().sort({ createdAt: -1 }).lean(),
      SupplierPOModel.find().sort({ createdAt: -1 }).lean(),
      GRNModel.find().sort({ createdAt: -1 }).lean(),
      SupplierReturnModel.find().sort({ createdAt: -1 }).lean(),
      StockTransactionModel.find().sort({ timestamp: -1 }).lean(),
      DailyProductionUpdateModel.find().sort({ createdAt: -1 }).lean(),
      QualityCheckModel.find().sort({ createdAt: -1 }).lean(),
      ReworkOrderModel.find().sort({ createdAt: -1 }).lean(),
      ProductionReturnModel.find().sort({ createdAt: -1 }).lean(),
      DeliveryOrderModel.find().sort({ createdAt: -1 }).lean(),
      DeliveryIssueModel.find().sort({ createdAt: -1 }).lean(),
      NotificationModel.find().sort({ createdAt: -1 }).lean(),
      ActivityLogModel.find().sort({ timestamp: -1 }).lean(),
      ApprovalWorkflowModel.find().lean(),
      ApprovalRequestModel.find().sort({ createdAt: -1 }).lean(),
    ]);

    const counters: Record<string, number> = {};
    for (const c of countersDocs) {
      counters[c.key] = c.value;
    }

    const defaultCompany: CompanySettings = {
      companyName: 'CRYO Scientific Systems Pvt. Ltd.',
      legalName: 'CRYO Scientific & Cold-Chain Engineering Pvt. Ltd.',
      gstin: '29AABCC4921M1Z8',
      address: 'Plot 42, Peenya Industrial Area Phase II, Bengaluru, Karnataka 560058',
      phone: '+91 80 4128 7600',
      email: 'operations@cryoscientific.in',
      website: 'https://cryoscientific.in',
      bankName: 'HDFC Bank Ltd.',
      bankAccountName: 'CRYO Scientific Systems Pvt. Ltd.',
      bankAccountNumber: '50200048912045',
      bankIfsc: 'HDFC0000184',
      bankBranch: 'Peenya Industrial Estate, Bengaluru',
      defaultTaxPercent: 18,
      defaultPaymentTerms: '50% Advance with Purchase Order, 50% prior to dispatch.',
      defaultDeliveryTerms: 'Ex-Works Bengaluru. 3–4 weeks from receipt of PO and advance.',
      defaultWarranty: '24 months comprehensive warranty from date of commissioning.',
      currencySymbol: '₹',
      demoMode: true,
    };

    return {
      counters: counters as unknown as DocCounters,
      company: (companyDoc as CompanySettings) || defaultCompany,
      roles: roles as unknown as Role[],
      employees: employees as unknown as Employee[],
      customers: customers as unknown as Customer[],
      products: products as unknown as Product[],
      materials: materials as unknown as Material[],
      suppliers: suppliers as unknown as Supplier[],
      enquiries: enquiries as unknown as Enquiry[],
      followUps: followUps as unknown as FollowUp[],
      quotations: quotations as unknown as Quotation[],
      proformaInvoices: proformaInvoices as unknown as ProformaInvoice[],
      customerPOs: customerPOs as unknown as CustomerPO[],
      payments: payments as unknown as PaymentEntry[],
      salesOrders: salesOrders as unknown as SalesOrder[],
      productionOrders: productionOrders as unknown as ProductionOrder[],
      boms: boms as unknown as BOM[],
      materialRequests: materialRequests as unknown as MaterialRequest[],
      materialIssues: materialIssues as unknown as MaterialIssue[],
      supplierPOs: supplierPOs as unknown as SupplierPO[],
      grns: grns as unknown as GRN[],
      supplierReturns: supplierReturns as unknown as SupplierReturn[],
      stockTransactions: stockTransactions as unknown as StockTransaction[],
      dailyUpdates: dailyUpdates as unknown as DailyProductionUpdate[],
      qualityChecks: qualityChecks as unknown as QualityCheck[],
      reworkOrders: reworkOrders as unknown as ReworkOrder[],
      productionReturns: productionReturns as unknown as ProductionReturn[],
      deliveryOrders: deliveryOrders as unknown as DeliveryOrder[],
      deliveryIssues: deliveryIssues as unknown as DeliveryIssue[],
      notifications: notifications as unknown as NotificationItem[],
      activityLogs: activityLogs as unknown as ActivityLog[],
      approvalWorkflows: approvalWorkflows as any,
      approvalRequests: approvalRequests as any,
    };
  }

  /**
   * Stock map calculation using persisted stock transactions
   */
  public async computeStockMap(): Promise<Record<string, number>> {
    const txs = await StockTransactionModel.find().lean();
    return computeMaterialStockMap(txs as unknown as StockTransaction[]);
  }

  /**
   * Synchronize MaterialModel currentStock balances with transaction ledger
   */
  public async syncMaterialStock(): Promise<Record<string, number>> {
    const stockMap = await this.computeStockMap();
    const materials = await MaterialModel.find().lean();
    for (const mat of materials) {
      if (stockMap[mat.id] !== undefined) {
        const bal = stockMap[mat.id];
        if (mat.currentStock !== bal) {
          await MaterialModel.updateOne({ id: mat.id }, { $set: { currentStock: bal } });
        }
      }
    }
    return stockMap;
  }

  /**
   * Compare MaterialModel.currentStock against immutable transaction ledger.
   * If fix is true, updates currentStock to match ledger balance and logs an activity.
   */
  public async getStockReconciliationReport(fix = false, actorName = 'System') {
    const stockMap = await this.computeStockMap();
    const materials = await MaterialModel.find().sort({ code: 1 }).lean();
    const discrepancies: Array<{
      materialId: string;
      materialCode: string;
      materialName: string;
      unit: string;
      currentStock: number;
      ledgerBalance: number;
      discrepancy: number;
      status: 'MATCHED' | 'DISCREPANCY';
    }> = [];

    let reconciledCount = 0;
    for (const mat of materials) {
      const ledgerBal = round2(stockMap[mat.id] ?? 0);
      const curStock = round2(mat.currentStock ?? 0);
      const diff = round2(curStock - ledgerBal);
      const hasDiscrepancy = Math.abs(diff) > 0.001;

      discrepancies.push({
        materialId: mat.id,
        materialCode: mat.code,
        materialName: mat.name,
        unit: mat.unit,
        currentStock: curStock,
        ledgerBalance: ledgerBal,
        discrepancy: diff,
        status: hasDiscrepancy ? 'DISCREPANCY' : 'MATCHED',
      });

      if (hasDiscrepancy && fix) {
        await MaterialModel.updateOne({ id: mat.id }, { $set: { currentStock: ledgerBal } });
        reconciledCount++;
      }
    }

    if (fix && reconciledCount > 0) {
      await this.addActivity({
        actorId: 'system',
        actorName,
        department: 'supply_chain',
        action: 'Reconciled Stock Balances',
        entityType: 'Material',
        entityId: 'all',
        entityDocNo: 'RECON',
        details: `Reconciled ${reconciledCount} material(s) where currentStock diverged from transaction ledger.`,
      });
    }

    const discrepanciesCount = discrepancies.filter((d) => d.status === 'DISCREPANCY').length;

    return {
      matched: discrepanciesCount === 0,
      totalMaterials: materials.length,
      discrepanciesCount,
      reconciledCount: fix ? reconciledCount : 0,
      materials: discrepancies,
    };
  }

  // --- PAGINATION HELPER ---
  private async paginate<T>(
    model: Model<any>,
    filter: Record<string, any>,
    pagination: PaginationQuery,
    defaultSort: Record<string, 1 | -1> = { createdAt: -1 },
  ): Promise<PaginatedResult<T>> {
    const page = Math.max(1, Number(pagination.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 20));
    const skip = (page - 1) * limit;

    let sort = defaultSort;
    if (pagination.sortBy) {
      sort = { [pagination.sortBy]: pagination.sortOrder === 'asc' ? 1 : -1 };
    }

    const [items, total] = await Promise.all([
      model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      model.countDocuments(filter),
    ]);

    return {
      items: items as unknown as T[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // --- PAGINATED LIST METHODS ---

  public async getPaginatedEnquiries(query: PaginationQuery): Promise<PaginatedResult<Enquiry>> {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ docNo: s }, { 'customerSnapshot.name': s }, { 'customerSnapshot.contactPerson': s }, { notes: s }];
    }
    return this.paginate<Enquiry>(EnquiryModel, filter, query);
  }

  public async getPaginatedQuotations(query: PaginationQuery): Promise<PaginatedResult<Quotation>> {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ docNo: s }, { baseDocNo: s }, { enquiryDocNo: s }, { 'customerSnapshot.name': s }];
    }
    return this.paginate<Quotation>(QuotationModel, filter, query);
  }

  public async getPaginatedSalesOrders(query: PaginationQuery): Promise<PaginatedResult<SalesOrder>> {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.$or = [{ commercialStatus: query.status }, { fulfillmentStatus: query.status }];
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ docNo: s }, { customerPoNumber: s }, { quotationDocNo: s }, { 'customerSnapshot.name': s }];
    }
    return this.paginate<SalesOrder>(SalesOrderModel, filter, query);
  }

  public async getPaginatedMaterials(query: PaginationQuery): Promise<PaginatedResult<Material>> {
    const filter: Record<string, any> = {};
    if (query.category) {
      filter.category = query.category;
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ code: s }, { name: s }, { storageLocation: s }];
    }
    return this.paginate<Material>(MaterialModel, filter, query, { name: 1 });
  }

  public async getPaginatedMaterialRequests(query: PaginationQuery): Promise<PaginatedResult<MaterialRequest>> {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ docNo: s }, { bomDocNo: s }, { productionOrderDocNo: s }, { productName: s }];
    }
    return this.paginate<MaterialRequest>(MaterialRequestModel, filter, query);
  }

  public async getPaginatedSupplierPOs(query: PaginationQuery): Promise<PaginatedResult<SupplierPO>> {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ docNo: s }, { supplierName: s }];
    }
    return this.paginate<SupplierPO>(SupplierPOModel, filter, query);
  }

  public async getPaginatedGRNs(query: PaginationQuery): Promise<PaginatedResult<GRN>> {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.verificationStatus = query.status;
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ docNo: s }, { supplierPoDocNo: s }, { supplierName: s }, { invoiceOrChallanNo: s }];
    }
    return this.paginate<GRN>(GRNModel, filter, query);
  }

  public async getPaginatedProductionOrders(query: PaginationQuery & { salesOrderId?: string; customerId?: string; priority?: string; employee?: string }): Promise<PaginatedResult<ProductionOrder>> {
    const filter: Record<string, any> = {};
    if (query.status && query.status !== 'All') {
      filter.status = query.status;
    }
    if (query.salesOrderId) {
      filter.salesOrderId = query.salesOrderId;
    }
    if (query.customerId) {
      filter.customerId = query.customerId;
    }
    if (query.priority) {
      filter.priority = query.priority;
    }
    if (query.employee) {
      filter.$or = [{ productionInCharge: query.employee }, { assignedEmployees: query.employee }];
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ docNo: s }, { salesOrderDocNo: s }, { productName: s }, { customerName: s }, { model: s }];
    }
    return this.paginate<ProductionOrder>(ProductionOrderModel, filter, query);
  }

  public async getPaginatedDeliveryOrders(query: PaginationQuery): Promise<PaginatedResult<DeliveryOrder>> {
    const q = query as Record<string, any>;
    const filter: Record<string, any> = {};
    if (q.status && q.status !== 'All') {
      if (q.status === 'in_transit') {
        filter.status = { $in: ['In Transit', 'Dispatched', 'Partially Delivered'] };
      } else {
        filter.status = q.status;
      }
    }
    if (q.transportMethod) {
      filter.transportMethod = q.transportMethod;
    }
    if (q.customerId) {
      filter.customerId = q.customerId;
    }
    if (q.salesOrderId) {
      filter.salesOrderId = q.salesOrderId;
    }
    if (q.productionOrderId) {
      filter.productionOrderId = q.productionOrderId;
    }
    if (q.dateFrom || q.dateTo) {
      const dateFilter: Record<string, any> = {};
      if (q.dateFrom) dateFilter.$gte = q.dateFrom;
      if (q.dateTo) dateFilter.$lte = q.dateTo;
      filter.plannedDispatchDate = dateFilter;
    }
    if (q.search?.trim()) {
      const s = new RegExp(q.search.trim(), 'i');
      filter.$or = [
        { docNo: s },
        { salesOrderDocNo: s },
        { productionOrderDocNo: s },
        { customerName: s },
        { productName: s },
        { trackingNumber: s },
        { vehicleNumber: s },
        { driverName: s },
        { deliveryChallanNo: s },
      ];
    }
    return this.paginate<DeliveryOrder>(DeliveryOrderModel, filter, query);
  }

  // --- DROPDOWN / OPTIONS QUERIES ---

  public async getCustomerOptions(): Promise<Array<{ id: string; name: string; contactPerson: string; phone: string; gstin: string }>> {
    return CustomerModel.find({}, { _id: 0, id: 1, name: 1, contactPerson: 1, phone: 1, gstin: 1 }).sort({ name: 1 }).lean();
  }

  public async getProductOptions(): Promise<Array<{ id: string; name: string; model: string; category: string; sellingPrice: number }>> {
    return ProductModel.find({ status: 'Active' }, { _id: 0, id: 1, name: 1, model: 1, category: 1, sellingPrice: 1 }).sort({ name: 1 }).lean();
  }

  public async getMaterialOptions(): Promise<Array<{ id: string; code: string; name: string; unit: string; minStock: number }>> {
    return MaterialModel.find({ active: true }, { _id: 0, id: 1, code: 1, name: 1, unit: 1, minStock: 1 }).sort({ code: 1 }).lean();
  }

  public async getSupplierOptions(): Promise<Array<{ id: string; name: string; contactPerson: string; phone: string; email: string }>> {
    return SupplierModel.find({ active: true }, { _id: 0, id: 1, name: 1, contactPerson: 1, phone: 1, email: 1 }).sort({ name: 1 }).lean();
  }

  // --- DASHBOARD SUMMARIES ---

  public async getSalesSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const [
      totalEnquiries,
      newEnquiries,
      qualifiedEnquiries,
      todaysFollowUps,
      overdueFollowUps,
      pendingQuotations,
      acceptedQuotations,
      orders,
      payments,
      recentActivities,
    ] = await Promise.all([
      EnquiryModel.countDocuments(),
      EnquiryModel.countDocuments({ status: { $in: ['New', 'Contacted'] } }),
      EnquiryModel.countDocuments({ status: 'Qualified' }),
      FollowUpModel.countDocuments({ status: 'Scheduled', nextFollowUpDate: today }),
      FollowUpModel.countDocuments({ status: 'Scheduled', nextFollowUpDate: { $lt: today } }),
      QuotationModel.countDocuments({ status: { $in: ['Draft', 'Sent', 'Pending', 'Negotiation'] } }),
      QuotationModel.countDocuments({ status: 'Accepted' }),
      SalesOrderModel.find().lean(),
      PaymentEntryModel.find().lean(),
      ActivityLogModel.find({ department: 'sales' }).sort({ timestamp: -1 }).limit(10).lean(),
    ]);

    const confirmedOrders = orders.filter((o) => o.commercialStatus === 'Confirmed');
    const totalRevenue = confirmedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalCollected = payments.reduce((sum, p) => sum + (p.status === 'Verified' ? p.amount : 0), 0);
    const totalOutstanding = Math.max(0, totalRevenue - totalCollected);

    return {
      totalEnquiries,
      newEnquiries,
      qualifiedEnquiries,
      todaysFollowUps,
      overdueFollowUps,
      pendingQuotations,
      acceptedQuotations,
      confirmedOrdersCount: confirmedOrders.length,
      totalOrders: orders.length,
      totalRevenue: round2(totalRevenue),
      totalCollected: round2(totalCollected),
      totalOutstanding: round2(totalOutstanding),
      pendingPayments: round2(totalOutstanding),
      recentActivities: recentActivities as unknown as ActivityLog[],
    };
  }

  public async getSupplyChainSummary() {
    const [materials, stockMap, pendingRequests, openPOs] = await Promise.all([
      MaterialModel.find().lean(),
      this.computeStockMap(),
      MaterialRequestModel.countDocuments({ status: { $in: ['Pending', 'Partially Issued'] } as any }),
      SupplierPOModel.countDocuments({ status: { $in: ['Issued', 'Partially Received'] } as any }),
    ]);

    const lowStockCount = materials.filter((m) => (stockMap[m.id] ?? 0) <= m.minStock).length;

    return {
      totalMaterials: materials.length,
      lowStockCount,
      pendingMaterialRequests: pendingRequests,
      openPurchaseOrders: openPOs,
    };
  }

  public async getProductionSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const [orders, dailyCount, activeRework, pendingQC, confirmedSOs] = await Promise.all([
      ProductionOrderModel.find().lean(),
      DailyProductionUpdateModel.countDocuments(),
      ReworkOrderModel.countDocuments({ status: { $in: ['Open', 'In Progress'] } as any }),
      ProductionOrderModel.countDocuments({ status: 'QC Pending' }),
      SalesOrderModel.find({ commercialStatus: 'Confirmed' }).lean(),
    ]);

    let receivedSalesOrders = 0;
    for (const so of confirmedSOs) {
      const hasUnallocated = so.items.some(
        (it) => getRemainingSOAllocatableQty(so as any, it.productId, orders as any) > 0,
      );
      if (hasUnallocated) receivedSalesOrders++;
    }

    return {
      totalProductionOrders: orders.length,
      receivedSalesOrders,
      planned: orders.filter((o) => o.status === 'Planned').length,
      awaitingMaterials: orders.filter((o) => o.status === 'Awaiting Materials').length,
      readyToStart: orders.filter((o) => o.status === 'Ready to Start').length,
      inProduction: orders.filter((o) => o.status === 'In Progress').length,
      pendingQualityChecks: pendingQC,
      activeReworkOrders: activeRework || orders.filter((o) => o.status === 'Rework').length,
      completed: orders.filter((o) => o.status === 'Completed').length,
      delayedOrders: orders.filter((o) => o.status !== 'Completed' && o.plannedEndDate < today).length,
      dailyUpdatesCount: dailyCount,
    };
  }

  /**
   * Concurrency-safe and transaction-safe Production Order allocation
   */
  public async createProductionOrderTx(
    params: {
      salesOrderId: string;
      productId: string;
      quantity: number;
      plannedStartDate: string;
      plannedEndDate: string;
      productionInCharge?: string;
      assignedEmployees?: string[];
      priority?: 'Normal' | 'High' | 'Urgent';
      instructions?: string;
    },
    actor: { id: string; name: string },
  ): Promise<ProductionOrder> {
    return withTransaction(async (session) => {
      const so = await SalesOrderModel.findOne({ id: params.salesOrderId }).session(session);
      if (!so) throw new Error('NOT_FOUND:Confirmed Sales Order not found.');
      if (so.commercialStatus !== 'Confirmed') {
        throw new Error('Cannot create production order for an unconfirmed Sales Order.');
      }
      const soItem = so.items.find((i) => i.productId === params.productId) || so.items[0];
      if (!soItem) throw new Error('Sales order has no product items.');

      const existingPOs = await ProductionOrderModel.find({ salesOrderId: so.id }).session(session).lean();
      const remaining = getRemainingSOAllocatableQty(so.toObject() as any, soItem.productId, existingPOs as any);
      const qty = Number(params.quantity);
      if (!qty || qty <= 0) throw new Error('Production quantity must be greater than zero.');
      if (qty > remaining) {
        throw new Error(`Cannot allocate ${qty} unit(s); only ${remaining} unit(s) remaining on ${so.docNo}.`);
      }

      const duration = calculateDurationDays(params.plannedStartDate, params.plannedEndDate);
      if (duration <= 0) {
        throw new Error('Planned completion date must be on or after planned start date.');
      }

      // Optimistic concurrency guard on SalesOrder: update __v to prevent concurrent overallocation
      const updatedSO = await SalesOrderModel.findOneAndUpdate(
        { id: so.id, __v: so.__v },
        { $inc: { __v: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!updatedSO) {
        throw new Error('CONCURRENCY_CONFLICT: Sales Order was modified concurrently. Please retry.');
      }

      const now = new Date().toISOString();
      const docNo = await this.getNextDocNo('PROD', session || undefined);
      const po: ProductionOrder = {
        id: generateId('po'),
        docNo,
        salesOrderId: so.id,
        salesOrderDocNo: so.docNo,
        customerId: so.customerId,
        customerName: so.customerSnapshot.name,
        productId: soItem.productId,
        productName: soItem.productName,
        model: soItem.model,
        specifications: soItem.specifications,
        highlights: soItem.highlights,
        quantity: qty,
        plannedStartDate: params.plannedStartDate,
        plannedEndDate: params.plannedEndDate,
        plannedDurationDays: duration,
        productionInCharge: params.productionInCharge?.trim() || actor.name,
        assignedEmployees: Array.isArray(params.assignedEmployees) ? params.assignedEmployees : [],
        priority: params.priority || so.priority,
        instructions: params.instructions?.trim() || '',
        status: 'Planned',
        completedManufacturingQty: 0,
        serialNumbers: [],
        qcAcceptedQty: 0,
        qcRejectedQty: 0,
        dispatchedQty: 0,
        deliveredQty: 0,
        planningHistory: [],
        createdBy: actor.name,
        createdAt: now,
        updatedAt: now,
      };

      await ProductionOrderModel.create([po], { session: session || undefined });
      await syncSalesOrderFulfillmentMongo(so.id, session || undefined);

      await this.addActivity(
        {
          actorId: actor.id,
          actorName: actor.name,
          department: 'production',
          action: 'Created Production Order',
          entityType: 'ProductionOrder',
          entityId: po.id,
          entityDocNo: po.docNo,
          details: `Scheduled ${po.docNo} for ${qty}x ${po.productName} (${so.docNo}), duration ${duration} days.`,
        },
        session || undefined,
      );

      return po;
    });
  }

  /**
   * Reschedule Production Order planned schedule with mandatory audit reason
   */
  public async rescheduleProductionOrder(
    productionOrderId: string,
    params: { newStartDate: string; newEndDate: string; reason: string },
    actor: { id: string; name: string },
  ): Promise<ProductionOrder> {
    const po = await ProductionOrderModel.findOne({ id: productionOrderId });
    if (!po) throw new Error('NOT_FOUND:Production order not found.');
    if (!params.reason?.trim()) {
      throw new Error('Rescheduling reason is required.');
    }
    const duration = calculateDurationDays(params.newStartDate, params.newEndDate);
    if (duration <= 0) {
      throw new Error('New planned completion date must be on or after new planned start date.');
    }

    const now = new Date().toISOString();
    if (!po.planningHistory) po.planningHistory = [];
    po.planningHistory.push({
      previousStartDate: po.plannedStartDate,
      previousEndDate: po.plannedEndDate,
      newStartDate: params.newStartDate,
      newEndDate: params.newEndDate,
      reason: params.reason.trim(),
      rescheduledBy: actor.name,
      rescheduledAt: now,
    });

    po.plannedStartDate = params.newStartDate;
    po.plannedEndDate = params.newEndDate;
    po.plannedDurationDays = duration;
    po.updatedAt = now;
    await po.save();

    await this.addActivity({
      actorId: actor.id,
      actorName: actor.name,
      department: 'production',
      action: 'Rescheduled Production Order',
      entityType: 'ProductionOrder',
      entityId: po.id,
      entityDocNo: po.docNo,
      details: `Rescheduled ${po.docNo} from ${po.planningHistory[po.planningHistory.length - 1].previousEndDate} to ${params.newEndDate}. Reason: ${params.reason.trim()}`,
    });

    return po.toObject() as unknown as ProductionOrder;
  }

  public async getLogisticsSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const [deliveryOrders, completedPOs, openIssuesCount] = await Promise.all([
      DeliveryOrderModel.find().lean(),
      ProductionOrderModel.find({ status: 'Completed', qcAcceptedQty: { $gt: 0 } }).lean(),
      DeliveryIssueModel.countDocuments({ status: 'Open' }),
    ]);

    const activeAllocationsMap = new Map<string, number>();
    for (const d of deliveryOrders) {
      if (d.status !== 'Cancelled') {
        activeAllocationsMap.set(d.productionOrderId, (activeAllocationsMap.get(d.productionOrderId) || 0) + d.quantity);
      }
    }

    const readyToDispatch = completedPOs.filter((po) => {
      const allocated = activeAllocationsMap.get(po.id) || 0;
      return (po.qcAcceptedQty - allocated) > 0;
    }).length;

    const planned = deliveryOrders.filter((d) => d.status === 'Planned');
    const scheduledToday = planned.filter((d) => d.plannedDispatchDate === today);
    const inTransit = deliveryOrders.filter((d) => d.status === 'In Transit' || d.status === 'Dispatched');
    const partiallyDelivered = deliveryOrders.filter((d) => d.status === 'Partially Delivered');
    const delivered = deliveryOrders.filter((d) => d.status === 'Delivered');
    const overdueDeliveries = deliveryOrders.filter((d) =>
      ['Planned', 'In Transit', 'Dispatched', 'Partially Delivered'].includes(d.status) &&
      d.expectedDeliveryDate < today
    );

    return {
      readyToDispatch,
      pendingDeliveryOrders: planned.length,
      scheduledDispatches: scheduledToday.length || planned.length,
      inTransit: inTransit.length,
      partiallyDelivered: partiallyDelivered.length,
      delivered: delivered.length,
      overdueDeliveries: overdueDeliveries.length,
      deliveryIssues: openIssuesCount,
      // Backward compatibility aliases
      totalDeliveryOrders: deliveryOrders.length,
      dispatched: deliveryOrders.filter((d) => d.status === 'Dispatched').length,
      unresolvedIssues: openIssuesCount,
    };
  }

  // --- MULTI-DOCUMENT WORKFLOW TRANSACTIONS ---

  /**
   * Atomically supersede an older quotation and create revised quotation version
   */
  public async reviseQuotation(
    quotationId: string,
    body: any,
    actor: { id: string; name: string },
  ): Promise<Quotation> {
    return withTransaction(async (session) => {
      const prev = await QuotationModel.findOne({ id: quotationId }).session(session);
      if (!prev) throw new Error('NOT_FOUND:Target quotation not found.');
      if (prev.status === 'Accepted' || prev.status === 'Superseded' || prev.status === 'Rejected') {
        throw new Error(`Cannot revise a quotation in ${prev.status} state.`);
      }

      prev.status = 'Superseded';
      await prev.save({ session: session || undefined });

      const family = await QuotationModel.find({ baseDocNo: prev.baseDocNo }).session(session).lean();
      const nextVersion = Math.max(...family.map((q) => q.version), prev.version) + 1;
      const baseDocNo = prev.baseDocNo || prev.docNo.replace(/-V\d+$/, '');
      const docNo = `${baseDocNo}-V${nextVersion}`;
      const now = new Date().toISOString();

      const rawItems = Array.isArray(body.items) && body.items.length > 0 ? body.items : prev.items;
      const items = normalizeQuotationItems(
        rawItems.map((it: any) => ({
          id: generateId('qi'),
          productId: it.productId || '',
          productName: it.productName?.trim() || 'Product',
          model: it.model?.trim() || '',
          specifications: it.specifications?.trim() || '',
          quantity: Math.max(1, Number(it.quantity) || 1),
          unitPrice: Math.max(0, Number(it.unitPrice) || 0),
          highlights: Array.isArray(it.highlights) ? it.highlights.filter((h: string) => h.trim()) : [],
        })),
      );
      const discountPercent = Number(body.discountPercent ?? prev.discountPercent);
      const taxPercent = Number(body.taxPercent ?? prev.taxPercent);
      const totals = calculateQuotationTotals(items, discountPercent, taxPercent);

      const revisedData: Quotation = {
        id: generateId('qt'),
        docNo,
        baseDocNo,
        version: nextVersion,
        enquiryId: prev.enquiryId,
        enquiryDocNo: prev.enquiryDocNo,
        customerId: prev.customerId,
        customerSnapshot: body.customerSnapshot || prev.customerSnapshot,
        quotationDate: body.quotationDate || now.slice(0, 10),
        validityDate: body.validityDate || prev.validityDate,
        items,
        subtotal: totals.subtotal,
        discountPercent,
        discountAmount: totals.discountAmount,
        taxPercent,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        paymentTerms: body.paymentTerms ?? prev.paymentTerms,
        deliveryTerms: body.deliveryTerms ?? prev.deliveryTerms,
        warranty: body.warranty ?? prev.warranty,
        remarks: body.remarks ?? `Revision V${nextVersion} based on negotiation.`,
        status: 'Negotiation',
        createdBy: actor.name,
        createdAt: now,
        updatedAt: now,
      };

      await QuotationModel.create([revisedData], { session: session || undefined });

      await this.addActivity(
        {
          actorId: actor.id,
          actorName: actor.name,
          department: 'sales',
          action: 'Revised Quotation',
          entityType: 'Quotation',
          entityId: revisedData.id,
          entityDocNo: revisedData.docNo,
          details: `Created revision ${revisedData.docNo} superseding ${prev.docNo}.`,
        },
        session || undefined,
      );

      return revisedData;
    });
  }

  /**
   * Atomically issue material against request, creating MaterialIssue and StockTransactions
   */
  public async issueMaterial(
    requestId: string,
    rawItems: Array<{ materialId: string; issuingQty: number }>,
    remarks: string,
    issueDate: string,
    actor: { id: string; name: string },
    expectedVersion?: number,
  ): Promise<MaterialIssue> {
    return withTransaction(async (session) => {
      const mr = await MaterialRequestModel.findOne({ id: requestId }).session(session);
      if (!mr) throw new Error('NOT_FOUND:Material request not found.');
      if (mr.sourceType) {
        if (!session) throw new Error('Department material issues require a MongoDB replica set.');
        if (expectedVersion !== mr.__v) throw new Error('CONCURRENCY_CONFLICT: Reload the request before issuing.');
      }
      if (mr.status === 'Fully Issued' || mr.status === 'Cancelled') {
        throw new Error(`Material request ${mr.docNo} is already ${mr.status}.`);
      }

      const validLines = (rawItems || []).filter((i) => Number(i.issuingQty) > 0);
      if (validLines.length === 0) {
        throw new Error('Enter a positive issuing quantity for at least one material.');
      }

      if (new Set(validLines.map(line => line.materialId)).size !== validLines.length) throw new Error('Combine repeated issue lines.');
      // Step 1: Pre-validate all lines against Material Request pending requirements
      for (const line of validLines) {
        const issueQty = Number(line.issuingQty);
        const mrItem = mr.items.find((x) => x.materialId === line.materialId);
        if (!mrItem) throw new Error(`Material ${line.materialId} is not on ${mr.docNo}.`);
        if (!Number.isFinite(issueQty) || !validateMaterialUnitQuantity(mrItem.unit,issueQty).valid) throw new Error('Invalid issue quantity.');
        const pending = round2(mrItem.requiredQty - mrItem.issuedQty);
        if (issueQty > pending) {
          throw new Error(
            `EXCESS_ISSUE: Cannot issue ${issueQty} for ${mrItem.materialName}. Only ${pending} remaining to issue.`,
          );
        }
      }

      // Step 2: Atomic conditional decrements on MaterialModel with compensation rollback for standalone MongoDB
      const decremented: Array<{ materialId: string; qty: number; balanceAfter: number }> = [];
      try {
        for (const line of validLines) {
          const issueQty = Number(line.issuingQty);
          const mrItem = mr.items.find((x) => x.materialId === line.materialId)!;

          const updated = await MaterialModel.findOneAndUpdate(
            { id: line.materialId, currentStock: { $gte: issueQty } },
            { $inc: { currentStock: -issueQty } },
            { session: session || undefined, returnDocument: 'after' },
          );
          if (!updated) {
            const currentMat = await MaterialModel.findOne({ id: line.materialId }).session(session || null);
            throw new Error(
              `INSUFFICIENT_STOCK: Available stock exhausted or below requested quantity (${issueQty}) for ${mrItem.materialName}. Current stock is ${currentMat?.currentStock ?? 0}.`,
            );
          }
          decremented.push({ materialId: line.materialId, qty: issueQty, balanceAfter: updated.currentStock ?? 0 });
        }
      } catch (err) {
        // Compensate any already-decremented lines if transaction session wasn't active (standalone MongoDB)
        if (!session) {
          for (const d of decremented) {
            await MaterialModel.updateOne({ id: d.materialId }, { $inc: { currentStock: d.qty } });
          }
        }
        throw err;
      }

      // Step 3: Construct issue items and update mr.items
      const issueItems: MaterialIssueItem[] = [];
      const stockTxDocs: StockTransaction[] = [];
      const now = new Date().toISOString();
      const miDocNo = await this.getNextDocNo('MI', session || undefined);
      const miId = generateId('mi');

      for (const d of decremented) {
        const mrItem = mr.items.find((x) => x.materialId === d.materialId)!;
        mrItem.issuedQty = round2(mrItem.issuedQty + d.qty);
        issueItems.push({
          materialId: mrItem.materialId,
          materialCode: mrItem.materialCode,
          materialName: mrItem.materialName,
          unit: mrItem.unit,
          issuedQty: d.qty,
          receivedQty: 0,
        });

        stockTxDocs.push({
          id: generateId('stx'),
          materialId: mrItem.materialId,
          materialCode: mrItem.materialCode,
          materialName: mrItem.materialName,
          unit: mrItem.unit,
          type: 'Material Issue',
          quantityDelta: -d.qty,
          balanceAfter: d.balanceAfter,
          linkedDocType: 'MI',
          linkedDocId: miId,
          linkedDocNo: miDocNo,
          remarks: `Issued to ${mr.sourceDocNo || mr.productionOrderDocNo}`,
          performedBy: actor.name,
          timestamp: now,
        });
      }

      const mi: MaterialIssue = {
        id: miId,
        docNo: miDocNo,
        materialRequestId: mr.id,
        materialRequestDocNo: mr.docNo,
        sourceType: mr.sourceType, sourceId: mr.sourceId, sourceDocNo: mr.sourceDocNo,
        productionOrderId: mr.productionOrderId,
        productionOrderDocNo: mr.productionOrderDocNo,
        issueDate: issueDate || now.slice(0, 10),
        items: issueItems,
        receiptAcknowledged: false,
        issuedBy: actor.name,
        remarks: remarks?.trim() || '',
        createdAt: now,
      };

      const derivedStatus = deriveMaterialRequestStatus(mr as any);
      mr.status = derivedStatus.status;
      mr.receiptStatus = derivedStatus.receiptStatus;
      mr.updatedAt = now;

      // Optimistic concurrency control on MaterialRequestModel
      const mrVersion = (mr as any).__v;
      let saveQuery: any = { id: mr.id };
      if (typeof mrVersion === 'number') {
        saveQuery.__v = mrVersion;
      }
      const updatedMR = await MaterialRequestModel.findOneAndUpdate(
        saveQuery,
        {
          $set: {
            items: mr.items,
            status: mr.status,
            receiptStatus: mr.receiptStatus,
            updatedAt: now,
          },
          $inc: { __v: 1 },
        },
        { session: session || undefined, returnDocument: 'after' },
      );

      if (!updatedMR) {
        // Rollback stock if standalone
        if (!session) {
          for (const d of decremented) {
            await MaterialModel.updateOne({ id: d.materialId }, { $inc: { currentStock: d.qty } });
          }
        }
        throw new Error('CONCURRENT_MODIFICATION: Material request was updated concurrently. Please retry.');
      }

      await MaterialIssueModel.create([mi], { session: session || undefined });
      if (stockTxDocs.length > 0) {
        await StockTransactionModel.create(stockTxDocs, { session: session || undefined, ordered:true });
      }

      await this.addActivity(
        {
          actorId: actor.id,
          actorName: actor.name,
          department: 'supply_chain',
          action: 'Issued Materials',
          entityType: 'MaterialIssue',
          entityId: mi.id,
          entityDocNo: mi.docNo,
          details: `Issued ${issueItems.length} material(s) for ${mr.docNo} -> ${mi.docNo}. Status: ${mr.status}`,
        },
        session || undefined,
      );

      return mi;
    });
  }

  /**
   * Atomically confirm Customer PO into confirmed Sales Order
   */
  public async confirmSalesOrder(
    body: {
      piId: string;
      deliveryAddress?: string;
      promisedDeliveryDate?: string;
      priority?: string;
      remarks?: string;
      allowCreditTerms?: boolean;
    },
    actor: { id: string; name: string },
  ): Promise<SalesOrder> {
    return withTransaction(async (session) => {
      const pi = await ProformaInvoiceModel.findOne({ id: body.piId }).session(session);
      if (!pi) throw new Error('NOT_FOUND:Proforma Invoice not found.');

      const existingSO = await SalesOrderModel.findOne({
        piId: pi.id,
        commercialStatus: { $ne: 'Cancelled' },
      }).session(session);
      if (existingSO) {
        throw new Error(`Sales Order already confirmed for ${pi.docNo}. Duplicate conversion blocked.`);
      }

      const cpo = await CustomerPOModel.findOne({ piId: pi.id }).session(session);
      if (!cpo) {
        throw new Error('A Customer Purchase Order must be recorded against this PI before confirming Sales Order.');
      }
      if (cpo.hasDiscrepancy && !cpo.discrepancyResolved) {
        throw new Error('Customer PO has an unresolved discrepancy against the PI. Resolve it before confirming SO.');
      }

      const qt = await QuotationModel.findOne({ id: pi.quotationId }).session(session);
      if (!qt || qt.status !== 'Accepted') {
        throw new Error('Linked quotation must be in Accepted status.');
      }

      const payments = await PaymentEntryModel.find({ piId: pi.id }).session(session).lean();
      const paySummary = calculatePaymentSummary(pi.totalAmount, payments as unknown as PaymentEntry[], {
        piId: pi.id,
      });
      if (paySummary.verifiedReceived <= 0 && !body.allowCreditTerms) {
        throw new Error(
          'At least one verified advance payment is required before confirming SO (or enable agreed credit terms).',
        );
      }

      const soDocNo = await this.getNextDocNo('SO', session || undefined);
      const now = new Date().toISOString();

      const so: SalesOrder = {
        id: generateId('so'),
        docNo: soDocNo,
        enquiryId: qt.enquiryId,
        enquiryDocNo: qt.enquiryDocNo,
        quotationId: qt.id,
        quotationDocNo: qt.docNo,
        piId: pi.id,
        piDocNo: pi.docNo,
        customerPoId: cpo.id,
        customerPoDocNo: cpo.docNo,
        customerPoNumber: cpo.customerPoNumber,
        customerId: pi.customerId,
        customerSnapshot: pi.customerSnapshot,
        items: pi.items,
        subtotal: pi.subtotal,
        discountAmount: pi.discountAmount,
        taxAmount: pi.taxAmount,
        totalAmount: pi.totalAmount,
        paymentTerms: pi.paymentTerms,
        deliveryTerms: pi.deliveryTerms,
        deliveryAddress: body.deliveryAddress?.trim() || pi.customerSnapshot.shippingAddress || '',
        promisedDeliveryDate: body.promisedDeliveryDate || cpo.expectedDeliveryDate || '',
        priority: (body.priority as 'Normal' | 'High' | 'Urgent') || 'Normal',
        commercialStatus: 'Confirmed',
        fulfillmentStatus: 'Awaiting Production',
        remarks: body.remarks?.trim() || '',
        createdBy: actor.name,
        createdAt: now,
        updatedAt: now,
      };

      await SalesOrderModel.create([so], { session: session || undefined });

      // Link any existing payments
      await PaymentEntryModel.updateMany(
        { piId: pi.id, salesOrderId: { $exists: false } },
        { $set: { salesOrderId: so.id, salesOrderDocNo: so.docNo, updatedAt: now } },
        { session: session || undefined },
      );

      await this.addActivity(
        {
          actorId: actor.id,
          actorName: actor.name,
          department: 'sales',
          action: 'Created Sales Order',
          entityType: 'SalesOrder',
          entityId: so.id,
          entityDocNo: so.docNo,
          details: `Confirmed Sales Order ${so.docNo} from PI ${pi.docNo} and Customer PO ${cpo.customerPoNumber}.`,
        },
        session || undefined,
      );

      await this.addNotification(
        {
          title: `Sales Order Confirmed: ${so.docNo}`,
          message: `Confirmed Sales Order ${so.docNo} for ${so.customerSnapshot.name}. Ready for production scheduling.`,
          department: 'production',
          severity: 'info',
          link: '/production/orders',
        },
        session || undefined,
      );

      return so;
    });
  }

  /**
   * Atomically complete a Quality Check and route to Rework or Logistics
   */
  public async completeQualityCheck(
    checkId: string,
    body: any,
    actor: { id: string; name: string },
  ): Promise<{ qc: QualityCheck; rework?: ReworkOrder }> {
    return withTransaction(async (session) => {
      const qc = await QualityCheckModel.findOne({ id: checkId }).session(session);
      if (!qc) throw new Error('NOT_FOUND:Quality Check record not found.');

      const now = new Date().toISOString();
      const finalResult = body.finalResult as 'Accepted' | 'Rejected';
      if (!['Accepted', 'Rejected'].includes(finalResult)) {
        throw new Error('Valid finalResult (Accepted or Rejected) is required.');
      }

      qc.finalResult = finalResult;
      qc.checks = body.checks || qc.checks;
      qc.acceptedQty = Number(body.acceptedQty ?? (finalResult === 'Accepted' ? qc.inspectedQty : 0));
      qc.rejectedQty = Number(body.rejectedQty ?? (finalResult === 'Rejected' ? qc.inspectedQty : 0));
      qc.rejectionReason = body.rejectionReason?.trim() || '';
      qc.remarks = body.remarks?.trim() || '';
      qc.inspector = actor.name;
      qc.inspectionDate = now.slice(0, 10);
      await qc.save({ session: session || undefined });

      const prodOrder = await ProductionOrderModel.findOne({ id: qc.productionOrderId }).session(session);
      let rework: ReworkOrder | undefined;

      if (finalResult === 'Accepted') {
        if (prodOrder) {
          prodOrder.qcAcceptedQty = round2((prodOrder.qcAcceptedQty || 0) + qc.acceptedQty);
          prodOrder.status = 'Completed';
          prodOrder.updatedAt = now;
          await prodOrder.save({ session: session || undefined });
          await syncSalesOrderFulfillmentMongo(prodOrder.salesOrderId, session || undefined);
        }

        await this.addNotification(
          {
            title: 'Product Passed QC',
            message: `Order ${prodOrder?.docNo || ''} has passed Quality Check and is ready for dispatch.`,
            department: 'logistics',
            severity: 'success',
            link: '/logistics/dispatch',
          },
          session || undefined,
        );
      } else {
        // Rejected -> Create Rework Order
        const rwDocNo = await this.getNextDocNo('RW', session || undefined);
        const rw: ReworkOrder = {
          id: generateId('rw'),
          docNo: rwDocNo,
          productionOrderId: qc.productionOrderId,
          productionOrderDocNo: qc.productionOrderDocNo,
          qcId: qc.id,
          qcDocNo: qc.docNo,
          affectedQty: qc.rejectedQty,
          affectedSerialNumbers: qc.serialNumbers || [],
          rejectionReason: qc.rejectionReason || 'Defects observed during QC',
          requiredCorrection: body.requiredCorrection || 'Resolve reported defects and resubmit for QC',
          assignedEmployee: body.assignedEmployee || prodOrder?.productionInCharge || 'Assembly Team',
          expectedCompletionDate: body.expectedCompletionDate || '',
          status: 'Open',
          remarks: body.remarks || '',
          createdBy: actor.name,
          createdAt: now,
          updatedAt: now,
        };
        await ReworkOrderModel.create([rw], { session: session || undefined });
        rework = rw;

        qc.reworkId = rw.id;
        qc.reworkDocNo = rw.docNo;
        await qc.save({ session: session || undefined });

        if (prodOrder) {
          prodOrder.qcRejectedQty = round2((prodOrder.qcRejectedQty || 0) + qc.rejectedQty);
          prodOrder.status = 'Rework';
          prodOrder.updatedAt = now;
          await prodOrder.save({ session: session || undefined });
          await syncSalesOrderFulfillmentMongo(prodOrder.salesOrderId, session || undefined);
        }

        await this.addNotification(
          {
            title: 'Rework Order Initiated',
            message: `QC reported defects for ${prodOrder?.docNo}. Rework order ${rwDocNo} created.`,
            department: 'production',
            severity: 'warning',
            link: '/production/quality-check',
          },
          session || undefined,
        );
      }

      await this.addActivity(
        {
          actorId: actor.id,
          actorName: actor.name,
          department: 'production',
          action: 'Completed Quality Inspection',
          entityType: 'QualityCheck',
          entityId: qc.id,
          entityDocNo: qc.docNo,
          details: `Completed QC ${qc.docNo} with result ${finalResult}.${rework ? ` Rework Order: ${rework.docNo}` : ''}`,
        },
        session || undefined,
      );

      return { qc: qc.toObject() as unknown as QualityCheck, rework };
    });
  }

  /**
   * Atomically allocate QC-approved production quantity and create Delivery Order with OCC protection
   */
  public async createDeliveryOrderTx(
    params: {
      productionOrderId: string;
      quantity: number;
      transportMethod: 'Own Vehicle' | 'Courier';
      vehicleNumber?: string;
      driverName?: string;
      driverPhone?: string;
      courierCompany?: string;
      trackingNumber?: string;
      courierContact?: string;
      deliveryAddress?: string;
      plannedDispatchDate?: string;
      expectedDeliveryDate?: string;
      serialNumbers?: string[];
      remarks?: string;
    },
    actor: { id: string; name: string },
  ): Promise<DeliveryOrder> {
    return withTransaction(async (session) => {
      const po = await ProductionOrderModel.findOne({ id: params.productionOrderId }).session(session || null);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'Completed' || po.qcAcceptedQty <= 0) {
        throw new Error('Only QC-accepted Completed production orders can be dispatched.');
      }

      // Check current active allocations
      const existingDeliveries = await DeliveryOrderModel.find({
        productionOrderId: po.id,
        status: { $ne: 'Cancelled' },
      }).session(session || null).lean();

      const allocated = existingDeliveries.reduce((sum, d) => sum + d.quantity, 0);
      const available = Math.max(0, po.qcAcceptedQty - allocated);
      const qty = Number(params.quantity);

      if (!qty || qty <= 0) {
        throw new Error('Delivery quantity must be a positive number.');
      }
      if (qty > available) {
        throw new Error(`Cannot allocate ${qty} unit(s); only ${available} available for ${po.docNo}.`);
      }

      // Serialize allocations against this order, including concurrent transaction snapshots.
      {
        const updatedPO = await ProductionOrderModel.findOneAndUpdate(
          { id: po.id, __v: po.__v },
          { $inc: { __v: 1 } },
          { session: session || undefined },
        );
        if (!updatedPO) {
          throw new Error('CONCURRENCY_CONFLICT:Production order modified concurrently during delivery allocation.');
        }
      }

      const transportMethod = params.transportMethod === 'Courier' ? 'Courier' : 'Own Vehicle';
      if (transportMethod === 'Own Vehicle') {
        if (!params.vehicleNumber?.trim() || !params.driverName?.trim() || !params.driverPhone?.trim()) {
          throw new Error('Vehicle number, driver name, and driver phone are required for Own Vehicle.');
        }
      } else {
        if (!params.courierCompany?.trim()) {
          throw new Error('Courier company name is required for Courier transport.');
        }
      }

      const so = await SalesOrderModel.findOne({ id: po.salesOrderId }).session(session || null).lean();
      const docNo = await this.getNextDocNo('DEL',session || undefined);
      const now = new Date().toISOString();

      const allocatedSerials=new Set(existingDeliveries.flatMap(d=>d.serialNumbers || []));
      const selectedSerials = params.serialNumbers?.length ? params.serialNumbers : (po.serialNumbers || []).filter(n=>!allocatedSerials.has(n)).slice(0,qty);
      if (selectedSerials.length>qty || new Set(selectedSerials).size!==selectedSerials.length || selectedSerials.some(n=>allocatedSerials.has(n))) {
        throw new Error('Select unallocated serial numbers within the shipment quantity.');
      }

      const delData = {
        id: generateId('del'),
        docNo,
        salesOrderId: po.salesOrderId,
        salesOrderDocNo: po.salesOrderDocNo,
        productionOrderId: po.id,
        productionOrderDocNo: po.docNo,
        customerId: po.customerId,
        customerName: po.customerName,
        productName: `${po.productName} (${po.model})`,
        quantity: qty,
        serialNumbers: selectedSerials,
        deliveryAddress: params.deliveryAddress?.trim() || so?.deliveryAddress || '',
        transportMethod,
        vehicleNumber: transportMethod === 'Own Vehicle' ? params.vehicleNumber?.trim() : undefined,
        driverName: transportMethod === 'Own Vehicle' ? params.driverName?.trim() : undefined,
        driverPhone: transportMethod === 'Own Vehicle' ? params.driverPhone?.trim() : undefined,
        courierCompany: transportMethod === 'Courier' ? params.courierCompany?.trim() : undefined,
        trackingNumber: transportMethod === 'Courier' ? params.trackingNumber?.trim() || '' : undefined,
        courierContact: transportMethod === 'Courier' ? params.courierContact?.trim() || '' : undefined,
        plannedDispatchDate: params.plannedDispatchDate || now.slice(0, 10),
        expectedDeliveryDate: params.expectedDeliveryDate || now.slice(0, 10),
        deliveredQty: 0,
        status: 'Planned' as const,
        history: [
          {
            timestamp: now,
            action: 'Delivery Order Created',
            actorName: actor.name,
            details: `Created ${docNo} (${transportMethod}) for ${qty}x ${po.productName}.`,
            status: 'Planned' as const,
          },
        ],
        remarks: params.remarks?.trim() || '',
        createdBy: actor.name,
        createdAt: now,
        updatedAt: now,
      };

      const del = new DeliveryOrderModel(delData);
      await del.save({ session: session || undefined });

      await this.addActivity(
        {
          actorId: actor.id,
          actorName: actor.name,
          department: 'logistics',
          action: 'Created Delivery Order',
          entityType: 'DeliveryOrder',
          entityId: del.id,
          entityDocNo: del.docNo,
          details: `Created ${del.docNo} (${transportMethod}) for ${qty}x ${del.productName}.`,
        },
        session || undefined,
      );

      return del.toObject() as unknown as DeliveryOrder;
    });
  }

  /**
   * Atomically cancel a Delivery Order before dispatch and release allocated quantity
   */
  public async cancelDeliveryOrderTx(
    deliveryOrderId: string,
    reason: string,
    actor: { id: string; name: string },
  ): Promise<DeliveryOrder> {
    return withTransaction(async (session) => {
      const del = await DeliveryOrderModel.findOne({ id: deliveryOrderId }).session(session || null);
      if (!del) throw new Error('NOT_FOUND:Delivery order not found.');
      if (del.status !== 'Planned') {
        throw new Error(`Delivery order ${del.docNo} cannot be cancelled because it is already ${del.status}. Only Planned delivery orders can be cancelled.`);
      }
      if (!reason?.trim()) {
        throw new Error('Cancellation reason is mandatory.');
      }

      const now = new Date().toISOString();
      del.status = 'Cancelled';
      del.cancellationReason = reason.trim();
      del.cancelledBy = actor.name;
      del.cancelledAt = now;
      del.updatedAt = now;
      if (!del.history) del.history = [];
      del.history.push({
        timestamp: now,
        action: 'Delivery Order Cancelled',
        actorName: actor.name,
        details: `Cancelled: ${reason.trim()}`,
        status: 'Cancelled',
      });

      await del.save({ session: session || undefined });

      await syncSalesOrderFulfillmentMongo(del.salesOrderId, session || undefined);

      await this.addActivity(
        {
          actorId: actor.id,
          actorName: actor.name,
          department: 'logistics',
          action: 'Cancelled Delivery Order',
          entityType: 'DeliveryOrder',
          entityId: del.id,
          entityDocNo: del.docNo,
          details: `Cancelled ${del.docNo}: ${reason.trim()}`,
        },
        session || undefined,
      );

      return del.toObject() as unknown as DeliveryOrder;
    });
  }

  /**
   * Atomically confirm delivery and synchronize Sales Order fulfillment
   */
  public async confirmDelivery(
    deliveryOrderId: string,
    body: any,
    actor: { id: string; name: string },
  ): Promise<{ deliveryOrder: DeliveryOrder; salesOrder?: SalesOrder }> {
    return withTransaction(async (session) => {
      const del = await DeliveryOrderModel.findOne({ id: deliveryOrderId }).session(session);
      if (!del) throw new Error('NOT_FOUND:Delivery Order not found.');
      if (del.status === 'Delivered') throw new Error('Delivery Order is already confirmed as Delivered.');
      if (del.status !== 'In Transit' && del.status !== 'Dispatched' && del.status !== 'Partially Delivered') {
        throw new Error(`Delivery must be In Transit before confirming delivery (current: ${del.status}).`);
      }

      const now = new Date().toISOString();
      const prevDelivered = del.deliveredQty || 0;
      const remainingToDeliver = del.quantity - prevDelivered;
      const deliveredNow = Number(body.deliveredQty ?? remainingToDeliver);

      if (!deliveredNow || deliveredNow <= 0) {
        throw new Error('Delivered quantity must be a positive number.');
      }
      if (deliveredNow > remainingToDeliver) {
        throw new Error(`Cannot deliver ${deliveredNow} unit(s); only ${remainingToDeliver} unit(s) remaining for ${del.docNo}.`);
      }

      const newDelivered = del.quantity ? Math.min(del.quantity, prevDelivered + deliveredNow) : deliveredNow;
      const delta = newDelivered - prevDelivered;

      del.actualDeliveryDate = body.actualDeliveryDate || body.deliveryDate || now.slice(0, 10);
      del.receivedBy = body.receivedBy?.trim() || del.receivedBy || del.customerName;
      del.deliveredQty = newDelivered;
      del.deliveryCondition = body.deliveryCondition || 'Good';
      del.podName = body.podName || del.podName;
      del.podDataUrl = body.podDataUrl || del.podDataUrl;
      del.podFileType = body.podFileType || del.podFileType;
      del.podFileSize = body.podFileSize || del.podFileSize;
      del.podUploadedBy = body.podUploadedBy || (body.podName ? actor.name : undefined);
      del.podUploadedAt = body.podUploadedAt || (body.podName ? now : undefined);
      del.deliveryRemarks = body.remarks?.trim() || del.deliveryRemarks || '';
      del.status = newDelivered >= del.quantity ? 'Delivered' : 'Partially Delivered';
      del.updatedAt = now;

      if (!del.history) del.history = [];
      del.history.push({
        timestamp: now,
        action: del.status === 'Delivered' ? 'Delivery Completed' : 'Partial Delivery Confirmed',
        actorName: actor.name,
        details: `Confirmed delivery of ${deliveredNow} unit(s) (Total: ${newDelivered}/${del.quantity}). Received by: ${del.receivedBy}.`,
        status: del.status,
      });

      await del.save({ session: session || undefined });

      const po = await ProductionOrderModel.findOne({ id: del.productionOrderId }).session(session || null);
      if (po) {
        po.deliveredQty = (po.deliveredQty || 0) + delta;
        po.updatedAt = now;
        await po.save({ session: session || undefined });
      }

      const updatedSO = await syncSalesOrderFulfillmentMongo(del.salesOrderId, session || undefined);

      await this.addActivity(
        {
          actorId: actor.id,
          actorName: actor.name,
          department: 'logistics',
          action: 'Confirmed Delivery',
          entityType: 'DeliveryOrder',
          entityId: del.id,
          entityDocNo: del.docNo,
          details: `Confirmed delivery of ${del.docNo} to ${del.receivedBy}.`,
        },
        session || undefined,
      );

      await this.addNotification(
        {
          title: del.status === 'Delivered' ? 'Delivery Completed' : 'Partial Delivery Recorded',
          message: `Delivery Order ${del.docNo} for Sales Order ${del.salesOrderDocNo} (${del.deliveredQty}/${del.quantity} units) received by ${del.receivedBy}.`,
          department: 'sales',
          severity: 'success',
          link: `/tracking/${del.salesOrderId}`,
        },
        session || undefined,
      );

      return {
        deliveryOrder: del.toObject() as unknown as DeliveryOrder,
        salesOrder: updatedSO || undefined,
      };
    });
  }
}

export const mongoERPRepository = new MongoERPRepository();
