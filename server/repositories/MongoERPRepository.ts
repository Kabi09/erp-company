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
  calculatePaymentSummary,
  calculateQuotationTotals,
  computeMaterialStockMap,
  deriveMaterialRequestStatus,
  normalizeQuotationItems,
  round2,
  validateMaterialIssueLine,
} from '../../src/utils/erpLogic';
import { withTransaction } from '../config/database';
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
      deliveryOrders,
      deliveryIssues,
      notifications,
      activityLogs,
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
      DeliveryOrderModel.find().sort({ createdAt: -1 }).lean(),
      DeliveryIssueModel.find().sort({ createdAt: -1 }).lean(),
      NotificationModel.find().sort({ createdAt: -1 }).lean(),
      ActivityLogModel.find().sort({ timestamp: -1 }).lean(),
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
      deliveryOrders: deliveryOrders as unknown as DeliveryOrder[],
      deliveryIssues: deliveryIssues as unknown as DeliveryIssue[],
      notifications: notifications as unknown as NotificationItem[],
      activityLogs: activityLogs as unknown as ActivityLog[],
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

  public async getPaginatedProductionOrders(query: PaginationQuery): Promise<PaginatedResult<ProductionOrder>> {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ docNo: s }, { salesOrderDocNo: s }, { productName: s }];
    }
    return this.paginate<ProductionOrder>(ProductionOrderModel, filter, query);
  }

  public async getPaginatedDeliveryOrders(query: PaginationQuery): Promise<PaginatedResult<DeliveryOrder>> {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.search?.trim()) {
      const s = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ docNo: s }, { salesOrderDocNo: s }, { customerName: s }, { trackingNumber: s }];
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
    const [orders, dailyCount, pendingQC, activeRework] = await Promise.all([
      ProductionOrderModel.find().lean(),
      DailyProductionUpdateModel.countDocuments(),
      QualityCheckModel.countDocuments({ finalResult: 'Rejected' as any }),
      ReworkOrderModel.countDocuments({ status: { $in: ['Open', 'In Progress'] } as any }),
    ]);

    return {
      totalProductionOrders: orders.length,
      planned: orders.filter((o) => o.status === 'Planned').length,
      inProduction: orders.filter((o) => o.status === 'In Progress').length,
      completed: orders.filter((o) => o.status === 'Completed').length,
      dailyUpdatesCount: dailyCount,
      pendingQualityChecks: pendingQC,
      activeReworkOrders: activeRework,
    };
  }

  public async getLogisticsSummary() {
    const [deliveryOrders, issues] = await Promise.all([
      DeliveryOrderModel.find().lean(),
      DeliveryIssueModel.countDocuments({ resolved: false }),
    ]);

    return {
      totalDeliveryOrders: deliveryOrders.length,
      dispatched: deliveryOrders.filter((d) => d.status === 'Dispatched').length,
      inTransit: deliveryOrders.filter((d) => d.status === 'In Transit').length,
      delivered: deliveryOrders.filter((d) => d.status === 'Delivered').length,
      unresolvedIssues: issues,
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
  ): Promise<MaterialIssue> {
    return withTransaction(async (session) => {
      const mr = await MaterialRequestModel.findOne({ id: requestId }).session(session);
      if (!mr) throw new Error('NOT_FOUND:Material request not found.');
      if (mr.status === 'Fully Issued' || mr.status === 'Cancelled') {
        throw new Error(`Material request ${mr.docNo} is already ${mr.status}.`);
      }

      const validLines = (rawItems || []).filter((i) => Number(i.issuingQty) > 0);
      if (validLines.length === 0) {
        throw new Error('Enter a positive issuing quantity for at least one material.');
      }

      // Step 1: Pre-validate all lines against Material Request pending requirements
      for (const line of validLines) {
        const issueQty = Number(line.issuingQty);
        const mrItem = mr.items.find((x) => x.materialId === line.materialId);
        if (!mrItem) throw new Error(`Material ${line.materialId} is not on ${mr.docNo}.`);
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
          remarks: `Issued to ${mr.productionOrderDocNo}`,
          performedBy: actor.name,
          timestamp: now,
        });
      }

      const mi: MaterialIssue = {
        id: miId,
        docNo: miDocNo,
        materialRequestId: mr.id,
        materialRequestDocNo: mr.docNo,
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
        await StockTransactionModel.create(stockTxDocs, { session: session || undefined });
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

      const now = new Date().toISOString();
      del.status = 'Delivered';
      del.actualDeliveryDate = body.actualDeliveryDate || now.slice(0, 10);
      del.receivedBy = body.receivedBy?.trim() || del.customerName;
      del.deliveredQty = Number(body.deliveredQty ?? del.quantity);
      del.deliveryCondition = body.deliveryCondition || 'Good';
      del.updatedAt = now;
      await del.save({ session: session || undefined });

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
          title: 'Delivery Completed',
          message: `Delivery Order ${del.docNo} for Sales Order ${del.salesOrderDocNo} has been delivered.`,
          department: 'sales',
          severity: 'success',
          link: '/sales/orders',
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
