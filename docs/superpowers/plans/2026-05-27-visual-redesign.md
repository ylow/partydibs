# PartyDibs Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the utilitarian system-font UI with the Warm & Festive / Coral & Cream design defined in `docs/superpowers/specs/2026-05-27-redesign-design.md`. Same functionality, restyled surface, plus inline-edit + two-click-delete patterns to replace browser `prompt()` / `confirm()`.

**Architecture:** Pure frontend refactor. `public/styles.css` is rewritten around a CSS-custom-property token system. `public/app.js` keeps its existing structure (one file, one render function per screen) but each renderer is updated to emit the new component markup. Two new behaviors: inline-edit row swap (replaces `prompt()` admin edit) and two-click delete pill (replaces `confirm()`). No backend changes, no new dependencies, no build step.

**Tech Stack:** Vanilla JS (ES modules), single CSS file, two self-hosted woff2 web fonts (Fraunces 600, Inter 400/600).

---

## File Map

| File | Change |
|---|---|
| `public/fonts/fraunces-600.woff2` | **Create.** Latin-subset Fraunces 600. |
| `public/fonts/inter-400.woff2` | **Create.** Latin-subset Inter 400. |
| `public/fonts/inter-600.woff2` | **Create.** Latin-subset Inter 600. |
| `public/fonts/LICENSE.txt` | **Create.** OFL license text for both families. |
| `public/styles.css` | **Rewrite.** Token system + base + component CSS. |
| `public/index.html` | **Modify.** Add font preload `<link>` tags. |
| `public/app.js` | **Modify.** Restyle markup in all five render functions; add inline-edit, two-click delete, polling pause, shared `flash()` helper. |

The spec calls for no test changes. The existing `test/*.test.js` suite covers the unchanged backend and must continue to pass.

---

## Verification Strategy

This is a UI-only refactor with no existing frontend test framework. Each task ends with **manual verification in a browser** plus running `npm test` to confirm backend tests still pass. A fresh database in a throwaway path is used so the verification flow always starts from `/setup`.

**Standard verify recipe** (used by many tasks):

```bash
# Fresh DB in /tmp, server on a fixed port
rm -f /tmp/partydibs-redesign.db
DB_PATH=/tmp/partydibs-redesign.db PORT=3333 npm start
# In another terminal or browser: http://127.0.0.1:3333
```

Tasks below reference this recipe by name.

---

## Task 1: Add font assets

**Files:**
- Create: `public/fonts/fraunces-600.woff2`
- Create: `public/fonts/inter-400.woff2`
- Create: `public/fonts/inter-600.woff2`
- Create: `public/fonts/LICENSE.txt`

- [ ] **Step 1: Create the fonts directory**

```bash
mkdir -p public/fonts
```

- [ ] **Step 2: Download the woff2 files from Google Fonts**

Google Fonts' CSS API returns the current production woff2 URLs (Latin subset) when called with a modern browser User-Agent. Run this script from the repo root:

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

fetch_latin_woff2() {
  local css_url="$1"
  local out_path="$2"
  local url
  url=$(curl -sH "User-Agent: $UA" "$css_url" \
    | awk '/\/\* latin \*\//{found=1} found && /url\(/{
        match($0, /https:\/\/fonts\.gstatic\.com\/[^)]+/)
        print substr($0, RSTART, RLENGTH); exit
      }')
  if [ -z "$url" ]; then echo "No latin URL found for $css_url" >&2; exit 1; fi
  echo "Downloading $url -> $out_path"
  curl -sL -o "$out_path" "$url"
}

fetch_latin_woff2 \
  'https://fonts.googleapis.com/css2?family=Fraunces:wght@600&display=swap' \
  public/fonts/fraunces-600.woff2

fetch_latin_woff2 \
  'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap' \
  public/fonts/inter-400.woff2

fetch_latin_woff2 \
  'https://fonts.googleapis.com/css2?family=Inter:wght@600&display=swap' \
  public/fonts/inter-600.woff2
