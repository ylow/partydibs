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

function flash(target, text, variant = 'error', ms = 3000) {
  target.textContent = text;
  target.classList.remove('error', 'success');
  target.classList.add(variant);
  target.hidden = false;
  clearTimeout(target._flashTimer);
  target._flashTimer = setTimeout(() => { target.hidden = true; }, ms);
}

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
    $('.save', li).disabled = true;
    onSave({ name: $('.edit-name', li).value, note: $('.edit-note', li).value });
  });
  $('.cancel', li).addEventListener('click', onCancel);
  return li;
}

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

async function renderAdmin() {
  app.innerHTML = '';
  // Probe an admin endpoint to determine session state: PATCH on a non-existent
  // id returns 401 if unauthed, 404 if authed.
  const probe = await fetchJson('/api/items/0', { method: 'PATCH', body: { name: 'x' } });
  if (probe.status === 401) return renderAdminLogin();
  return renderAdminList();
}

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
    // editingId tracks one row; opening a second pencil overwrites it without
    // reverting the first. The next refresh() collapses any stale edit rows.
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

  return li;
}

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
    <form class="form-card">
      <div class="label">Add item</div>
      <div class="row">
        <input name="name" placeholder="Item name" required maxlength="100" />
        <input name="note" placeholder="Note (optional)" maxlength="500" />
        <button type="submit" class="btn btn-primary btn-block">Add</button>
      </div>
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
    for (const it of r.body.items) list.appendChild(adminItemRow(it, refresh, state));
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

  const state = { editingId: null };
  await refresh();
  setInterval(() => { if (state.editingId === null) refresh(); }, 5000);
}

const route = routes[window.location.pathname] ?? renderGuest;
route();
