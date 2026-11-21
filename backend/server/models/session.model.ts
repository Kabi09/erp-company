import { Schema, model, type Model } from 'mongoose';

export interface UserSession {
  id: string;
  employeeId: string;
  refreshTokenHash: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  revoked: boolean;
  replacedByTokenHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

const SessionSchema = new Schema<UserSession>(
  {
    id: { type: String, required: true, unique: true, index: true },
    employeeId: { type: String, required: true, index: true },
    refreshTokenHash: { type: String, required: true, index: true },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    revoked: { type: Boolean, default: false, index: true },
    replacedByTokenHash: { type: String, default: undefined },
  },
  { timestamps: true },
);

export const SessionModel: Model<UserSession> = model<UserSession>('Session', SessionSchema);
