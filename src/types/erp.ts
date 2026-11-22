export type Department = 'sales' | 'supply_chain' | 'production' | 'logistics' | 'service' | 'rd' | 'admin';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'submit'
  | 'approve'
  | 'verify'
  | 'confirm'
  | 'export'
  | 'manage';

export type PermissionModule =
  | 'sales'
  | 'supply_chain'
  | 'production'
  | 'logistics'
  | 'service'
  | 'rd'
  | 'admin'
  | 'tracking'
  | 'reports'
  | string;

export type RolePermissionMap = Record<string, PermissionAction[]>;

export interface Role {
  id: string;
  name: string;
  department: Department | 'all';
  description: string;
  permissions: RolePermissionMap;
}

export type OverrideEffect = 'inherit' | 'allow' | 'deny';
export type EmployeePermissionOverrides = Record<string, Record<string, 'allow' | 'deny'>>;

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
  permissionOverrides?: EmployeePermissionOverrides;
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
  effectivePermissions?: Record<string, PermissionAction[]>;
  permissionOverrides?: EmployeePermissionOverrides;
}

// ==========================================
// UNIVERSAL MODULE REGISTRY & CATALOG
// ==========================================

export interface ModuleDef {
  id: string;
  name: string;
  department: Department | 'shared' | 'admin';
  description: string;
  actions: PermissionAction[];
}

