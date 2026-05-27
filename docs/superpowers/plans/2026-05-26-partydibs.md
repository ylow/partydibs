# PartyDibs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-party wishlist web app where the creator lists items and guests claim them (one claim per item) via a shareable URL.

**Architecture:** Single Node.js Express process, SQLite (`better-sqlite3`) for storage, three page routes (`/setup`, `/`, `/admin`) served from a single shell HTML file, JSON API for all mutations, vanilla-JS client that polls `/api/state` every 5 s.

**Tech Stack:** Node.js (18+), Express, better-sqlite3, bcrypt, cookie-parser, supertest, built-in `node:test`. No build step, no frontend framework.

---

## File Map

Code modules (kept small, single-responsibility):

| File | Responsibility |
|---|---|
| `package.json` | Deps, npm scripts (`start`, `test`). |
| `src/db.js` | Open SQLite handle, run schema migrations, export `db`. |
| `src/validate.js` | Pure functions: `validateTitle`, `validateItemName`, `validateItemNote`, `validateClaimerName`, `validatePassword`. Each returns `{ok: true, value}` or `{ok: false, error}`. |
| `src/auth.js` | `hashPassword`, `verifyPassword` (bcrypt cost 12). `createSession(db)` → token string. `lookupSession(db, token)` → bool. `deleteSession(db, token)`. |
| `src/routes/api.js` | Exports `function mountApi(app, db)` that registers all `/api/*` handlers on the given app. |
| `src/routes/pages.js` | Exports `function mountPages(app, db)` for `GET /`, `/setup`, `/admin`. |
| `src/server.js` | Builds the Express app (export `buildApp(db)`) and, if run directly, opens DB and listens on `PORT`. |
| `public/index.html` | Shell HTML loaded by all three page routes. Has a single `<div id="app">`. |
| `public/app.js` | Client: reads `window.location.pathname`, dispatches to setup / guest / admin view. Renders, polls, handles claim/unclaim/CRUD via `fetch`. |
| `public/styles.css` | Minimal styling. |
| `test/db.test.js` | Schema + claim-race tests. |
| `test/api.test.js` | API-level integration tests via supertest. |
| `data/.gitkeep` | Keep `data/` dir in repo; `*.db` files inside ignored. |
| `README.md` | Run/test instructions. |

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `data/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Create package.json**

Create `package.json`:

```json
{
  "name": "partydibs",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "better-sqlite3": "^11.5.0",
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.7",
    "express": "^4.21.1"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, no errors. (`better-sqlite3` compiles native; needs Xcode CLT on macOS — already present on most dev machines.)

- [ ] **Step 3: Ensure data dir tracked, contents ignored**

Create empty file `data/.gitkeep`.

Append to `.gitignore`:

```
# project
data/*.db
data/*.db-journal
data/*.db-wal
data/*.db-shm
!data/.gitkeep
```

- [ ] **Step 4: Verify Node version**

Run: `node --version`
Expected: v18 or higher.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore data/.gitkeep
git commit -m "chore: scaffold node project with deps"
```

---

## Task 2: Database module

**Files:**
- Create: `src/db.js`, `test/db.test.js`

- [ ] **Step 1: Write failing schema test**

Create `test/db.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';

test('openDb creates the three tables', () => {
  const db = openDb(':memory:');
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map(r => r.name);
  assert.deepEqual(tables, ['admin_sessions', 'items', 'party']);
});

test('openDb is idempotent (re-running does not throw)', () => {
  const db = openDb(':memory:');
  // Calling the schema bootstrap a second time on the same handle should be a no-op
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/db.js'`.

- [ ] **Step 3: Implement db.js**

Create `src/db.js`:

```javascript
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test`
Expected: 3 passes.

- [ ] **Step 5: Commit**

```bash
git add src/db.js test/db.test.js
git commit -m "feat(db): add SQLite schema bootstrap"
```

---

## Task 3: Validation module

**Files:**
- Create: `src/validate.js`
- Modify: `test/` — new file `test/validate.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/validate.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTitle,
  validateItemName,
  validateItemNote,
  validateClaimerName,
  validatePassword,
} from '../src/validate.js';

test('validateTitle trims, rejects empty and oversized', () => {
  assert.deepEqual(validateTitle('  Birthday  '), { ok: true, value: 'Birthday' });
  assert.equal(validateTitle('').ok, false);
  assert.equal(validateTitle('   ').ok, false);
  assert.equal(validateTitle('x'.repeat(101)).ok, false);
  assert.equal(validateTitle('x'.repeat(100)).ok, true);
});

test('validateItemName trims, rejects empty and oversized', () => {
  assert.deepEqual(validateItemName('Chips'), { ok: true, value: 'Chips' });
  assert.equal(validateItemName('').ok, false);
  assert.equal(validateItemName('x'.repeat(101)).ok, false);
});

test('validateItemNote allows empty (returns null), rejects oversized', () => {
  assert.deepEqual(validateItemNote(''), { ok: true, value: null });
  assert.deepEqual(validateItemNote('   '), { ok: true, value: null });
  assert.deepEqual(validateItemNote('paper plates'), { ok: true, value: 'paper plates' });
  assert.equal(validateItemNote('x'.repeat(501)).ok, false);
});

test('validateClaimerName trims, rejects empty and >60', () => {
  assert.deepEqual(validateClaimerName('  Alice '), { ok: true, value: 'Alice' });
  assert.equal(validateClaimerName('').ok, false);
  assert.equal(validateClaimerName('x'.repeat(61)).ok, false);
});

test('validatePassword rejects empty and >200', () => {
  assert.deepEqual(validatePassword('hunter2'), { ok: true, value: 'hunter2' });
  assert.equal(validatePassword('').ok, false);
  assert.equal(validatePassword('x'.repeat(201)).ok, false);
  assert.equal(validatePassword('x'.repeat(200)).ok, true);
});

test('validators reject non-string inputs', () => {
  assert.equal(validateTitle(undefined).ok, false);
  assert.equal(validateTitle(null).ok, false);
  assert.equal(validateTitle(42).ok, false);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement validate.js**

Create `src/validate.js`:

```javascript
function bounded(min, max) {
  return (raw) => {
    if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
    const value = raw.trim();
    if (value.length < min) return { ok: false, error: `must be at least ${min} char(s)` };
    if (value.length > max) return { ok: false, error: `must be at most ${max} chars` };
    return { ok: true, value };
  };
}

export const validateTitle = bounded(1, 100);
export const validateItemName = bounded(1, 100);
export const validateClaimerName = bounded(1, 60);
export const validatePassword = bounded(1, 200);

export function validateItemNote(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
  const value = raw.trim();
  if (value.length === 0) return { ok: true, value: null };
  if (value.length > 500) return { ok: false, error: 'must be at most 500 chars' };
  return { ok: true, value };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/validate.js test/validate.test.js
git commit -m "feat(validate): add input validators with bounded lengths"
```

---

## Task 4: Auth module

**Files:**
- Create: `src/auth.js`, `test/auth.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/auth.test.js`:

```javascript
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
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement auth.js**

Create `src/auth.js`:

```javascript
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
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: all 4 auth tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth.js test/auth.test.js
git commit -m "feat(auth): bcrypt password hashing and session tokens"
```

---

## Task 5: Express app skeleton + page routes

**Files:**
- Create: `src/server.js`, `src/routes/pages.js`, `src/routes/api.js`, `test/pages.test.js`

This sets up the app structure so subsequent tasks can add API handlers incrementally.

- [ ] **Step 1: Write failing tests for page route redirects**

Create `test/pages.test.js`:

```javascript
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
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test`
Expected: FAIL — `buildApp` not defined / files not found.

- [ ] **Step 3: Create the shell HTML and minimal CSS**

Create `public/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PartyDibs</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="app">Loading…</div>
    <script type="module" src="/app.js"></script>
  </body>
</html>
```

Create `public/styles.css`:

```css
body { font: 16px/1.4 system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
h1 { margin-top: 0; }
ul.items { list-style: none; padding: 0; }
ul.items li { border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
ul.items .meta { flex: 1; min-width: 0; }
ul.items .name { font-weight: 600; }
ul.items .note { color: #555; font-size: 0.9em; }
ul.items .claim { white-space: nowrap; }
input, button { font: inherit; padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid #999; }
button { cursor: pointer; }
.error { color: #b00; }
.msg { color: #060; }
form.row { display: flex; gap: 0.5rem; margin: 0.5rem 0; }
form.row input { flex: 1; }
```

Create empty `public/app.js`:

```javascript
// Filled in later tasks
```

- [ ] **Step 4: Create stub routes/pages.js**

Create `src/routes/pages.js`:

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(__dirname, '../../public/index.html');

function partyExists(db) {
  return !!db.prepare('SELECT 1 FROM party WHERE id = 1').get();
}

export function mountPages(app, db) {
  app.get('/', (req, res) => {
    if (!partyExists(db)) return res.redirect('/setup');
    res.sendFile(SHELL);
  });

  app.get('/setup', (req, res) => {
    if (partyExists(db)) return res.redirect('/');
    res.sendFile(SHELL);
  });

  app.get('/admin', (req, res) => {
    if (!partyExists(db)) return res.redirect('/setup');
    res.sendFile(SHELL);
  });
}
```

- [ ] **Step 5: Create stub routes/api.js**

Create `src/routes/api.js`:

```javascript
import express from 'express';

export function mountApi(app, db) {
  const router = express.Router();
  router.use(express.json());
  // Endpoints added in later tasks
  app.use('/api', router);
  return router;
}
```

- [ ] **Step 6: Create server.js**

Create `src/server.js`:

```javascript
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { mountPages } from './routes/pages.js';
import { mountApi } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

export function buildApp(db) {
  const app = express();
  app.use(cookieParser());
  app.use(express.static(PUBLIC_DIR, { index: false }));
  mountApi(app, db);
  mountPages(app, db);
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const dbPath = process.env.DB_PATH || './data/party.db';
  const db = openDb(dbPath);
  const app = buildApp(db);
  app.listen(port, () => {
    console.log(`PartyDibs listening on http://localhost:${port}`);
  });
}
```

- [ ] **Step 7: Run, expect pass**

Run: `npm test`
Expected: all page-route tests pass.

- [ ] **Step 8: Smoke-test the server**

Run: `npm start` in one terminal, then in another: `curl -i http://localhost:3000/`
Expected: `HTTP/1.1 302 Found`, `Location: /setup`. Stop the server with Ctrl-C.

- [ ] **Step 9: Commit**

```bash
git add src/server.js src/routes/pages.js src/routes/api.js public/index.html public/styles.css public/app.js test/pages.test.js
git commit -m "feat(server): express app skeleton with page route redirects"
```

---

## Task 6: Setup API (POST /api/setup)

**Files:**
- Modify: `src/routes/api.js`
- Create: `test/api.test.js`

- [ ] **Step 1: Write failing test**

Create `test/api.test.js`:

```javascript
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
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test`
Expected: FAIL — setup endpoint not implemented.

- [ ] **Step 3: Implement setup endpoint**

Replace `src/routes/api.js`:

```javascript
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
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: all 3 setup tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.js test/api.test.js
git commit -m "feat(api): POST /api/setup with singleton enforcement"
```

---

## Task 7: Login / logout API

**Files:**
- Modify: `src/routes/api.js`, `test/api.test.js`

- [ ] **Step 1: Append failing tests to test/api.test.js**

```javascript
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
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test`
Expected: FAIL — login/logout not implemented.

- [ ] **Step 3: Add login/logout to api.js**

In `src/routes/api.js`, add imports:

```javascript
import { hashPassword, verifyPassword, createSession, lookupSession, deleteSession } from '../auth.js';
```

(replace the existing auth import line)

Add helper near the top of the module, after `partyExists`:

```javascript
function requireAdmin(db) {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!lookupSession(db, token)) return res.status(401).json({ error: 'admin required' });
    req.adminToken = token;
    next();
  };
}
```

Inside `mountApi`, after the `/setup` handler, add:

```javascript
  router.post('/login', async (req, res) => {
    if (!partyExists(db)) return res.status(400).json({ error: 'not set up' });
    const p = validatePassword(req.body?.password);
    if (!p.ok) return res.status(401).json({ error: 'invalid credentials' });
    const row = db.prepare('SELECT admin_pw_hash FROM party WHERE id = 1').get();
    const ok = await verifyPassword(p.value, row.admin_pw_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = createSession(db);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    res.json({ ok: true });
  });

  router.post('/logout', requireAdmin(db), (req, res) => {
    deleteSession(db, req.adminToken);
    res.clearCookie(COOKIE_NAME, COOKIE_OPTS);
    res.json({ ok: true });
  });
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: all 4 new login/logout tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.js test/api.test.js
git commit -m "feat(api): login/logout with admin_session cookie"
```

---

## Task 8: State API (GET /api/state)

**Files:**
- Modify: `src/routes/api.js`, `test/api.test.js`

- [ ] **Step 1: Append failing test**

```javascript
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
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test`
Expected: FAIL — /api/state returns 404.

- [ ] **Step 3: Add handler**

In `src/routes/api.js`, add inside `mountApi` (after logout):

```javascript
  router.get('/state', (req, res) => {
    const party = db.prepare('SELECT title FROM party WHERE id = 1').get();
    if (!party) return res.status(400).json({ error: 'not set up' });
    const items = db
      .prepare(
        'SELECT id, name, note, position, claimed_by, claimed_at FROM items ORDER BY position, id'
      )
      .all();
    res.json({ title: party.title, items });
  });
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.js test/api.test.js
git commit -m "feat(api): GET /api/state returns title + items"
```

---

## Task 9: Item CRUD (admin)

Implements `POST /api/items`, `PATCH /api/items/:id`, `DELETE /api/items/:id`.

**Files:**
- Modify: `src/routes/api.js`, `test/api.test.js`

- [ ] **Step 1: Append failing tests**

```javascript
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
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test`
Expected: FAIL — endpoints missing.

- [ ] **Step 3: Implement endpoints**

In `src/routes/api.js`, add to imports:

```javascript
import { validateTitle, validatePassword, validateItemName, validateItemNote, validateClaimerName } from '../validate.js';
```

(replace the existing validate import line)

Inside `mountApi`, after the state handler, add:

```javascript
  router.post('/items', requireAdmin(db), (req, res) => {
    const n = validateItemName(req.body?.name);
    if (!n.ok) return res.status(400).json({ error: `name: ${n.error}` });
    const note = validateItemNote(req.body?.note);
    if (!note.ok) return res.status(400).json({ error: `note: ${note.error}` });
    const nextPos =
      db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM items').get().p;
    const info = db
      .prepare(
        'INSERT INTO items (name, note, position, claimed_by, claimed_at) VALUES (?, ?, ?, NULL, NULL)'
      )
      .run(n.value, note.value, nextPos);
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  });

  router.patch('/items/:id', requireAdmin(db), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });

    let name = existing.name;
    let note = existing.note;
    if (req.body?.name !== undefined) {
      const n = validateItemName(req.body.name);
      if (!n.ok) return res.status(400).json({ error: `name: ${n.error}` });
      name = n.value;
    }
    if (req.body?.note !== undefined) {
      const nv = validateItemNote(req.body.note);
      if (!nv.ok) return res.status(400).json({ error: `note: ${nv.error}` });
      note = nv.value;
    }
    db.prepare('UPDATE items SET name = ?, note = ? WHERE id = ?').run(name, note, id);
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  });

  router.delete('/items/:id', requireAdmin(db), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    res.status(204).end();
  });
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: all new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.js test/api.test.js
git commit -m "feat(api): admin item CRUD (create/update/delete)"
```

---

## Task 10: Claim / unclaim API + race condition test

**Files:**
- Modify: `src/routes/api.js`, `test/api.test.js`, `test/db.test.js`

- [ ] **Step 1: Append failing API tests**

In `test/api.test.js`:

```javascript
test('POST /api/items/:id/claim claims a free item', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const item = (await agent.post('/api/items').send({ name: 'Chips' })).body;
  const res = await request(app)
    .post(`/api/items/${item.id}/claim`)
    .send({ name: 'Alice' });
  assert.equal(res.status, 200);
  assert.equal(res.body.claimed_by, 'Alice');
});

test('POST /api/items/:id/claim on already-claimed returns 409 with current state', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const item = (await agent.post('/api/items').send({ name: 'Chips' })).body;
  await request(app).post(`/api/items/${item.id}/claim`).send({ name: 'Alice' });
  const res = await request(app)
    .post(`/api/items/${item.id}/claim`)
    .send({ name: 'Bob' });
  assert.equal(res.status, 409);
  assert.equal(res.body.item.claimed_by, 'Alice');
});

test('POST /api/items/:id/claim rejects bad name with 400', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const item = (await agent.post('/api/items').send({ name: 'Chips' })).body;
  const res = await request(app).post(`/api/items/${item.id}/claim`).send({ name: '' });
  assert.equal(res.status, 400);
});

test('POST /api/items/:id/claim returns 404 for unknown id', async () => {
  const { app } = freshApp();
  await request(app).post('/api/setup').send({ title: 'P', password: 'pw' });
  const res = await request(app).post('/api/items/999/claim').send({ name: 'Alice' });
  assert.equal(res.status, 404);
});

test('POST /api/items/:id/unclaim clears claimer; idempotent', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const item = (await agent.post('/api/items').send({ name: 'Chips' })).body;
  await request(app).post(`/api/items/${item.id}/claim`).send({ name: 'Alice' });
  const first = await request(app).post(`/api/items/${item.id}/unclaim`).send();
  assert.equal(first.status, 200);
  assert.equal(first.body.claimed_by, null);
  const second = await request(app).post(`/api/items/${item.id}/unclaim`).send();
  assert.equal(second.status, 200);
});
```

- [ ] **Step 2: Append failing DB-level race test**

In `test/db.test.js`:

```javascript
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
  // Exactly one wins
  assert.equal(a.changes + b.changes, 1);
  const row = db.prepare('SELECT claimed_by FROM items WHERE id = ?').get(id);
  assert.equal(row.claimed_by, 'Alice');
});
```

- [ ] **Step 3: Run, expect failures**

Run: `npm test`
Expected: FAIL on the new tests (endpoints not implemented).

- [ ] **Step 4: Implement claim/unclaim**

In `src/routes/api.js`, inside `mountApi`, after the DELETE handler:

```javascript
  router.post('/items/:id/claim', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const n = validateClaimerName(req.body?.name);
    if (!n.ok) return res.status(400).json({ error: `name: ${n.error}` });
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const info = db
      .prepare(
        `UPDATE items SET claimed_by = ?, claimed_at = ?
         WHERE id = ? AND claimed_by IS NULL`
      )
      .run(n.value, Math.floor(Date.now() / 1000), id);
    if (info.changes === 0) {
      const current = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
      return res.status(409).json({ error: 'already claimed', item: current });
    }
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  });

  router.post('/items/:id/unclaim', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    db.prepare(
      'UPDATE items SET claimed_by = NULL, claimed_at = NULL WHERE id = ?'
    ).run(id);
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  });
```

- [ ] **Step 5: Run, expect pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.js test/api.test.js test/db.test.js
git commit -m "feat(api): claim/unclaim with atomic conditional update"
```

---

## Task 11: Frontend — setup form

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Implement the dispatch + setup view**

Replace `public/app.js` with:

```javascript
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

const routes = {
  '/setup': renderSetup,
  '/': renderGuest,
  '/admin': renderAdmin,
};

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let body = null;
  try { body = await res.json(); } catch { /* may have no body */ }
  return { status: res.status, body };
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function renderSetup() {
  app.innerHTML = '';
  const form = el(`
    <form>
      <h1>Set up your party</h1>
      <p>Pick a title and an admin password. The password lets you add and edit items later.</p>
      <form class="row"><input name="title" placeholder="Party title" required maxlength="100" /></form>
      <form class="row"><input name="password" type="password" placeholder="Admin password" required maxlength="200" /></form>
      <button type="submit">Create party</button>
      <p class="error" hidden></p>
    </form>
  `);
  const error = $('.error', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const title = form.elements.title.value;
    const password = form.elements.password.value;
    const r = await fetchJson('/api/setup', { method: 'POST', body: { title, password } });
    if (r.status === 200) { window.location.pathname = '/admin'; return; }
    error.textContent = r.body?.error ?? `error ${r.status}`;
    error.hidden = false;
  });
  app.appendChild(form);
}

function renderGuest() {
  app.textContent = '(guest view — implemented next)';
}

function renderAdmin() {
  app.textContent = '(admin view — implemented next)';
}

const route = routes[window.location.pathname] ?? renderGuest;
route();
```

- [ ] **Step 2: Smoke test in browser**

Delete any existing dev DB: `rm -f data/party.db data/party.db-*`
Run: `npm start`
In a browser, visit `http://localhost:3000/`. The server should redirect to `/setup`. Fill in the form, submit. Expect to land on `/admin` with a session cookie set.

Verify in DevTools → Application → Cookies that `admin_session` is present.

Stop the server (Ctrl-C).

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat(frontend): setup form on /setup"
```

---

## Task 12: Frontend — guest view (list, claim, unclaim, polling)

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Replace `renderGuest` with the real implementation**

In `public/app.js`, replace the `renderGuest` function with:

```javascript
const NAME_KEY = 'partydibs.name';

function getStoredName() { return localStorage.getItem(NAME_KEY) ?? ''; }
function setStoredName(v) { localStorage.setItem(NAME_KEY, v); }

function itemRow(item, storedName, onClaim, onUnclaim) {
  const li = el(`
    <li>
      <div class="meta">
        <div class="name"></div>
        <div class="note" hidden></div>
      </div>
      <div class="claim"></div>
    </li>
  `);
  $('.name', li).textContent = item.name;
  if (item.note) { const n = $('.note', li); n.textContent = item.note; n.hidden = false; }
  const claim = $('.claim', li);
  if (item.claimed_by) {
    claim.innerHTML = `Taken by <strong></strong> — <button type="button">Unclaim</button>`;
    claim.querySelector('strong').textContent = item.claimed_by;
    claim.querySelector('button').addEventListener('click', () => onUnclaim(item.id));
  } else {
    const btn = el('<button type="button">Claim</button>');
    btn.addEventListener('click', () => onClaim(item.id));
    claim.appendChild(btn);
  }
  return li;
}

async function renderGuest() {
  app.innerHTML = '';
  const h1 = el('<h1>Loading…</h1>');
  const nameRow = el(`
    <form class="row">
      <input name="name" placeholder="Your name" maxlength="60" />
    </form>
  `);
  nameRow.elements.name.value = getStoredName();
  nameRow.addEventListener('input', () => setStoredName(nameRow.elements.name.value));
  nameRow.addEventListener('submit', (e) => e.preventDefault());

  const list = el('<ul class="items"></ul>');
  const msg = el('<p class="error" hidden></p>');
  app.append(h1, nameRow, list, msg);

  async function refresh() {
    const r = await fetchJson('/api/state');
    if (r.status !== 200) {
      h1.textContent = 'Error';
      msg.textContent = r.body?.error ?? `error ${r.status}`;
      msg.hidden = false;
      return;
    }
    h1.textContent = r.body.title;
    list.innerHTML = '';
    for (const it of r.body.items) {
      list.appendChild(itemRow(it, getStoredName(), onClaim, onUnclaim));
    }
  }

  async function onClaim(id) {
    const name = nameRow.elements.name.value.trim();
    if (!name) { flash('Type your name first.'); return; }
    setStoredName(name);
    const r = await fetchJson(`/api/items/${id}/claim`, { method: 'POST', body: { name } });
    if (r.status === 409) flash(`Already claimed by ${r.body?.item?.claimed_by ?? 'someone'}.`);
    else if (r.status !== 200) flash(r.body?.error ?? `error ${r.status}`);
    refresh();
  }

  async function onUnclaim(id) {
    await fetchJson(`/api/items/${id}/unclaim`, { method: 'POST' });
    refresh();
  }

  function flash(text) {
    msg.textContent = text;
    msg.hidden = false;
    setTimeout(() => { msg.hidden = true; }, 3000);
  }

  await refresh();
  setInterval(refresh, 5000);
}
```

- [ ] **Step 2: Smoke test in browser**

If `data/party.db` exists with a set-up party, reuse it; otherwise re-run setup from Task 11.

Run: `npm start`

In one browser window visit `http://localhost:3000/`. (The list will be empty until you add items in `/admin` — do that in the next task. For now, just verify:)
- The page shows the party title.
- The name input is present and persists across reload (type a name, reload, value remains).
- Polling makes a request every ~5s (DevTools → Network filter on `state`).

Stop the server (Ctrl-C).

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat(frontend): guest list view with claim/unclaim + polling"
```

---

## Task 13: Frontend — admin view

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Replace `renderAdmin` with login + admin list**

In `public/app.js`, replace the `renderAdmin` function with:

```javascript
async function renderAdmin() {
  app.innerHTML = '';
  // Probe admin endpoint to see if we're authed (PATCH a non-existent item: 401 if unauthed, 404 if authed).
  const probe = await fetchJson('/api/items/0', { method: 'PATCH', body: { name: 'x' } });
  if (probe.status === 401) return renderAdminLogin();
  return renderAdminList();
}

function renderAdminLogin() {
  const form = el(`
    <form>
      <h1>Admin login</h1>
      <form class="row"><input name="password" type="password" placeholder="Admin password" required maxlength="200" /></form>
      <button type="submit">Log in</button>
      <p class="error" hidden></p>
    </form>
  `);
  const error = $('.error', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const password = form.elements.password.value;
    const r = await fetchJson('/api/login', { method: 'POST', body: { password } });
    if (r.status === 200) { renderAdmin(); return; }
    error.textContent = r.body?.error ?? `error ${r.status}`;
    error.hidden = false;
  });
  app.appendChild(form);
}

function adminItemRow(item, refresh) {
  const li = el(`
    <li>
      <div class="meta">
        <div class="name"></div>
        <div class="note" hidden></div>
        <div class="claimed" hidden></div>
      </div>
      <div class="claim"></div>
    </li>
  `);
  $('.name', li).textContent = item.name;
  if (item.note) { const n = $('.note', li); n.textContent = item.note; n.hidden = false; }
  if (item.claimed_by) {
    const c = $('.claimed', li);
    c.textContent = `Taken by ${item.claimed_by}`;
    c.hidden = false;
  }
  const actions = $('.claim', li);
  const editBtn = el('<button type="button">Edit</button>');
  const delBtn = el('<button type="button">Delete</button>');
  editBtn.addEventListener('click', async () => {
    const name = prompt('Name', item.name);
    if (name === null) return;
    const note = prompt('Note (optional)', item.note ?? '') ?? '';
    const r = await fetchJson(`/api/items/${item.id}`, { method: 'PATCH', body: { name, note } });
    if (r.status !== 200) alert(r.body?.error ?? `error ${r.status}`);
    refresh();
  });
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await fetchJson(`/api/items/${item.id}`, { method: 'DELETE' });
    refresh();
  });
  actions.append(editBtn, delBtn);
  return li;
}

