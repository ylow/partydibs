import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  lookupSession,
  deleteSession,
} from '../src/auth.js';

test('hashPassword + verifyPassword roundtrip', async () => {
  const hash = await hashPassword('hunter2');
  assert.notEqual(hash, 'hunter2');
  assert.equal(await verifyPassword('hunter2', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('createSession returns a 64-char hex token and inserts a row', () => {
  const db = openDb(':memory:');
  const token = createSession(db);
  assert.match(token, /^[0-9a-f]{64}$/);
  const row = db.prepare('SELECT * FROM admin_sessions WHERE token = ?').get(token);
  assert.ok(row);
  assert.equal(typeof row.created_at, 'number');
});

test('lookupSession returns true for known token, false otherwise', () => {
  const db = openDb(':memory:');
  const token = createSession(db);
  assert.equal(lookupSession(db, token), true);
  assert.equal(lookupSession(db, 'nope'), false);
  assert.equal(lookupSession(db, undefined), false);
});

test('deleteSession removes the row', () => {
  const db = openDb(':memory:');
  const token = createSession(db);
  deleteSession(db, token);
  assert.equal(lookupSession(db, token), false);
});
