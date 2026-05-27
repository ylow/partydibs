import express from 'express';
import { validateTitle, validatePassword } from '../validate.js';
import { hashPassword, createSession } from '../auth.js';

const COOKIE_NAME = 'admin_session';
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', path: '/' };

function partyExists(db) {
  return !!db.prepare('SELECT 1 FROM party WHERE id = 1').get();
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

  app.use('/api', router);
  return router;
}
