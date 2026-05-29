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

test('GET /api/state returns message (null until set)', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const before = await request(app).get('/api/state');
  assert.equal(before.body.message, null);
  await agent.patch('/api/party').send({ message: 'Bring a dish!' });
  const after = await request(app).get('/api/state');
  assert.equal(after.body.message, 'Bring a dish!');
});

test('PATCH /api/party requires admin', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'P', password: 'pw' });
  const res = await request(app).patch('/api/party').send({ message: 'hi' });
  assert.equal(res.status, 401);
});

test('PATCH /api/party sets, trims, and clears the message', async () => {
  const { db, app } = freshApp();
  const agent = await setupAndLogin(app);
  const set = await agent.patch('/api/party').send({ message: '  Party at 7pm\nBYOB  ' });
  assert.equal(set.status, 200);
  assert.equal(set.body.message, 'Party at 7pm\nBYOB');
  assert.equal(db.prepare('SELECT message FROM party WHERE id = 1').get().message, 'Party at 7pm\nBYOB');

  const cleared = await agent.patch('/api/party').send({ message: '' });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.message, null);
  assert.equal(db.prepare('SELECT message FROM party WHERE id = 1').get().message, null);
});

test('PATCH /api/party rejects oversized message with 400', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const res = await agent.patch('/api/party').send({ message: 'x'.repeat(1001) });
  assert.equal(res.status, 400);
});

async function setupAndLogin(app) {
  const agent = request.agent(app);
  await agent.post('/api/setup').send({ title: 'P', password: 'pw' });
  return agent;
}

test('POST /api/items requires admin', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'P', password: 'pw' });
  const res = await request(app).post('/api/items').send({ name: 'Chips' });
  assert.equal(res.status, 401);
});

test('POST /api/items creates item and assigns position', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const a = await agent.post('/api/items').send({ name: 'Chips' });
  assert.equal(a.status, 201);
  assert.equal(a.body.name, 'Chips');
  assert.equal(a.body.position, 1);
  const b = await agent.post('/api/items').send({ name: 'Soda', note: 'Diet' });
  assert.equal(b.body.position, 2);
  assert.equal(b.body.note, 'Diet');
});

test('POST /api/items rejects bad input with 400', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const res = await agent.post('/api/items').send({ name: '' });
  assert.equal(res.status, 400);
  const big = await agent.post('/api/items').send({ name: 'x'.repeat(101) });
  assert.equal(big.status, 400);
  const bigNote = await agent
    .post('/api/items')
    .send({ name: 'ok', note: 'x'.repeat(501) });
  assert.equal(bigNote.status, 400);
});

test('PATCH /api/items/:id updates name/note, leaves claim alone', async () => {
  const { db, app } = freshApp();
  const agent = await setupAndLogin(app);
  const created = (await agent.post('/api/items').send({ name: 'Chips' })).body;
  db.prepare('UPDATE items SET claimed_by = ?, claimed_at = ? WHERE id = ?').run(
    'Alice',
    123,
    created.id
  );
  const res = await agent
    .patch(`/api/items/${created.id}`)
    .send({ name: 'Tortilla chips', note: 'salty' });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(created.id);
  assert.equal(row.name, 'Tortilla chips');
  assert.equal(row.note, 'salty');
  assert.equal(row.claimed_by, 'Alice');
});

test('PATCH /api/items/:id returns 404 for unknown id', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const res = await agent.patch('/api/items/999').send({ name: 'x' });
  assert.equal(res.status, 404);
});

test('DELETE /api/items/:id removes the row', async () => {
  const { db, app } = freshApp();
  const agent = await setupAndLogin(app);
  const created = (await agent.post('/api/items').send({ name: 'Chips' })).body;
  const res = await agent.delete(`/api/items/${created.id}`);
  assert.equal(res.status, 204);
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(created.id);
  assert.equal(row, undefined);
});

