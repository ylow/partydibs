import express from 'express';
import { validateTitle, validatePassword } from '../validate.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  lookupSession,
  deleteSession,
} from '../auth.js';

const COOKIE_NAME = 'admin_session';
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', path: '/' };

function partyExists(db) {
  return !!db.prepare('SELECT 1 FROM party WHERE id = 1').get();
}

function requireAdmin(db) {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!lookupSession(db, token)) return res.status(401).json({ error: 'admin required' });
    req.adminToken = token;
    next();
  };
}

export function mountApi(app, db) {
  const router = express.Router();
  router.use(express.json());

  router.post('/setup', async (req, res) => {
    if (partyExists(db)) return res.status(409).json({ error: 'already set up' });
    const t = validateTitle(req.body?.title);
    if (!t.ok) return res.status(400).json({ error: `title: ${t.error}` });
    const p = validatePassword(req.body?.password);
    if (!p.ok) return res.status(400).json({ error: `password: ${p.error}` });
    const hash = await hashPassword(p.value);
    db.prepare(
      'INSERT INTO party (id, title, admin_pw_hash, created_at) VALUES (1, ?, ?, ?)'
    ).run(t.value, hash, Math.floor(Date.now() / 1000));
    const token = createSession(db);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    res.json({ ok: true });
  });

  router.post('/login', async (req, res) => {
    if (!partyExists(db)) return res.status(400).json({ error: 'not set up' });
    const p = validatePassword(req.body?.password);
    if (!p.ok) return res.status(401).json({ error: 'invalid credentials' });
    const row = db.prepare('SELECT admin_pw_hash FROM party WHERE id = 1').get();
    const ok = await verifyPassword(p.value, row.admin_pw_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = createSession(db);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    res.json({ ok: true });
  });

  router.post('/logout', requireAdmin(db), (req, res) => {
    deleteSession(db, req.adminToken);
    res.clearCookie(COOKIE_NAME, COOKIE_OPTS);
    res.json({ ok: true });
  });

  router.get('/state', (req, res) => {
    const party = db.prepare('SELECT title FROM party WHERE id = 1').get();
    if (!party) return res.status(400).json({ error: 'not set up' });
    const items = db
      .prepare(
        'SELECT id, name, note, position, claimed_by, claimed_at FROM items ORDER BY position, id'
      )
      .all();
    res.json({ title: party.title, items });
  });

  app.use('/api', router);
  return router;
}
