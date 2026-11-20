import { Schema, model, type Model } from 'mongoose';
import type {
  GRN,
  Material,
  MaterialIssue,
  MaterialRequest,
  ProductionReturn,
  StockTransaction,
  Supplier,
  SupplierPO,
  SupplierReturn,
} from '../../src/types/erp';

// --- MATERIAL MODEL ---
const MaterialSchema = new Schema<Material>(
  {
    id: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, index: true },
    specification: { type: String, default: '' },
    unit: { type: String, default: 'Nos' },
    minStock: { type: Number, default: 0, min: 0 },
    currentStock: { type: Number, default: 0, min: 0 },
    storageLocation: { type: String, default: 'Main Store' },
    preferredSupplierId: { type: String, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export const MaterialModel: Model<Material> = model<Material>('Material', MaterialSchema);

// --- SUPPLIER MODEL ---
const SupplierSchema = new Schema<Supplier>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '', index: true },
    email: { type: String, default: '', index: true },
    address: { type: String, default: '' },
    gstin: { type: String, default: '', index: true },
    suppliedMaterialIds: { type: [String], default: [] },
    notes: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export const SupplierModel: Model<Supplier> = model<Supplier>('Supplier', SupplierSchema);

// --- MATERIAL REQUEST MODEL ---
const MaterialRequestSchema = new Schema<MaterialRequest>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    bomId: { type: String, required: true, index: true },
    bomDocNo: { type: String, required: true },
    productionOrderId: { type: String, required: true, index: true },
    productionOrderDocNo: { type: String, required: true },
    salesOrderId: { type: String, required: true, index: true },
    salesOrderDocNo: { type: String, required: true },
    productName: { type: String, required: true },
    priority: { type: String, enum: ['Normal', 'High', 'Urgent'], default: 'Normal', index: true },
    items: [
      {
        materialId: { type: String, required: true },
        materialCode: { type: String, required: true },
        materialName: { type: String, required: true },
        unit: { type: String, required: true },
        requiredQty: { type: Number, required: true, min: 0.01 },
        issuedQty: { type: Number, default: 0, min: 0 },
        receivedQty: { type: Number, default: 0, min: 0 },
        returnedQty: { type: Number, default: 0, min: 0 },
      },
    ],
    status: {
      type: String,
      enum: ['Pending', 'Partially Issued', 'Fully Issued', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    receiptStatus: {
      type: String,
      enum: ['Pending', 'Partially Received', 'Fully Received'],
      default: 'Pending',
      index: true,
    },
    requestedBy: { type: String, required: true },
    requestDate: { type: String, required: true, index: true },
  },
  { timestamps: true },
);
export const MaterialRequestModel: Model<MaterialRequest> = model<MaterialRequest>('MaterialRequest', MaterialRequestSchema);

// --- MATERIAL ISSUE MODEL ---
const MaterialIssueSchema = new Schema<MaterialIssue>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    materialRequestId: { type: String, required: true, index: true },
    materialRequestDocNo: { type: String, required: true },
    productionOrderId: { type: String, required: true, index: true },
    productionOrderDocNo: { type: String, required: true },
    issueDate: { type: String, required: true, index: true },
    items: [
      {
        materialId: { type: String, required: true },
        materialCode: { type: String, required: true },
        materialName: { type: String, required: true },
        unit: { type: String, required: true },
        issuedQty: { type: Number, required: true, min: 0.01 },
        receivedQty: { type: Number, default: 0, min: 0 },
      },
    ],
    receiptAcknowledged: { type: Boolean, default: false, index: true },
    acknowledgedBy: { type: String },
    acknowledgedAt: { type: String },
    receiptDiscrepancyNotes: { type: String },
    issuedBy: { type: String, required: true },
    remarks: { type: String, default: '' },
  },
  { timestamps: true },
);
export const MaterialIssueModel: Model<MaterialIssue> = model<MaterialIssue>('MaterialIssue', MaterialIssueSchema);

