export type Department = 'sales' | 'supply_chain' | 'production' | 'logistics' | 'admin';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'manage';

export type PermissionModule =
  | 'sales'
  | 'supply_chain'
  | 'production'
  | 'logistics'
  | 'admin'
  | 'tracking'
  | 'reports';

export type RolePermissionMap = Record<PermissionModule, PermissionAction[]>;

export interface Role {
  id: string;
  name: string;
  department: Department | 'all';
  description: string;
  permissions: RolePermissionMap;
}

export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  department: Department;
  roleId: string;
  designation: string;
  status: 'Active' | 'Inactive';
  passwordHash?: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  department: Department;
  roleId: string;
  roleName: string;
  designation: string;
  permissions: RolePermissionMap;
}

export interface CompanySettings {
  companyName: string;
  legalName: string;
  gstin: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankBranch: string;
  defaultTaxPercent: number;
  defaultPaymentTerms: string;
  defaultDeliveryTerms: string;
  defaultWarranty: string;
  currencySymbol: string;
  demoMode: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  department: Department | 'all';
  severity: 'info' | 'warning' | 'error' | 'success';
  link?: string;
  readBy: string[];
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  actorId: string;
  actorName: string;
  department: Department;
  action: string;
  entityType: string;
  entityId: string;
  entityDocNo: string;
  details: string;
  timestamp: string;
}

// ==========================================
// DEPARTMENT 1: SALES MANAGEMENT
// ==========================================

