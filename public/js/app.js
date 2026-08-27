const TOKEN_KEY = 'as_token';
const API = '/api/v1';
const page = document.body.dataset.page || 'home';

let mode = 'login';
let waUrl = null;
let currentUser = null;
let cache = {};

const $ = (id) => document.getElementById(id);
function token() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = token();
  if (t) headers.Authorization = 'Bearer ' + t;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function navHtml() {
  const links = [
    ['/', 'home', '⌂'],
    ['/about.html', 'about', '◎'],
    ['/portfolio.html', 'portfolio', '▣'],
    ['/reels.html', 'reels', '▶'],
    ['/services.html', 'services', '✦'],
    ['/contact.html', 'contact', '✉'],
  ];
  const linkEls = links.map(([href, key, label]) =>
    `<a href="${href}" class="${page === key ? 'active' : ''}">${label}</a>`
  ).join('');
  return `
  <header class="nav">
    <a class="brand" href="/">Artist's Studio</a>
    <button type="button" class="nav-toggle" id="navToggle" aria-label="Menu">Menu</button>
    <nav class="nav-links" id="navLinks">${linkEls}</nav>
    <div class="nav-actions" id="navActions"></div>
  </header>`;
}

function footHtml() {
  return `<footer class="foot">
    <span>Artist's Studio</span>
    <span class="muted">◆</span>
  </footer>`;
}

function modalsHtml() {
  return `
  <div class="modal hidden" id="authModal" role="dialog" aria-modal="true">
    <div class="modal-backdrop" data-close></div>
    <div class="modal-card">
      <button type="button" class="modal-x" data-close aria-label="Close">×</button>
      <h2 id="authTitle">Sign in</h2>
      <p class="muted" id="authSub">Welcome back to the studio.</p>
      <form id="authForm" class="form">
        <label><span>Username</span><input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+"/></label>
        <label id="nameField" class="hidden"><span>Name</span><input name="name" autocomplete="name" minlength="2" maxlength="60"/></label>
        <label><span>Password</span><input name="password" type="password" required minlength="6"/></label>
        <p class="form-error hidden" id="authError"></p>
        <button type="submit" class="btn btn-block" id="authSubmit">Sign in</button>
      </form>
      <p class="switch"><button type="button" class="linkish" id="authSwitch">Need an account? Join</button></p>
    </div>
  </div>
  <div class="modal hidden" id="waModal" role="dialog" aria-modal="true">
    <div class="modal-backdrop" data-wa-close></div>
    <div class="modal-card">
      <button type="button" class="modal-x" data-wa-close aria-label="Close">×</button>
      <h2>Before you continue</h2>
      <p class="wa-warn">Please don’t remove <strong>Name</strong> / <strong>Username</strong> from the WhatsApp message. The studio needs them to recognise you.</p>
      <pre class="wa-preview" id="waPreview"></pre>
      <div class="wa-actions">
        <button type="button" class="btn btn-ghost" data-wa-close>Cancel</button>
        <button type="button" class="btn" id="waConfirm">OK, Open WhatsApp</button>
      </div>
    </div>
  </div>`;
}

function renderNavAuth() {
  const nav = $('navActions');
  if (!nav) return;
  if (!currentUser) {
    nav.innerHTML = `<button type="button" class="linkish" data-open="login">Sign in</button>
      <button type="button" class="btn btn-sm" data-open="register">Join</button>`;
    return;
  }
  nav.innerHTML = `<a class="linkish" href="/account.html">@${escapeHtml(currentUser.username)}</a>
    <button type="button" class="btn btn-sm btn-ghost" id="navLogout">Sign out</button>`;
  $('navLogout')?.addEventListener('click', logout);
}

function openModal(m) {
  mode = m;
  $('authError')?.classList.add('hidden');
  $('authForm')?.reset();
  if (mode === 'register') {
    $('authTitle').textContent = 'Join the studio';
    $('authSub').textContent = 'Username, name, and a password.';
    $('nameField').classList.remove('hidden');
    $('nameField').querySelector('input').required = true;
    $('authSubmit').textContent = 'Create account';
    $('authSwitch').textContent = 'Already have an account? Sign in';
  } else {
    $('authTitle').textContent = 'Sign in';
    $('authSub').textContent = 'Welcome back to the studio.';
    $('nameField').classList.add('hidden');
    $('nameField').querySelector('input').required = false;
    $('authSubmit').textContent = 'Sign in';
    $('authSwitch').textContent = 'Need an account? Join';
  }
  $('authModal').classList.remove('hidden');
}

function closeModal() { $('authModal')?.classList.add('hidden'); }

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
  setToken(null);
  currentUser = null;
  renderNavAuth();
  if (page === 'account') location.href = '/';
}