// --- SUPPLIER PO MODEL ---
const SupplierPOSchema = new Schema<SupplierPO>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    supplierId: { type: String, required: true, index: true },
    supplierName: { type: String, required: true },
    purchaseType: { type: String, enum: ['Request-Based', 'Normal'], default: 'Normal', index: true },
    materialRequestId: { type: String, index: true },
    materialRequestDocNo: { type: String },
    poDate: { type: String, required: true, index: true },
    expectedDeliveryDate: { type: String, required: true },
    items: [
      {
        materialId: { type: String, required: true },
        materialCode: { type: String, required: true },
        materialName: { type: String, required: true },
        unit: { type: String, required: true },
        orderedQty: { type: Number, required: true, min: 0.01 },
        receivedQty: { type: Number, default: 0, min: 0 },
        acceptedQty: { type: Number, default: 0, min: 0 },
        rejectedQty: { type: Number, default: 0, min: 0 },
        unitPrice: { type: Number, required: true, min: 0 },
        lineTotal: { type: Number, required: true, min: 0 },
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, default: 18 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['Draft', 'Ordered', 'Partially Received', 'Received', 'Closed', 'Cancelled'],
      default: 'Ordered',
      index: true,
    },
    remarks: { type: String, default: '' },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
export const SupplierPOModel: Model<SupplierPO> = model<SupplierPO>('SupplierPO', SupplierPOSchema);

// --- GRN MODEL ---
const GRNSchema = new Schema<GRN>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    supplierPoId: { type: String, required: true, index: true },
    supplierPoDocNo: { type: String, required: true },
    supplierId: { type: String, required: true, index: true },
    supplierName: { type: String, required: true },
    isReplacement: { type: Boolean, default: false, index: true },
    supplierReturnId: { type: String, index: true },
    supplierReturnDocNo: { type: String },
    receivedDate: { type: String, required: true, index: true },
    invoiceOrChallanNo: { type: String, required: true },
    items: [
      {
        materialId: { type: String, required: true },
        materialCode: { type: String, required: true },
        materialName: { type: String, required: true },
        unit: { type: String, required: true },
        orderedQty: { type: Number, required: true },
        previouslyReceivedQty: { type: Number, default: 0 },
        receivedQty: { type: Number, required: true, min: 0.01 },
        acceptedQty: { type: Number, default: 0 },
        rejectedQty: { type: Number, default: 0 },
        rejectionReason: { type: String },
        verified: { type: Boolean, default: false },
      },
    ],
    attachmentName: { type: String },
    attachmentDataUrl: { type: String },
    verificationStatus: {
      type: String,
      enum: ['Pending', 'Partially Accepted', 'Accepted', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    verifiedBy: { type: String },
    verifiedAt: { type: String },
    verificationRemarks: { type: String },
    remarks: { type: String, default: '' },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
export const GRNModel: Model<GRN> = model<GRN>('GRN', GRNSchema);

// --- SUPPLIER RETURN MODEL ---
const SupplierReturnSchema = new Schema<SupplierReturn>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    grnId: { type: String, required: true, index: true },
    grnDocNo: { type: String, required: true },
    supplierPoId: { type: String, required: true, index: true },
    supplierPoDocNo: { type: String, required: true },
    supplierId: { type: String, required: true, index: true },
    supplierName: { type: String, required: true },
    materialId: { type: String, required: true, index: true },
    materialCode: { type: String, required: true },
    materialName: { type: String, required: true },
    unit: { type: String, required: true },
    returnQty: { type: Number, required: true, min: 0.01 },
    reason: { type: String, required: true },
    returnDate: { type: String, required: true, index: true },
    replacementRequired: { type: Boolean, default: true, index: true },
    replacementStatus: {
      type: String,
      enum: ['Not Required', 'Pending Replacement', 'Replacement Received', 'Closed'],
      default: 'Pending Replacement',
      index: true,
    },
    replacementGrnId: { type: String },
    replacementGrnDocNo: { type: String },
    attachmentName: { type: String },
    remarks: { type: String, default: '' },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
export const SupplierReturnModel: Model<SupplierReturn> = model<SupplierReturn>('SupplierReturn', SupplierReturnSchema);

// --- STOCK TRANSACTION MODEL (IMMUTABLE LEDGER) ---
const StockTransactionSchema = new Schema<StockTransaction>(
  {
    id: { type: String, required: true, unique: true, index: true },
    materialId: { type: String, required: true, index: true },
    materialCode: { type: String, required: true },
    materialName: { type: String, required: true },
    unit: { type: String, required: true },
    type: {
      type: String,
      enum: ['Opening Balance', 'GRN Accepted', 'Material Issue', 'Production Return', 'Stock Adjustment'],
      required: true,
      index: true,
    },
    quantityDelta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    linkedDocType: { type: String, required: true },
    linkedDocId: { type: String, required: true, index: true },
    linkedDocNo: { type: String, required: true },
    remarks: { type: String, default: '' },
    performedBy: { type: String, required: true },
    timestamp: { type: String, required: true, index: true },
  },
  { timestamps: true },
);
StockTransactionSchema.index({ materialId: 1, timestamp: 1 });
StockTransactionSchema.index({ linkedDocType: 1, linkedDocId: 1 });
export const StockTransactionModel: Model<StockTransaction> = model<StockTransaction>('StockTransaction', StockTransactionSchema);

// --- PRODUCTION RETURN MODEL ---
const ProductionReturnSchema = new Schema<ProductionReturn>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    materialRequestId: { type: String, required: true, index: true },
    materialRequestDocNo: { type: String, required: true },
    productionOrderId: { type: String, required: true, index: true },
    productionOrderDocNo: { type: String, required: true },
    materialId: { type: String, required: true, index: true },
    materialCode: { type: String, required: true },
    materialName: { type: String, required: true },
    unit: { type: String, required: true },
    returnQty: { type: Number, required: true, min: 0.01 },
    reason: { type: String, required: true },
    returnedBy: { type: String, required: true },
  },
  { timestamps: true },
);
ProductionReturnSchema.index({ materialRequestId: 1, materialId: 1 });
export const ProductionReturnModel: Model<ProductionReturn> = model<ProductionReturn>('ProductionReturn', ProductionReturnSchema);
