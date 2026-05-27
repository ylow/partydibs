import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/server.js';

function freshApp() {
  const db = openDb(':memory:');
  return { db, app: buildApp(db) };
}

function seedParty(db) {
  db.prepare(
    "INSERT INTO party (id, title, admin_pw_hash, created_at) VALUES (1, 'Test', 'x', 0)"
  ).run();
}

test('GET / redirects to /setup when no party row', async () => {
  const { app } = freshApp();
  const res = await request(app).get('/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/setup');
});

test('GET / serves shell HTML when party exists', async () => {
  const { db, app } = freshApp();
  seedParty(db);
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /<div id="app">/);
});

test('GET /setup redirects to / when party exists', async () => {
  const { db, app } = freshApp();
  seedParty(db);
  const res = await request(app).get('/setup');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/');
});

test('GET /setup serves shell HTML when no party', async () => {
  const { app } = freshApp();
  const res = await request(app).get('/setup');
  assert.equal(res.status, 200);
  assert.match(res.text, /<div id="app">/);
});

test('GET /admin redirects to /setup when no party row', async () => {
  const { app } = freshApp();
  const res = await request(app).get('/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/setup');
});

test('GET /admin serves shell HTML when party exists', async () => {
  const { db, app } = freshApp();
  seedParty(db);
  const res = await request(app).get('/admin');
  assert.equal(res.status, 200);
  assert.match(res.text, /<div id="app">/);
});