```

- [ ] **Step 3: Verify the files are valid woff2**

Run:

```bash
file public/fonts/*.woff2
```

Expected: each line ends with `Web Open Font Format (Version 2)`. Each file should be roughly 15–80 KB (Latin subset only).

If `file` reports anything other than woff2, the CSS-API parse likely picked up a different subset block. Re-inspect the CSS by running the bare `curl` (without piping to awk) and confirm the `/* latin */` comment block is present.

- [ ] **Step 4: Write the LICENSE.txt**

Both families ship under the SIL Open Font License 1.1. Create `public/fonts/LICENSE.txt`:

```
The fonts in this directory are distributed under the SIL Open Font License,
Version 1.1.

  Fraunces — Copyright 2020 The Fraunces Project Authors
    (https://github.com/undercase/Fraunces)

  Inter — Copyright 2020 The Inter Project Authors
    (https://github.com/rsms/inter)

The full license text is available at:
  https://openfontlicense.org/

Summary:
  • Free to use, study, modify, and redistribute (including in commercial products).
  • Modified versions cannot use the original Reserved Font Names.
  • These fonts may not be sold by themselves.
```

- [ ] **Step 5: Commit**

```bash
git add public/fonts/
git commit -m "chore(fonts): self-host Fraunces 600 and Inter 400/600 (Latin subset)"
```

---

## Task 2: Rewrite styles.css with token system + base

**Files:**
- Modify: `public/styles.css` (full rewrite)

- [ ] **Step 1: Replace `public/styles.css` with the new tokenized stylesheet**

Replace the entire file with:

```css
/* ============================================================
   PartyDibs — Warm & Festive (Coral & Cream)
   See docs/superpowers/specs/2026-05-27-redesign-design.md
   ============================================================ */

/* --- Web fonts --------------------------------------------- */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('/fonts/fraunces-600.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/inter-400.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('/fonts/inter-600.woff2') format('woff2');
}

/* --- Design tokens ----------------------------------------- */
:root {
  --bg-gradient: linear-gradient(180deg, #fff7f0 0%, #ffeed9 100%);

  --surface: #ffffff;
  --surface-soft: #fffaf4;
  --surface-warm: #fdf1e2;

  --text: #3d2817;
  --text-soft: #8a6a4f;
  --text-muted: #9a7a5e;
  --ink: #5b1f1f;

  --accent: #c44536;
  --accent-hover: #ad3a2d;
  --accent-ink: #ffffff;
  --accent-soft: #fff3e5;

  --chip-bg: #f3e3d3;
  --chip-text: #8a6a4f;
  --border: #ead8c0;

  --success-bg: #e8efe0;
  --success-text: #3d6b3d;

  --shadow-card: 0 1px 3px rgba(91, 31, 31, 0.06);
  --shadow-sheet: 0 4px 14px rgba(91, 31, 31, 0.12);

  --radius-card: 12px;
  --radius-button: 8px;
  --radius-pill: 999px;

  --font-serif: 'Fraunces', 'Cormorant Garamond', Georgia, serif;
  --font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

/* --- Base reset --------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; }

html, body { height: 100%; }

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.5;
  color: var(--text);
  background: var(--bg-gradient);
  background-attachment: fixed;
  min-height: 100vh;
}

#app {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1rem 4rem;
}

h1, h2, h3 { margin: 0; }

a {
  color: var(--ink);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 120ms ease;
}
a:hover { border-bottom-color: var(--ink); }

p { margin: 0.4rem 0; }

/* --- Typography roles --------------------------------------- */
.page-title {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: clamp(1.6rem, 5vw, 2rem);
  color: var(--ink);
  letter-spacing: -0.01em;
  margin-bottom: 0.1rem;
}

.hero-title {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: clamp(1.4rem, 4.5vw, 1.7rem);
  color: var(--ink);
  letter-spacing: -0.01em;
  margin-bottom: 0.25rem;
}

.subhead {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 1rem;
  color: var(--text);
  margin: 0.6rem 0 0.4rem;
}

.subtitle {
  font-size: 0.78rem;
  color: var(--text-soft);
  letter-spacing: 0.02em;
  margin-bottom: 1.2rem;
}

.label {
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-soft);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

/* --- Hero card (Setup, Name prompt, Admin login) ------------ */
.hero {
  background: var(--surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  max-width: 420px;
  margin: 8vh auto 0;
  padding: 28px 24px;
}
.hero .field-stack { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }

/* --- Forms -------------------------------------------------- */
input[type="text"],
input[type="password"],
input:not([type]),
textarea {
  font-family: inherit;
  font-size: 0.9rem;
  color: var(--text);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-button);
  padding: 8px 11px;
  width: 100%;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
input::placeholder, textarea::placeholder {
  color: var(--text-muted);
  opacity: 0.85;
}
input:focus, textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
textarea { resize: vertical; min-height: 6rem; }

/* --- Buttons ------------------------------------------------ */
.btn {
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 7px 16px;
  border-radius: var(--radius-button);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.btn-primary {
  background: var(--accent);
  color: var(--accent-ink);
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn-primary:disabled { background: var(--text-muted); cursor: not-allowed; }

.btn-secondary {
  background: transparent;
  color: var(--text-soft);
  border-color: var(--border);
}
.btn-secondary:hover { background: var(--surface-warm); color: var(--ink); }

.btn-pill {
  border-radius: var(--radius-pill);
  padding: 5px 13px;
  font-size: 0.75rem;
}

.btn-block { width: 100%; }

.icon-btn {
  background: transparent;
  border: none;
  padding: 4px 6px;
  cursor: pointer;
  color: var(--text-soft);
  border-radius: 6px;
  font-size: 0.95rem;
  line-height: 1;
  transition: background 120ms ease, color 120ms ease;
}
.icon-btn:hover { background: var(--surface-warm); color: var(--ink); }

.link-quiet {
  background: none;
  border: none;
  color: var(--text-soft);
  font: inherit;
  cursor: pointer;
  padding: 0;
  border-bottom: 1px solid transparent;
}
.link-quiet:hover { color: var(--ink); border-bottom-color: var(--ink); }

/* --- Header strip (guest) ----------------------------------- */
.signed-in {
  font-size: 0.85rem;
  color: var(--text-soft);
  margin-bottom: 1rem;
}
.signed-in strong { color: var(--text); font-weight: 600; }
.signed-in .sep { margin: 0 0.4rem; opacity: 0.5; }

/* --- Title row (admin) -------------------------------------- */
.title-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }

.badge {
  display: inline-block;
  background: var(--ink);
  color: #fde7d2;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
}

/* --- Item list / rows --------------------------------------- */
ul.items { list-style: none; padding: 0; margin: 0 0 1rem; }

.item {
  background: var(--surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 11px 13px;
  margin-bottom: 7px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.item .meta { flex: 1; min-width: 0; }
.item .name { font-weight: 600; font-size: 0.92rem; }
.item .note { font-size: 0.78rem; color: var(--text-muted); margin-top: 1px; }
.item .actions { display: flex; align-items: center; gap: 6px; }

/* Guest item action variants */
.chip {
  display: inline-block;
  background: var(--chip-bg);
  color: var(--chip-text);
  font-size: 0.72rem;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
.chip-inline {
  margin-left: 0.4rem;
  vertical-align: middle;
}

/* Inline edit state (admin) */
.item.editing {
  background: var(--accent-soft);
  border: 1.5px solid var(--accent);
  padding: 12px 13px;
}
.item.editing .edit-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item.editing .edit-fields input {
  padding: 6px 9px;
  background: var(--surface);
}
.item.editing .edit-actions {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* Delete confirm pill (admin) */
.icon-btn.confirming {
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  letter-spacing: 0.02em;
}
.icon-btn.confirming:hover { background: var(--accent-hover); color: var(--accent-ink); }

/* --- Form cards (Add item, Bulk add) ------------------------ */
.form-card {
  background: var(--surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 14px;
  margin-top: 14px;
}
.form-card .row { display: flex; gap: 6px; }
.form-card .row input { flex: 1; }
.form-card .helper {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0 0 8px;
}
.form-card .actions { display: flex; justify-content: flex-end; margin-top: 8px; }

@media (max-width: 480px) {
  .form-card .row { flex-direction: column; }
}

/* --- Flash message ------------------------------------------ */
.flash {
  display: inline-block;
  margin-top: 0.6rem;
  font-size: 0.82rem;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
}
.flash.error { background: var(--accent); color: var(--accent-ink); }
.flash.success { background: var(--success-bg); color: var(--success-text); }
.flash[hidden] { display: none; }

/* --- Bulk errors -------------------------------------------- */
ul.bulk-errors {
  list-style: disc;
  padding-left: 1.25rem;
  margin: 0.4rem 0 0;
  font-size: 0.82rem;
  color: var(--accent);
}
ul.bulk-errors[hidden] { display: none; }

/* --- Footer-level link (Log out) ---------------------------- */
.footer-actions {
  margin-top: 1.5rem;
  text-align: center;
}
```

- [ ] **Step 2: Add font preload links in `public/index.html`**

Replace the contents of `public/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PartyDibs</title>
    <link rel="preload" as="font" type="font/woff2" href="/fonts/fraunces-600.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/fonts/inter-400.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/fonts/inter-600.woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="app">Loading…</div>
    <script type="module" src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Manual verify — fresh DB, server up, Setup screen loads**

Run the **Standard verify recipe** from the top of this document. Open `http://127.0.0.1:3333` in a browser.

Expected: the existing Setup form renders (still with old markup — we haven't restyled it yet), but the page background is now the cream gradient, body font is Inter, and the network panel shows the three woff2 files loading successfully (200 OK).

Network panel — confirm:
- `/fonts/fraunces-600.woff2` → 200
- `/fonts/inter-400.woff2` → 200
- `/fonts/inter-600.woff2` → 200

- [ ] **Step 4: Run backend tests**

```bash
npm test
```

Expected: all tests pass (no backend changes have been made).

- [ ] **Step 5: Commit**

```bash
git add public/styles.css public/index.html
git commit -m "feat(ui): add token system, fonts, base styles for redesign"
```

---

## Task 3: Restyle Setup screen + define shared `el()` and hero markup conventions

**Files:**
- Modify: `public/app.js` — `renderSetup` (currently around line 27).

- [ ] **Step 1: Replace `renderSetup` with restyled markup**

Find the existing `renderSetup` function and replace it with:

```javascript
function renderSetup() {
  app.innerHTML = '';
  const form = el(`
    <form class="hero">
      <h1 class="hero-title">Set up your party</h1>
      <p>Pick a title and an admin password. The password lets you add and edit items later.</p>
      <div class="field-stack">
        <input name="title" placeholder="Party title" required maxlength="100" />
        <input name="password" type="password" placeholder="Admin password" required maxlength="200" />
      </div>
      <div class="field-stack">
        <button type="submit" class="btn btn-primary btn-block">Create party</button>
      </div>
      <p class="flash error" hidden></p>
    </form>
  `);
  const error = $('.flash', form);
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
```

- [ ] **Step 2: Manual verify**

Run the **Standard verify recipe** (fresh DB). Visit `http://127.0.0.1:3333`.

Expected: a centered white hero card on the cream gradient with:
- "Set up your party" in Fraunces serif, dark wine color.
- Paragraph in Inter, dark brown.
- Two inputs stacked with warm cream backgrounds.
- A full-width coral "Create party" button.

Submit with an empty title — browser native validation prevents submit. Fill both fields, submit — page navigates to `/admin`.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): restyle Setup screen with hero card"
```

---

## Task 4: Restyle Name Prompt screen

**Files:**
- Modify: `public/app.js` — `renderNamePrompt` (currently around line 80).

- [ ] **Step 1: Replace `renderNamePrompt` with restyled markup**

Replace the existing function with:

```javascript
async function renderNamePrompt(onName) {
  app.innerHTML = '';
  const state = await fetchJson('/api/state');
  const title = state.body?.title ?? 'PartyDibs';
  const form = el(`
    <form class="hero">
      <h1 class="page-title"></h1>
      <h2 class="subhead">Who are you?</h2>
      <p>Type a display name to claim items. Anyone who picks something up will see this name.</p>
      <div class="field-stack">
        <input name="name" placeholder="Your name" required maxlength="60" autofocus />
      </div>
      <div class="field-stack">
        <button type="submit" class="btn btn-primary btn-block">Continue</button>
      </div>
      <p class="flash error" hidden></p>
    </form>
  `);
  form.querySelector('.page-title').textContent = title;
  const error = $('.flash', form);
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
```

- [ ] **Step 2: Manual verify**

Use the **Standard verify recipe**. Complete Setup (e.g. title = "Hannah's 30th", password = "abc"). Then in a separate browser session (incognito / different browser to avoid carrying the admin cookie), open `http://127.0.0.1:3333/`.

Expected: hero card with:
- "Hannah's 30th" in large Fraunces serif at the top.
- "Who are you?" subhead in bold Inter.
- Paragraph, input (autofocused), full-width Continue button.

Type a name, click Continue — page transitions to the (still-old) guest list.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): restyle Name Prompt screen with hero card"
```

---

## Task 5: Restyle Admin Login screen

**Files:**
- Modify: `public/app.js` — `renderAdminLogin` (currently around line 196).

- [ ] **Step 1: Replace `renderAdminLogin` with restyled markup**

Replace the existing function with:

```javascript
async function renderAdminLogin() {
  app.innerHTML = '';
  const state = await fetchJson('/api/state');
  const title = state.body?.title ?? 'PartyDibs';
  const form = el(`
    <form class="hero">
      <h1 class="page-title"></h1>
      <h2 class="subhead">Admin login</h2>
      <div class="field-stack">
        <input name="password" type="password" placeholder="Admin password" required maxlength="200" autofocus />
      </div>
      <div class="field-stack">
        <button type="submit" class="btn btn-primary btn-block">Log in</button>
      </div>
      <p class="flash error" hidden></p>
    </form>
  `);
  form.querySelector('.page-title').textContent = title;
  const error = $('.flash', form);
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
```

- [ ] **Step 2: Manual verify**

Run **Standard verify recipe**, complete Setup. In a fresh incognito window (no admin cookie), visit `http://127.0.0.1:3333/admin`.

Expected: hero card with the party title in Fraunces, "Admin login" subhead, password input (autofocused), full-width Log in button.

Try a wrong password — coral error pill appears under the button. Right password — page transitions to the (still-old) admin list.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): restyle Admin Login screen with hero card"
```

---

## Task 6: Restyle Guest List + add shared `flash()` helper

**Files:**
- Modify: `public/app.js` — `itemRow`, `renderGuestList` (currently around lines 53 and 122).

- [ ] **Step 1: Add a shared `flash()` helper near the top of the file**

Insert this function near the other small helpers (right after `el()` around line 21):

```javascript
function flash(el, text, variant = 'error', ms = 3000) {
  el.textContent = text;
  el.classList.remove('error', 'success');
  el.classList.add(variant);
  el.hidden = false;
  clearTimeout(el._flashTimer);
  el._flashTimer = setTimeout(() => { el.hidden = true; }, ms);
}
```

- [ ] **Step 2: Replace the existing `itemRow` (guest variant) function**

Replace `itemRow` with:

```javascript
function itemRow(item, currentName, onClaim, onUnclaim) {
  const li = el(`
    <li class="item">
      <div class="meta">
        <div class="name"></div>
        <div class="note" hidden></div>
      </div>
      <div class="actions"></div>
    </li>
  `);
  $('.name', li).textContent = item.name;
  if (item.note) { const n = $('.note', li); n.textContent = item.note; n.hidden = false; }
  const actions = $('.actions', li);
  if (item.claimed_by) {
    const chip = el('<span class="chip"></span>');
    chip.textContent = `Taken by ${item.claimed_by}`;
    actions.appendChild(chip);
    if (item.claimed_by === currentName) {
      const unclaim = el('<button type="button" class="link-quiet">Unclaim</button>');
      unclaim.addEventListener('click', () => onUnclaim(item.id));
      actions.appendChild(unclaim);
    }
  } else {
    const btn = el('<button type="button" class="btn btn-primary btn-pill">Claim</button>');
    btn.addEventListener('click', () => onClaim(item.id));
    actions.appendChild(btn);
  }
  return li;
}
```

(Note: the signature changes — it now takes `currentName` so the row can decide on its own whether to render the Unclaim link. This lets the caller stop poking at `.claim button` after the fact.)

- [ ] **Step 3: Replace `renderGuestList`**

```javascript
function renderGuestList(currentName) {
  app.innerHTML = '';
  const header = el(`
    <p class="signed-in">
      Signed in as <strong></strong>
      <span class="sep">·</span><a href="#" class="signout">Sign out</a>
      <span class="sep">·</span><a href="/admin">Admin</a>
    </p>
  `);
  header.querySelector('strong').textContent = currentName;
  header.querySelector('.signout').addEventListener('click', async (e) => {
    e.preventDefault();
    await fetchJson('/api/name/logout', { method: 'POST' });
    renderGuest();
  });

  const h1 = el('<h1 class="page-title">Loading…</h1>');
  const subtitle = el('<p class="subtitle"></p>');
  const list = el('<ul class="items"></ul>');
  const msg = el('<p class="flash" hidden></p>');
  app.append(header, h1, subtitle, list, msg);

  async function refresh() {
    const r = await fetchJson('/api/state');
    if (r.status !== 200) {
      h1.textContent = 'Error';
      flash(msg, r.body?.error ?? `error ${r.status}`);
      return;
    }
    h1.textContent = r.body.title;
    const total = r.body.items.length;
    const claimed = r.body.items.filter((i) => i.claimed_by).length;
    subtitle.textContent = `${total} item${total === 1 ? '' : 's'} · ${claimed} claimed`;
    list.innerHTML = '';
    for (const it of r.body.items) {
      list.appendChild(itemRow(it, currentName, onClaim, onUnclaim));
    }
  }

  async function onClaim(id) {
    const r = await fetchJson(`/api/items/${id}/claim`, { method: 'POST' });
    if (r.status === 409) flash(msg, `Already claimed by ${r.body?.item?.claimed_by ?? 'someone'}.`);
    else if (r.status === 401) { flash(msg, 'Please sign in again.'); renderGuest(); return; }
    else if (r.status !== 200) flash(msg, r.body?.error ?? `error ${r.status}`);
    refresh();
  }

  async function onUnclaim(id) {
    const r = await fetchJson(`/api/items/${id}/unclaim`, { method: 'POST' });
    if (r.status === 403) flash(msg, 'That claim is not yours.');
    refresh();
  }

  refresh();
  setInterval(refresh, 5000);
}
```

- [ ] **Step 4: Manual verify**

Use the **Standard verify recipe**. Setup the party as admin, add a couple of items via the (still-old) admin UI, log out, visit `/` in an incognito window, type a guest name.

Expected:
- Header strip: "Signed in as **Sam** · Sign out · Admin" in muted brown, with hover-underline links.
- Party title in Fraunces serif.
- Counts subtitle: "2 items · 0 claimed".
- Each item as a white card with rounded corners and soft shadow.
- Unclaimed items show a coral "Claim" pill on the right.

Click Claim. Expected:
- Chip appears: "Taken by Sam" in muted cream.
- A quiet "Unclaim" text link appears next to the chip.
- Counts subtitle updates to show 1 claimed within ~5s (poll).

Open a second browser as a different guest. Claim a different item.

Expected (first browser): within 5s the chip on the other item shows "Taken by [other name]" with no Unclaim link.

Test error: click Claim on an already-claimed item — coral pill flash appears under the list and fades after 3s.

- [ ] **Step 5: Run backend tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): restyle Guest List + shared flash helper"
```

---

## Task 7: Restyle Admin List shell — title, badge, counts, item rows, polling

**Files:**
- Modify: `public/app.js` — `adminItemRow`, `renderAdminList` (currently around lines 222 and 260).

This task lays out the admin list with restyled rows but **keeps the existing `prompt()` / `confirm()` edit/delete handlers**. Tasks 8 and 9 replace them.

- [ ] **Step 1: Replace `adminItemRow` with the restyled (still-prompt-based) version**

```javascript
function adminItemRow(item, refresh) {
  const li = el(`
    <li class="item">
      <div class="meta">
        <div class="name-row"></div>
        <div class="note" hidden></div>
      </div>
      <div class="actions">
        <button type="button" class="icon-btn edit" title="Edit" aria-label="Edit">&#9998;</button>
        <button type="button" class="icon-btn delete" title="Delete" aria-label="Delete">&#128465;</button>
      </div>
    </li>
  `);
  const nameRow = $('.name-row', li);
  const nameSpan = el('<span class="name"></span>');
  nameSpan.textContent = item.name;
  nameRow.appendChild(nameSpan);
  if (item.claimed_by) {
    const chip = el('<span class="chip chip-inline"></span>');
    chip.textContent = item.claimed_by;
    nameRow.appendChild(chip);
  }
  if (item.note) { const n = $('.note', li); n.textContent = item.note; n.hidden = false; }

  $('.edit', li).addEventListener('click', async () => {
    const name = prompt('Name', item.name);
    if (name === null) return;
    const note = prompt('Note (optional)', item.note ?? '') ?? '';
    const r = await fetchJson(`/api/items/${item.id}`, { method: 'PATCH', body: { name, note } });
    if (r.status !== 200) alert(r.body?.error ?? `error ${r.status}`);
    refresh();
  });
  $('.delete', li).addEventListener('click', async () => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await fetchJson(`/api/items/${item.id}`, { method: 'DELETE' });
    refresh();
  });

  return li;
}
```

- [ ] **Step 2: Replace `renderAdminList` (title + badge + counts + rows; existing add and bulk forms preserved for now)**

```javascript
async function renderAdminList() {
  app.innerHTML = '';
  const titleRow = el(`
    <div class="title-row">
      <h1 class="page-title">Loading…</h1>
      <span class="badge">Admin</span>
    </div>
  `);
  const h1 = $('.page-title', titleRow);
  const subtitle = el('<p class="subtitle"></p>');
  const list = el('<ul class="items"></ul>');

  // Keep the existing add/bulk markup for now — restyled in tasks 10 and 11.
  const addForm = el(`
    <form>
      <h2>Add item</h2>
      <div class="row"><input name="name" placeholder="Item name" required maxlength="100" /></div>
      <div class="row"><input name="note" placeholder="Note (optional)" maxlength="500" /></div>
      <button type="submit">Add</button>
      <p class="flash error" hidden></p>
    </form>
  `);
  const addError = $('.flash', addForm);

  const bulkForm = el(`
    <form>
      <h2>Bulk add (CSV)</h2>
      <p>One item per line. Optional note after the first comma. Example: <code>Chips, salty</code></p>
      <textarea name="csv" rows="6" maxlength="100000"></textarea>
      <button type="submit">Add batch</button>
      <p class="flash" hidden></p>
      <ul class="bulk-errors" hidden></ul>
    </form>
  `);
  const bulkMsg = $('.flash', bulkForm);
  const bulkErrors = $('.bulk-errors', bulkForm);

  const logoutBtn = el('<button type="button" class="link-quiet">Log out</button>');
  const footer = el('<div class="footer-actions"></div>');
  footer.appendChild(logoutBtn);

  app.append(titleRow, subtitle, list, addForm, bulkForm, footer);

  async function refresh() {
    const r = await fetchJson('/api/state');
    if (r.status !== 200) { h1.textContent = 'Error'; return; }
    h1.textContent = r.body.title;
    const total = r.body.items.length;
    const claimed = r.body.items.filter((i) => i.claimed_by).length;
    subtitle.textContent = `${total} item${total === 1 ? '' : 's'} · ${claimed} claimed`;
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

  bulkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    bulkMsg.hidden = true;
    bulkErrors.hidden = true;
    bulkErrors.innerHTML = '';
    const csv = bulkForm.elements.csv.value;
    const r = await fetchJson('/api/items/bulk', { method: 'POST', body: { csv } });
    if (r.status !== 200) {
      bulkMsg.textContent = r.body?.error ?? `error ${r.status}`;
      bulkMsg.className = 'flash error';
      bulkMsg.hidden = false;
      return;
    }
    bulkMsg.textContent = `Added ${r.body.added} item(s).`;
    bulkMsg.className = 'flash success';
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

  logoutBtn.addEventListener('click', async () => {
    await fetchJson('/api/logout', { method: 'POST' });
    renderAdmin();
  });

  await refresh();
  setInterval(refresh, 5000);
}
```

- [ ] **Step 3: Manual verify**

Use **Standard verify recipe**. Complete Setup, visit `/admin`.

Expected:
- Title row: party title in Fraunces + small dark wine "Admin" pill badge.
- Counts subtitle in muted brown.
- Each item row is a white card with ✎ and 🗑 icon-buttons on the right. Claimed items show a chip with just the claimer's name inline next to the item name.
- The Add and Bulk forms are still using old markup (they will be restyled in tasks 10 and 11), but they should function.
- Bottom of the page: small "Log out" text link, not a button.

Click ✎ — a browser `prompt()` dialog appears (still). OK to dismiss; will be replaced in Task 8.

Add a couple of items — they should appear within 5s (poll) without manual refresh.

- [ ] **Step 4: Run backend tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): restyle Admin List shell (title, badge, counts, rows)"
```

---

## Task 8: Replace `prompt()` edit with inline-edit row swap (+ polling pause)

**Files:**
- Modify: `public/app.js` — `adminItemRow`, `renderAdminList`.

- [ ] **Step 1: Add a top-level edit-state flag and an inline-edit row builder**

Insert this near the other small helpers, after `flash()`:

```javascript
function buildInlineEditRow(item, onSave, onCancel) {
  const li = el(`
    <li class="item editing">
      <div class="edit-fields">
        <input class="edit-name" maxlength="100" />
        <input class="edit-note" placeholder="Note (optional)" maxlength="500" />
      </div>
      <div class="edit-actions">
        <button type="button" class="btn btn-primary btn-pill save">Save</button>
        <button type="button" class="btn btn-secondary btn-pill cancel" title="Cancel" aria-label="Cancel">×</button>
      </div>
    </li>
  `);
  $('.edit-name', li).value = item.name;
  $('.edit-note', li).value = item.note ?? '';
  $('.edit-name', li).focus();
  $('.save', li).addEventListener('click', () => {
    onSave({ name: $('.edit-name', li).value, note: $('.edit-note', li).value });
  });
  $('.cancel', li).addEventListener('click', onCancel);
  return li;
}
```

- [ ] **Step 2: Update `renderAdminList` to track edit state and pause polling**

Find the line in `renderAdminList` that reads `await refresh(); setInterval(refresh, 5000);` and replace those two lines with:

```javascript
  const state = { editingId: null };
  await refresh();
  setInterval(() => { if (state.editingId === null) refresh(); }, 5000);
```

Also change `list.appendChild(adminItemRow(it, refresh));` inside `refresh()` to:

```javascript
      list.appendChild(adminItemRow(it, refresh, state));
```

After these edits, the `refresh` function body inside `renderAdminList` should look like:

```javascript
  async function refresh() {
    const r = await fetchJson('/api/state');
    if (r.status !== 200) { h1.textContent = 'Error'; return; }
    h1.textContent = r.body.title;
    const total = r.body.items.length;
    const claimed = r.body.items.filter((i) => i.claimed_by).length;
    subtitle.textContent = `${total} item${total === 1 ? '' : 's'} · ${claimed} claimed`;
    list.innerHTML = '';
    for (const it of r.body.items) list.appendChild(adminItemRow(it, refresh, state));
  }
```

- [ ] **Step 3: Update `adminItemRow` — accept `state`, swap to inline edit on pencil click**

Replace the existing `adminItemRow` body with:

```javascript
function adminItemRow(item, refresh, state) {
  const li = el(`
    <li class="item">
      <div class="meta">
        <div class="name-row"></div>
        <div class="note" hidden></div>
      </div>
      <div class="actions">
        <button type="button" class="icon-btn edit" title="Edit" aria-label="Edit">&#9998;</button>
        <button type="button" class="icon-btn delete" title="Delete" aria-label="Delete">&#128465;</button>
      </div>
    </li>
  `);
  const nameRow = $('.name-row', li);
  const nameSpan = el('<span class="name"></span>');
  nameSpan.textContent = item.name;
  nameRow.appendChild(nameSpan);
  if (item.claimed_by) {
    const chip = el('<span class="chip chip-inline"></span>');
    chip.textContent = item.claimed_by;
    nameRow.appendChild(chip);
  }
  if (item.note) { const n = $('.note', li); n.textContent = item.note; n.hidden = false; }

  $('.edit', li).addEventListener('click', () => {
    state.editingId = item.id;
    const editRow = buildInlineEditRow(
      item,
      async ({ name, note }) => {
        const r = await fetchJson(`/api/items/${item.id}`, { method: 'PATCH', body: { name, note } });
        if (r.status !== 200) {
          alert(r.body?.error ?? `error ${r.status}`);
          return;
        }
        state.editingId = null;
        refresh();
      },
      () => {
        state.editingId = null;
        refresh();
      },
    );
    li.replaceWith(editRow);
  });

  $('.delete', li).addEventListener('click', async () => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await fetchJson(`/api/items/${item.id}`, { method: 'DELETE' });
    refresh();
  });

  return li;
}
```

(`confirm()` is still here — Task 9 replaces it.)

- [ ] **Step 4: Manual verify**

Use **Standard verify recipe**. Complete Setup, add a couple of items, then in `/admin`:

- Click ✎ on item 1. Expected: row swaps to an editable form with warm-coral background and accent border. The name field is autofocused with the existing name selected.
- Wait at least 10 seconds (longer than the 5s poll). Expected: the edit row stays put, no flicker, no clobbering. Polling is paused while editing.
- Change the name, click Save. Expected: row returns to display mode with the new name. The 5s poll has resumed.
- Click ✎ again, change the note, click × (cancel). Expected: row reverts to display mode with the original values, no PATCH was made.

- [ ] **Step 5: Run backend tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): replace admin prompt() with inline row edit + polling pause"
```

---

## Task 9: Replace `confirm()` delete with two-click pill

**Files:**
- Modify: `public/app.js` — the delete handler inside `adminItemRow`.

- [ ] **Step 1: Replace the delete handler with the two-click pattern**

Find the existing `$('.delete', li).addEventListener('click', async () => { if (!confirm... })` block inside `adminItemRow` and replace it with:

```javascript
  const deleteBtn = $('.delete', li);
  let deleteTimer = null;
  const resetDelete = () => {
    deleteBtn.classList.remove('confirming');
    deleteBtn.innerHTML = '&#128465;';
    deleteBtn.title = 'Delete';
    if (deleteTimer) { clearTimeout(deleteTimer); deleteTimer = null; }
  };
  deleteBtn.addEventListener('click', async () => {
    if (!deleteBtn.classList.contains('confirming')) {
      deleteBtn.classList.add('confirming');
      deleteBtn.textContent = 'Delete?';
      deleteBtn.title = 'Click again to confirm';
      deleteTimer = setTimeout(resetDelete, 4000);
      return;
    }
    resetDelete();
    await fetchJson(`/api/items/${item.id}`, { method: 'DELETE' });
    refresh();
  });
  deleteBtn.addEventListener('mouseenter', () => {
    if (deleteBtn.classList.contains('confirming') && deleteTimer) {
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(resetDelete, 4000);
    }
  });
```

- [ ] **Step 2: Manual verify**

Use **Standard verify recipe**. Complete Setup, add 3 items, in `/admin`:

- Click 🗑 on item 2. Expected: the icon-button transforms into a coral "Delete?" pill.
- Wait 4–5 seconds without moving the mouse. Expected: it reverts to the trash icon.
- Click 🗑 again, then click "Delete?" within 4s. Expected: the item is deleted, list re-renders.
- Click 🗑 on item 1 (now the top item), then hover over the pill but don't click for 5 seconds. Expected: the pill stays (timer resets on hover-enter). Move away and wait 4s — it reverts.
- Add a new item, click 🗑, then click a different row's ✎ (without confirming). Expected: the pill stays until its own timer expires; clicking elsewhere does not auto-reset it. (Acceptable — the pill is its own visible UI element, the user can see it's armed.)

- [ ] **Step 3: Run backend tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): replace admin confirm() with two-click delete pill"
```

---

## Task 10: Restyle Add-item card

**Files:**
- Modify: `public/app.js` — the `addForm` block inside `renderAdminList`.

- [ ] **Step 1: Replace the `addForm` template and submit handler**

Find the existing `addForm = el(\`<form>...\`)` block and replace it with:

```javascript
  const addForm = el(`
    <form class="form-card">
      <div class="label">Add item</div>
      <div class="row">
        <input name="name" placeholder="Item name" required maxlength="100" />
        <input name="note" placeholder="Note (optional)" maxlength="500" />
        <button type="submit" class="btn btn-primary">Add</button>
      </div>
      <p class="flash error" hidden></p>
    </form>
  `);
  const addError = $('.flash', addForm);
```

The submit handler defined later in `renderAdminList` doesn't need changes — `addForm.elements.name` etc. still resolve.

- [ ] **Step 2: Manual verify**

Use **Standard verify recipe**. Complete Setup, visit `/admin`.

Expected:
- White card with the small all-caps "ADD ITEM" label.
- Single row: name input (flex), note input (flex), coral Add button.
- On a narrow viewport (resize to <480px), the row stacks vertically.

Submit empty — browser validation prevents submit. Submit with a name — item appears in the list, form clears. Submit with a duplicate name — coral error pill appears under the row.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): restyle Add-item card"
```

---

## Task 11: Restyle Bulk-add card

**Files:**
- Modify: `public/app.js` — the `bulkForm` block inside `renderAdminList`.

- [ ] **Step 1: Replace the `bulkForm` template**

Find the existing `bulkForm = el(\`<form>...\`)` block and replace it with:

```javascript
  const bulkForm = el(`
    <form class="form-card">
      <div class="label">Bulk add (CSV)</div>
      <p class="helper">One item per line. Optional note after the first comma. Example: <code>Chips, salty</code></p>
      <textarea name="csv" rows="6" maxlength="100000"></textarea>
      <div class="actions">
        <button type="submit" class="btn btn-primary">Add batch</button>
      </div>
      <p class="flash" hidden></p>
      <ul class="bulk-errors" hidden></ul>
    </form>
  `);
  const bulkMsg = $('.flash', bulkForm);
  const bulkErrors = $('.bulk-errors', bulkForm);
```

(The submit handler already uses `bulkMsg.className = 'flash success'` / `'flash error'`, which lines up with the CSS variants.)

- [ ] **Step 2: Manual verify**

Use **Standard verify recipe**. In `/admin`:

- Bulk-add card renders with the all-caps "BULK ADD (CSV)" label, helper text, full-width textarea (warm-cream background), and an Add-batch button right-aligned below.
- Paste:
  ```
  Cookies, oatmeal
  Lemonade
  ,bad-name
  Chips, salty
  ```
- Click "Add batch". Expected:
  - Green success pill: "Added 3 item(s)."
  - Coral bullet list below: "line 3: ..." (the validation error).
  - The textarea clears.
  - The 3 items appear in the list above within 5s.

- [ ] **Step 3: Run backend tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): restyle Bulk-add card"
```

---

## Task 12: Final visual regression sweep

**Files:** none modified — verification + cleanup only.

- [ ] **Step 1: Walk every screen once with a fresh DB**

Run **Standard verify recipe** and click through:

1. `/` (no DB yet) → Setup wizard renders. Submit valid title + password.
2. After Setup, browser is at `/admin`. Admin list renders with title + badge + 0 items.
3. Add 3 items via the Add card.
4. Bulk-add 2 more via the Bulk card.
5. Edit one item inline (Save) and edit another (Cancel).
6. Delete one item via the two-click pill.
7. Log out (bottom link).
8. Hit `/admin` → Admin Login renders. Wrong password shows error pill. Right password returns to admin.
9. Open `/` in an incognito window → Name Prompt renders with party title at top.
10. Enter a name → Guest List renders with header strip and item cards.
11. Claim one item → chip + Unclaim link appear.
12. Try to claim an already-claimed item from a third browser session → error pill flashes.
13. Sign out via header strip.

- [ ] **Step 2: Confirm no leftover old styles or markup**

Quick grep checks:

```bash
grep -n 'list-style: none' public/styles.css
# Expected: 1 hit, on `ul.items`. No others.

grep -nE 'prompt\(|confirm\(' public/app.js
# Expected: zero matches (both replaced).

grep -n 'style="' public/app.js
# Expected: zero inline style attributes (the old `style="width:100%..."` on the textarea is gone).

grep -n 'meta-header' public/{app.js,styles.css}
# Expected: zero (the old class name is replaced by `signed-in`).
```

If any of the above show unexpected matches, address them with a small follow-up edit before committing.

- [ ] **Step 3: Backend tests still green**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit any cleanup (if Step 2 turned up leftovers)**

```bash
# Only run this if there are changes from Step 2:
git add -p
git commit -m "chore(ui): final cleanup after visual redesign"
```

If Step 2 found nothing, no commit is needed here.

---

## Done

After Task 12, every checkbox should be ticked, every git commit listed above should appear in `git log`, and a manual walk-through of the five screens should show the new Warm & Festive / Coral & Cream design with inline edit and two-click delete.