async function openWhatsAppFlow() {
  try {
    const data = await api('/whatsapp-prefill');
    if (!data.url) { alert('WhatsApp is not available right now.'); return; }
    waUrl = data.url;
    $('waPreview').textContent = data.text + '(Your message…)';
    $('waModal').classList.remove('hidden');
  } catch (e) { alert(e.message); }
}

async function refreshSession() {
  if (!token()) { currentUser = null; renderNavAuth(); return; }
  try {
    const { user } = await api('/auth/me');
    currentUser = user;
  } catch { setToken(null); currentUser = null; }
  renderNavAuth();
}

async function loadSite() {
  if (!cache.site) {
    const [siteRes, socials] = await Promise.all([api('/site'), api('/socials')]);
    cache.site = siteRes.site || {};
    cache.socials = socials.socials || {};
  }
  return cache;
}

async function renderPage() {
  const { site, socials } = await loadSite();
  document.title = (site.brand || "Artist's Studio") + (page === 'home' ? '' : ' — ' + page.charAt(0).toUpperCase() + page.slice(1));

  if (page === 'home') {
    if ($('tagline')) $('tagline').textContent = site.tagline || '';
    if ($('heroTitle')) $('heroTitle').textContent = site.hero_title || '';
    if ($('heroSubtitle')) $('heroSubtitle').textContent = site.hero_subtitle || '';
    if ($('profileName')) $('profileName').textContent = site.profile_name || '';
    if ($('profileRole')) $('profileRole').textContent = site.profile_role || '';
    if ($('profileBio')) $('profileBio').textContent = site.profile_bio || '';
    return;
  }

  const root = $('page-root');
  if (!root) return;

  if (page === 'about') {
    root.innerHTML = `<div class="page-hero"><p class="eyebrow">About</p><h1>The studio</h1>
      <p class="prose">${escapeHtml(site.about || '')}</p></div>`;
  } else if (page === 'portfolio') {
    const folio = await api('/portfolio');
    root.innerHTML = `<div class="page-hero" style="max-width:none;padding-bottom:8px"><p class="eyebrow">Selected work</p><h1>Portfolio</h1></div>
      <div class="folio-grid">${(folio.items || []).map((it) => `
        <article class="folio-card">
          <img src="${escapeHtml(it.image)}" alt="${escapeHtml(it.title)}" loading="lazy"/>
          <div class="folio-meta"><h3>${escapeHtml(it.title)}</h3>
          <p>${escapeHtml(it.category || '')}${it.caption ? ' · ' + escapeHtml(it.caption) : ''}</p></div>
        </article>`).join('')}</div>`;
  } else if (page === 'reels') {
    const reels = await api('/reels');
    root.innerHTML = `<div class="page-hero" style="max-width:none;padding-bottom:8px"><p class="eyebrow">Motion</p><h1>Reels</h1></div>
      <div class="reels-row">${(reels.items || []).map((r) => `
        <a class="reel-card" href="${escapeHtml(r.url || '#')}">
          <img src="${escapeHtml(r.thumb)}" alt="" loading="lazy"/><span>${escapeHtml(r.title)}</span>
        </a>`).join('')}</div>`;
  } else if (page === 'services') {
    root.innerHTML = `<div class="page-hero" style="max-width:none;padding-bottom:8px"><p class="eyebrow">Offerings</p><h1>Services</h1></div>
      <div class="svc-grid">${(site.services || []).map((x) => `
        <article class="svc-card"><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.text)}</p></article>`).join('')}</div>`;
  } else if (page === 'contact') {
    // Contact page is the chat UI (chat-user.js). No form here.
    return;
  } else if (page === 'policies') {
    const pol = await api('/policies');
    const policies = pol.policies || {};
    root.innerHTML = `<div class="page-hero"><p class="eyebrow">Legal</p><h1>Policies</h1></div>
      <div class="pol-list">${Object.keys(policies).map((k) => `
        <article><h3>${escapeHtml(policies[k].title || k)}</h3><p>${escapeHtml(policies[k].body || '')}</p></article>`).join('')}</div>`;
  } else if (page === 'account') {
    if (!currentUser) {
      root.innerHTML = `<div class="page-hero"><p class="eyebrow">Account</p><h1>Sign in required</h1>
        <p class="lede">Create an account or sign in to open your dashboard.</p>
        <button type="button" class="btn" data-open="login">Sign in</button></div>`;
    } else {
      root.innerHTML = `<div class="page-hero"><p class="eyebrow">Welcome</p>
        <h1>${escapeHtml(currentUser.name)}</h1>
        <p class="muted">@${escapeHtml(currentUser.username)}</p></div>
        <div class="dash-grid">
          <article class="tile"><h3>Profile</h3><p>${escapeHtml(currentUser.name)} · @${escapeHtml(currentUser.username)}</p></article>
          <article class="tile"><h3>Messages</h3><p><a href="/contact.html" style="color:var(--accent)">Open chat with artist</a></p></article>
          <article class="tile"><h3>Calls</h3><p class="muted">Voice & video — coming soon.</p></article>
        </div>
        <p style="margin:8px 0 16px"><a class="btn" href="/contact.html">Contact Artist</a></p>
        <button type="button" class="btn btn-ghost" id="btnLogout">Sign out</button>`;
      $('btnLogout')?.addEventListener('click', logout);
    }
  }
}

