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

test('POST /api/login with correct password sets cookie', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'P', password: 'pw' });
  const res = await request(app).post('/api/login').send({ password: 'pw' });
  assert.equal(res.status, 200);
  assert.match(res.headers['set-cookie'].join(';'), /admin_session=[0-9a-f]{64}/);
});

test('POST /api/login with wrong password returns 401', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'P', password: 'pw' });
  const res = await request(app).post('/api/login').send({ password: 'nope' });
  assert.equal(res.status, 401);
  assert.equal(res.headers['set-cookie'], undefined);
});

test('POST /api/login before setup returns 400', async () => {
  const { app } = freshApp();
  const res = await request(app).post('/api/login').send({ password: 'pw' });
  assert.equal(res.status, 400);
});

test('POST /api/logout clears cookie and deletes session row', async () => {
  const { db, app } = freshApp();
  const agent = request.agent(app);
  await agent.post('/api/setup').send({ title: 'P', password: 'pw' });
  const before = db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n;
  assert.equal(before, 1);
  const res = await agent.post('/api/logout');
  assert.equal(res.status, 200);
  const after = db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n;
  assert.equal(after, 0);
});

test('GET /api/state before setup returns 400', async () => {
  const { app } = freshApp();
  const res = await request(app).get('/api/state');
  assert.equal(res.status, 400);
});

test('GET /api/state returns title and empty items after setup', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'Mine', password: 'pw' });
  const res = await request(app).get('/api/state');
  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'Mine');
  assert.deepEqual(res.body.items, []);
});
