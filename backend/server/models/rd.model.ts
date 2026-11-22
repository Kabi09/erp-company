import { Schema, model, type Model } from 'mongoose';
import type {
  RDBOM,
  RDProject,
  RDSpecification,
  RDTestRecord,
  RDWorkUpdate,
} from '../../src/types/erp';

// --- R&D PROJECT MODEL ---
const RDProjectSchema = new Schema<RDProject>(
  {
    id: { type: String, required: true, unique: true, index: true },
    projectCode: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    objective: { type: String, required: true },
    projectType: {
      type: String,
      enum: ['New Product Development', 'Component Research', 'Efficiency Optimization', 'Custom Prototype'],
      default: 'New Product Development',
      index: true,
    },
    leadEngineerId: { type: String, required: true, index: true },
    leadEngineerName: { type: String, required: true },
    teamMembers: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        role: { type: String, required: true },
      },
    ],
    targetCompletionDate: { type: String, required: true, index: true },
    budgetEstimated: { type: Number, required: true, min: 0 },
    budgetUtilized: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: [
        'Initiated',
        'Specification Done',
        'Prototyping',
        'Testing',
        'Successfully Completed',
        'On Hold',
        'Cancelled',
      ],
      default: 'Initiated',
      index: true,
    },
    currentStage: { type: String, default: 'Conceptualization' },
    finalConclusion: { type: String, default: '' },
    completedAt: { type: String },
  },
  { timestamps: true },
);
export const RDProjectModel: Model<RDProject> = model<RDProject>('RDProject', RDProjectSchema);

// --- R&D SPECIFICATION MODEL ---
const RDSpecificationSchema = new Schema<RDSpecification>(
  {
    id: { type: String, required: true, unique: true, index: true },
    rdProjectId: { type: String, required: true, index: true },
    version: { type: String, default: '1.0' },
    parameters: [
      {
        id: { type: String, required: true },
        category: { type: String, default: 'Mechanical' },
        parameterName: { type: String, required: true },
        targetValue: { type: String, required: true },
        tolerance: { type: String, default: '' },
        unit: { type: String, default: '' },
        notes: { type: String, default: '' },
      },
    ],
    approvedBy: { type: String },
    approvedAt: { type: String },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);
export const RDSpecificationModel: Model<RDSpecification> = model<RDSpecification>(
  'RDSpecification',
  RDSpecificationSchema,
);

// --- R&D PROTOTYPE BOM MODEL ---
const RDBOMSchema = new Schema<RDBOM>(
  {
    id: { type: String, required: true, unique: true, index: true },
    rdProjectId: { type: String, required: true, index: true },
    version: { type: String, default: '1.0' },
    items: [
      {
        id: { type: String, required: true },
        materialId: { type: String },
        name: { type: String, required: true },
        partNumber: { type: String, default: '' },
        category: { type: String, default: '' },
        quantityRequired: { type: Number, required: true, min: 1 },
        unit: { type: String, default: 'Nos' },
        source: { type: String, enum: ['Stock', 'Procurement', 'Procure', 'Custom Fabrication', 'Existing Rig'], default: 'Stock' },
        estimatedUnitCost: { type: Number, default: 0 },
        totalCost: { type: Number, default: 0 },
        quantityRequested: { type: Number, default: 0 },
        quantityIssued: { type: Number, default: 0 },
        quantityConsumed: { type: Number, default: 0 },
        quantityReceived: { type: Number, default: 0 },
        quantityReturned: { type: Number, default: 0 },
        notes: { type: String, default: '' },
      },
    ],
    totalEstimatedCost: { type: Number, default: 0 },
    linkedMaterialRequestId: { type: String, index: true },
    receiptStatus: {
      type: String,
      enum: ['Pending', 'Partially Received', 'Fully Received'],
      default: 'Pending',
    },
    requisitionStatus: {
      type: String,
      enum: ['Draft', 'Requested', 'Partially Issued', 'Issued'],
      default: 'Draft',
    },
  },
  { timestamps: true },
);
export const RDBOMModel: Model<RDBOM> = model<RDBOM>('RDBOM', RDBOMSchema);

// --- R&D WORK UPDATE MODEL ---
const RDWorkUpdateSchema = new Schema<RDWorkUpdate>(
  {
    id: { type: String, required: true, unique: true, index: true },
    rdProjectId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    engineerId: { type: String, required: true },
    engineerName: { type: String, required: true },
    selectedStages: { type: [String], default: [] },
    customStage: { type: String },
    hoursSpent: { type: Number, required: true, default: 1 },
    highlights: { type: [String], default: [] },
    technicalObservations: { type: String, default: '' },
    attachments: { type: [String], default: [] },
    createdAt: { type: String, required: true },
  },
  { timestamps: false },
);
export const RDWorkUpdateModel: Model<RDWorkUpdate> = model<RDWorkUpdate>(
  'RDWorkUpdate',
  RDWorkUpdateSchema,
);

// --- R&D TEST RECORD MODEL ---
const RDTestRecordSchema = new Schema<RDTestRecord>(
  {
    id: { type: String, required: true, unique: true, index: true },
    rdProjectId: { type: String, required: true, index: true },
    testName: { type: String, required: true },
    testProtocolNumber: { type: String, default: '' },
    iteration: { type: Number, default: 1 },
    testDate: { type: String, required: true, index: true },
    testedById: { type: String, required: true },
    testedByName: { type: String, required: true },
    status: {
      type: String,
      enum: ['In Progress', 'Passed', 'Failed'],
      default: 'In Progress',
      index: true,
    },
    checklist: [
      {
        id: { type: String, required: true },
        parameterOrCheck: { type: String, required: true },
        expectedCondition: { type: String, required: true },
        measuredValue: { type: String, required: true },
        result: { type: String, enum: ['Pass', 'Fail', 'Pending'], default: 'Pending' },
        remarks: { type: String, default: '' },
      },
    ],
    environmentalConditions: { type: String, default: '' },
    testNotes: { type: String, default: '' },
    retestRequired: { type: Boolean, default: false },
    retestReason: { type: String, default: '' },
  },
  { timestamps: true },
);
export const RDTestRecordModel: Model<RDTestRecord> = model<RDTestRecord>(
  'RDTestRecord',
  RDTestRecordSchema,
);
