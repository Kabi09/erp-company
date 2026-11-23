let appInstance: any = null;
let initPromise: Promise<any> | null = null;

function sendJson(res: any, statusCode: number, payload: unknown) {
  if (typeof res?.status === 'function' && typeof res?.json === 'function') {
    return res.status(statusCode).json(payload);
  }
  res.statusCode = statusCode;
  if (typeof res?.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  res.end(JSON.stringify(payload));
  return res;
}

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
    const urlPath = String(req?.url || '').split('?')[0];
    if (req?.method === 'GET' && (urlPath === '' || urlPath === '/' || urlPath === '/health')) {
      return sendJson(res, 200, {
        status: 'healthy',
        service: 'CRYO Enterprise ERP 2.0 API Server',
        version: '2.9.0',
        timestamp: new Date().toISOString(),
      });
    }

    const app = await ensureApp();
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Handler Error]', err);
    return sendJson(res, 500, {
      status: 'error',
      error: err?.message || 'Backend initialization failed',
    });
  }
}
