import express from 'express';
import { connectDatabase } from './server/config/database';
import { env } from './server/config/environment';
import { corsMiddleware, noSqlSanitizer, securityHeaders } from './server/middleware/auth.middleware';
import { apiRouter } from './server/routes';
import { ensureServiceAndRDRolesAndData, ensureSuperAdminOnly } from './server/services/seedService';

export function createApp() {
  const app = express();

  // Enterprise Security Headers
  app.use(securityHeaders);

  // CORS Middleware
  app.use(corsMiddleware);

  // Secure JSON body parsing with restricted 2MB payload ceiling
  app.use(express.json({ limit: '2mb' }));

  // NoSQL Injection Sanitizer
  app.use(noSqlSanitizer);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'CRYO Enterprise ERP 2.0 API Server',
      version: '2.9.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Root endpoint info
  app.get('/', (_req, res) => {
    res.json({
      name: 'CRYO Enterprise ERP 2.0 API Server',
      version: '2.9.0',
      status: 'active',
      endpoints: {
        health: '/health',
        api: '/api',
      },
    });
  });

  // Lazy DB + seed initializer for serverless environments (e.g. Vercel Express runtime)
  app.use('/api', async (_req, res, next) => {
    try {
      await ensureDbInitialized();
      next();
    } catch (err: any) {
      console.error('[API Init Error]', err);
      res.status(500).json({
        status: 'error',
        error: err?.message || 'Backend initialization failed',
      });
    }
  });

  // Mount REST API
  app.use('/api', apiRouter);

  return app;
}

let dbInitPromise: Promise<void> | null = null;
let dbInitialized = false;

async function ensureDbInitialized() {
  if (dbInitialized) return;
  if (env.configError) {
    throw new Error(env.configError);
  }
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await connectDatabase();
      if (env.seedDemoData) {
        await ensureServiceAndRDRolesAndData();
      } else {
        await ensureSuperAdminOnly(env.superAdminEmail, env.superAdminPassword || 'Zxcvbnm09#');
      }
      dbInitialized = true;
    })().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

export async function startServer() {
  // Connect to MongoDB before accepting HTTP traffic
  await ensureDbInitialized();

  const app = createApp();

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`CRYO Enterprise ERP 2.0 API server listening on http://0.0.0.0:${env.port}`);
  });

  return { app, server };
}

const app = createApp();
export default app;

// Only auto-start when executed directly as entrypoint (not when imported in test suites)
const isMainModule = process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));
if (isMainModule && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Failed to start CRYO ERP server:', err);
    process.exit(1);
  });
}
