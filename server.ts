import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { connectDatabase } from './server/config/database';
import { env } from './server/config/environment';
import { apiRouter } from './server/routes';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Mount REST API
  app.use('/api', apiRouter);

  return app;
}

export async function startServer() {
  // Connect to MongoDB before accepting HTTP traffic
  await connectDatabase();

  const app = createApp();

  if (!env.isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`CRYO Enterprise ERP 2.0 server listening on http://0.0.0.0:${env.port}`);
  });

  return { app, server };
}

// Only auto-start when executed directly as entrypoint (not when imported in test suites)
const isMainModule = process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));
if (isMainModule && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Failed to start CRYO ERP server:', err);
    process.exit(1);
  });
}
