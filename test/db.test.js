import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';

test('openDb creates the three tables', () => {
  const db = openDb(':memory:');
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map(r => r.name);
  assert.deepEqual(tables, ['admin_sessions', 'items', 'party']);
});

test('openDb is idempotent (re-running does not throw)', () => {
  const db = openDb(':memory:');
  assert.doesNotThrow(() => openDb.bootstrap(db));
});

test('party table enforces singleton via CHECK (id = 1)', () => {
  const db = openDb(':memory:');
  db.prepare(
    "INSERT INTO party (id, title, admin_pw_hash, created_at) VALUES (1, 't', 'h', 0)"
  ).run();
  assert.throws(() =>
    db
      .prepare(
        "INSERT INTO party (id, title, admin_pw_hash, created_at) VALUES (2, 't', 'h', 0)"
      )
      .run()
  );
});