export const ERP_MODULE_CATALOG: ModuleDef[] = [
  // Sales Department
  { id: 'sales_dashboard', name: 'Sales Dashboard', department: 'sales', description: 'Department KPIs, enquiry metrics, pipeline summaries', actions: ['view', 'export'] },
  { id: 'customers', name: 'Customer Directory', department: 'sales', description: 'Customer profiles, GSTINs, and contact information', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'products', name: 'Product Catalog', department: 'sales', description: 'Finished equipment models, specifications, and BOM links', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'enquiries', name: 'Customer Enquiries', department: 'sales', description: 'Inbound RFQs, requirements intake, and follow-ups', actions: ['view', 'create', 'edit', 'delete', 'submit', 'verify', 'export'] },
  { id: 'quotations', name: 'Price Quotations', department: 'sales', description: 'Commercial offers, pricing revisions, and terms', actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export'] },
  { id: 'proforma_invoices', name: 'Proforma Invoices', department: 'sales', description: 'Advance proforma billing and banking instructions', actions: ['view', 'create', 'edit', 'delete', 'submit', 'confirm', 'export'] },
  { id: 'customer_pos', name: 'Customer PO Records', department: 'sales', description: 'Received customer purchase orders and document audit', actions: ['view', 'create', 'edit', 'delete', 'verify', 'export'] },
  { id: 'payments', name: 'Payment Entries', department: 'sales', description: 'Payment reconciliations and ledger entries', actions: ['view', 'create', 'edit', 'delete', 'verify', 'confirm', 'export'] },
  { id: 'sales_orders', name: 'Sales Orders', department: 'sales', description: 'Binding sales order bookings and fulfillment tracking', actions: ['view', 'create', 'edit', 'delete', 'confirm', 'export'] },
  { id: 'sales_reports', name: 'Sales Reports', department: 'sales', description: 'Sales analytics, revenue breakdowns, and exports', actions: ['view', 'export'] },

  // Supply Chain Department
  { id: 'supply_chain_dashboard', name: 'Supply Chain Dashboard', department: 'supply_chain', description: 'Stock levels, procurement metrics, and alerts', actions: ['view', 'export'] },
  { id: 'materials', name: 'Material Master', department: 'supply_chain', description: 'Raw material codes, reorder thresholds, and specs', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'inventory', name: 'Inventory & Stock Map', department: 'supply_chain', description: 'Real-time bin balances and store valuations', actions: ['view', 'edit', 'export'] },
  { id: 'material_requests', name: 'Material Requests', department: 'supply_chain', description: 'Production floor requisition indent orders', actions: ['view', 'create', 'edit', 'delete', 'submit', 'verify', 'export'] },
  { id: 'material_issues', name: 'Material Issues', department: 'supply_chain', description: 'Store store issue vouchers and delivery handovers', actions: ['view', 'create', 'edit', 'delete', 'verify', 'confirm', 'export'] },
  { id: 'suppliers', name: 'Supplier Directory', department: 'supply_chain', description: 'Approved vendor accounts, terms, and contacts', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'supplier_pos', name: 'Supplier POs', department: 'supply_chain', description: 'External procurement purchase orders to vendors', actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export'] },
  { id: 'grn', name: 'Goods Receipt Notes (GRN)', department: 'supply_chain', description: 'Gate inbound receipts and QC physical check', actions: ['view', 'create', 'edit', 'delete', 'verify', 'confirm', 'export'] },
  { id: 'supplier_returns', name: 'Supplier Returns', department: 'supply_chain', description: 'Rejection debit notes and supplier return vouchers', actions: ['view', 'create', 'edit', 'delete', 'submit', 'confirm', 'export'] },
  { id: 'stock_adjustments', name: 'Stock Adjustments', department: 'supply_chain', description: 'Inventory cycle count alignments and ledger audit', actions: ['view', 'create', 'verify', 'confirm', 'export'] },
  { id: 'stock_history', name: 'Stock Ledger History', department: 'supply_chain', description: 'Immutable transaction ledger of all bin movements', actions: ['view', 'export'] },
  { id: 'supply_chain_reports', name: 'Supply Chain Reports', department: 'supply_chain', description: 'Procurement and stock movement reports', actions: ['view', 'export'] },

  // Production Department
  { id: 'production_dashboard', name: 'Production Dashboard', department: 'production', description: 'Shop floor KPIs, work in progress, and output metrics', actions: ['view', 'export'] },
  { id: 'received_orders', name: 'Received Sales Orders', department: 'production', description: 'Sales bookings ready for engineering release', actions: ['view', 'confirm', 'export'] },
  { id: 'production_orders', name: 'Production Orders', department: 'production', description: 'Shop work orders, execution stages, and targets', actions: ['view', 'create', 'edit', 'delete', 'submit', 'confirm', 'export'] },
  { id: 'production_planning', name: 'Production Planning', department: 'production', description: 'Batch scheduling, machine allocation, and dates', actions: ['view', 'create', 'edit', 'export'] },
  { id: 'bom', name: 'Bills of Materials (BOM)', department: 'production', description: 'Multi-level engineering recipes and material specs', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'material_receipts', name: 'Material Receipts', department: 'production', description: 'Physical store issue acceptance and verification', actions: ['view', 'verify', 'confirm', 'export'] },
  { id: 'daily_updates', name: 'Daily Production Logs', department: 'production', description: 'Shift manufacturing logs, machine hours, and output', actions: ['view', 'create', 'edit', 'export'] },
  { id: 'quality_checks', name: 'Quality Inspections (QC)', department: 'production', description: 'Stage-gate inspections and technical test reports', actions: ['view', 'create', 'edit', 'verify', 'confirm', 'export'] },
  { id: 'rework', name: 'Rework Orders', department: 'production', description: 'Non-conforming unit rework loops and re-inspection', actions: ['view', 'create', 'edit', 'confirm', 'export'] },
  { id: 'completed_production', name: 'Finished Goods Handoff', department: 'production', description: 'QC-passed units ready for logistics dispatch', actions: ['view', 'confirm', 'export'] },
  { id: 'production_reports', name: 'Production Reports', department: 'production', description: 'Manufacturing efficiency, yields, and cycle times', actions: ['view', 'export'] },

  // Logistics Department
  { id: 'logistics_dashboard', name: 'Logistics Dashboard', department: 'logistics', description: 'Dispatch volume, transit tracking, and on-time rate', actions: ['view', 'export'] },
  { id: 'ready_dispatch', name: 'Ready for Dispatch', department: 'logistics', description: 'Completed FG units awaiting vehicle assignment', actions: ['view', 'create', 'confirm', 'export'] },
  { id: 'delivery_orders', name: 'Delivery Challans (DC)', department: 'logistics', description: 'Shipment manifests, e-way bills, and transit tracking', actions: ['view', 'create', 'edit', 'delete', 'submit', 'confirm', 'export'] },
  { id: 'in_transit', name: 'In-Transit Shipments', department: 'logistics', description: 'Live shipment tracking, driver contact, and GPS check', actions: ['view', 'edit', 'confirm', 'export'] },
  { id: 'completed_deliveries', name: 'Completed Deliveries', department: 'logistics', description: 'Customer sign-off, signed POD records, and archive', actions: ['view', 'export'] },
  { id: 'delivery_issues', name: 'Delivery Incidents', department: 'logistics', description: 'Transit damages, customer refusal, and rerouting', actions: ['view', 'create', 'edit', 'confirm', 'export'] },
  { id: 'delivery_history', name: 'Dispatch History Archive', department: 'logistics', description: 'Historical shipment records and search', actions: ['view', 'export'] },
  { id: 'logistics_reports', name: 'Logistics Reports', department: 'logistics', description: 'Carrier performance, delivery SLAs, and freight cost', actions: ['view', 'export'] },

  // Service Department
  { id: 'service_dashboard', name: 'Service Dashboard', department: 'service', description: 'Technician dispatch, open tickets, SLAs, and performance metrics', actions: ['view', 'export'] },
  { id: 'delivered_products', name: 'Delivered Products Register', department: 'service', description: 'Customer delivered machinery, serial numbers, and warranty records', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'service_requests', name: 'Service Requests', department: 'service', description: 'Customer breakdown tickets, warranty claim reviews, and triage', actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export'] },
  { id: 'service_jobs', name: 'Service Work Orders', department: 'service', description: 'Technician job sheets, check-in/out, work updates, and checklists', actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export'] },
  { id: 'service_schedule', name: 'Technician Schedule', department: 'service', description: 'Technician site visit calendar and field allocations', actions: ['view', 'create', 'edit', 'export'] },
  { id: 'service_materials', name: 'Service Spare Requests', department: 'service', description: 'Spare parts indent to supply chain, receipt, and consumption', actions: ['view', 'create', 'edit', 'submit', 'confirm', 'export'] },
  { id: 'service_expenses', name: 'Technician Expenses & Advances', department: 'service', description: 'Travel advances, expense claims, verification, and settlement', actions: ['view', 'create', 'edit', 'verify', 'confirm', 'export'] },
  { id: 'service_billing', name: 'Service Billing & Invoicing', department: 'service', description: 'Chargeable service invoices, spare billing, and payment tracking', actions: ['view', 'create', 'edit', 'confirm', 'export'] },
  { id: 'completed_services', name: 'Service History & Reports', department: 'service', description: 'Archived service completion reports and customer sign-offs', actions: ['view', 'export'] },
  { id: 'service_reports', name: 'Service Department Reports', department: 'service', description: 'Warranty claim trends, MTBF, MTTR, and technician utilization', actions: ['view', 'export'] },

  // Research & Development (R&D) Department
  { id: 'rd_dashboard', name: 'R&D Dashboard', department: 'rd', description: 'Active prototype metrics, testing queues, and milestone tracking', actions: ['view', 'export'] },
  { id: 'rd_projects', name: 'R&D Projects', department: 'rd', description: 'Product development projects, innovation milestones, and budgets', actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export'] },
  { id: 'rd_specifications', name: 'Product Specifications', department: 'rd', description: 'Dynamic technical design specifications, parameters, and tolerances', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'rd_bom', name: 'Prototype BOM & Materials', department: 'rd', description: 'Experimental BOMs, component requisitions, and inventory requests', actions: ['view', 'create', 'edit', 'delete', 'submit', 'export'] },
  { id: 'rd_work_updates', name: 'Daily R&D Work Updates', department: 'rd', description: 'Fabrication & engineering updates, multi-stage logs, and highlights', actions: ['view', 'create', 'edit', 'export'] },
  { id: 'rd_testing', name: 'Prototype Testing & Validation', department: 'rd', description: 'Dynamic test protocols, Pass/Fail/Pending checklist, and retest runs', actions: ['view', 'create', 'edit', 'verify', 'confirm', 'export'] },
  { id: 'completed_rd_projects', name: 'Completed R&D Archive', department: 'rd', description: 'Successfully completed R&D projects and validated prototypes archive', actions: ['view', 'export'] },
  { id: 'rd_reports', name: 'R&D Department Reports', department: 'rd', description: 'R&D testing yields, budget utilization, and milestone completion velocity', actions: ['view', 'export'] },

  // Shared & Admin
  { id: 'tracking', name: 'Centralized Order Tracking', department: 'shared', description: 'End-to-end 15-stage order lifecycle visibility', actions: ['view', 'export'] },
  { id: 'notifications', name: 'System Notifications', department: 'shared', description: 'Cross-department alerts and broadcast announcements', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'documents', name: 'Document Vault & Attachments', department: 'shared', description: 'Signed POs, test certificates, and file storage', actions: ['view', 'create', 'delete', 'export'] },
  { id: 'admin_dashboard', name: 'Administration Overview', department: 'admin', description: 'System health, global audit, and enterprise metrics', actions: ['view', 'export'] },
  { id: 'employees', name: 'Employee Directory', department: 'admin', description: 'Staff directory, account credentials, and departments', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'roles', name: 'Roles & Permissions Matrix', department: 'admin', description: 'Role permission policies and security boundaries', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
  { id: 'employee_access', name: 'Employee Access Overrides', department: 'admin', description: 'Per-employee granular Inherit/Allow/Deny overrides', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
  { id: 'approval_workflows', name: 'Approval Workflows Policy', department: 'admin', description: 'Multi-level approval rules, triggers, and approvers', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
  { id: 'approval_inbox', name: 'Universal Approval Inbox', department: 'admin', description: 'Centralized review, approval, and decision history', actions: ['view', 'approve', 'confirm', 'export'] },
  { id: 'company', name: 'Company Profile & Banking', department: 'admin', description: 'Enterprise GSTIN, banking, and document letterheads', actions: ['view', 'edit'] },
  { id: 'settings', name: 'Application Settings', department: 'admin', description: 'Document numbering prefixes and tax rate defaults', actions: ['view', 'edit'] },
  { id: 'audit_logs', name: 'Immutable Audit Trail', department: 'admin', description: 'Security activity logs and user compliance trail', actions: ['view', 'export'] },
  { id: 'admin_reports', name: 'Executive Master Reports', department: 'admin', description: 'Consolidated cross-department operational reports', actions: ['view', 'export'] },
];

// ==========================================
// APPROVAL WORKFLOW ENGINE TYPES
// ==========================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'withdrawn';
export type ApprovalDecisionType = 'approved' | 'rejected' | 'changes_requested';

export interface ApprovalLevelConfig {
  levelNumber: number;
  levelName: string;
  approverType: 'role' | 'employee' | 'either';
  eligibleRoleIds: string[];
  eligibleEmployeeIds: string[];
  requiredApprovalCount: number;
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  department: Department;
  module: string;
  triggerAction: string;
  description: string;
  enabled: boolean;
  allowSelfApproval: boolean;
  approvalLevels: ApprovalLevelConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalDecisionRecord {
  levelNumber: number;
  levelName: string;
  decidedBy: {
    id: string;
    name: string;
    employeeId: string;
    roleName: string;
  };
  decision: ApprovalDecisionType;
  remarks: string;
  decidedAt: string;
}

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  workflowName: string;
  department: Department;
  module: string;
  documentId: string;
  documentDocNo: string;
  documentVersion: string;
  submittedBy: {
    id: string;
    name: string;
    employeeId: string;
    roleId: string;
    department: Department;
  };
  submittedAt: string;
  documentSnapshot: any;
  currentLevel: number;
  totalLevels: number;
  status: ApprovalStatus;
  decisions: ApprovalDecisionRecord[];
  createdAt: string;
  updatedAt: string;
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
  state?: string;
  country?: string;
  upiId?: string;
  defaultQuotationTerms?: string;
  authorizedSignatoryName?: string;
  authorizedSignatoryDesignation?: string;
  documentPrefixes?: Record<string, string>;
  taxConfigurations?: Array<{ name: string; rate: number }>;
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
  recipientEmployeeId?: string;
  relatedModule?: string;
  relatedDocumentId?: string;
  dedupKey?: string;
}

export interface AttachmentRecord {
  id: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  module: PermissionModule | 'admin';
  recordId: string;
  recordDocNo?: string;
  uploadedBy: string;
  uploadedAt: string;
  isMigrated?: boolean;
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
  | 'Pending Approval'
  | 'Approved'
  | 'Changes Requested'
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
  department?: Department | string;
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
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Changes Requested' | 'Ordered' | 'Partially Received' | 'Received' | 'Closed' | 'Cancelled' | 'Rejected';
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

export type WorkUpdateType = 'Preliminary Planning / Preparation' | 'Manufacturing Progress';

export interface DailyProductionUpdate {
  id: string;
  productionOrderId: string;
  productionOrderDocNo: string;
  workDate: string;
  workType?: WorkUpdateType;
  stage: string;
  selectedStages?: string[];
  workCompleted: string;
  highlights?: string[];
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

export type QCItemResult = 'Pass' | 'Fail' | 'Pending';

export interface QCCheckItem {
  id?: string;
  name: string;
  result: QCItemResult;
  observation?: string;
  measuredValue?: string;
  expectedValue?: string;
  required?: boolean;
  passed?: boolean;
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
  finalResult: 'Accepted' | 'Rejected' | 'Pending';
  rejectionReason?: string;
  reworkId?: string;
  reworkDocNo?: string;
  remarks: string;
  reportName?: string;
  reportDataUrl?: string;
  createdAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  normalizedName: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingStageDefinition {
  id: string;
  name: string;
  normalizedName: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
  | 'Cancelled'
  | 'Pending Cancellation';

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
// SERVICE MANAGEMENT TYPES
// ==========================================

export type WarrantyStatus = 'Under Warranty' | 'Expired' | 'Not Configured';

export interface DeliveredProduct {
  id: string;
  serialNumber: string;
  productId: string;
  productName: string;
  modelNumber: string;
  customerId: string;
  customerName: string;
  customerContact?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress: string;
  salesOrderId?: string;
  salesOrderDocNo?: string;
  productionOrderId?: string;
  productionOrderDocNo?: string;
  deliveryOrderId?: string;
  deliveryOrderDocNo?: string;
  deliveredDate: string;
  warrantyPeriodMonths: number;
  warrantyStartDate: string;
  warrantyEndDate: string;
  warrantyStatus: WarrantyStatus;
  status: 'Active' | 'Under Service' | 'Decommissioned';
  notes?: string;
  serviceHistory?: Array<{
    serviceJobId: string;
    serviceJobDocNo: string;
    completedDate: string;
    technicianName: string;
    issueDescription: string;
  }>;
  createdAt: string;
  updatedAt?: string;
}

export type ServicePriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type ServiceLocation = 'Customer Site' | 'CRYO Workshop';
export type ServiceRequestStatus = 'Open' | 'Assigned' | 'In Progress' | 'Completed' | 'Cancelled';

export interface ServiceRequest {
  id: string;
  docNo: string; // SRV-xxxx
  requestDate: string;
  customerId: string;
  customerName: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  serviceAddress: string;
  deliveredProductId: string;
  serialNumber: string;
  productName: string;
  modelNumber?: string;
  serviceType: ServiceLocation;
  priority: ServicePriority;
  issueDescription: string;
  isUnderWarranty: boolean;
  warrantyClaimValid: boolean;
  warrantyRemarks?: string;
  status: ServiceRequestStatus;
  assignedJobId?: string;
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  scheduledDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ServiceJobStatus = 'Scheduled' | 'In Progress' | 'Awaiting Spares' | 'Work Completed' | 'Billed' | 'Closed';

export interface ServiceJobCheckIn {
  timestamp: string;
  performedBy: string;
  location?: string;
  notes?: string;
}

export interface ServiceJobCheckOut {
  timestamp: string;
  performedBy: string;
  resolutionSummary: string;
  customerRepresentativeName?: string;
  customerSignatureAck?: boolean;
}

export interface ServiceJobVisit {
  visitNumber: number;
  checkInTime: string;
  checkOutTime?: string;
  durationMinutes?: number;
  technicianId?: string;
  technicianName?: string;
  location?: string;
  resolutionSummary?: string;
  workSummary?: string;
  notes?: string;
}

export interface WorkshopCustody {
  status?: string;
  condition?: string;
  receivedDate?: string;
  receivedBy?: string;
  receivedCondition?: string;
  photos?: string[];
  returnDate?: string;
  returnStatus?: 'Pending' | 'Ready for Pickup' | 'Collected by Customer' | 'Dispatched' | string;
  customerConfirmation?: boolean;
  customerSignatoryName?: string;
  returnNotes?: string;
}

export interface ServiceJob {
  id: string;
  docNo: string; // JOB-xxxx
  serviceRequestId: string;
  serviceRequestDocNo: string;
  customerId: string;
  customerName: string;
  deliveredProductId: string;
  serialNumber: string;
  productName: string;
  serviceType: ServiceLocation;
  priority: ServicePriority;
  assignedTechnicianId: string;
  assignedTechnicianName: string;
  scheduledDate: string;
  scheduledTime?: string;
  instructions?: string;
  status: ServiceJobStatus;
  checkIn?: ServiceJobCheckIn;
  checkInTime?: string;
  checkOut?: ServiceJobCheckOut;
  checkOutTime?: string;
  totalDurationMinutes?: number;
  visits?: ServiceJobVisit[];
  workshopDetails?: WorkshopCustody;
  finalProductCondition?: string;
  completionSummary?: string;
  diagnosisSummary?: string;
  rootCause?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  totalHoursSpent?: number;
  customerFeedbackScore?: number;
  customerFeedbackNotes?: string;
  isChargeable: boolean;
  billingId?: string;
  completionDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DynamicChecklistItem {
  id: string;
  item: string;
  result: 'Pass' | 'Fail' | 'Pending';
  remarks?: string;
}

export interface ServiceWorkUpdate {
  id: string;
  serviceJobId: string;
  date: string;
  technicianId: string;
  technicianName: string;
  stageName: string;
  hoursSpent: number;
  highlights: string[];
  checklist: DynamicChecklistItem[];
  findingsNotes?: string;
  createdAt: string;
}

export interface ServiceMaterialItem {
  materialId?: string;
  materialName: string;
  partNumber?: string;
  quantityRequested: number;
  quantityIssued: number;
  quantityUsed: number;
  quantityReturned: number;
  unit: string;
  unitCost?: number;
  totalCost?: number;
}

export interface ServiceMaterialRequest {
  id: string;
  docNo: string; // SMR-xxxx
  serviceJobId: string;
  serviceJobDocNo: string;
  customerId: string;
  customerName: string;
  requestedBy: string;
  requestDate: string;
  items: ServiceMaterialItem[];
  status: 'Pending' | 'Requested' | 'Issued' | 'Received' | 'Reconciled';
  issuedDate?: string;
  receivedDate?: string;
  reconciledDate?: string;
  notes?: string;
  linkedMaterialRequestId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory = 'Travel' | 'Food' | 'Lodging' | 'Local Transport' | 'Tools/Hardware' | 'Other';
export type ExpensePaidBy = 'Technician' | 'Company';
export type ExpenseVerificationStatus = 'Pending' | 'Verified' | 'Rejected';

export interface ServiceExpense {
  id: string;
  docNo: string; // EXP-xxxx
  serviceJobId?: string;
  serviceJobDocNo?: string;
  technicianId: string;
  technicianName: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paidBy: ExpensePaidBy;
  receiptAttachment?: string;
  status: ExpenseVerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface TechnicianAdvance {
  id: string;
  docNo: string; // ADV-xxxx
  technicianId: string;
  technicianName: string;
  serviceJobId?: string;
  serviceJobDocNo?: string;
  amount: number;
  advanceDate: string;
  paymentMode: 'Cash' | 'Bank Transfer' | 'UPI' | 'Company Card';
  purpose: string;
  status: 'Disbursed' | 'Settled';
  approvedBy: string;
  settledDate?: string;
  createdAt: string;
}

export interface ExpenseSettlementSummary {
  technicianId: string;
  technicianName: string;
  serviceJobId?: string;
  totalExpenses: number;
  employeePaid: number;
  companyPaid: number;
  advancePaid: number;
  reimbursementDue: number;
  advanceToReturn: number;
  settlementStatus: 'Balanced' | 'Reimbursement Due' | 'Advance Return Due';
  verifiedExpensesCount?: number;
}

export interface ServiceBillingItem {
  description: string;
  itemType: 'Spare' | 'Labor' | 'Travel' | 'Other';
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isWarrantyCovered: boolean;
}

export interface ServiceBilling {
  id: string;
  docNo: string; // SBL-xxxx
  serviceJobId: string;
  serviceJobDocNo: string;
  customerId: string;
  customerName: string;
  billingDate: string;
  items: ServiceBillingItem[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
  discountAmount?: number;
  paidAmount?: number;
  outstandingAmount?: number;
  paymentStatus: 'Pending' | 'Paid' | 'Waived';
  paymentMode?: string;
  paymentReference?: string;
  paymentDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// R&D MANAGEMENT TYPES
// ==========================================

export type RDProjectType = 'New Product Development' | 'Component Research' | 'Efficiency Optimization' | 'Custom Prototype';
export type RDProjectStatus = 'Initiated' | 'Specification Done' | 'Prototyping' | 'Testing' | 'Successfully Completed' | 'On Hold' | 'Cancelled';

export interface RDProject {
  id: string;
  projectCode: string; // RND-xxxx
  title: string;
  objective: string;
  projectType: RDProjectType;
  leadEngineerId: string;
  leadEngineerName: string;
  teamMembers: Array<{ id: string; name: string; role: string }>;
  targetCompletionDate: string;
  budgetEstimated: number;
  budgetUtilized: number;
  status: RDProjectStatus;
  currentStage: string;
  finalConclusion?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RDSpecParameter {
  id: string;
  category?: string;
  parameterName: string;
  targetValue: string;
  tolerance?: string;
  unit?: string;
  isCritical?: boolean;
  notes?: string;
}

export interface RDSpecification {
  id: string;
  rdProjectId: string;
  version: string;
  parameters: RDSpecParameter[];
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RDBOMItem {
  id: string;
  materialId?: string;
  name: string;
  partNumber?: string;
  category?: string;
  quantityRequired: number;
  unit: string;
  source: 'Stock' | 'Procurement';
  estimatedUnitCost: number;
  totalCost: number;
  quantityRequested: number;
  quantityIssued: number;
  quantityConsumed: number;
  quantityReceived?: number;
  quantityReturned?: number;
  notes?: string;
}

export interface RDBOM {
  id: string;
  rdProjectId: string;
  version: string;
  items: RDBOMItem[];
  totalEstimatedCost: number;
  linkedMaterialRequestId?: string;
  receiptStatus?: 'Pending' | 'Partially Received' | 'Fully Received';
  requisitionStatus?: 'Draft' | 'Requested' | 'Partially Issued' | 'Issued';
  createdAt: string;
  updatedAt: string;
}

export interface RDWorkUpdate {
  id: string;
  rdProjectId: string;
  date: string;
  engineerId: string;
  engineerName: string;
  selectedStages: string[];
  customStage?: string;
  hoursSpent: number;
  highlights: string[];
  technicalObservations?: string;
  attachments?: string[];
  createdAt: string;
}

export interface RDTestItem {
  id: string;
  parameterOrCheck: string;
  expectedCondition: string;
  measuredValue: string;
  result: 'Pass' | 'Fail' | 'Pending';
  remarks?: string;
}

export interface RDTestRecord {
  id: string;
  rdProjectId: string;
  testName: string;
  testProtocolNumber?: string;
  iteration: number;
  testDate: string;
  testedById: string;
  testedByName: string;
  status: 'In Progress' | 'Passed' | 'Failed';
  checklist: RDTestItem[];
  environmentalConditions?: string;
  testNotes?: string;
  retestRequired?: boolean;
  retestReason?: string;
  createdAt: string;
  updatedAt: string;
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
  SRV?: number;
  JOB?: number;
  RND?: number;
  SMR?: number;
  EXP?: number;
  ADV?: number;
  SBL?: number;
  DP?: number;
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
  attachments?: AttachmentRecord[];
  approvalWorkflows?: ApprovalWorkflow[];
  approvalRequests?: ApprovalRequest[];
  // Service Management
  deliveredProducts?: DeliveredProduct[];
  serviceRequests?: ServiceRequest[];
  serviceJobs?: ServiceJob[];
  serviceWorkUpdates?: ServiceWorkUpdate[];
  serviceMaterialRequests?: ServiceMaterialRequest[];
  serviceExpenses?: ServiceExpense[];
  technicianAdvances?: TechnicianAdvance[];
  serviceBillings?: ServiceBilling[];
  // R&D Management
  rdProjects?: RDProject[];
  rdSpecifications?: RDSpecification[];
  rdBoms?: RDBOM[];
  rdWorkUpdates?: RDWorkUpdate[];
  rdTestRecords?: RDTestRecord[];
}
