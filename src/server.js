import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { mountPages } from './routes/pages.js';
import { mountApi } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

export function buildApp(db) {
  const app = express();
  app.use(cookieParser());
  app.use(express.static(PUBLIC_DIR, { index: false }));
  mountApi(app, db);
  mountPages(app, db);
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const dbPath = process.env.DB_PATH || './data/party.db';
  const db = openDb(dbPath);
  const app = buildApp(db);
  app.listen(port, host, () => {
    console.log(`PartyDibs listening on http://${host}:${port}`);
  });
}
