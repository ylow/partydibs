# PartyDibs v2 Implementation Plan — Guest name cookie + CSV bulk add

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-bound guest name cookie (gating claim/unclaim) and an admin-only CSV bulk-add endpoint + UI.

**Architecture:** Additive on the v1 Express + better-sqlite3 + vanilla-JS app. New `/api/name`, `/api/me`, `/api/name/logout`, `/api/items/bulk` endpoints; behavior tweaks to existing `/api/items/:id/claim` (reads cookie) and `/api/items/:id/unclaim` (name-match OR admin). Frontend gains a name-prompt screen, a small signed-in header with Sign out / Admin links, and a CSV textarea on `/admin`.

**Tech Stack:** Same as v1 (no new deps).

---

## File Map

| File | Change |
|---|---|
| `src/routes/api.js` | Add 4 endpoints (`/api/name`, `/api/me`, `/api/name/logout`, `/api/items/bulk`); modify `/api/items/:id/claim` and `/api/items/:id/unclaim`. |
| `public/app.js` | Add name-prompt screen + header (Sign out, Admin link); drop the localStorage name cache; add CSV textarea on the admin view. |
| `test/api.test.js` | Update 4 existing claim/unclaim tests to use a cookie-carrying agent; add new tests for `/api/name`, `/api/me`, claim-401, unclaim-403, admin override, bulk add. |
| `README.md` | No change — current README is still accurate at a high level. |

The `validateClaimerName` and `validateItemName` / `validateItemNote`
validators already do everything we need for the new endpoints.

---

## Task 1: `/api/name`, `/api/me`, `/api/name/logout`

**Files:**
- Modify: `src/routes/api.js`
- Modify: `test/api.test.js`

- [ ] **Step 1: Append failing tests to `test/api.test.js`**

```javascript
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
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test`
Expected: 6 new failures (endpoints not implemented).

- [ ] **Step 3: Implement the three endpoints**

In `src/routes/api.js`, near the top after the existing `COOKIE_OPTS` constant, add:

```javascript
const GUEST_COOKIE = 'guest_name';
```

Inside `mountApi`, after the `/logout` handler and before `/state`, add:

```javascript
  router.get('/me', (req, res) => {
    const name = req.cookies?.[GUEST_COOKIE] ?? null;
    res.json({ name });
  });

  router.post('/name', (req, res) => {
    const n = validateClaimerName(req.body?.name);
    if (!n.ok) return res.status(400).json({ error: `name: ${n.error}` });
    res.cookie(GUEST_COOKIE, n.value, COOKIE_OPTS);
    res.json({ name: n.value });
  });

  router.post('/name/logout', (req, res) => {
    res.clearCookie(GUEST_COOKIE, COOKIE_OPTS);
    res.json({ ok: true });
  });
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test`
Expected: all 6 new tests pass; existing tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.js test/api.test.js
git commit -m "feat(api): guest name cookie endpoints (/api/name, /api/me, /api/name/logout)"
```

---

## Task 2: Claim reads cookie; 401 when missing

**Files:**
- Modify: `src/routes/api.js`
- Modify: `test/api.test.js`

This task changes the claim contract: the request body's `name` is ignored;
the server reads the `guest_name` cookie. Existing claim tests are updated to
match.

- [ ] **Step 1: Update existing claim tests**

In `test/api.test.js`, replace the four existing claim tests in-place.

Replace:

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
```

with:

```javascript
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
```

- [ ] **Step 2: Run tests, expect the four updated claim tests to fail**

Run: `npm test`
Expected: the four claim tests fail (server still reads body, returns 400 on missing name not 401).

- [ ] **Step 3: Update the claim handler**

In `src/routes/api.js`, replace the `router.post('/items/:id/claim', ...)` handler with:

```javascript
  router.post('/items/:id/claim', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const guestName = req.cookies?.[GUEST_COOKIE];
    if (typeof guestName !== 'string' || guestName.length === 0) {
      return res.status(401).json({ error: 'name required' });
    }
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const info = db
      .prepare(
        `UPDATE items SET claimed_by = ?, claimed_at = ?
         WHERE id = ? AND claimed_by IS NULL`
      )
      .run(guestName, Math.floor(Date.now() / 1000), id);
    if (info.changes === 0) {
      const current = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
      return res.status(409).json({ error: 'already claimed', item: current });
    }
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  });
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test`
Expected: all tests green (including the four updated and the new 401 test).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.js test/api.test.js
git commit -m "feat(api): claim uses guest_name cookie, 401 when absent"
```

---

## Task 3: Unclaim gated by name match or admin

**Files:**
- Modify: `src/routes/api.js`
- Modify: `test/api.test.js`

- [ ] **Step 1: Update existing unclaim test and add new tests**

In `test/api.test.js`, replace the existing unclaim test:

```javascript
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

