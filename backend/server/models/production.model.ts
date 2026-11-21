import { Schema, model, type Model } from 'mongoose';
import type {
  BOM,
  DailyProductionUpdate,
  ManufacturingStageDefinition,
  ProductionOrder,
  QualityCheck,
  ReworkOrder,
} from '../../src/types/erp';

// --- PRODUCTION ORDER MODEL ---
const ProductionOrderSchema = new Schema<ProductionOrder>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    salesOrderId: { type: String, required: true, index: true },
    salesOrderDocNo: { type: String, required: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    model: { type: String, default: '' },
    specifications: { type: String, default: '' },
    highlights: { type: [String], default: [] },
    quantity: { type: Number, required: true, min: 1 },
    plannedStartDate: { type: String, required: true, index: true },
    plannedEndDate: { type: String, required: true },
    plannedDurationDays: { type: Number, required: true, min: 1 },
    actualStartDate: { type: String },
    actualCompletionDate: { type: String },
    productionInCharge: { type: String, required: true },
    assignedEmployees: { type: [String], default: [] },
    priority: { type: String, enum: ['Normal', 'High', 'Urgent'], default: 'Normal', index: true },
    instructions: { type: String, default: '' },
    status: {
      type: String,
      enum: [
        'Planned',
        'Awaiting Materials',
        'Ready to Start',
        'In Progress',
        'QC Pending',
        'Rework',
        'Completed',
      ],
      default: 'Planned',
      index: true,
    },
    completedManufacturingQty: { type: Number, default: 0, min: 0 },
    serialNumbers: { type: [String], default: [] },
    qcAcceptedQty: { type: Number, default: 0, min: 0 },
    qcRejectedQty: { type: Number, default: 0, min: 0 },
    dispatchedQty: { type: Number, default: 0, min: 0 },
    deliveredQty: { type: Number, default: 0, min: 0 },
    planningHistory: [
      {
        previousStartDate: { type: String, required: true },
        previousEndDate: { type: String, required: true },
        newStartDate: { type: String, required: true },
        newEndDate: { type: String, required: true },
        reason: { type: String, required: true },
        rescheduledBy: { type: String, required: true },
        rescheduledAt: { type: String, required: true },
      },
    ],
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
ProductionOrderSchema.index({ salesOrderId: 1, productId: 1 });
ProductionOrderSchema.index({ status: 1, plannedStartDate: 1 });
export const ProductionOrderModel: Model<ProductionOrder> = model<ProductionOrder>('ProductionOrder', ProductionOrderSchema);

// --- BOM MODEL ---
const BOMSchema = new Schema<BOM>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    productionOrderId: { type: String, required: true, unique: true, index: true },
    productionOrderDocNo: { type: String, required: true },
    productName: { type: String, required: true },
    productionQty: { type: Number, required: true, min: 1 },
    items: [
      {
        materialId: { type: String, required: true },
        materialCode: { type: String, required: true },
        materialName: { type: String, required: true },
        unit: { type: String, required: true },
        qtyPerUnit: { type: Number, required: true, min: 0.001 },
        totalRequiredQty: { type: Number, required: true, min: 0.001 },
        remarks: { type: String },
      },
    ],
    requestSent: { type: Boolean, default: false, index: true },
    materialRequestId: { type: String, index: true },
    materialRequestDocNo: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
export const BOMModel: Model<BOM> = model<BOM>('BOM', BOMSchema);

// --- DAILY PRODUCTION UPDATE MODEL ---
const DailyProductionUpdateSchema = new Schema<DailyProductionUpdate>(
  {
    id: { type: String, required: true, unique: true, index: true },
    productionOrderId: { type: String, required: true, index: true },
    productionOrderDocNo: { type: String, required: true },
    workDate: { type: String, required: true, index: true },
    workType: {
      type: String,
      enum: ['Preliminary Planning / Preparation', 'Manufacturing Progress'],
      default: 'Manufacturing Progress',
      index: true,
    },
    stage: { type: String, required: true },
    selectedStages: { type: [String], default: [] },
    workCompleted: { type: String, required: true },
    highlights: { type: [String], default: [] },
    completedQty: { type: Number, default: 0, min: 0 },
    workHours: { type: Number, default: 0, min: 0 },
    stageStatus: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed', 'Blocked'],
      default: 'In Progress',
      index: true,
    },
    issues: { type: String, default: '' },
    remarks: { type: String, default: '' },
    photoName: { type: String },
    photoDataUrl: { type: String },
    employeeName: { type: String, required: true },
  },
  { timestamps: true },
);
DailyProductionUpdateSchema.index({ productionOrderId: 1, workDate: -1 });
export const DailyProductionUpdateModel: Model<DailyProductionUpdate> = model<DailyProductionUpdate>(
  'DailyProductionUpdate',
  DailyProductionUpdateSchema,
);