async function renderAdminList() {
  app.innerHTML = '';
  const h1 = el('<h1>Loading…</h1>');
  const list = el('<ul class="items"></ul>');
  const addForm = el(`
    <form>
      <h2>Add item</h2>
      <form class="row"><input name="name" placeholder="Item name" required maxlength="100" /></form>
      <form class="row"><input name="note" placeholder="Note (optional)" maxlength="500" /></form>
      <button type="submit">Add</button>
      <p class="error" hidden></p>
    </form>
  `);
  const addError = $('.error', addForm);
  const logoutBtn = el('<button type="button">Log out</button>');
  app.append(h1, list, addForm, logoutBtn);

  async function refresh() {
    const r = await fetchJson('/api/state');
    if (r.status !== 200) { h1.textContent = 'Error'; return; }
    h1.textContent = `${r.body.title} (admin)`;
    list.innerHTML = '';
    for (const it of r.body.items) list.appendChild(adminItemRow(it, refresh));
  }

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    addError.hidden = true;
    const name = addForm.elements.name.value;
    const note = addForm.elements.note.value;
    const r = await fetchJson('/api/items', { method: 'POST', body: { name, note } });
    if (r.status !== 201) { addError.textContent = r.body?.error ?? `error ${r.status}`; addError.hidden = false; return; }
    addForm.reset();
    refresh();
  });

  logoutBtn.addEventListener('click', async () => {
    await fetchJson('/api/logout', { method: 'POST' });
    renderAdmin();
  });

  await refresh();
  setInterval(refresh, 5000);
}
```

- [ ] **Step 2: Smoke test in browser**

Run: `npm start`. Visit `http://localhost:3000/admin`.
- If you don't have a session, the login form appears. Log in.
- Add a few items (name and notes). They appear in the list.
- Edit one item — name and note update.
- Open `http://localhost:3000/` in another tab as a "guest" — claim an item with a typed name. Back on `/admin`, within 5 s, the item shows "Taken by <name>".
- On the guest tab, click Unclaim; admin tab reflects it within 5 s.
- On admin, delete an item; it disappears in both tabs.
- Click Log out on admin; the login form reappears.

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat(frontend): admin login + item CRUD UI"
```

---

## Task 14: README and end-to-end smoke

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Create `README.md`:

```markdown
# PartyDibs

