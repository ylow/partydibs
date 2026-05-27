# PartyDibs — Design

A single-party wishlist web app. The party creator lists items they want guests
to bring; guests visit a link, type their name, and claim items. Each item can
be claimed by exactly one person.

## Scope (in / out)

**In scope (v1):**
- One running instance hosts one party.
- Creator authenticates with an admin password set during first-run setup.
- Creator can add, edit, and delete items.
- Guests identify themselves by typing a display name on each visit (no accounts).
- Each item has a name and an optional note; exactly one claimer per item.
- Anyone with the link can claim or unclaim any item.
- Guests see updates from other guests via short-interval polling.
- State persists in SQLite across server restarts.

**Out of scope (v1):**
- Multiple parties per deployment.
- Email or magic-link auth.
- Quantities / multiple slots per item.
- WebSocket / SSE real-time push.
- Drag-to-reorder UI (the schema supports ordering; the UI does not).
- No-JS fallback for claim/unclaim (JS is assumed).
- Rate limiting, CSRF tokens, audit logs.

## Architecture

- Single Node.js process running an Express HTTP server (default port `3000`,
  override with `PORT`).
- SQLite via `better-sqlite3`, one file at `./data/party.db` (override with
  `DB_PATH`). Synchronous API keeps server code simple; performance is ample at
  this scale (one party, dozens of items, dozens of concurrent guests).
- Three page routes — `/setup`, `/`, `/admin` — all served by the same app and
  all backed by a single shell HTML file plus one client-side script.
- Client is vanilla JS (no framework, no build step). It fetches state from
  `/api/state` on load and re-fetches every ~5 seconds, diffing into the DOM.
- All mutations go through `/api/*` JSON endpoints.

### Why this shape

- **Single-page shell + JSON API** rather than per-page server rendering: the
  app is always interactive (we said JS is assumed), so a server-render of the
  list would just be discarded and re-fetched. One shell + one client script
  is simpler than templates plus partial server rendering.
- **SQLite, not JSON file**: gives us atomic `UPDATE … WHERE claimed_by IS NULL`
  for the claim race without hand-rolling locking. Also cheap to extend later.
- **No framework on the client**: the entire interactive surface is "render a
  list, post a form, poll." A framework would dwarf the app.

## Data model

Three tables in `party.db`:

```sql
CREATE TABLE party (
  id              INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
  title           TEXT    NOT NULL,
  admin_pw_hash   TEXT    NOT NULL,                    -- bcrypt
  created_at      INTEGER NOT NULL                     -- unix seconds
);

CREATE TABLE items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  note        TEXT,                                    -- nullable
  position    INTEGER NOT NULL,                        -- for ordering
  claimed_by  TEXT,                                    -- NULL = available
  claimed_at  INTEGER                                  -- unix seconds, null if unclaimed
);

CREATE TABLE admin_sessions (
  token       TEXT PRIMARY KEY,                        -- random 32-byte hex
  created_at  INTEGER NOT NULL
);
```

Design notes:
- `party` is a singleton enforced by `CHECK (id = 1)`. While no row exists,
  `/setup` is the only working page; once it exists, `/setup` is closed.
- `claimed_by` doubles as "is this claimed?" (NULL vs not) and "who claimed it"
  (the typed display name). No separate claims table — single slot per item.
- `position` orders items deterministically (`ORDER BY position, id`). New items
  get `MAX(position) + 1`. Reordering UI is out of scope; the column exists so
  we don't have to migrate later.
- `admin_sessions.token` is a random 32-byte hex string set as an HttpOnly,
  SameSite=Lax cookie named `admin_session`. No expiry sweep in v1.

### Concurrency: the claim race

Two guests clicking "Claim" on the same item at the same time must result in
exactly one winner. The claim handler runs:

```sql
UPDATE items
   SET claimed_by = ?, claimed_at = ?
 WHERE id = ?
   AND claimed_by IS NULL
```

If `db.changes() === 0`, the claim lost the race. The handler returns HTTP 409
with the current state; the client re-fetches and shows "Already claimed by X".

## HTTP API

All endpoints return JSON. Errors are `{error: string}` with a 4xx status.

| Method  | Path                       | Auth                | Purpose |
|---      |---                         |---                  |---      |
| `GET`   | `/api/state`               | none                | `{title, items: [{id, name, note, position, claimed_by, claimed_at}]}`. Polled by client. |
| `POST`  | `/api/setup`               | only if no party row| Body `{title, password}`. Creates the singleton party row, hashes password, returns 200 + sets `admin_session` cookie. 409 if already set up. |
| `POST`  | `/api/login`               | none                | Body `{password}`. On success sets `admin_session` cookie and returns 200. 401 on failure. |
| `POST`  | `/api/logout`              | admin               | Clears cookie and deletes session row. 200. |
| `POST`  | `/api/items/:id/claim`     | none                | Body `{name}`. Atomic claim via `UPDATE … WHERE claimed_by IS NULL`. 200 on win, 409 on loss, 404 if item gone. |
| `POST`  | `/api/items/:id/unclaim`   | none                | No body. Sets `claimed_by` and `claimed_at` to NULL. Idempotent. 200. |
| `POST`  | `/api/items`               | admin               | Body `{name, note?}`. Appends new item. 201 + the created item. |
| `PATCH` | `/api/items/:id`           | admin               | Body `{name?, note?}`. Updates metadata only (not claim state). 200. |
| `DELETE`| `/api/items/:id`          | admin               | Removes item regardless of claim state. 204. |

