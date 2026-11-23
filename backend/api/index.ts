import { connectDatabase } from '../server/config/database';
import { env } from '../server/config/environment';
import { createApp } from '../server';
import { ensureServiceAndRDRolesAndData, ensureSuperAdminOnly } from '../server/services/seedService';

const app = createApp();
let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await connectDatabase();
      if (env.seedDemoData) {
        await ensureServiceAndRDRolesAndData();
      } else {
        await ensureSuperAdminOnly(env.superAdminEmail, env.superAdminPassword || 'Zxcvbnm09#');
      }
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export default async function handler(req: any, res: any) {
  try {
    await ensureInitialized();
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Handler Error]', err);
    return res.status(500).json({
      status: 'error',
      error: err?.message || 'Backend initialization failed',
    });
  }
}
