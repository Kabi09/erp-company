import { Schema, model, type Model } from 'mongoose';
import type { AttachmentRecord } from '../../src/types/erp';

const AttachmentSchema = new Schema<AttachmentRecord>(
  {
    id: { type: String, required: true, unique: true, index: true },
    originalName: { type: String, required: true },
    storageKey: { type: String, required: true, unique: true, index: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    module: { type: String, required: true, index: true },
    recordId: { type: String, required: true, index: true },
    recordDocNo: { type: String, default: '' },
    uploadedById: String,
    uploadedBy: { type: String, required: true },
    uploadedAt: { type: String, required: true, index: true },
    isMigrated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const AttachmentModel: Model<AttachmentRecord> = model<AttachmentRecord>('Attachment', AttachmentSchema);