async function onContactSubmit(e) {
  e.preventDefault();
  const err = $('contactError');
  const ok = $('contactOk');
  err?.classList.add('hidden');
  ok?.classList.add('hidden');
  const fd = new FormData(e.target);
  $('contactSubmit').disabled = true;
  try {
    await api('/contact', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        email: fd.get('email'),
        phone: fd.get('phone'),
        message: fd.get('message'),
      }),
    });
    e.target.reset();
    ok?.classList.remove('hidden');
  } catch (ex) {
    if (err) { err.textContent = ex.message; err.classList.remove('hidden'); }
  } finally {
    $('contactSubmit').disabled = false;
  }
}

function bindGlobal() {
  $('navToggle')?.addEventListener('click', () => $('navLinks')?.classList.toggle('open'));
  document.body.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) openModal(open.getAttribute('data-open'));
    if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) closeModal();
    if (e.target.matches('[data-wa-close]') || e.target.closest('[data-wa-close]')) {
      $('waModal')?.classList.add('hidden');
      waUrl = null;
    }
  });
  $('authSwitch')?.addEventListener('click', () => openModal(mode === 'login' ? 'register' : 'login'));
  $('waConfirm')?.addEventListener('click', () => {
    if (waUrl) window.open(waUrl, '_blank', 'noopener');
    $('waModal')?.classList.add('hidden');
  });
  $('authForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('authError')?.classList.add('hidden');
    const fd = new FormData(e.target);
    const body = { username: fd.get('username'), password: fd.get('password') };
    if (mode === 'register') body.name = fd.get('name');
    $('authSubmit').disabled = true;
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login';
      const data = await api(path, { method: 'POST', body: JSON.stringify(body) });
      setToken(data.token);
      currentUser = data.user;
      closeModal();
      document.getElementById('authWall')?.remove();
      renderNavAuth();
      location.reload();
    } catch (err) {
      if ($('authError')) {
        $('authError').textContent = err.message;
        $('authError').classList.remove('hidden');
      }
    } finally {
      $('authSubmit').disabled = false;
    }
  });
}

async function boot() {
  const nav = $('site-nav');
  const foot = $('site-foot');
  const modals = $('site-modals');
  if (nav) nav.outerHTML = navHtml();
  if (foot) foot.outerHTML = footHtml();
  if (modals) modals.innerHTML = modalsHtml();
  bindGlobal();
  await refreshSession();
  if (!token()) {
    // Contact: guest channels ok; other pages show sign-in wall (login/register always work)
    if (page === 'contact') {
      try { await renderPage(); } catch (e) { console.error(e); }
      return;
    }
    showAuthWall();
    return;
  }
  try { await renderPage(); } catch (e) { console.error(e); }
}

function showAuthWall() {
  let wall = document.getElementById('authWall');
  if (!wall) {
    wall = document.createElement('div');
    wall.id = 'authWall';
    wall.style.cssText = 'position:fixed;inset:0;z-index:25;background:#0a0a0b;display:flex;align-items:center;justify-content:center;padding:24px';
    wall.innerHTML = '<div style="max-width:400px;text-align:center;width:100%">' +
      '<p style="color:#c4a574;letter-spacing:.14em;font-size:.72rem;text-transform:uppercase">Artist\'s Studio</p>' +
      '<h1 style="font-family:Cormorant Garamond,Georgia,serif;font-weight:500;font-size:2rem;margin:8px 0 12px;color:#f4f1ea">Welcome</h1>' +
      '<p style="color:#9c978c;margin:0 0 22px">Sign in or join to open the studio.</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
      '<button type="button" class="btn" data-open="login">Sign in</button>' +
      '<button type="button" class="btn btn-ghost" data-open="register">Join</button></div></div>';
    document.body.appendChild(wall);
  }
  wall.style.display = 'flex';
  renderNavAuth();
}

boot();

