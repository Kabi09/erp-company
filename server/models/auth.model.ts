import { Schema, model, type Model } from 'mongoose';
import type { ActivityLog, CompanySettings, Employee, NotificationItem, Role } from '../../src/types/erp';

// --- ROLE MODEL ---
const RoleSchema = new Schema<Role>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, unique: true },
    department: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    permissions: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
export const RoleModel: Model<Role> = model<Role>('Role', RoleSchema);

// --- EMPLOYEE MODEL ---
const EmployeeSchema = new Schema<Employee>(
  {
    id: { type: String, required: true, unique: true, index: true },
    employeeId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    department: { type: String, required: true, index: true },
    roleId: { type: String, required: true, index: true },
    designation: { type: String, default: 'Executive' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active', index: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);
export const EmployeeModel: Model<Employee> = model<Employee>('Employee', EmployeeSchema);

// --- COMPANY SETTINGS MODEL ---
const CompanySettingsSchema = new Schema<CompanySettings & { id: string }>(
  {
    id: { type: String, required: true, unique: true, default: 'company' },
    companyName: { type: String, required: true },
    legalName: { type: String, default: '' },
    gstin: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankIfsc: { type: String, default: '' },
    bankBranch: { type: String, default: '' },
    defaultTaxPercent: { type: Number, default: 18 },
    defaultPaymentTerms: { type: String, default: '' },
    defaultDeliveryTerms: { type: String, default: '' },
    defaultWarranty: { type: String, default: '' },
    currencySymbol: { type: String, default: '₹' },
    demoMode: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const CompanySettingsModel = model('CompanySettings', CompanySettingsSchema);

// --- DOCUMENT COUNTERS MODEL ---
export interface DocCounterDoc {
  key: string;
  value: number;
}
const DocCounterSchema = new Schema<DocCounterDoc>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);
export const DocCounterModel = model<DocCounterDoc>('DocCounter', DocCounterSchema);

// --- NOTIFICATION MODEL ---
const NotificationSchema = new Schema<NotificationItem>(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    department: { type: String, required: true, index: true },
    severity: { type: String, enum: ['info', 'warning', 'error', 'success'], default: 'info' },
    link: { type: String },
    readBy: { type: [String], default: [] },
    createdAt: { type: String, required: true, index: true },
  },
  { timestamps: true },
);
export const NotificationModel: Model<NotificationItem> = model<NotificationItem>('Notification', NotificationSchema);

// --- ACTIVITY LOG MODEL ---
const ActivityLogSchema = new Schema<ActivityLog>(
  {
    id: { type: String, required: true, unique: true, index: true },
    actorId: { type: String, required: true, index: true },
    actorName: { type: String, required: true },
    department: { type: String, required: true, index: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    entityDocNo: { type: String, required: true },
    details: { type: String, default: '' },
    timestamp: { type: String, required: true, index: true },
  },
  { timestamps: true },
);
export const ActivityLogModel: Model<ActivityLog> = model<ActivityLog>('ActivityLog', ActivityLogSchema);
