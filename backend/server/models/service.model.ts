import { Schema, model, type Model } from 'mongoose';
import type {
  DeliveredProduct,
  ServiceBilling,
  ServiceExpense,
  ServiceJob,
  ServiceMaterialRequest,
  ServiceRequest,
  ServiceWorkUpdate,
  TechnicianAdvance,
} from '../../src/types/erp';

// --- DELIVERED PRODUCT MODEL ---
const DeliveredProductSchema = new Schema<DeliveredProduct>(
  {
    id: { type: String, required: true, unique: true, index: true },
    serialNumber: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    modelNumber: { type: String, default: '' },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    customerContact: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    deliveryAddress: { type: String, required: true },
    salesOrderId: { type: String, index: true },
    salesOrderDocNo: { type: String },
    productionOrderId: { type: String, index: true },
    productionOrderDocNo: { type: String },
    deliveryOrderId: { type: String, index: true },
    deliveryOrderDocNo: { type: String },
    deliveredDate: { type: String, required: true, index: true },
    warrantyPeriodMonths: { type: Number, default: 12 },
    warrantyStartDate: { type: String, required: true },
    warrantyEndDate: { type: String, required: true, index: true },
    warrantyStatus: {
      type: String,
      enum: ['Under Warranty', 'Expired', 'Not Configured'],
      default: 'Under Warranty',
      index: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Under Service', 'Decommissioned'],
      default: 'Active',
      index: true,
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);
export const DeliveredProductModel: Model<DeliveredProduct> = model<DeliveredProduct>(
  'DeliveredProduct',
  DeliveredProductSchema,
);

// --- SERVICE REQUEST MODEL ---
const ServiceRequestSchema = new Schema<ServiceRequest>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    requestDate: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    contactPerson: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    serviceAddress: { type: String, required: true },
    deliveredProductId: { type: String, required: true, index: true },
    serialNumber: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    modelNumber: { type: String, default: '' },
    serviceType: {
      type: String,
      enum: ['Customer Site', 'CRYO Workshop'],
      default: 'Customer Site',
      index: true,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
      index: true,
    },
    issueDescription: { type: String, required: true },
    isUnderWarranty: { type: Boolean, default: true },
    warrantyClaimValid: { type: Boolean, default: true },
    warrantyRemarks: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Open', 'Assigned', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Open',
      index: true,
    },
    assignedJobId: { type: String, index: true },
    assignedTechnicianId: { type: String, index: true },
    assignedTechnicianName: { type: String },
    scheduledDate: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
export const ServiceRequestModel: Model<ServiceRequest> = model<ServiceRequest>(
  'ServiceRequest',
  ServiceRequestSchema,
);

// --- SERVICE JOB MODEL ---
const ServiceJobSchema = new Schema<ServiceJob>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    serviceRequestId: { type: String, required: true, index: true },
    serviceRequestDocNo: { type: String, required: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    deliveredProductId: { type: String, required: true, index: true },
    serialNumber: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    serviceType: {
      type: String,
      enum: ['Customer Site', 'CRYO Workshop'],
      default: 'Customer Site',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    assignedTechnicianId: { type: String, required: true, index: true },
    assignedTechnicianName: { type: String, required: true },
    scheduledDate: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['Scheduled', 'In Progress', 'Awaiting Spares', 'Work Completed', 'Billed', 'Closed'],
      default: 'Scheduled',
      index: true,
    },
    checkIn: {
      timestamp: { type: String },
      performedBy: { type: String },
      location: { type: String },
      notes: { type: String },
    },
    checkInTime: { type: String },
    checkOut: {
      timestamp: { type: String },
      performedBy: { type: String },
      resolutionSummary: { type: String },
      customerRepresentativeName: { type: String },
      customerSignatureAck: { type: Boolean },
    },
    checkOutTime: { type: String },
    diagnosisSummary: { type: String, default: '' },
    rootCause: { type: String, default: '' },
    correctiveAction: { type: String, default: '' },
    preventiveAction: { type: String, default: '' },
    totalHoursSpent: { type: Number, default: 0 },
    customerFeedbackScore: { type: Number, min: 1, max: 5 },
    customerFeedbackNotes: { type: String, default: '' },
    isChargeable: { type: Boolean, default: false },
    billingId: { type: String },
    completionDate: { type: String },
  },
  { timestamps: true },
);
export const ServiceJobModel: Model<ServiceJob> = model<ServiceJob>('ServiceJob', ServiceJobSchema);

