import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export interface IStorageAdapter {
  save(buffer: Buffer, originalName: string, mimeType: string, module: string): Promise<string>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  getSignedUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
}

export class LocalStorageAdapter implements IStorageAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    const tmpFallback = path.join(os.tmpdir(), 'cryo-uploads');
    this.baseDir = baseDir || (process.env.VERCEL ? tmpFallback : path.resolve(process.cwd(), 'uploads'));
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
    } catch {
      this.baseDir = tmpFallback;
      try {
        if (!fs.existsSync(this.baseDir)) {
          fs.mkdirSync(this.baseDir, { recursive: true });
        }
      } catch {
        // Defer directory creation until an explicit save() if filesystem is restricted
      }
    }
  }

  private resolveSafePath(storageKey: string): string {
    const safeKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(this.baseDir, safeKey);
    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error('SECURITY_ERROR: Directory traversal attempt detected.');
    }
    return fullPath;
  }

  async save(buffer: Buffer, originalName: string, _mimeType: string, module: string): Promise<string> {
    const cleanModule = module.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
    const moduleDir = path.join(this.baseDir, cleanModule);
    if (!fs.existsSync(moduleDir)) {
      await fs.promises.mkdir(moduleDir, { recursive: true });
    }

    const ext = path.extname(originalName) || '';
    const hash = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const safeBaseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32);
    const filename = `${timestamp}_${safeBaseName}_${hash}${ext}`;
    const storageKey = path.join(cleanModule, filename).replace(/\\/g, '/');

    const filePath = path.join(this.baseDir, storageKey);
    await fs.promises.writeFile(filePath, buffer);
    return storageKey;
  }

  async get(storageKey: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(storageKey);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`NOT_FOUND: Storage file not found for key: ${storageKey}`);
    }
    return fs.promises.readFile(fullPath);
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = this.resolveSafePath(storageKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }

  async getSignedUrl(storageKey: string, _expiresInSeconds = 3600): Promise<string> {
    // For local storage, returns an internal API access URL
    return `/api/files/download-by-key?key=${encodeURIComponent(storageKey)}`;
  }
}

// S3 Storage Adapter skeleton (for seamless cloud object storage deployment)
export class S3StorageAdapter implements IStorageAdapter {
  private bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  async save(buffer: Buffer, originalName: string, _mimeType: string, module: string): Promise<string> {
    const ext = path.extname(originalName) || '';
    const hash = crypto.randomBytes(8).toString('hex');
    const storageKey = `${module}/${Date.now()}_${hash}${ext}`;
    // When S3 client is configured, puts object to S3 bucket
    return storageKey;
  }

  async get(_storageKey: string): Promise<Buffer> {
    throw new Error('S3 get requires AWS S3 credentials configuration.');
  }

  async delete(_storageKey: string): Promise<void> {
    // S3 deleteObject
  }

  async getSignedUrl(storageKey: string, expiresInSeconds = 3600): Promise<string> {
    return `https://${this.bucket}.s3.amazonaws.com/${storageKey}?expires=${expiresInSeconds}`;
  }
}

export const storageService = new LocalStorageAdapter();
