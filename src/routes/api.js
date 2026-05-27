import express from 'express';
import {
  validateTitle,
  validatePassword,
  validateItemName,
  validateItemNote,
  validateClaimerName,
} from '../validate.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  lookupSession,
  deleteSession,
} from '../auth.js';

const COOKIE_NAME = 'admin_session';
const GUEST_COOKIE = 'guest_name';
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

  router.get('/me', (req, res) => {
    const name = req.cookies?.[GUEST_COOKIE] ?? null;
    res.json({ name });
  });

  router.post('/name', (req, res) => {
    const n = validateClaimerName(req.body?.name);
    if (!n.ok) return res.status(400).json({ error: `name: ${n.error}` });
    res.cookie(GUEST_COOKIE, n.value, COOKIE_OPTS);
    res.json({ name: n.value });
  });

  router.post('/name/logout', (req, res) => {
    res.clearCookie(GUEST_COOKIE, COOKIE_OPTS);
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

  router.post('/items', requireAdmin(db), (req, res) => {
    const n = validateItemName(req.body?.name);
    if (!n.ok) return res.status(400).json({ error: `name: ${n.error}` });
    const note = validateItemNote(req.body?.note);
    if (!note.ok) return res.status(400).json({ error: `note: ${note.error}` });
    const nextPos =
      db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM items').get().p;
    const info = db
      .prepare(
        'INSERT INTO items (name, note, position, claimed_by, claimed_at) VALUES (?, ?, ?, NULL, NULL)'
      )
      .run(n.value, note.value, nextPos);
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  });

  router.patch('/items/:id', requireAdmin(db), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });

    let name = existing.name;
    let note = existing.note;
    if (req.body?.name !== undefined) {
      const n = validateItemName(req.body.name);
      if (!n.ok) return res.status(400).json({ error: `name: ${n.error}` });
      name = n.value;
    }
    if (req.body?.note !== undefined) {
      const nv = validateItemNote(req.body.note);
      if (!nv.ok) return res.status(400).json({ error: `note: ${nv.error}` });
      note = nv.value;
    }
    db.prepare('UPDATE items SET name = ?, note = ? WHERE id = ?').run(name, note, id);
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  });

  router.delete('/items/:id', requireAdmin(db), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    res.status(204).end();
  });

  router.post('/items/:id/claim', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const n = validateClaimerName(req.body?.name);
    if (!n.ok) return res.status(400).json({ error: `name: ${n.error}` });
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const info = db
      .prepare(
        `UPDATE items SET claimed_by = ?, claimed_at = ?
         WHERE id = ? AND claimed_by IS NULL`
      )
      .run(n.value, Math.floor(Date.now() / 1000), id);
    if (info.changes === 0) {
      const current = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
      return res.status(409).json({ error: 'already claimed', item: current });
    }
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  });

  router.post('/items/:id/unclaim', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    db.prepare(
      'UPDATE items SET claimed_by = NULL, claimed_at = NULL WHERE id = ?'
    ).run(id);
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  });

  app.use('/api', router);
  return router;
}