A single-party wishlist. The host adds items; guests visit a link, type their
name, and claim items. One claim per item.

## Run

```
npm install
npm start
```

Defaults to `http://localhost:3000`. Override with `PORT=4000 npm start`.

On first launch the home page redirects to `/setup` where you pick a party
title and admin password. After setup, share `http://localhost:3000/` with
guests and go to `/admin` to manage the list.

## Storage

State lives in `./data/party.db` (SQLite). Override with `DB_PATH`. To start a
new party, stop the server, delete `data/party.db`, and restart.

## Test

```
npm test
```

Tests use `node:test` and `supertest`; the DB runs in-memory.
```

- [ ] **Step 2: End-to-end smoke**

Run: `rm -f data/party.db data/party.db-*`
Run: `npm start`

Walk through the full happy path in a browser:
1. Visit `/` → redirected to `/setup`. Create party.
2. Land on `/admin`. Add three items.
3. Open `/` in another browser/incognito. Type a name. Claim one item. Confirm the admin tab updates within ~5 s.
4. Unclaim. Confirm both tabs update.
5. From admin, edit one item, then delete one. Confirm guest tab reflects within ~5 s.
6. Log out from admin. Confirm `/admin` shows the login form. Log back in.
7. Stop the server (Ctrl-C). Run `npm start` again. Visit `/` — the party and items persist.

- [ ] **Step 3: Run full test suite one last time**

Run: `npm test`
Expected: all tests pass, zero failures.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with run/test instructions"
```

