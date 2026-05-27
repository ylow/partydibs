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

const NAME_KEY = 'partydibs.name';

function getStoredName() { return localStorage.getItem(NAME_KEY) ?? ''; }
function setStoredName(v) { localStorage.setItem(NAME_KEY, v); }

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
    <div class="row">
      <input name="name" placeholder="Your name" maxlength="60" />
    </div>
  `);
  const nameInput = nameRow.querySelector('input[name="name"]');
  nameInput.value = getStoredName();
  nameInput.addEventListener('input', () => setStoredName(nameInput.value));

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
      list.appendChild(itemRow(it, onClaim, onUnclaim));
    }
  }

  async function onClaim(id) {
    const name = nameInput.value.trim();
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

async function renderAdmin() {
  app.innerHTML = '';
  // Probe an admin endpoint to determine session state: PATCH on a non-existent
  // id returns 401 if unauthed, 404 if authed.
  const probe = await fetchJson('/api/items/0', { method: 'PATCH', body: { name: 'x' } });
  if (probe.status === 401) return renderAdminLogin();
  return renderAdminList();
}

function renderAdminLogin() {
  const form = el(`
    <form>
      <h1>Admin login</h1>
      <div class="row"><input name="password" type="password" placeholder="Admin password" required maxlength="200" /></div>
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
      <div class="row"><input name="name" placeholder="Item name" required maxlength="100" /></div>
      <div class="row"><input name="note" placeholder="Note (optional)" maxlength="500" /></div>
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

const route = routes[window.location.pathname] ?? renderGuest;
route();
