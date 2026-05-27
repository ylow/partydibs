import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS party (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  title           TEXT    NOT NULL,
  admin_pw_hash   TEXT    NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  note        TEXT,
  position    INTEGER NOT NULL,
  claimed_by  TEXT,
  claimed_at  INTEGER
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token       TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL
);
`;

export function openDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  openDb.bootstrap(db);
  return db;
}

openDb.bootstrap = function bootstrap(db) {
  db.exec(SCHEMA);
};
