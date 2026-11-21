import { Schema, model, type Model } from 'mongoose';
import type {
  Customer,
  CustomerPO,
  Enquiry,
  FollowUp,
  PaymentEntry,
  Product,
  ProformaInvoice,
  Quotation,
  SalesOrder,
} from '../../src/types/erp';

// --- CUSTOMER MODEL ---
const CustomerSchema = new Schema<Customer>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '', index: true },
    email: { type: String, default: '', index: true },
    billingAddress: { type: String, default: '' },
    shippingAddress: { type: String, default: '' },
    gstin: { type: String, default: '', index: true },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);
export const CustomerModel: Model<Customer> = model<Customer>('Customer', CustomerSchema);

// --- PRODUCT MODEL ---
const ProductSchema = new Schema<Product>(
  {
    id: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    model: { type: String, default: '', index: true },
    specifications: { type: String, default: '' },
    highlights: { type: [String], default: [] },
    sellingPrice: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'Nos' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active', index: true },
    bomTemplate: [
      {
        materialId: { type: String, required: true },
        quantityPerUnit: { type: Number, required: true, min: 0 },
        remarks: { type: String },
      },
    ],
    stages: { type: [String], default: ['Fabrication', 'Assembly', 'Testing'] },
  },
  { timestamps: true },
);
export const ProductModel: Model<Product> = model<Product>('Product', ProductSchema);

// --- ENQUIRY MODEL ---
const EnquirySchema = new Schema<Enquiry>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerSnapshot: { type: Schema.Types.Mixed, required: true },
    source: { type: String, default: 'Direct', index: true },
    items: [
      {
        id: { type: String, required: true },
        productId: { type: String, required: true },
        productName: { type: String, required: true },
        model: { type: String, default: '' },
        quantity: { type: Number, required: true, min: 1 },
        requiredSpecifications: { type: String, default: '' },
        customerRequirements: { type: String, default: '' },
      },
    ],
    expectedDeliveryDate: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Qualified', 'On Hold', 'Rejected'],
      default: 'New',
      index: true,
    },
    rejectionReason: { type: String },
    assignedTo: { type: String, default: '', index: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
EnquirySchema.index({ customerId: 1, status: 1 });
EnquirySchema.index({ createdAt: -1 });
export const EnquiryModel: Model<Enquiry> = model<Enquiry>('Enquiry', EnquirySchema);

// --- FOLLOW-UP MODEL ---
const FollowUpSchema = new Schema<FollowUp>(
  {
    id: { type: String, required: true, unique: true, index: true },
    entityType: { type: String, enum: ['enquiry', 'quotation'], required: true, index: true },
    entityId: { type: String, required: true, index: true },
    entityDocNo: { type: String, required: true },
    customerName: { type: String, default: '' },
    summary: { type: String, default: '' },
    followUpDate: { type: String, required: true, index: true },
    contactMethod: { type: String, default: 'Call' },
    discussion: { type: String, required: true },
    nextFollowUpDate: { type: String, index: true },
    response: { type: String, default: 'Pending' },
    rejectionReason: { type: String },
    status: { type: String, enum: ['Scheduled', 'Completed', 'Overdue', 'Cancelled'], default: 'Scheduled', index: true },
    followedBy: { type: String, required: true, index: true },
    createdAt: { type: String, required: true },
  },
  { timestamps: true },
);
FollowUpSchema.index({ entityType: 1, entityId: 1, followUpDate: -1 });
export const FollowUpModel: Model<FollowUp> = model<FollowUp>('FollowUp', FollowUpSchema);

// --- QUOTATION MODEL ---
const QuotationSchema = new Schema<Quotation>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    baseDocNo: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1, index: true },
    enquiryId: { type: String, required: true, index: true },
    enquiryDocNo: { type: String, required: true },
    customerId: { type: String, required: true, index: true },
    customerSnapshot: { type: Schema.Types.Mixed, required: true },
    quotationDate: { type: String, required: true, index: true },
    validityDate: { type: String, required: true },
    items: [
      {
        id: { type: String, required: true },
        productId: { type: String, required: true },
        productName: { type: String, required: true },
        model: { type: String, default: '' },
        specifications: { type: String, default: '' },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        highlights: { type: [String], default: [] },
        lineTotal: { type: Number, required: true, min: 0 },
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 18, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentTerms: { type: String, default: '' },
    deliveryTerms: { type: String, default: '' },
    warranty: { type: String, default: '' },
    remarks: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Pending', 'Negotiation', 'Superseded', 'Accepted', 'Rejected', 'Expired', 'Pending Approval', 'Approved', 'Changes Requested'],
      default: 'Draft',
      index: true,
    },
    acceptedAt: { type: String },
    acceptedBy: { type: String },
    rejectionReason: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
QuotationSchema.index({ baseDocNo: 1, version: -1 });
QuotationSchema.index({ customerId: 1, status: 1 });
export const QuotationModel: Model<Quotation> = model<Quotation>('Quotation', QuotationSchema);

// --- PROFORMA INVOICE MODEL ---
const ProformaInvoiceSchema = new Schema<ProformaInvoice>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    piDate: { type: String, required: true, index: true },
    quotationId: { type: String, required: true, unique: true, index: true },
    quotationDocNo: { type: String, required: true },
    enquiryId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerSnapshot: { type: Schema.Types.Mixed, required: true },
    items: [{ type: Schema.Types.Mixed }],
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 18 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentTerms: { type: String, default: '' },
    deliveryTerms: { type: String, default: '' },
    bankDetails: { type: Schema.Types.Mixed, required: true },
    remarks: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Issued', 'PO Received', 'Converted', 'Cancelled'],
      default: 'Issued',
      index: true,
    },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