with:

```javascript
test('POST /api/items/:id/unclaim by the claimer clears it; idempotent for same name', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const alice = await guestAgent(app, 'Alice');
  await alice.post(`/api/items/${item.id}/claim`);
  const first = await alice.post(`/api/items/${item.id}/unclaim`);
  assert.equal(first.status, 200);
  assert.equal(first.body.claimed_by, null);
  // Second call: row exists, no claim — still 200, no change.
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

test('admin can unclaim someone else\\'s claim (override)', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  const alice = await guestAgent(app, 'Alice');
  await alice.post(`/api/items/${item.id}/claim`);
  const res = await adminAgent.post(`/api/items/${item.id}/unclaim`);
  assert.equal(res.status, 200);
  assert.equal(res.body.claimed_by, null);
});

test('unclaim of an unclaimed item: same-name actor 200, different-name actor 403', async () => {
  const { app } = freshApp();
  const adminAgent = await setupAndLogin(app);
  const item = (await adminAgent.post('/api/items').send({ name: 'Chips' })).body;
  // unclaimed: any guest unclaim is a no-op but should still be denied if
  // there's no claim to act on for a different actor. We treat "no claim" as
  // a free no-op for any guest (idempotent), per the test above for same-name.
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
```

- [ ] **Step 2: Run tests, expect new tests to fail**

Run: `npm test`
Expected: the unclaim tests fail (no gating yet).

- [ ] **Step 3: Update the unclaim handler**

In `src/routes/api.js`, replace the `router.post('/items/:id/unclaim', ...)` handler with:

```javascript
  router.post('/items/:id/unclaim', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const guestName = req.cookies?.[GUEST_COOKIE] ?? null;
    const isAdmin = lookupSession(db, req.cookies?.[COOKIE_NAME]);
    // Idempotent no-op for any caller if there's no claim to release.
    if (existing.claimed_by === null) return res.json(existing);
    if (!isAdmin && existing.claimed_by !== guestName) {
      return res.status(403).json({ error: 'not your claim' });
    }
    db.prepare(
      'UPDATE items SET claimed_by = NULL, claimed_at = NULL WHERE id = ?'
    ).run(id);
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  });
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test`
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.js test/api.test.js
git commit -m "feat(api): unclaim gated by name match or admin session"
```

---

## Task 4: CSV bulk add endpoint

**Files:**
- Modify: `src/routes/api.js`
- Modify: `test/api.test.js`

- [ ] **Step 1: Append failing tests**

In `test/api.test.js`:

```javascript
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
  // Positions are contiguous and increasing.
  assert.deepEqual(
    items.map((i) => i.position),
    [1, 2, 3, 4]
  );
});

