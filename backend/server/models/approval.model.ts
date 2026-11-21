import { Schema, model, type Model } from 'mongoose';
import type { ApprovalRequest, ApprovalWorkflow } from '../../src/types/erp';

const ApprovalLevelConfigSchema = new Schema(
  {
    levelNumber: { type: Number, required: true },
    levelName: { type: String, required: true },
    approverType: { type: String, enum: ['role', 'employee', 'either'], default: 'role' },
    eligibleRoleIds: { type: [String], default: [] },
    eligibleEmployeeIds: { type: [String], default: [] },
    requiredApprovalCount: { type: Number, default: 1 },
  },
  { _id: false },
);

const ApprovalWorkflowSchema = new Schema<ApprovalWorkflow>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    department: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    triggerAction: { type: String, required: true, default: 'submit' },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: true, index: true },
    allowSelfApproval: { type: Boolean, default: false },
    approvalLevels: { type: [ApprovalLevelConfigSchema], default: [] },
  },
  { timestamps: true },
);

export const ApprovalWorkflowModel: Model<ApprovalWorkflow> = model<ApprovalWorkflow>(
  'ApprovalWorkflow',
  ApprovalWorkflowSchema,
);

const ApprovalDecisionRecordSchema = new Schema(
  {
    levelNumber: { type: Number, required: true },
    levelName: { type: String, required: true },
    decidedBy: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      employeeId: { type: String, required: true },
      roleName: { type: String, required: true },
    },
    decision: { type: String, enum: ['approved', 'rejected', 'changes_requested'], required: true },
    remarks: { type: String, default: '' },
    decidedAt: { type: String, required: true },
  },
  { _id: false },
);

const ApprovalRequestSchema = new Schema<ApprovalRequest>(
  {
    id: { type: String, required: true, unique: true, index: true },
    workflowId: { type: String, required: true, index: true },
    workflowName: { type: String, required: true },
    department: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    documentId: { type: String, required: true, index: true },
    documentDocNo: { type: String, required: true, index: true },
    documentVersion: { type: String, required: true, default: 'V1' },
    submittedBy: {
      id: { type: String, required: true, index: true },
      name: { type: String, required: true },
      employeeId: { type: String, required: true },
      roleId: { type: String, required: true },
      department: { type: String, required: true },
    },
    submittedAt: { type: String, required: true },
    documentSnapshot: { type: Schema.Types.Mixed, required: true },
    currentLevel: { type: Number, required: true, default: 1 },
    totalLevels: { type: Number, required: true, default: 1 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'changes_requested', 'withdrawn'],
      default: 'pending',
      index: true,
    },
    decisions: { type: [ApprovalDecisionRecordSchema], default: [] },
  },
  { timestamps: true },
);

export const ApprovalRequestModel: Model<ApprovalRequest> = model<ApprovalRequest>(
  'ApprovalRequest',
  ApprovalRequestSchema,
);
