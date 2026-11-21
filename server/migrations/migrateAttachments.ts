import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { env } from '../config/environment';
import { connectDatabase } from '../config/database';
import {
  CustomerPOModel,
  PaymentEntryModel,
  GRNModel,
  QualityCheckModel,
  DeliveryOrderModel,
  AttachmentModel,
} from '../models';
import { storageService } from '../services/storage.service';
import { generateId } from '../utils/routeUtils';

export interface MigrationSummary {
  dryRun: boolean;
  totalFound: number;
  migratedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: Array<{ recordId: string; field: string; error: string }>;
}

export async function migrateLegacyAttachments(options: { dryRun?: boolean; silent?: boolean } = {}): Promise<MigrationSummary> {
  const isDryRun = options.dryRun ?? false;
  const isSilent = options.silent ?? false;

  const summary: MigrationSummary = {
    dryRun: isDryRun,
    totalFound: 0,
    migratedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: [],
  };

  const log = (msg: string) => {
    if (!isSilent) console.log(msg);
  };

  log(`[Migration] Starting legacy base64 attachment migration (Dry-run: ${isDryRun})...`);

  // Helper to extract MIME and buffer from data URL or raw base64
  const decodeBase64 = (dataUrl: string, fallbackMime = 'application/octet-stream') => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        mimeType: match[1],
        buffer: Buffer.from(match[2], 'base64'),
      };
    }
    return {
      mimeType: fallbackMime,
      buffer: Buffer.from(dataUrl, 'base64'),
    };
  };

  // 1. Customer PO Attachments
  try {
    const cpos = await CustomerPOModel.find({
      $or: [
        { attachmentDataUrl: { $exists: true, $ne: '' } },
        { attachment: { $exists: true, $ne: '' } },
      ],
    }).lean();

    for (const cpo of cpos) {
      const rawData = cpo.attachmentDataUrl || (cpo as any).attachment;
      if (!rawData || typeof rawData !== 'string') continue;
      summary.totalFound++;

      // Check if already migrated
      const existing = await AttachmentModel.findOne({ recordId: cpo.id, module: 'sales' });
      if (existing) {
        summary.skippedCount++;
        continue;
      }

      try {
        const { mimeType, buffer } = decodeBase64(rawData, 'application/pdf');
        const filename = cpo.attachmentName || `CustomerPO_${cpo.customerPoNumber || cpo.id}.pdf`;

        if (!isDryRun) {
          const storageKey = await storageService.save(buffer, filename, mimeType, 'sales');
          await AttachmentModel.create({
            id: generateId('att'),
            originalName: filename,
            storageKey,
            mimeType,
            fileSize: buffer.length,
            module: 'sales',
            recordId: cpo.id,
            recordDocNo: cpo.customerPoNumber || cpo.id,
            uploadedBy: cpo.createdBy || 'System Migration',
            uploadedAt: cpo.createdAt || new Date().toISOString(),
            isMigrated: true,
          });
          summary.migratedCount++;
        }
      } catch (err: any) {
        summary.failedCount++;
        summary.errors.push({ recordId: cpo.id, field: 'attachmentDataUrl', error: err.message });
      }
    }
  } catch (err: any) {
    log(`[Migration Error: Customer POs] ${err.message}`);
  }

  // 2. Payment Entry Proofs
  try {
    const payments = await PaymentEntryModel.find({
      $or: [
        { proofDataUrl: { $exists: true, $ne: '' } },
        { receiptProofDataUrl: { $exists: true, $ne: '' } },
        { receiptProof: { $exists: true, $ne: '' } },
      ],
    }).lean();

    for (const pay of payments) {
      const rawData = (pay as any).proofDataUrl || (pay as any).receiptProofDataUrl || (pay as any).receiptProof;
      if (!rawData || typeof rawData !== 'string') continue;
      summary.totalFound++;

      const existing = await AttachmentModel.findOne({ recordId: pay.id, module: 'sales' });
      if (existing) {
        summary.skippedCount++;
        continue;
      }

      try {
        const { mimeType, buffer } = decodeBase64(rawData, 'image/png');
        const filename = (pay as any).proofName || (pay as any).receiptProofName || `PaymentProof_${pay.docNo}.png`;

        if (!isDryRun) {
          const storageKey = await storageService.save(buffer, filename, mimeType, 'sales');
          const attId = generateId('att');
          await AttachmentModel.create({
            id: attId,
            originalName: filename,
            storageKey,
            mimeType,
            fileSize: buffer.length,
            module: 'sales',
            recordId: pay.id,
            recordDocNo: pay.docNo,
            uploadedBy: pay.createdBy || 'System Migration',
            uploadedAt: pay.createdAt || new Date().toISOString(),
            isMigrated: true,
          });

          await PaymentEntryModel.updateOne(
            { id: pay.id },
            {
              $set: {
                proofDataUrl: `/api/files/${attId}/download`,
                receiptProofDataUrl: `/api/files/${attId}/download`,
              },
            },
          );
          summary.migratedCount++;
        }
      } catch (err: any) {
        summary.failedCount++;
        summary.errors.push({ recordId: pay.id, field: 'receiptProof', error: err.message });
      }
    }
  } catch (err: any) {
    log(`[Migration Error: Payments] ${err.message}`);
  }

  // 3. GRN Delivery Challan Attachments
  try {
    const grns = await GRNModel.find({
      $or: [
        { attachmentDataUrl: { $exists: true, $ne: '' } },
        { deliveryChallanCopy: { $exists: true, $ne: '' } },
      ],
    }).lean();

    for (const grn of grns) {
      const rawData = grn.attachmentDataUrl || (grn as any).deliveryChallanCopy;
      if (!rawData || typeof rawData !== 'string') continue;
      summary.totalFound++;

      const existing = await AttachmentModel.findOne({ recordId: grn.id, module: 'supply_chain' });
      if (existing) {
        summary.skippedCount++;
        continue;
      }

      try {
        const { mimeType, buffer } = decodeBase64(rawData, 'application/pdf');
        const filename = grn.attachmentName || `GRN_Challan_${grn.docNo}.pdf`;

        if (!isDryRun) {
          const storageKey = await storageService.save(buffer, filename, mimeType, 'supply_chain');
          await AttachmentModel.create({
            id: generateId('att'),
            originalName: filename,
            storageKey,
            mimeType,
            fileSize: buffer.length,
            module: 'supply_chain',
            recordId: grn.id,
            recordDocNo: grn.docNo,
            uploadedBy: grn.createdBy || 'System Migration',
            uploadedAt: grn.createdAt || new Date().toISOString(),
            isMigrated: true,
          });
          summary.migratedCount++;
        }
      } catch (err: any) {
        summary.failedCount++;
        summary.errors.push({ recordId: grn.id, field: 'deliveryChallanCopy', error: err.message });
      }
    }
  } catch (err: any) {
    log(`[Migration Error: GRN] ${err.message}`);
  }

  // 4. Quality Check Attachments
  try {
    const qcs = await QualityCheckModel.find({
      $or: [
        { attachmentDataUrl: { $exists: true, $ne: '' } },
        { inspectionReport: { $exists: true, $ne: '' } },
      ],
    }).lean();

    for (const rawQC of qcs) {
      const qc = rawQC as any;
      const rawData = qc.attachmentDataUrl || qc.inspectionReport;
      if (!rawData || typeof rawData !== 'string') continue;
      summary.totalFound++;

      const existing = await AttachmentModel.findOne({ recordId: qc.id, module: 'production' });
      if (existing) {
        summary.skippedCount++;
        continue;
      }

      try {
        const { mimeType, buffer } = decodeBase64(rawData, 'application/pdf');
        const filename = qc.attachmentName || `QC_Report_${qc.docNo}.pdf`;

        if (!isDryRun) {
          const storageKey = await storageService.save(buffer, filename, mimeType, 'production');
          await AttachmentModel.create({
            id: generateId('att'),
            originalName: filename,
            storageKey,
            mimeType,
            fileSize: buffer.length,
            module: 'production',
            recordId: qc.id,
            recordDocNo: qc.docNo,
            uploadedBy: qc.inspector || qc.inspectorName || 'System Migration',
            uploadedAt: qc.createdAt || new Date().toISOString(),
            isMigrated: true,
          });
          summary.migratedCount++;
        }
      } catch (err: any) {
        summary.failedCount++;
        summary.errors.push({ recordId: qc.id, field: 'inspectionReport', error: err.message });
      }
    }
  } catch (err: any) {
    log(`[Migration Error: Quality Checks] ${err.message}`);
  }

  // 5. Delivery Order Proof of Delivery (POD)
  try {
    const deliveries = await DeliveryOrderModel.find({
      $or: [
        { podDataUrl: { $exists: true, $ne: '' } },
        { podAttachment: { $exists: true, $ne: '' } },
      ],
    }).lean();

    for (const del of deliveries) {
      const rawData = del.podDataUrl || (del as any).podAttachment;
      if (!rawData || typeof rawData !== 'string') continue;
      summary.totalFound++;

      const existing = await AttachmentModel.findOne({ recordId: del.id, module: 'logistics' });
      if (existing) {
        summary.skippedCount++;
        continue;
      }

      try {
        const { mimeType, buffer } = decodeBase64(rawData, del.podFileType || 'image/png');
        const filename = del.podName || `POD_${del.docNo}.${del.podFileType ? del.podFileType.split('/')[1] : 'png'}`;

        if (!isDryRun) {
          const storageKey = await storageService.save(buffer, filename, mimeType, 'logistics');
          await AttachmentModel.create({
            id: generateId('att'),
            originalName: filename,
            storageKey,
            mimeType,
            fileSize: buffer.length,
            module: 'logistics',
            recordId: del.id,
            recordDocNo: del.docNo,
            uploadedBy: del.podUploadedBy || 'System Migration',
            uploadedAt: del.podUploadedAt || del.createdAt || new Date().toISOString(),
            isMigrated: true,
          });
          summary.migratedCount++;
        }
      } catch (err: any) {
        summary.failedCount++;
        summary.errors.push({ recordId: del.id, field: 'podDataUrl', error: err.message });
      }
    }
  } catch (err: any) {
    log(`[Migration Error: Logistics] ${err.message}`);
  }

  log(`[Migration Complete] Found: ${summary.totalFound}, Migrated: ${summary.migratedCount}, Skipped: ${summary.skippedCount}, Failed: ${summary.failedCount}`);
  return summary;
}

// Standalone execution entrypoint
if (process.argv[1]?.endsWith('migrateAttachments.ts') || process.argv[1]?.endsWith('migrateAttachments.js')) {
  (async () => {
    try {
      await connectDatabase();
      const isDry = process.argv.includes('--dry-run');
      const res = await migrateLegacyAttachments({ dryRun: isDry });
      console.log('Result:', JSON.stringify(res, null, 2));
      process.exit(res.failedCount > 0 ? 1 : 0);
    } catch (err) {
      console.error('Fatal migration error:', err);
      process.exit(1);
    }
  })();
}
