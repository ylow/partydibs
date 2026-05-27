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

function renderGuest() {
  app.textContent = '(guest view — implemented next)';
}

function renderAdmin() {
  app.textContent = '(admin view — implemented next)';
}

const route = routes[window.location.pathname] ?? renderGuest;
route();