// --- SERVICE WORK UPDATE MODEL ---
const ServiceWorkUpdateSchema = new Schema<ServiceWorkUpdate>(
  {
    id: { type: String, required: true, unique: true, index: true },
    serviceJobId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    technicianId: { type: String, required: true },
    technicianName: { type: String, required: true },
    stageName: { type: String, default: 'Diagnostic & Repair' },
    hoursSpent: { type: Number, required: true, default: 1 },
    highlights: { type: [String], default: [] },
    checklist: [
      {
        id: { type: String, default: () => `CHK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
        item: { type: String, required: true },
        result: { type: String, enum: ['Pass', 'Fail', 'Pending'], default: 'Pending' },
        remarks: { type: String, default: '' },
        notes: { type: String, default: '' },
      },
    ],
    findingsNotes: { type: String, default: '' },
    createdAt: { type: String, required: true },
  },
  { timestamps: false },
);
export const ServiceWorkUpdateModel: Model<ServiceWorkUpdate> = model<ServiceWorkUpdate>(
  'ServiceWorkUpdate',
  ServiceWorkUpdateSchema,
);

// --- SERVICE MATERIAL REQUEST MODEL ---
const ServiceMaterialRequestSchema = new Schema<ServiceMaterialRequest>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    serviceJobId: { type: String, required: true, index: true },
    serviceJobDocNo: { type: String, required: true },
    customerId: { type: String, required: true },
    customerName: { type: String, required: true },
    requestedBy: { type: String, required: true },
    requestDate: { type: String, required: true },
    items: [
      {
        materialId: { type: String },
        materialName: { type: String, required: true },
        partNumber: { type: String, default: '' },
        quantityRequested: { type: Number, required: true, min: 1 },
        quantityIssued: { type: Number, default: 0 },
        quantityUsed: { type: Number, default: 0 },
        quantityReturned: { type: Number, default: 0 },
        unit: { type: String, default: 'Nos' },
        unitCost: { type: Number, default: 0 },
        totalCost: { type: Number, default: 0 },
      },
    ],
    status: {
      type: String,
      enum: ['Pending', 'Requested', 'Issued', 'Received', 'Reconciled'],
      default: 'Requested',
      index: true,
    },
    issuedDate: { type: String },
    receivedDate: { type: String },
    reconciledDate: { type: String },
    notes: { type: String, default: '' },
    linkedMaterialRequestId: { type: String, index: true },
  },
  { timestamps: true },
);
export const ServiceMaterialRequestModel: Model<ServiceMaterialRequest> = model<ServiceMaterialRequest>(
  'ServiceMaterialRequest',
  ServiceMaterialRequestSchema,
);

// --- SERVICE EXPENSE MODEL ---
const ServiceExpenseSchema = new Schema<ServiceExpense>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    serviceJobId: { type: String, index: true },
    serviceJobDocNo: { type: String },
    technicianId: { type: String, required: true, index: true },
    technicianName: { type: String, required: true },
    date: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ['Travel', 'Food', 'Lodging', 'Local Transport', 'Tools/Hardware', 'Other'],
      required: true,
    },
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    paidBy: {
      type: String,
      enum: ['Technician', 'Company'],
      default: 'Technician',
    },
    receiptAttachment: { type: String },
    status: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    verifiedBy: { type: String },
    verifiedAt: { type: String },
    rejectionReason: { type: String },
    createdAt: { type: String, required: true },
  },
  { timestamps: false },
);
export const ServiceExpenseModel: Model<ServiceExpense> = model<ServiceExpense>(
  'ServiceExpense',
  ServiceExpenseSchema,
);

// --- TECHNICIAN ADVANCE MODEL ---
const TechnicianAdvanceSchema = new Schema<TechnicianAdvance>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    technicianId: { type: String, required: true, index: true },
    technicianName: { type: String, required: true },
    serviceJobId: { type: String, index: true },
    serviceJobDocNo: { type: String },
    amount: { type: Number, required: true, min: 0 },
    advanceDate: { type: String, required: true, index: true },
    paymentMode: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'UPI', 'Company Card'],
      default: 'Bank Transfer',
    },
    purpose: { type: String, required: true },
    status: {
      type: String,
      enum: ['Disbursed', 'Settled'],
      default: 'Disbursed',
      index: true,
    },
    approvedBy: { type: String, required: true },
    settledDate: { type: String },
    createdAt: { type: String, required: true },
  },
  { timestamps: false },
);
export const TechnicianAdvanceModel: Model<TechnicianAdvance> = model<TechnicianAdvance>(
  'TechnicianAdvance',
  TechnicianAdvanceSchema,
);

// --- SERVICE BILLING MODEL ---
const ServiceBillingSchema = new Schema<ServiceBilling>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    serviceJobId: { type: String, required: true, index: true },
    serviceJobDocNo: { type: String, required: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    billingDate: { type: String, required: true, index: true },
    items: [
      {
        description: { type: String, required: true },
        itemType: {
          type: String,
          enum: ['Spare', 'Labor', 'Travel', 'Other'],
          default: 'Labor',
        },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, default: 0, min: 0 },
        totalPrice: { type: Number, default: 0, min: 0 },
        isWarrantyCovered: { type: Boolean, default: false },
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, default: 18 },
    taxAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid', 'Waived'],
      default: 'Pending',
      index: true,
    },
    paymentMode: { type: String },
    paymentReference: { type: String },
    paymentDate: { type: String },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);
export const ServiceBillingModel: Model<ServiceBilling> = model<ServiceBilling>(
  'ServiceBilling',
  ServiceBillingSchema,
);