test('POST /api/items/bulk reports per-line errors with 1-based line numbers', async () => {
  const { app } = freshApp();
  const agent = await setupAndLogin(app);
  const big = 'x'.repeat(101);
  const csv = [
    'Chips',           // line 1 ok
    `${big}`,          // line 2 too long
    'Soda,Diet',       // line 3 ok
    '',                // line 4 skipped (blank)
    `ok,${'y'.repeat(501)}`, // line 5 note too long
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
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test`
Expected: 6 new failures (endpoint not implemented).

- [ ] **Step 3: Implement the bulk endpoint**

In `src/routes/api.js`, inside `mountApi`, after the existing
`router.post('/items', requireAdmin(db), ...)` handler, add:

```javascript
  const MAX_CSV_LEN = 100000;

  router.post('/items/bulk', requireAdmin(db), (req, res) => {
    const csv = req.body?.csv;
    if (typeof csv !== 'string') {
      return res.status(400).json({ error: 'csv must be a string' });
    }
    if (csv.length > MAX_CSV_LEN) {
      return res.status(400).json({ error: `csv must be at most ${MAX_CSV_LEN} chars` });
    }

    const rawLines = csv.split('\n');
    const valid = []; // {name, note}
    const errors = []; // {line, error}

    rawLines.forEach((raw, idx) => {
      const lineNo = idx + 1;
      if (raw.trim().length === 0) return;
      const comma = raw.indexOf(',');
      const namePart = comma === -1 ? raw : raw.slice(0, comma);
      const notePart = comma === -1 ? undefined : raw.slice(comma + 1);
      const n = validateItemName(namePart);
      if (!n.ok) { errors.push({ line: lineNo, error: `name: ${n.error}` }); return; }
      const nt = validateItemNote(notePart);
      if (!nt.ok) { errors.push({ line: lineNo, error: `note: ${nt.error}` }); return; }
      valid.push({ name: n.value, note: nt.value });
    });

    if (valid.length === 0) {
      return res.json({ added: 0, errors });
    }

    const insert = db.prepare(
      'INSERT INTO items (name, note, position, claimed_by, claimed_at) VALUES (?, ?, ?, NULL, NULL)'
    );
    const tx = db.transaction((rows) => {
      let pos =
        db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM items').get().p;
      for (const r of rows) {
        pos += 1;
        insert.run(r.name, r.note, pos);
      }
    });
    tx(valid);

    res.json({ added: valid.length, errors });
  });
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test`
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.js test/api.test.js
git commit -m "feat(api): POST /api/items/bulk for CSV batch add"
```

---

## Task 5: Frontend — name prompt, header, sign-out, admin link

**Files:**
- Modify: `public/app.js`

This replaces the `renderGuest` function and its helpers. The current
implementation relies on `localStorage` and an inline name input row; both
go away.

- [ ] **Step 1: Replace `renderGuest` and supporting helpers**

In `public/app.js`, delete the `NAME_KEY`, `getStoredName`, `setStoredName`
constants/functions and the existing `itemRow` and `renderGuest`. Replace
them with:

```javascript
function itemRow(item, onClaim, onUnclaim) {
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
    claim.innerHTML = `Taken by <strong></strong> <button type="button" hidden>Unclaim</button>`;
    claim.querySelector('strong').textContent = item.claimed_by;
    // The unclaim button is rendered but only shown to the claimer; the
    // caller flips it visible after checking the current guest name.
    const btn = claim.querySelector('button');
    btn.addEventListener('click', () => onUnclaim(item.id));
    claim.dataset.claimedBy = item.claimed_by;
  } else {
    const btn = el('<button type="button">Claim</button>');
    btn.addEventListener('click', () => onClaim(item.id));
    claim.appendChild(btn);
  }
  return li;
}

function renderNamePrompt(onName) {
  app.innerHTML = '';
  const form = el(`
    <form>
      <h1>Who are you?</h1>
      <p>Type a display name to claim items. Anyone who picks something up will see this name.</p>
      <div class="row"><input name="name" placeholder="Your name" required maxlength="60" autofocus /></div>
      <button type="submit">Continue</button>
      <p class="error" hidden></p>
    </form>
  `);
  const error = $('.error', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const name = form.elements.name.value;
    const r = await fetchJson('/api/name', { method: 'POST', body: { name } });
    if (r.status !== 200) {
      error.textContent = r.body?.error ?? `error ${r.status}`;
      error.hidden = false;
      return;
    }
    onName(r.body.name);
  });
  app.appendChild(form);
}

async function renderGuest() {
  app.innerHTML = '';
  const me = await fetchJson('/api/me');
  const currentName = me.body?.name ?? null;
  if (currentName === null) {
    renderNamePrompt(() => renderGuest());
    return;
  }
  renderGuestList(currentName);
}

function renderGuestList(currentName) {
  app.innerHTML = '';
  const header = el(`
    <p class="meta-header">
      Signed in as <strong></strong>
      · <a href="#" class="signout">Sign out</a>
      · <a href="/admin">Admin</a>
    </p>
  `);
  header.querySelector('strong').textContent = currentName;
  header.querySelector('.signout').addEventListener('click', async (e) => {
    e.preventDefault();
    await fetchJson('/api/name/logout', { method: 'POST' });
    renderGuest();
  });

  const h1 = el('<h1>Loading…</h1>');
  const list = el('<ul class="items"></ul>');
  const msg = el('<p class="error" hidden></p>');
  app.append(header, h1, list, msg);

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
      const row = itemRow(it, onClaim, onUnclaim);
      // Show the unclaim button only to the claimer.
      if (it.claimed_by === currentName) {
        const btn = row.querySelector('.claim button');
        if (btn) btn.hidden = false;
      }
      list.appendChild(row);
    }
  }

  async function onClaim(id) {
    const r = await fetchJson(`/api/items/${id}/claim`, { method: 'POST' });
    if (r.status === 409) flash(`Already claimed by ${r.body?.item?.claimed_by ?? 'someone'}.`);
    else if (r.status === 401) { flash('Please sign in again.'); renderGuest(); return; }
    else if (r.status !== 200) flash(r.body?.error ?? `error ${r.status}`);
    refresh();
  }

  async function onUnclaim(id) {
    const r = await fetchJson(`/api/items/${id}/unclaim`, { method: 'POST' });
    if (r.status === 403) flash('That claim is not yours.');
    refresh();
  }

  function flash(text) {
    msg.textContent = text;
    msg.hidden = false;
    setTimeout(() => { msg.hidden = true; }, 3000);
  }

  refresh();
  setInterval(refresh, 5000);
}
```

- [ ] **Step 2: Add a tiny styling tweak**

Append to `public/styles.css`:

```css
.meta-header { color: #555; font-size: 0.95em; margin-bottom: 1rem; }
.meta-header a { color: #333; }
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/app.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: End-to-end smoke**

Run:

```bash
rm -f data/party.db data/party.db-*
PORT=3099 DB_PATH=/tmp/partydibs-v2-smoke.db npm start > /tmp/partydibs-v2.log 2>&1 &
SERVER_PID=$!
sleep 1

echo "--- POST /api/setup ---"
curl -s -X POST http://localhost:3099/api/setup -H 'content-type: application/json' \
  -d '{"title":"V2Test","password":"pw"}' -c /tmp/cookies-admin.txt

echo
echo "--- POST /api/items as admin ---"
curl -s -X POST http://localhost:3099/api/items -H 'content-type: application/json' \
  -b /tmp/cookies-admin.txt -d '{"name":"Chips"}'

echo
echo "--- /api/me before name set ---"
curl -s http://localhost:3099/api/me -c /tmp/cookies-guest.txt

echo
echo "--- POST /api/name ---"
curl -s -X POST http://localhost:3099/api/name -H 'content-type: application/json' \
  -b /tmp/cookies-guest.txt -c /tmp/cookies-guest.txt -d '{"name":"Alice"}'

echo
echo "--- claim with guest cookie ---"
curl -s -X POST http://localhost:3099/api/items/1/claim -b /tmp/cookies-guest.txt

echo
echo "--- claim WITHOUT guest cookie (expect 401) ---"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3099/api/items/1/claim

echo "--- unclaim by Bob (expect 403) ---"
curl -s -X POST http://localhost:3099/api/name -H 'content-type: application/json' \
  -c /tmp/cookies-bob.txt -d '{"name":"Bob"}' > /dev/null
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3099/api/items/1/unclaim -b /tmp/cookies-bob.txt

echo "--- admin override unclaim (expect 200) ---"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3099/api/items/1/unclaim -b /tmp/cookies-admin.txt

kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
rm -f /tmp/partydibs-v2-smoke.db /tmp/partydibs-v2-smoke.db-* /tmp/cookies-*.txt /tmp/partydibs-v2.log
```

Expected highlights:
- `/api/me` returns `{"name":null}` before name set.
- `POST /api/name` returns `{"name":"Alice"}` and sets a `guest_name` cookie.
- claim with guest cookie returns the item with `"claimed_by":"Alice"`.
- claim without guest cookie prints `401`.
- unclaim by Bob prints `403`.
- admin override unclaim prints `200`.

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat(frontend): name prompt + signed-in header (sign out, admin link)"
```

---

## Task 6: Frontend — CSV bulk-add on admin

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Extend the admin list view**

In `public/app.js`, locate `renderAdminList`. Inside it, after the existing
`addForm` declaration and before `logoutBtn`, add the bulk-add form and
result element by changing the surrounding code as follows:

Replace this block:

```javascript
  const addError = $('.error', addForm);
  const logoutBtn = el('<button type="button">Log out</button>');
  app.append(h1, list, addForm, logoutBtn);
```

with:

```javascript
  const addError = $('.error', addForm);

  const bulkForm = el(`
    <form>
      <h2>Bulk add (CSV)</h2>
      <p>One item per line. Optional note after the first comma. Example: <code>Chips, salty</code></p>
      <textarea name="csv" rows="6" maxlength="100000" style="width:100%;font:inherit;"></textarea>
      <button type="submit">Add batch</button>
      <p class="msg" hidden></p>
      <ul class="bulk-errors" hidden></ul>
    </form>
  `);
  const bulkMsg = $('.msg', bulkForm);
  const bulkErrors = $('.bulk-errors', bulkForm);

  const logoutBtn = el('<button type="button">Log out</button>');
  app.append(h1, list, addForm, bulkForm, logoutBtn);
```

Then, after the existing `addForm.addEventListener('submit', ...)` block and
before `logoutBtn.addEventListener(...)`, add:

```javascript
  bulkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    bulkMsg.hidden = true;
    bulkErrors.hidden = true;
    bulkErrors.innerHTML = '';
    const csv = bulkForm.elements.csv.value;
    const r = await fetchJson('/api/items/bulk', { method: 'POST', body: { csv } });
    if (r.status !== 200) {
      bulkMsg.textContent = r.body?.error ?? `error ${r.status}`;
      bulkMsg.className = 'error';
      bulkMsg.hidden = false;
      return;
    }
    bulkMsg.textContent = `Added ${r.body.added} item(s).`;
    bulkMsg.className = 'msg';
    bulkMsg.hidden = false;
    if (r.body.errors?.length) {
      for (const err of r.body.errors) {
        const li = document.createElement('li');
        li.textContent = `line ${err.line}: ${err.error}`;
        bulkErrors.appendChild(li);
      }
      bulkErrors.hidden = false;
    }
    if (r.body.added > 0) {
      bulkForm.elements.csv.value = '';
      refresh();
    }
  });
```

- [ ] **Step 2: Add minor styling**

Append to `public/styles.css`:

```css
ul.bulk-errors { color: #b00; font-size: 0.9em; padding-left: 1.25rem; }
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/app.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: End-to-end smoke**

Run:

```bash
rm -f data/party.db data/party.db-*
PORT=3099 DB_PATH=/tmp/partydibs-bulk-smoke.db npm start > /tmp/partydibs-bulk.log 2>&1 &
SERVER_PID=$!
sleep 1

curl -s -X POST http://localhost:3099/api/setup -H 'content-type: application/json' \
  -d '{"title":"Bulk","password":"pw"}' -c /tmp/cookies-admin.txt > /dev/null

echo "--- bulk with 3 valid + 1 oversize ---"
BIG=$(printf 'x%.0s' {1..101})
curl -s -X POST http://localhost:3099/api/items/bulk -H 'content-type: application/json' \
  -b /tmp/cookies-admin.txt \
  -d "{\"csv\":\"Chips\\nSoda,Diet\\n$BIG\\nForks\"}"

echo
echo "--- state ---"
curl -s http://localhost:3099/api/state

kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
rm -f /tmp/partydibs-bulk-smoke.db /tmp/partydibs-bulk-smoke.db-* /tmp/cookies-admin.txt /tmp/partydibs-bulk.log
```

Expected:
- Bulk response: `{"added":3,"errors":[{"line":3,"error":"name: must be at most 100 chars"}]}`.
- State: items list contains Chips, Soda (with note Diet), Forks — 3 items in order with positions 1,2,3.

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat(frontend): admin CSV bulk-add textarea with per-line error report"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Guest name cookie (HttpOnly, SameSite=Lax, Path=/) | 1 |
| `POST /api/name`, `GET /api/me`, `POST /api/name/logout` | 1 |
| Claim reads cookie; 401 when absent | 2 |
| Unclaim allowed if name matches OR admin session valid; 403 otherwise | 3 |
| Existing claim tests updated to use cookie-carrying agent | 2 |
| Existing unclaim test updated; new tests for 403, admin override | 3 |
| `POST /api/items/bulk` admin-gated | 4 |
| CSV parse: split first comma, trim, skip blank | 4 |
| Bulk validation per row; partial success; 1-based line numbers including blanks | 4 |
| `added: N, errors: [{line, error}]` response shape | 4 |
| Single transaction insert with appended position | 4 |
| CSV size cap (100,000 chars) | 4 |
| Frontend: name prompt when cookie absent | 5 |
| Frontend: signed-in header with Sign out + Admin link | 5 |
| Frontend: claim drops body name; reads from server | 5 |
| Frontend: unclaim button only shown to the claimer | 5 |
| Frontend: localStorage name cache removed | 5 |
| Frontend: CSV textarea on admin with per-line error list | 6 |

All requirements have a task.

**Placeholder scan:** None. Every step has the actual code or command.

**Type/name consistency:** `GUEST_COOKIE`, `COOKIE_NAME` (admin), `COOKIE_OPTS`, `lookupSession`, `validateClaimerName`, `validateItemName`, `validateItemNote` are the same names used throughout. Endpoint paths match between Tasks 1/2/3 and the frontend in Tasks 5/6. The `guestAgent` helper introduced in Task 2 is reused in Task 3.

No issues found.
