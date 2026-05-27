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

test('claim race: conditional UPDATE picks exactly one winner', () => {
  const db = openDb(':memory:');
  db.prepare(
    "INSERT INTO party (id, title, admin_pw_hash, created_at) VALUES (1, 't', 'h', 0)"
  ).run();
  const info = db
    .prepare(
      "INSERT INTO items (name, note, position) VALUES ('Chips', NULL, 1)"
    )
    .run();
  const id = info.lastInsertRowid;

  const claim = db.prepare(
    `UPDATE items SET claimed_by = ?, claimed_at = ?
     WHERE id = ? AND claimed_by IS NULL`
  );
  const a = claim.run('Alice', 1, id);
  const b = claim.run('Bob', 2, id);
  assert.equal(a.changes + b.changes, 1);
  const row = db.prepare('SELECT claimed_by FROM items WHERE id = ?').get(id);
  assert.equal(row.claimed_by, 'Alice');
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
