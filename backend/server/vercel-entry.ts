let appInstance: any = null;
let initPromise: Promise<any> | null = null;

async function ensureApp() {
  if (appInstance) return appInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const [{ connectDatabase }, { env }, { createApp }, { ensureServiceAndRDRolesAndData, ensureSuperAdminOnly }] =
        await Promise.all([
          import('./config/database'),
          import('./config/environment'),
          import('../server'),
          import('./services/seedService'),
        ]);

      await connectDatabase();
      if (env.seedDemoData) {
        await ensureServiceAndRDRolesAndData();
      } else {
        await ensureSuperAdminOnly(env.superAdminEmail, env.superAdminPassword || 'Zxcvbnm09#');
      }

      appInstance = createApp();
      return appInstance;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await ensureApp();
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Handler Error]', err);
    return res.status(500).json({
      status: 'error',
      error: err?.message || 'Backend initialization failed',
    });
  }
}
