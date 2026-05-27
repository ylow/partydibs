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
      <div class="row"><input name="title" placeholder="Party title" required maxlength="100" /></div>
      <div class="row"><input name="password" type="password" placeholder="Admin password" required maxlength="200" /></div>
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

async function renderAdmin() {
  app.innerHTML = '';
  // Probe an admin endpoint to determine session state: PATCH on a non-existent
  // id returns 401 if unauthed, 404 if authed.
  const probe = await fetchJson('/api/items/0', { method: 'PATCH', body: { name: 'x' } });
  if (probe.status === 401) return renderAdminLogin();
  return renderAdminList();
}

async function renderAdminLogin() {
  const state = await fetchJson('/api/state');
  const title = state.body?.title ?? 'PartyDibs';
  const form = el(`
    <form>
      <h1></h1>
      <h2>Admin login</h2>
      <div class="row"><input name="password" type="password" placeholder="Admin password" required maxlength="200" /></div>
      <button type="submit">Log in</button>
      <p class="error" hidden></p>
    </form>
  `);
  form.querySelector('h1').textContent = title;
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
      <div class="row"><input name="name" placeholder="Item name" required maxlength="100" /></div>
      <div class="row"><input name="note" placeholder="Note (optional)" maxlength="500" /></div>
      <button type="submit">Add</button>
      <p class="error" hidden></p>
    </form>
  `);
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

  logoutBtn.addEventListener('click', async () => {
    await fetchJson('/api/logout', { method: 'POST' });
    renderAdmin();
  });

  await refresh();
  setInterval(refresh, 5000);
}

const route = routes[window.location.pathname] ?? renderGuest;
route();