export interface Customer {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  billingAddress: string;
  shippingAddress: string;
  gstin: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductBomTemplateItem {
  materialId: string;
  quantityPerUnit: number;
  remarks?: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  model: string;
  specifications: string;
  highlights: string[];
  sellingPrice: number;
  unit: string;
  description: string;
  status: 'Active' | 'Inactive';
  bomTemplate: ProductBomTemplateItem[];
  stages: string[];
  createdAt: string;
}

export interface CustomerSnapshot {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  billingAddress: string;
  shippingAddress: string;
  gstin: string;
}

export interface EnquiryItem {
  id: string;
  productId: string;
  productName: string;
  model: string;
  quantity: number;
  requiredSpecifications: string;
  customerRequirements: string;
}

export type EnquiryStatus = 'New' | 'Contacted' | 'Qualified' | 'On Hold' | 'Rejected';

export interface Enquiry {
  id: string;
  docNo: string;
  customerId: string;
  customerSnapshot: CustomerSnapshot;
  source: 'Phone' | 'Email' | 'Website' | 'Direct';
  items: EnquiryItem[];
  expectedDeliveryDate: string;
  notes: string;
  status: EnquiryStatus;
  rejectionReason?: string;
  assignedTo: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  entityType: 'enquiry' | 'quotation';
  entityId: string;
  entityDocNo: string;
  customerName: string;
  summary: string;
  followUpDate: string;
  contactMethod: 'Call' | 'Email' | 'Meeting';
  discussion: string;
  nextFollowUpDate?: string;
  response: 'Pending' | 'Accepted' | 'Rejected' | 'Negotiation';
  rejectionReason?: string;
  status: 'Scheduled' | 'Completed' | 'Overdue' | 'Cancelled';
  followedBy: string;
  createdAt: string;
}

export interface QuotationItem {
  id: string;
  productId: string;
  productName: string;
  model: string;
  specifications: string;
  quantity: number;
  unitPrice: number;
  highlights: string[];
  lineTotal: number;
}

export type QuotationStatus =
  | 'Draft'
  | 'Sent'
  | 'Pending'
  | 'Negotiation'
  | 'Superseded'
  | 'Accepted'
  | 'Rejected'
  | 'Expired';

export interface Quotation {
  id: string;
  docNo: string;
  baseDocNo: string;
  version: number;
  enquiryId: string;
  enquiryDocNo: string;
  customerId: string;
  customerSnapshot: CustomerSnapshot;
  quotationDate: string;
  validityDate: string;
  items: QuotationItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  paymentTerms: string;
  deliveryTerms: string;
  warranty: string;
  remarks: string;
  status: QuotationStatus;
  acceptedAt?: string;
  acceptedBy?: string;
  rejectionReason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProformaInvoice {
  id: string;
  docNo: string;
  piDate: string;
  quotationId: string;
  quotationDocNo: string;
  enquiryId: string;
  customerId: string;
  customerSnapshot: CustomerSnapshot;
  items: QuotationItem[];
  subtotal: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  paymentTerms: string;
  deliveryTerms: string;
  bankDetails: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    ifsc: string;
    branch: string;
  };
  remarks: string;
  status: 'Issued' | 'PO Received' | 'Converted' | 'Cancelled';
  createdBy: string;
  createdAt: string;
}

export interface CustomerPO {
  id: string;
  docNo: string;
  piId: string;
  piDocNo: string;
  customerId: string;
  customerName: string;
  customerPoNumber: string;
  receivedDate: string;
  expectedDeliveryDate: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  hasDiscrepancy: boolean;
  discrepancyNotes?: string;
  discrepancyResolved: boolean;
  remarks: string;
  createdBy: string;
  createdAt: string;
}

export interface PaymentEntry {
  id: string;
  docNo: string;
  piId?: string;
  piDocNo?: string;
  salesOrderId?: string;
  salesOrderDocNo?: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentDate: string;
  method: 'Bank Transfer' | 'UPI' | 'Cheque' | 'Cash';
  paymentType: 'Advance' | 'Partial' | 'Full';
  transactionRef: string;
  proofName?: string;
  proofDataUrl?: string;
  status: 'Pending' | 'Verified' | 'Rejected' | 'Reversed';
  remarks: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdBy: string;
  createdAt: string;
}

export type SOFulfillmentStatus =
  | 'Awaiting Production'
  | 'In Production'
  | 'QC Pending'
  | 'Ready for Dispatch'
  | 'In Transit'
  | 'Partially Delivered'
  | 'Delivered';

export type SOPaymentStatus = 'Unpaid' | 'Partial' | 'Paid';

export interface SalesOrder {
  id: string;
  docNo: string;
  enquiryId: string;
  enquiryDocNo: string;
  quotationId: string;
  quotationDocNo: string;
  piId: string;
  piDocNo: string;
  customerPoId: string;
  customerPoDocNo: string;
  customerPoNumber: string;
  customerId: string;
  customerSnapshot: CustomerSnapshot;
  items: QuotationItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentTerms: string;
  deliveryTerms: string;
  deliveryAddress: string;
  promisedDeliveryDate: string;
  priority: 'Normal' | 'High' | 'Urgent';
  commercialStatus: 'Confirmed' | 'Cancelled' | 'Closed';
  fulfillmentStatus: SOFulfillmentStatus;
  remarks: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// DEPARTMENT 2: SUPPLY CHAIN MANAGEMENT
// ==========================================

export interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  specification: string;
  unit: string;
  minStock: number;
  currentStock?: number;
  storageLocation: string;
  preferredSupplierId?: string;
  active: boolean;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  suppliedMaterialIds: string[];
  notes: string;
  active: boolean;
  createdAt: string;
}

export interface MaterialRequestItem {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  requiredQty: number;
  issuedQty: number;
  receivedQty: number;
  returnedQty?: number;
}

export interface MaterialRequest {
  id: string;
  docNo: string;
  bomId: string;
  bomDocNo: string;
  productionOrderId: string;
  productionOrderDocNo: string;
  salesOrderId: string;
  salesOrderDocNo: string;
  productName: string;
  priority: 'Normal' | 'High' | 'Urgent';
  items: MaterialRequestItem[];
  status: 'Pending' | 'Partially Issued' | 'Fully Issued' | 'Cancelled';
  receiptStatus: 'Pending' | 'Partially Received' | 'Fully Received';
  requestedBy: string;
  requestDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialIssueItem {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  issuedQty: number;
  receivedQty: number;
}

export interface MaterialIssue {
  id: string;
  docNo: string;
  materialRequestId: string;
  materialRequestDocNo: string;
  productionOrderId: string;
  productionOrderDocNo: string;
  issueDate: string;
  items: MaterialIssueItem[];
  receiptAcknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  receiptDiscrepancyNotes?: string;
  issuedBy: string;
  remarks: string;
  createdAt: string;
}

export interface SupplierPOItem {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  orderedQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SupplierPO {
  id: string;
  docNo: string;
  supplierId: string;
  supplierName: string;
  purchaseType: 'Request-Based' | 'Normal';
  materialRequestId?: string;
  materialRequestDocNo?: string;
  poDate: string;
  expectedDeliveryDate: string;
  items: SupplierPOItem[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  status: 'Draft' | 'Ordered' | 'Partially Received' | 'Received' | 'Closed' | 'Cancelled';
  remarks: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GRNItem {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  orderedQty: number;
  previouslyReceivedQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
  verified: boolean;
}

export interface GRN {
  id: string;
  docNo: string;
  supplierPoId: string;
  supplierPoDocNo: string;
  supplierId: string;
  supplierName: string;
  isReplacement: boolean;
  supplierReturnId?: string;
  supplierReturnDocNo?: string;
  receivedDate: string;
  invoiceOrChallanNo: string;
  items: GRNItem[];
  attachmentName?: string;
  attachmentDataUrl?: string;
  verificationStatus: 'Pending' | 'Partially Accepted' | 'Accepted' | 'Rejected';
  verifiedBy?: string;
  verifiedAt?: string;
  verificationRemarks?: string;
  remarks: string;
  createdBy: string;
  createdAt: string;
}

export interface SupplierReturn {
  id: string;
  docNo: string;
  grnId: string;
  grnDocNo: string;
  supplierPoId: string;
  supplierPoDocNo: string;
  supplierId: string;
  supplierName: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  returnQty: number;
  reason: string;
  returnDate: string;
  replacementRequired: boolean;
  replacementStatus: 'Not Required' | 'Pending Replacement' | 'Replacement Received' | 'Closed';
  replacementGrnId?: string;
  replacementGrnDocNo?: string;
  attachmentName?: string;
  remarks: string;
  createdBy: string;
  createdAt: string;
}

export interface ProductionReturn {
  id: string;
  docNo: string;
  materialRequestId: string;
  materialRequestDocNo: string;
  productionOrderId: string;
  productionOrderDocNo: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  returnQty: number;
  materialCondition?: 'Usable' | 'Damaged' | 'Unusable';
  reason: string;
  remarks?: string;
  returnedBy: string;
  createdAt: string;
}

export interface StockTransaction {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  type:
    | 'Opening Balance'
    | 'GRN Accepted'
    | 'Material Issue'
    | 'Production Return'
    | 'Stock Adjustment';
  quantityDelta: number;
  balanceAfter: number;
  linkedDocType: string;
  linkedDocId: string;
  linkedDocNo: string;
  remarks: string;
  performedBy: string;
  timestamp: string;
}

// ==========================================
// DEPARTMENT 3: PRODUCTION MANAGEMENT
// ==========================================

export type ProductionStatus =
  | 'Planned'
  | 'Awaiting Materials'
  | 'Ready to Start'
  | 'In Progress'
  | 'QC Pending'
  | 'Rework'
  | 'Completed';

export interface ProductionOrder {
  id: string;
  docNo: string;
  salesOrderId: string;
  salesOrderDocNo: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  model: string;
  specifications: string;
  highlights: string[];
  quantity: number;
  plannedStartDate: string;
  plannedEndDate: string;
  plannedDurationDays: number;
  actualStartDate?: string;
  actualCompletionDate?: string;
  productionInCharge: string;
  assignedEmployees: string[];
  priority: 'Normal' | 'High' | 'Urgent';
  instructions: string;
  status: ProductionStatus;
  completedManufacturingQty: number;
  serialNumbers: string[];
  qcAcceptedQty: number;
  qcRejectedQty: number;
  dispatchedQty: number;
  deliveredQty: number;
  planningHistory?: Array<{
    previousStartDate: string;
    previousEndDate: string;
    newStartDate: string;
    newEndDate: string;
    reason: string;
    rescheduledBy: string;
    rescheduledAt: string;
  }>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BOMItem {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  qtyPerUnit: number;
  totalRequiredQty: number;
  remarks?: string;
}

export interface BOM {
  id: string;
  docNo: string;
  productionOrderId: string;
  productionOrderDocNo: string;
  productName: string;
  productionQty: number;
  items: BOMItem[];
  requestSent: boolean;
  materialRequestId?: string;
  materialRequestDocNo?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyProductionUpdate {
  id: string;
  productionOrderId: string;
  productionOrderDocNo: string;
  workDate: string;
  stage: string;
  workCompleted: string;
  completedQty: number;
  workHours: number;
  stageStatus: 'Pending' | 'In Progress' | 'Completed' | 'Blocked';
  issues: string;
  remarks: string;
  photoName?: string;
  photoDataUrl?: string;
  employeeName: string;
  createdAt: string;
}

export interface QCCheckItem {
  name: string;
  result: 'Pass' | 'Fail';
  observation: string;
}

export interface QualityCheck {
  id: string;
  docNo: string;
  attemptNumber: number;
  productionOrderId: string;
  productionOrderDocNo: string;
  productName: string;
  inspectedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  serialNumbers: string[];
  inspectionDate: string;
  inspector: string;
  checks: QCCheckItem[];
  finalResult: 'Accepted' | 'Rejected';
  rejectionReason?: string;
  reworkId?: string;
  reworkDocNo?: string;
  remarks: string;
  reportName?: string;
  reportDataUrl?: string;
  createdAt: string;
}

export interface ReworkOrder {
  id: string;
  docNo: string;
  productionOrderId: string;
  productionOrderDocNo: string;
  qcId: string;
  qcDocNo: string;
  affectedQty: number;
  affectedSerialNumbers: string[];
  rejectionReason: string;
  requiredCorrection: string;
  assignedEmployee: string;
  expectedCompletionDate: string;
  completedWork?: string;
  actualCompletionDate?: string;
  status: 'Open' | 'In Progress' | 'Completed' | 'Reinspection';
  remarks: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// DEPARTMENT 4: LOGISTICS & DELIVERY
// ==========================================

export type DeliveryStatus =
  | 'Planned'
  | 'Dispatched'
  | 'In Transit'
  | 'Partially Delivered'
  | 'Delivered'
  | 'Issue'
  | 'Cancelled';

export interface DeliveryHistoryEntry {
  timestamp: string;
  action: string;
  actorName: string;
  details: string;
  status: DeliveryStatus;
}

export interface DeliveryOrder {
  id: string;
  docNo: string;
  salesOrderId: string;
  salesOrderDocNo: string;
  productionOrderId: string;
  productionOrderDocNo: string;
  customerId: string;
  customerName: string;
  productName: string;
  quantity: number;
  serialNumbers: string[];
  deliveryAddress: string;
  transportMethod: 'Own Vehicle' | 'Courier';
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  courierCompany?: string;
  trackingNumber?: string;
  courierContact?: string;
  plannedDispatchDate: string;
  expectedDeliveryDate: string;
  actualDispatchDate?: string;
  deliveryChallanNo?: string;
  dispatchAttachmentName?: string;
  dispatchAttachmentDataUrl?: string;
  dispatchRemarks?: string;
  actualDeliveryDate?: string;
  receivedBy?: string;
  deliveredQty: number;
  deliveryCondition?: 'Good' | 'Damaged';
  podName?: string;
  podDataUrl?: string;
  podFileType?: string;
  podFileSize?: number;
  podUploadedBy?: string;
  podUploadedAt?: string;
  deliveryRemarks?: string;
  status: DeliveryStatus;
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  history?: DeliveryHistoryEntry[];
  remarks: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryIssueType =
  | 'Customer Unavailable'
  | 'Incorrect Address'
  | 'Delivery Delayed'
  | 'Vehicle Breakdown'
  | 'Courier Delay'
  | 'Product Damaged'
  | 'Customer Rejected Delivery'
  | 'Partial Delivery'
  | 'Other'
  | 'Failed Attempt'
  | 'Delay'
  | 'Damage'
  | 'Shortage';

export type DeliveryIssueResolution =
  | 'Retry Delivery'
  | 'Reschedule Delivery'
  | 'Delivery Confirmed'
  | 'Returned to CRYO'
  | 'Requires Further Action';

export interface DeliveryIssue {
  id: string;
  deliveryOrderId: string;
  deliveryOrderDocNo: string;
  salesOrderDocNo: string;
  customerName: string;
  issueType: DeliveryIssueType;
  affectedQty: number;
  reason: string;
  reportedDate: string;
  responsibleEmployee: string;
  correctiveAction: string;
  nextAttemptDate?: string;
  status: 'Open' | 'Resolved';
  resolutionOutcome?: DeliveryIssueResolution;
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

// ==========================================
// FULL ERP DATABASE SNAPSHOT
// ==========================================

export interface DocCounters {
  ENQ: number;
  QT: number;
  PI: number;
  CPO: number;
  PAY: number;
  SO: number;
  PROD: number;
  BOM: number;
  MR: number;
  SPO: number;
  GRN: number;
  MI: number;
  SR: number;
  QC: number;
  RW: number;
  DEL: number;
  EMP?: number;
  MAT?: number;
  PRT?: number;
}

export interface ERPDatabase {
  counters: DocCounters;
  company: CompanySettings;
  roles: Role[];
  employees: Employee[];
  notifications: NotificationItem[];
  activityLogs: ActivityLog[];
  customers: Customer[];
  products: Product[];
  enquiries: Enquiry[];
  followUps: FollowUp[];
  quotations: Quotation[];
  proformaInvoices: ProformaInvoice[];
  customerPOs: CustomerPO[];
  payments: PaymentEntry[];
  salesOrders: SalesOrder[];
  materials: Material[];
  suppliers: Supplier[];
  materialRequests: MaterialRequest[];
  materialIssues: MaterialIssue[];
  supplierPOs: SupplierPO[];
  grns: GRN[];
  supplierReturns: SupplierReturn[];
  stockTransactions: StockTransaction[];
  productionOrders: ProductionOrder[];
  boms: BOM[];
  dailyUpdates: DailyProductionUpdate[];
  qualityChecks: QualityCheck[];
  reworkOrders: ReworkOrder[];
  productionReturns?: ProductionReturn[];
  deliveryOrders: DeliveryOrder[];
  deliveryIssues: DeliveryIssue[];
}