test('DELETE /api/items/:id requires admin', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const created = (await agent.post('/api/items').send({ name: 'Chips' })).body;
  const res = await request(app).delete(`/api/items/${created.id}`); // no cookie
  assert.equal(res.status, 401);
});

async function guestAgent(app, name) {
  const agent = request.agent(app);
  await agent.post('/api/name').send({ name });
  return agent;
}

test('POST /api/items/:id/claim claims a free item using the cookie name', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const alice = await guestAgent(app, 'Alice');
  const res = await alice.post(`/api/items/${item.id}/claim`);
  assert.equal(res.status, 200);
  assert.equal(res.body.claimed_by, 'Alice');
});

test('POST /api/items/:id/claim without name cookie returns 401', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const res = await request(app).post(`/api/items/${item.id}/claim`);
  assert.equal(res.status, 401);
});

test('POST /api/items/:id/claim on already-claimed returns 409 with current state', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const alice = await guestAgent(app, 'Alice');
  await alice.post(`/api/items/${item.id}/claim`);
  const bob = await guestAgent(app, 'Bob');
  const res = await bob.post(`/api/items/${item.id}/claim`);
  assert.equal(res.status, 409);
  assert.equal(res.body.item.claimed_by, 'Alice');
});

test('POST /api/items/:id/claim returns 404 for unknown id (with name cookie set)', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'P', password: 'pw' });
  const alice = await guestAgent(app, 'Alice');
  const res = await alice.post('/api/items/999/claim');
  assert.equal(res.status, 404);
});

test('POST /api/items/:id/unclaim by the claimer clears it; idempotent for same name', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const alice = await guestAgent(app, 'Alice');
  await alice.post(`/api/items/${item.id}/claim`);
  const first = await alice.post(`/api/items/${item.id}/unclaim`);
  assert.equal(first.status, 200);
  assert.equal(first.body.claimed_by, null);
  const second = await alice.post(`/api/items/${item.id}/unclaim`);
  assert.equal(second.status, 200);
});

test('POST /api/items/:id/unclaim with mismatched name returns 403; original claim stays', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const alice = await guestAgent(app, 'Alice');
  await alice.post(`/api/items/${item.id}/claim`);
  const bob = await guestAgent(app, 'Bob');
  const res = await bob.post(`/api/items/${item.id}/unclaim`);
  assert.equal(res.status, 403);
  const state = await request(app).get('/api/state');
  assert.equal(state.body.items[0].claimed_by, 'Alice');
});

test('POST /api/items/:id/unclaim with no name cookie at all returns 403', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const alice = await guestAgent(app, 'Alice');
  await alice.post(`/api/items/${item.id}/claim`);
  const res = await request(app).post(`/api/items/${item.id}/unclaim`);
  assert.equal(res.status, 403);
});

test('admin can unclaim someone else\'s claim (override)', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const alice = await guestAgent(app, 'Alice');
  await alice.post(`/api/items/${item.id}/claim`);
  const res = await adminAgent.post(`/api/items/${item.id}/unclaim`);
  assert.equal(res.status, 200);
  assert.equal(res.body.claimed_by, null);
});

test('unclaim of an unclaimed item by any guest is an idempotent no-op (200)', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const bob = await guestAgent(app, 'Bob');
  const res = await bob.post(`/api/items/${item.id}/unclaim`);
  assert.equal(res.status, 200);
});

test('unclaim returns 404 for unknown id', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'P', password: 'pw' });
  const alice = await guestAgent(app, 'Alice');
  const res = await alice.post('/api/items/999/unclaim');
  assert.equal(res.status, 404);
});

test('POST /api/items/bulk requires admin', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'P', password: 'pw' });
  const res = await request(app)
    .post('/api/items/bulk')
    .send({ csv: 'Chips\nSoda,Diet' });
  assert.equal(res.status, 401);
});

test('POST /api/items/bulk with empty csv returns 200 added:0', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const res = await agent.post('/api/items/bulk').send({ csv: '' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { added: 0, errors: [] });
});

