import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const BCRYPT_COST = 12;

export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function createSession(db) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)').run(
    token,
    Math.floor(Date.now() / 1000)
  );
  return token;
}

export function lookupSession(db, token) {
  if (typeof token !== 'string' || token.length === 0) return false;
  const row = db.prepare('SELECT 1 FROM admin_sessions WHERE token = ?').get(token);
  return !!row;
}

export function deleteSession(db, token) {
  if (typeof token !== 'string') return;
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
}