export const ProformaInvoiceModel: Model<ProformaInvoice> = model<ProformaInvoice>('ProformaInvoice', ProformaInvoiceSchema);

// --- CUSTOMER PO MODEL ---
const CustomerPOSchema = new Schema<CustomerPO>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    piId: { type: String, required: true, unique: true, index: true },
    piDocNo: { type: String, required: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    customerPoNumber: { type: String, required: true, index: true },
    receivedDate: { type: String, required: true },
    expectedDeliveryDate: { type: String, default: '' },
    attachmentName: { type: String },
    attachmentDataUrl: { type: String },
    hasDiscrepancy: { type: Boolean, default: false, index: true },
    discrepancyNotes: { type: String },
    discrepancyResolved: { type: Boolean, default: true },
    remarks: { type: String, default: '' },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
export const CustomerPOModel: Model<CustomerPO> = model<CustomerPO>('CustomerPO', CustomerPOSchema);

// --- PAYMENT ENTRY MODEL ---
const PaymentEntrySchema = new Schema<PaymentEntry>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    piId: { type: String, index: true },
    piDocNo: { type: String },
    salesOrderId: { type: String, index: true },
    salesOrderDocNo: { type: String },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentDate: { type: String, required: true, index: true },
    method: { type: String, default: 'Bank Transfer' },
    paymentType: { type: String, default: 'Advance' },
    transactionRef: { type: String, required: true, unique: true, trim: true, index: true },
    proofName: { type: String },
    proofDataUrl: { type: String },
    status: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected', 'Reversed'],
      default: 'Pending',
      index: true,
    },
    remarks: { type: String, default: '' },
    verifiedBy: { type: String },
    verifiedAt: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
PaymentEntrySchema.index({ salesOrderId: 1, status: 1 });
PaymentEntrySchema.index({ piId: 1, status: 1 });
export const PaymentEntryModel: Model<PaymentEntry> = model<PaymentEntry>('PaymentEntry', PaymentEntrySchema);

// --- SALES ORDER MODEL ---
const SalesOrderSchema = new Schema<SalesOrder>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    enquiryId: { type: String, required: true, index: true },
    enquiryDocNo: { type: String, required: true },
    quotationId: { type: String, required: true, index: true },
    quotationDocNo: { type: String, required: true },
    piId: { type: String, required: true, unique: true, index: true },
    piDocNo: { type: String, required: true },
    customerPoId: { type: String, required: true, index: true },
    customerPoDocNo: { type: String, required: true },
    customerPoNumber: { type: String, required: true },
    customerId: { type: String, required: true, index: true },
    customerSnapshot: { type: Schema.Types.Mixed, required: true },
    items: [{ type: Schema.Types.Mixed }],
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentTerms: { type: String, default: '' },
    deliveryTerms: { type: String, default: '' },
    deliveryAddress: { type: String, default: '' },
    promisedDeliveryDate: { type: String, default: '' },
    priority: { type: String, enum: ['Normal', 'High', 'Urgent'], default: 'Normal', index: true },
    commercialStatus: { type: String, enum: ['Confirmed', 'Cancelled', 'Closed'], default: 'Confirmed', index: true },
    fulfillmentStatus: {
      type: String,
      enum: [
        'Awaiting Production',
        'In Production',
        'QC Pending',
        'Ready for Dispatch',
        'In Transit',
        'Partially Delivered',
        'Delivered',
      ],
      default: 'Awaiting Production',
      index: true,
    },
    remarks: { type: String, default: '' },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
SalesOrderSchema.index({ customerId: 1, commercialStatus: 1 });
SalesOrderSchema.index({ createdAt: -1 });
export const SalesOrderModel: Model<SalesOrder> = model<SalesOrder>('SalesOrder', SalesOrderSchema);
