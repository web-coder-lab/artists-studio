const TOKEN_KEY = 'as_token';
const API = '/api/v1';

const els = {
  guest: document.getElementById('viewGuest'),
  dash: document.getElementById('viewDash'),
  nav: document.getElementById('navActions'),
  modal: document.getElementById('authModal'),
  form: document.getElementById('authForm'),
  title: document.getElementById('authTitle'),
  sub: document.getElementById('authSub'),
  nameField: document.getElementById('nameField'),
  nameInput: document.querySelector('#nameField input'),
  submit: document.getElementById('authSubmit'),
  error: document.getElementById('authError'),
  switchBtn: document.getElementById('authSwitch'),
  dashName: document.getElementById('dashName'),
  dashMeta: document.getElementById('dashMeta'),
  tileProfile: document.getElementById('tileProfile'),
  logout: document.getElementById('btnLogout'),
};

let mode = 'login'; // login | register

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = token();
  if (t) headers.Authorization = 'Bearer ' + t;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function openModal(m) {
  mode = m;
  els.error.classList.add('hidden');
  els.form.reset();
  if (mode === 'register') {
    els.title.textContent = 'Join the studio';
    els.sub.textContent = 'Username, name, and a password. That’s all.';
    els.nameField.classList.remove('hidden');
    els.nameInput.required = true;
    els.submit.textContent = 'Create account';
    els.switchBtn.textContent = 'Already have an account? Sign in';
    els.form.password.autocomplete = 'new-password';
  } else {
    els.title.textContent = 'Sign in';
    els.sub.textContent = 'Welcome back to the studio.';
    els.nameField.classList.add('hidden');
    els.nameInput.required = false;
    els.submit.textContent = 'Sign in';
    els.switchBtn.textContent = 'Need an account? Join';
    els.form.password.autocomplete = 'current-password';
  }
  els.modal.classList.remove('hidden');
}

function closeModal() {
  els.modal.classList.add('hidden');
}

function renderNav(user) {
  if (!user) {
    els.nav.innerHTML = `
      <button type="button" class="linkish" data-open="login">Sign in</button>
      <button type="button" class="btn btn-sm" data-open="register">Join</button>`;
    return;
  }
  els.nav.innerHTML = `<span class="muted" style="font-size:0.9rem">@${escapeHtml(user.username)}</span>
    <button type="button" class="btn btn-sm btn-ghost" id="navLogout">Sign out</button>`;
  document.getElementById('navLogout')?.addEventListener('click', logout);
}

function showDash(user) {
  els.guest.classList.add('hidden');
  els.dash.classList.remove('hidden');
  els.dashName.textContent = user.name;
  els.dashMeta.textContent = '@' + user.username + (user.role === 'admin' ? ' · Admin' : '');
  els.tileProfile.textContent = user.name + ' · @' + user.username;
  renderNav(user);
}

function showGuest() {
  els.dash.classList.add('hidden');
  els.guest.classList.remove('hidden');
  renderNav(null);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function refreshSession() {
  if (!token()) {
    showGuest();
    return;
  }
  try {
    const { user } = await api('/auth/me');
    showDash(user);
  } catch {
    setToken(null);
    showGuest();
  }
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
  setToken(null);
  showGuest();
}

document.body.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) openModal(open.getAttribute('data-open'));
  if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) closeModal();
});

els.switchBtn.addEventListener('click', () => {
  openModal(mode === 'login' ? 'register' : 'login');
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.error.classList.add('hidden');
  const fd = new FormData(els.form);
  const body = {
    username: fd.get('username'),
    password: fd.get('password'),
  };
  if (mode === 'register') body.name = fd.get('name');
  els.submit.disabled = true;
  try {
    const path = mode === 'register' ? '/auth/register' : '/auth/login';
    const data = await api(path, { method: 'POST', body: JSON.stringify(body) });
    setToken(data.token);
    closeModal();
    showDash(data.user);
  } catch (err) {
    els.error.textContent = err.message;
    els.error.classList.remove('hidden');
  } finally {
    els.submit.disabled = false;
  }
});

els.logout.addEventListener('click', logout);

refreshSession();