// --- QUALITY CHECK MODEL ---
const QualityCheckSchema = new Schema<QualityCheck>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    productionOrderId: { type: String, required: true, index: true },
    productionOrderDocNo: { type: String, required: true },
    productName: { type: String, required: true },
    inspectedQty: { type: Number, required: true, min: 1 },
    acceptedQty: { type: Number, default: 0, min: 0 },
    rejectedQty: { type: Number, default: 0, min: 0 },
    serialNumbers: { type: [String], default: [] },
    inspectionDate: { type: String, required: true, index: true },
    inspector: { type: String, required: true },
    checks: [
      {
        id: { type: String },
        name: { type: String, required: true },
        result: { type: String, enum: ['Pass', 'Fail', 'Pending'], required: true },
        observation: { type: String, default: '' },
        measuredValue: { type: String, default: '' },
        expectedValue: { type: String, default: '' },
        required: { type: Boolean, default: true },
      },
    ],
    finalResult: { type: String, enum: ['Accepted', 'Rejected', 'Pending'], required: true, index: true },
    rejectionReason: { type: String },
    reworkId: { type: String, index: true },
    reworkDocNo: { type: String },
    remarks: { type: String, default: '' },
    reportName: { type: String },
    reportDataUrl: { type: String },
  },
  { timestamps: true },
);
QualityCheckSchema.index({ productionOrderId: 1, attemptNumber: 1 });
export const QualityCheckModel: Model<QualityCheck> = model<QualityCheck>('QualityCheck', QualityCheckSchema);

// --- MANUFACTURING STAGE DEFINITION MODEL ---
const ManufacturingStageDefinitionSchema = new Schema<ManufacturingStageDefinition>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true, unique: true, index: true },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
export const ManufacturingStageDefinitionModel: Model<ManufacturingStageDefinition> = model<ManufacturingStageDefinition>(
  'ManufacturingStageDefinition',
  ManufacturingStageDefinitionSchema,
);

// --- REWORK ORDER MODEL ---
const ReworkOrderSchema = new Schema<ReworkOrder>(
  {
    id: { type: String, required: true, unique: true, index: true },
    docNo: { type: String, required: true, unique: true, index: true },
    productionOrderId: { type: String, required: true, index: true },
    productionOrderDocNo: { type: String, required: true },
    qcId: { type: String, required: true, index: true },
    qcDocNo: { type: String, required: true },
    affectedQty: { type: Number, required: true, min: 1 },
    affectedSerialNumbers: { type: [String], default: [] },
    rejectionReason: { type: String, required: true },
    requiredCorrection: { type: String, required: true },
    assignedEmployee: { type: String, required: true },
    expectedCompletionDate: { type: String, required: true },
    completedWork: { type: String },
    actualCompletionDate: { type: String },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Completed', 'Reinspection'],
      default: 'Open',
      index: true,
    },
    remarks: { type: String, default: '' },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
export const ReworkOrderModel: Model<ReworkOrder> = model<ReworkOrder>('ReworkOrder', ReworkOrderSchema);
