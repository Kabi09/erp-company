import { Router } from 'express';
import multer from 'multer';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { AttachmentModel } from '../models';
import { storageService } from '../services/storage.service';
import { generateId, sendError } from '../utils/routeUtils';

export const fileRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`UNSUPPORTED_MEDIA_TYPE: File type '${file.mimetype}' is not permitted. Permitted types: PDF, PNG, JPEG, WEBP, CSV, XLSX, DOCX.`));
    }
  },
});

// POST /api/files/upload - Secure file upload (supports both multipart form and JSON base64)
fileRouter.post('/files/upload', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    let buffer: Buffer;
    let originalName: string;
    let mimeType: string;
    let module = (req.body.module || 'general').toLowerCase();
    let recordId = req.body.recordId || '';
    let recordDocNo = req.body.recordDocNo || '';

    if (req.file) {
      buffer = req.file.buffer;
      originalName = req.file.originalname;
      mimeType = req.file.mimetype;
    } else if (req.body.dataBase64) {
      // Programmatic base64 upload
      const rawBase64 = req.body.dataBase64;
      const match = rawBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = req.body.mimeType || match[1];
        buffer = Buffer.from(match[2], 'base64');
      } else {
        mimeType = req.body.mimeType || 'application/octet-stream';
        buffer = Buffer.from(rawBase64, 'base64');
      }
      originalName = req.body.originalName || req.body.filename || 'attachment.bin';
    } else {
      throw new Error('BAD_REQUEST: No file uploaded or dataBase64 provided.');
    }

    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error('PAYLOAD_TOO_LARGE: Uploaded file exceeds the 10MB limit.');
    }

    // Save to private local/object storage
    const storageKey = await storageService.save(buffer, originalName, mimeType, module);

    // Save metadata in MongoDB
    const attachment = {
      id: generateId('att'),
      originalName,
      storageKey,
      mimeType,
      fileSize: buffer.length,
      module,
      recordId,
      recordDocNo,
      uploadedBy: user.name,
      uploadedAt: new Date().toISOString(),
      isMigrated: false,
    };

    await AttachmentModel.create(attachment);

    res.status(201).json({
      ok: true,
      attachment,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/files/:id/download - Secure private file download with RBAC verification
fileRouter.get('/files/:id/download', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const isSuperAdmin = user.department === 'admin';

    const attachment = await AttachmentModel.findOne({ id }).lean();
    if (!attachment) {
      throw new Error(`NOT_FOUND: Attachment '${id}' not found.`);
    }

    // Permission check
    if (!isSuperAdmin) {
      const allowedModule = attachment.module.toLowerCase();
      const userPerms = (user.permissions as any)?.[allowedModule] || [];
      if (!userPerms.includes('view') && user.department !== allowedModule) {
        throw new Error(`FORBIDDEN: You do not have permission to access attachments in the '${attachment.module}' module.`);
      }
    }

    const fileBuffer = await storageService.get(attachment.storageKey);

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.originalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`);
    res.send(fileBuffer);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/files/by-record/:module/:recordId - List attachments for a record
fileRouter.get('/files/by-record/:module/:recordId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { module, recordId } = req.params;
    const items = await AttachmentModel.find({ module, recordId } as any).sort({ uploadedAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/files/:id - Remove an attachment
fileRouter.delete('/files/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const isSuperAdmin = user.department === 'admin';

    const attachment = await AttachmentModel.findOne({ id });
    if (!attachment) {
      throw new Error(`NOT_FOUND: Attachment '${id}' not found.`);
    }

    if (!isSuperAdmin) {
      const allowedModule = attachment.module.toLowerCase();
      const userPerms = (user.permissions as any)?.[allowedModule] || [];
      if (!userPerms.includes('edit') && !userPerms.includes('delete') && !userPerms.includes('manage')) {
        throw new Error('FORBIDDEN: You do not have permission to delete this attachment.');
      }
    }

    await storageService.delete(attachment.storageKey);
    await AttachmentModel.deleteOne({ id });

    res.json({ ok: true, message: `Attachment '${attachment.originalName}' deleted successfully.` });
  } catch (err) {
    sendError(res, err);
  }
});