### Page routes

| Method | Path     | Behavior |
|---     |---       |---       |
| `GET`  | `/setup` | If party row exists → 302 to `/`. Otherwise serves the shell HTML; client renders the setup form. |
| `GET`  | `/`      | If no party row → 302 to `/setup`. Otherwise serves the shell HTML; client renders the guest list. |
| `GET`  | `/admin` | If no party row → 302 to `/setup`. Otherwise serves the shell HTML; client checks session, renders either login form or admin list. |

### Input validation

Applied uniformly at the API boundary:
- `title`: 1–100 chars after trim.
- `item.name`: 1–100 chars after trim.
- `item.note`: 0–500 chars after trim (empty → stored as NULL).
- `claimer name`: 1–60 chars after trim.
- `password`: 1–200 chars (no upper bound on complexity, but bounded).

Validation failures return 400 with `{error: "…"}`.

### Auth, sessions, CSRF

- Admin password is hashed with bcrypt (cost 12) before storage.
- Login generates a fresh 32-byte hex token, inserts an `admin_sessions` row,
  and sets the `admin_session` cookie (HttpOnly, SameSite=Lax, Path=/).
- Admin-gated endpoints look up the cookie's token in `admin_sessions`; missing
  or unknown token → 401.
- **No CSRF tokens in v1.** Claim/unclaim endpoints are intentionally open (the
  threat model is "someone with the link can claim — that's the point").
  Admin endpoints are session-cookie-gated and we accept the residual CSRF risk
  for a short-lived single-party tool. Documented here so the next reviewer
  knows it was a deliberate choice, not an oversight.

## UX flows

### First launch
1. Host starts the server and opens `http://localhost:3000/`.
2. No party row exists → 302 to `/setup`.
3. Host submits party title + admin password → `POST /api/setup`.
4. Server creates the party row, sets the admin session cookie, returns 200.
5. Client redirects to `/admin`. `/setup` is now closed.

### Guest (`/`)
- Page loads the shell, client `fetch('/api/state')`, renders the item list.
- Sticky display-name input at the top, value persisted to `localStorage` so the
  guest doesn't retype it. This is pure client convenience — the server never
  sees it until they actually claim something.
- Each row: name, optional note, and either a `Claim` button (sends the
  display-name with the request) or `Taken by <name> — Unclaim`.
- Client polls `/api/state` every 5 seconds and re-renders if anything changed.
- On a 409 from claim, client re-fetches state and shows an inline message
  "Already claimed by <name>" next to that row.

### Admin (`/admin`)
- If no admin session cookie: client shows password form, posts to
  `/api/login`, on success reloads in admin mode.
- Authed view shows the same item list plus:
  - "Add item" form at the bottom (name + optional note),
  - per-row Edit and Delete buttons,
  - Logout link.
- Admin can claim/unclaim too (useful when a guest tells the host in person).

## Project layout

```
partydibs/
├── package.json
├── src/
│   ├── server.js          # express app wiring + listen
│   ├── db.js              # better-sqlite3 init + schema bootstrap
│   ├── routes/
│   │   ├── pages.js       # GET /, /setup, /admin (serves shell + redirects)
│   │   └── api.js         # all /api/* endpoints
│   ├── auth.js            # bcrypt hash/compare, session cookie helpers
│   └── validate.js        # input trimming + length checks
├── public/
│   ├── app.js             # client: render, poll, claim, admin actions
│   ├── styles.css
│   └── index.html         # shell HTML used by all three page routes
├── data/                  # gitignored; party.db lives here
└── test/
    ├── api.test.js        # node:test + supertest against the express app
    └── db.test.js         # schema + claim race tests
```

### Dependencies

Runtime (4):
- `express`
- `better-sqlite3`
- `bcrypt`
- `cookie-parser`

Dev (1):
- `supertest`

Test runner: built-in `node:test`.

### Configuration

- `PORT` (default `3000`)
- `DB_PATH` (default `./data/party.db`)

## Testing

`node:test` + `supertest`, hitting the Express app with an in-memory or
per-test SQLite file (`:memory:` or a temp path).

Required coverage:
- Happy path: setup → login → add item → claim → `/api/state` reflects it → unclaim.
- Setup is one-shot: second `POST /api/setup` returns 409.
- Admin gating: unauthed `POST /api/items`, `PATCH /api/items/:id`,
  `DELETE /api/items/:id` all return 401.
- Login failure: wrong password → 401, no session row created.
- Claim race: fire two concurrent `POST /api/items/:id/claim` requests against
  the same item; assert exactly one returns 200 and one returns 409, and the
  DB row reflects the winner.
- Claim of already-claimed item returns 409.
- Unclaim is idempotent (twice in a row both return 200).
- Input validation rejects oversized name (>100), oversized note (>500),
  oversized claimer name (>60), and empty trimmed names.

## Open questions / deferred decisions

- **Session expiry sweep**: not implemented in v1. Sessions live until the
  `admin_sessions` row is deleted (logout) or the DB is wiped. Acceptable for a
  party-lifetime tool.
- **Item reorder UI**: schema-ready, UI deferred.
- **"Reset party" admin action**: not in v1. To start a new party, delete
  `data/party.db` and restart the server.
- **CSRF tokens on admin routes**: deliberately omitted; revisit if the tool
  outgrows the single-party-short-event use case.