test('POST /api/items/bulk parses lines, splits on first comma, trims', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const csv = [
    'Chips',
    '  Soda  ,  Diet  ',
    'Plates, paper, ~30 people',
    '',
    'Forks',
  ].join('\n');
  const res = await agent.post('/api/items/bulk').send({ csv });
  assert.equal(res.status, 200);
  assert.equal(res.body.added, 4);
  assert.deepEqual(res.body.errors, []);

  const state = await request(app).get('/api/state');
  const items = state.body.items;
  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((i) => [i.name, i.note]),
    [
      ['Chips', null],
      ['Soda', 'Diet'],
      ['Plates', 'paper, ~30 people'],
      ['Forks', null],
    ]
  );
  assert.deepEqual(items.map((i) => i.position), [1, 2, 3, 4]);
});

test('POST /api/items/bulk reports per-line errors with 1-based line numbers', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const big = 'x'.repeat(101);
  const csv = [
    'Chips',
    `${big}`,
    'Soda,Diet',
    '',
    `ok,${'y'.repeat(501)}`,
  ].join('\n');
  const res = await agent.post('/api/items/bulk').send({ csv });
  assert.equal(res.status, 200);
  assert.equal(res.body.added, 2);
  assert.equal(res.body.errors.length, 2);
  assert.equal(res.body.errors[0].line, 2);
  assert.match(res.body.errors[0].error, /name/);
  assert.equal(res.body.errors[1].line, 5);
  assert.match(res.body.errors[1].error, /note/);

  const state = await request(app).get('/api/state');
  assert.equal(state.body.items.length, 2);
});

test('POST /api/items/bulk rejects non-string csv or oversized payload with 400', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const a = await agent.post('/api/items/bulk').send({ csv: 12345 });
  assert.equal(a.status, 400);
  const b = await agent.post('/api/items/bulk').send({ csv: 'x'.repeat(100001) });
  assert.equal(b.status, 400);
});

test('POST /api/items/bulk appends after existing items', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  await agent.post('/api/items').send({ name: 'Existing' });
  await agent.post('/api/items/bulk').send({ csv: 'A\nB' });
  const state = await request(app).get('/api/state');
  assert.deepEqual(
    state.body.items.map((i) => [i.name, i.position]),
    [
      ['Existing', 1],
      ['A', 2],
      ['B', 3],
    ]
  );
});

test('GET /api/me returns null name before any name is set', async () => {
  const { app } = freshApp();
  const res = await request(app).get('/api/me');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: null });
});

test('POST /api/name sets guest_name cookie and returns name', async () => {
  const { app } = freshApp();
  const res = await request(app).post('/api/name').send({ name: '  Alice ' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Alice');
  const setCookie = res.headers['set-cookie'].join(';');
  assert.match(setCookie, /guest_name=Alice/);
  assert.match(setCookie, /HttpOnly/i);
});

test('POST /api/name rejects empty and oversized', async () => {
  const { app } = freshApp();
  assert.equal((await request(app).post('/api/name').send({ name: '' })).status, 400);
  assert.equal(
    (await request(app).post('/api/name').send({ name: 'x'.repeat(61) })).status,
    400
  );
});

test('GET /api/me returns the name set by POST /api/name', async () => {
  const { app } = freshApp();
  const agent = request.agent(app);
  await agent.post('/api/name').send({ name: 'Alice' });
  const res = await agent.get('/api/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Alice');
});

test('POST /api/name/logout clears the cookie; subsequent /api/me is null', async () => {
  const { app } = freshApp();
  const agent = request.agent(app);
  await agent.post('/api/name').send({ name: 'Alice' });
  const out = await agent.post('/api/name/logout');
  assert.equal(out.status, 200);
  const me = await agent.get('/api/me');
  assert.equal(me.body.name, null);
});

test('POST /api/name/logout is idempotent', async () => {
  const { app } = freshApp();
  const res = await request(app).post('/api/name/logout');
  assert.equal(res.status, 200);
});
