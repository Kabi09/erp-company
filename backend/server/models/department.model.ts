import { Schema, model } from 'mongoose';
import type { Values } from '../../../shared/departmentForms';

export interface WorkEntry {
  id: string;
  action: string;
  actor: string;
  actorName: string;
  employeeId: string;
  at: string;
  data: Values;
}
export interface WorkRecord {
  id: string;
  docNo: string;
  name: string;
  status: string;
  employeeId: string;
  assetId: string;
  createdBy: string;
  revision: number;
  details: Values;
  entries: WorkEntry[];
  paymentReferences?: string[];
}
const record = new Schema<WorkRecord>(
  {
    id: { type: String, required: true, unique: true },
    docNo: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, required: true, index: true },
    employeeId: { type: String, default: '', index: true },
    assetId: { type: String, default: '', index: true },
    createdBy: { type: String, required: true },
    revision: { type: Number, default: 0 },
    details: { type: Schema.Types.Mixed, required: true },
    entries: [
      {
        _id: false,
        id: String,
        action: String,
        actor: String,
        actorName: String,
        employeeId: String,
        at: String,
        data: Schema.Types.Mixed,
      },
    ],
  },
  { timestamps: true },
);
const serviceRecord = record.clone();
serviceRecord.add({ paymentReferences: { type: [String], default: undefined } });
serviceRecord.index({ paymentReferences: 1 }, { unique: true, sparse: true });
export const ServiceJob = model('ServiceJob', serviceRecord);
export const ResearchProject = model('ResearchProject', record.clone());
export const UnitWarranty = model(
  'UnitWarranty',
  new Schema(
    {
      assetId: { type: String, unique: true, required: true },
      duration: Number,
      unit: String,
      basis: String,
      start: String,
      notes: String,
      reviewedBy: String,
    },
    { timestamps: true },
  ),
);
