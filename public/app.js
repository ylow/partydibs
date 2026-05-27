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

function renderAdmin() {
  app.textContent = '(admin view — implemented next)';
}

const route = routes[window.location.pathname] ?? renderGuest;
route();
