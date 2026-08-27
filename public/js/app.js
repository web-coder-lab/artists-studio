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
    ['/', 'home', 'Home'],
    ['/about.html', 'about', 'About'],
    ['/portfolio.html', 'portfolio', 'Portfolio'],
    ['/reels.html', 'reels', 'Reels'],
    ['/services.html', 'services', 'Services'],
    ['/contact.html', 'contact', 'Contact'],
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
    <span><a href="/policies.html">Policies</a></span>
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
    root.innerHTML = `<div class="page-hero"><p class="eyebrow">Connect</p><h1>Contact</h1>
      <p class="lede">Send a note to the studio. Prefer WhatsApp? Your name stays in the message.</p></div>
      <form id="contactForm" class="card-form">
        <label><span>Name *</span><input name="name" required minlength="2" maxlength="60"/></label>
        <label><span>Email</span><input name="email" type="email"/></label>
        <label><span>Phone</span><input name="phone" type="tel"/></label>
        <label><span>Message *</span><textarea name="message" required minlength="5" maxlength="2000" rows="5"></textarea></label>
        <p class="form-error hidden" id="contactError"></p>
        <p class="form-ok hidden" id="contactOk">Message sent. We’ll get back to you.</p>
        <button type="submit" class="btn" id="contactSubmit">Send message</button>
      </form>
      <div class="contact-alt">
        <button type="button" class="btn btn-ghost" id="btnWhatsApp">WhatsApp</button>
        <a class="btn btn-ghost" id="btnEmail" href="mailto:${escapeHtml(socials.email || '')}">Email</a>
        <a class="btn btn-ghost" id="btnIg" href="${escapeHtml(socials.instagram || '#')}" target="_blank" rel="noopener">Instagram</a>
      </div>`;
    $('btnWhatsApp')?.addEventListener('click', openWhatsAppFlow);
    $('contactForm')?.addEventListener('submit', onContactSubmit);
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
          <article class="tile"><h3>Messages</h3><p><a href="/chat.html" style="color:var(--accent)">Open chat with artist</a></p></article>
          <article class="tile"><h3>Calls</h3><p class="muted">Voice & video — coming soon.</p></article>
        </div>
        <p style="margin:8px 0 16px"><a class="btn" href="/chat.html">Contact Artist</a></p>
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
      renderNavAuth();
      if (page === 'account') renderPage();
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
  try { await renderPage(); } catch (e) { console.error(e); }
}

boot();
