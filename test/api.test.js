import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/server.js';

function freshApp() {
  const db = openDb(':memory:');
  return { db, app: buildApp(db) };
}

test('POST /api/setup creates the party row and sets admin cookie', async () => {
  const { db, app } = freshApp();
  const res = await request(app)
    .post('/api/setup')
    .send({ title: 'Bday Bash', password: 'hunter2' });
  assert.equal(res.status, 200);
  const setCookie = res.headers['set-cookie'].join(';');
  assert.match(setCookie, /admin_session=[0-9a-f]{64}/);
  const row = db.prepare('SELECT * FROM party WHERE id = 1').get();
  assert.equal(row.title, 'Bday Bash');
  assert.ok(row.admin_pw_hash.startsWith('$2'));
});

test('POST /api/setup returns 409 when party already set up', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'A', password: 'p' });
  const res = await request(app)
    .post('/api/setup')
    .send({ title: 'B', password: 'q' });
  assert.equal(res.status, 409);
});

test('POST /api/setup validates inputs', async () => {
  const { app } = freshApp();
  const res = await request(app)
    .post('/api/setup')
    .send({ title: '', password: 'p' });
  assert.equal(res.status, 400);
});