---

## Self-Review

**Spec coverage check** (each spec requirement → task):

| Spec requirement | Task(s) |
|---|---|
| Single Node process + Express, port 3000 | 5 |
| SQLite via better-sqlite3 at `./data/party.db`, `DB_PATH` override | 2, 5 |
| Singleton `party` row enforced by `CHECK (id=1)` | 2 (test + schema) |
| `items` table with `name`, nullable `note`, `position`, `claimed_by`, `claimed_at` | 2 |
| `admin_sessions` table | 2 |
| Claim race: `UPDATE … WHERE claimed_by IS NULL` | 10 (DB test + API impl) |
| `GET /api/state` | 8 |
| `POST /api/setup` (once-only) | 6 |
| `POST /api/login` / `POST /api/logout` | 7 |
| `POST /api/items/:id/claim` (409 on loss) | 10 |
| `POST /api/items/:id/unclaim` (idempotent) | 10 |
| `POST /api/items` (admin) | 9 |
| `PATCH /api/items/:id` (admin, metadata only) | 9 |
| `DELETE /api/items/:id` (admin) | 9 |
| `GET /setup`, `/`, `/admin` with redirects | 5 |
| Bcrypt cost 12, 32-byte hex token, cookie HttpOnly+SameSite=Lax+Path=/ | 4 (auth), 6 (cookie opts) |
| Input validation bounds | 3 (validators), 6/9/10 (wired in) |
| Setup gating: `/setup` closed once party exists | 5 (pages), 6 (api) |
| First-visit setup → admin redirect flow | 11 (frontend) |
| Guest sticky name in localStorage, 5 s polling | 12 |
| Admin view with add/edit/delete, logout | 13 |
| Tests: happy path, setup one-shot, admin gating, login failure, claim race, claim already claimed, unclaim idempotent, validation rejections | 6, 7, 9, 10 |

All requirements have a task.

**Placeholder scan:** none — every code step has full code, every command has expected output.

**Type consistency:** Function names used across tasks are stable: `openDb`, `buildApp`, `mountApi`, `mountPages`, `hashPassword`, `verifyPassword`, `createSession`, `lookupSession`, `deleteSession`, `validateTitle`, `validateItemName`, `validateItemNote`, `validateClaimerName`, `validatePassword`. The cookie constant `COOKIE_NAME = 'admin_session'` is defined once in `api.js` and referenced consistently. Item rows use the same column set throughout (`id, name, note, position, claimed_by, claimed_at`).

No issues found.
