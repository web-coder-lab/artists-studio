const TOKEN_KEY = 'as_token';
const API = '/api/v1';
const page = document.body.dataset.page || 'home';

let mode = 'login';
let siteCache = null;
function copyOf(section, key, fallback) {
  try {
    const c = siteCache && siteCache.copy && siteCache.copy[section];
    if (c && c[key] != null && String(c[key]).length) return String(c[key]);
  } catch (_) {}
  return fallback;
}

let waUrl = null;
let currentUser = null;
let cache = {};

const $ = (id) => document.getElementById(id);
function token() { return localStorage.getItem(TOKEN_KEY); }
function guestId() {
  let g = localStorage.getItem('as_guest');
  if (!g) {
    g = 'g_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('as_guest', g);
  }
  return g;
}

function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

async function api(path, opts = {}) {
  if (window.StudioAPI) {
    try {
      return await window.StudioAPI.api(path, opts);
    } catch (e) {
      if (e.auth) {
        showAuthWall();
      }
      throw e;
    }
  }
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
    ['/', 'home', 'Home', `<svg class="nav-ico" viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/></svg>`],
    ['/about.html', 'about', 'About', `<svg class="nav-ico" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 19.5c1.2-3.2 3.7-4.8 7-4.8s5.8 1.6 7 4.8"/></svg>`],
    ['/portfolio.html', 'portfolio', 'Portfolio', `<svg class="nav-ico" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`],
    ['/reels.html', 'reels', 'Reels', `<svg class="nav-ico" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="m10 8 6 4-6 4V8z"/></svg>`],
    ['/services.html', 'services', 'Services', `<svg class="nav-ico" viewBox="0 0 24 24"><path d="M12 3.5 13.8 9H19l-4 3.2 1.5 5.3L12 14.8 7.5 17.5 9 12.2 5 9h5.2L12 3.5z"/></svg>`],
    ['/contact.html', 'contact', 'Contact', `<svg class="nav-ico" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 8 8 6 8-6"/></svg>`],
  ];
  const drawerLinks = links.map(([href, key, label, ico]) =>
    `<a class="nav-drawer-link${page === key ? ' active' : ''}" href="${href}">${ico}<span>${label}</span></a>`
  ).join('');
  return `
  <div class="nav-scrim" id="navScrim" hidden></div>
  <aside class="nav-drawer" id="navDrawer" aria-hidden="true">
    <div class="nav-drawer-head">
      <strong class="nav-drawer-title">Navigate</strong>
      <button type="button" class="nav-chip" id="navClose" aria-label="Close menu">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <nav class="nav-drawer-links" id="navLinks">${drawerLinks}</nav>
    <div class="nav-drawer-foot">Artist's Studio</div>
  </aside>
  <header class="nav site-top">
    <a class="brand nav-brand" href="/">Artist's <span>Studio</span></a>
    <div class="nav-actions" id="navActions"></div>
    <div class="nav-top-btns">
      <button type="button" class="nav-chip theme-toggle" id="themeToggle" title="Theme" aria-label="Toggle dark or light mode">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </button>
      <button type="button" class="nav-chip nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false" aria-controls="navDrawer">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </div>
  </header>`;
}

function footHtml() {
  return `<footer class="foot">
    <span>Artist's Studio</span>
    <span class="muted">— private atelier</span>
  </footer>`;
}

function modalsHtml() {
  return '';
}

function renderNavAuth() {
  const el = $('navActions');
  if (el) el.innerHTML = '';
  const btn = $('themeToggle');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', toggleTheme);
  }
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
  // Cookie + localStorage: try /auth/me even if local token missing (HttpOnly cookie may still be valid)
  try {
    const data = await api('/auth/me');
    currentUser = data.user;
    if (data.token) setToken(data.token);
    if (data.user && data.user.must_change_password && page !== 'account') {
      // soft nudge — account page can force
      console.info('Password change recommended');
    }
  } catch (e) {
    if (e && e.auth) {
      setToken(null);
      currentUser = null;
    } else if (!token()) {
      currentUser = null;
    }
    // network error: keep existing token so refresh does not force logout
  }
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
    applySiteCopy(site);
    if ($('tagline')) $('tagline').textContent = site.tagline || '';
    if ($('heroTitle')) $('heroTitle').textContent = site.hero_title || '';
    if ($('heroSubtitle')) $('heroSubtitle').textContent = site.hero_subtitle || '';
    if ($('profileName')) $('profileName').textContent = site.profile_name || '';
    if ($('profileRole')) $('profileRole').textContent = site.profile_role || '';
    if ($('profileBio')) $('profileBio').textContent = site.profile_bio || '';
    const work = document.querySelector('.home-cta a.btn:not(.btn-ghost)');
    const contact = document.querySelector('.home-cta a.btn-ghost');
    if (work) work.textContent = copyOf('home', 'cta_work', 'View work');
    if (contact) contact.textContent = copyOf('home', 'cta_contact', 'Contact');
    return;
  }

  const root = $('page-root');
  if (!root) return;

  if (page === 'about') {
    const aboutBody = copyOf('about','body', site.about || '') ||
      "Artist's Studio is a private atelier for still and motion work. We shape light, space, and pace so each frame feels intentional — not noisy.";
    const p2 = copyOf('about','body2', '') ||
      'From quiet portraits to directed sequences, the focus stays on craft: clean composition, honest tone, and work that holds attention without shouting.';
    const p3 = copyOf('about','body3', '') ||
      'When you are ready to talk through a brief, reach out through the contact channels. The studio prefers clarity over rush.';
    root.innerHTML = `<div class="page-hero about-hero">
      <p class="eyebrow">${escapeHtml(copyOf('about','eyebrow','Studio'))}</p>
      <h1>${escapeHtml(copyOf('about','title','About the studio'))}</h1>
      <div class="about-stack">
        <p class="prose">${escapeHtml(aboutBody)}</p>
        <p class="prose">${escapeHtml(p2)}</p>
        <p class="prose muted-prose">${escapeHtml(p3)}</p>
      </div>
    </div>`;
  } else if (page === 'portfolio') {
    const folio = await api('/portfolio');
    const items = folio.items || [];
    root.innerHTML = `<div class="page-hero" style="max-width:none;padding-bottom:8px"><p class="eyebrow">${escapeHtml(copyOf('portfolio','eyebrow','Selected work'))}</p><h1>${escapeHtml(copyOf('portfolio','title','Portfolio'))}</h1></div>
      ${items.length ? '' : `<p class="muted" style="text-align:center;padding:40px">${escapeHtml(copyOf('portfolio','empty','No work published yet.'))}</p>`}
      <div class="folio-grid">${items.map((it, i) => `
        <article class="folio-card" data-lightbox="${i}" role="button" tabindex="0">
          <img src="${escapeHtml(it.image || it.url || '')}" alt="${escapeHtml(it.title || '')}" loading="lazy"/>
          <div class="folio-meta"><h3>${escapeHtml(it.title || '')}</h3>
          <p>${escapeHtml(it.category || '')}${it.caption ? ' · ' + escapeHtml(it.caption) : ''}</p>
          <div class="folio-actions">
            <button type="button" class="chip" data-plike="${it.id}">♥ <span data-plc="${it.id}">${it.likes || 0}</span></button>
            <button type="button" class="chip" data-psave="${it.id}">Save <span data-psc="${it.id}">${it.saves || 0}</span></button>
          </div></div>
        </article>`).join('')}</div>
      <div class="lightbox hidden" id="lightbox" aria-modal="true" role="dialog">
        <button type="button" class="lightbox-x" id="lbClose" aria-label="Close">×</button>
        <button type="button" class="lightbox-nav prev" id="lbPrev" aria-label="Previous">‹</button>
        <img id="lbImg" alt=""/>
        <button type="button" class="lightbox-nav next" id="lbNext" aria-label="Next">›</button>
        <p class="lightbox-cap" id="lbCap"></p>
      </div>`;
    window.__folio = items;
    let li = 0;
    const lb = $('lightbox');
    const show = (i) => {
      if (!items.length) return;
      li = (i + items.length) % items.length;
      const it = items[li];
      $('lbImg').src = it.image || it.url || '';
      $('lbCap').textContent = [it.title, it.caption].filter(Boolean).join(' — ');
      lb.classList.remove('hidden');
    };
    root.querySelectorAll('[data-lightbox]').forEach((el) => {
      el.addEventListener('click', () => show(+el.dataset.lightbox));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') show(+el.dataset.lightbox); });
    });
    $('lbClose')?.addEventListener('click', () => lb.classList.add('hidden'));
    $('lbPrev')?.addEventListener('click', () => show(li - 1));
    $('lbNext')?.addEventListener('click', () => show(li + 1));
    lb?.addEventListener('click', (e) => { if (e.target === lb) lb.classList.add('hidden'); });
    // portfolio like/save
    root.querySelectorAll('[data-plike]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const id = btn.dataset.plike;
          const r = await api('/portfolio/' + id + '/like', {
            method: 'POST',
            headers: { 'X-Guest-Id': guestId() },
            body: {}
          });
          const el = document.querySelector('[data-plc="' + id + '"]');
          if (el) el.textContent = r.likes || 0;
        } catch (err) { console.error(err); }
      });
    });
    root.querySelectorAll('[data-psave]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const id = btn.dataset.psave;
          const r = await api('/portfolio/' + id + '/save', {
            method: 'POST',
            headers: { 'X-Guest-Id': guestId() },
            body: {}
          });
          const el = document.querySelector('[data-psc="' + id + '"]');
          if (el) el.textContent = r.saves || 0;
        } catch (err) { console.error(err); }
      });
    });
    document.addEventListener('keydown', function lbKeys(e) {
      if (lb.classList.contains('hidden')) return;
      if (e.key === 'Escape') lb.classList.add('hidden');
      if (e.key === 'ArrowLeft') show(li - 1);
      if (e.key === 'ArrowRight') show(li + 1);
    });
  } else if (page === 'reels') {
    const reels = await api('/reels');
    root.innerHTML = `<div class="page-hero" style="max-width:none;padding-bottom:8px"><p class="eyebrow">${escapeHtml(copyOf('reels','eyebrow','Motion'))}</p><h1>${escapeHtml(copyOf('reels','title','Reels'))}</h1></div>
      <div class="reels-row">${(reels.items || []).map((r) => `
        <a class="reel-card" href="${escapeHtml(r.url || '#')}">
          <img src="${escapeHtml(r.thumb)}" alt="" loading="lazy"/><span>${escapeHtml(r.title)}</span>
        </a>`).join('')}</div>`;
  } else if (page === 'services') {
    const defaultSvc = [
      { title: 'Portrait sessions', text: 'Quiet, directed portraits for personal and brand use — natural light or controlled studio tone.', icon: 'cam' },
      { title: 'Campaign stills', text: 'Product and lifestyle frames built for clarity on screen and print.', icon: 'grid' },
      { title: 'Motion & reels', text: 'Short sequences with the same restraint as the stills — paced, not noisy.', icon: 'play' },
      { title: 'Direction', text: 'Look development and on-set guidance so the final set feels coherent.', icon: 'compass' }
    ];
    const list = (site.services && site.services.length) ? site.services : defaultSvc;
    const ico = {
      cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h3l2-2h6l2 2h3v11H4V8z"/><circle cx="12" cy="13" r="3.5"/></svg>',
      grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
      play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5L10 9.5z"/></svg>',
      compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5 11 11l-1.5 3.5L13 13l1.5-3.5z"/></svg>'
    };
    root.innerHTML = `<div class="page-hero" style="max-width:none;padding-bottom:12px">
      <p class="eyebrow">${escapeHtml(copyOf('services','eyebrow','Offerings'))}</p>
      <h1>${escapeHtml(copyOf('services','title','Services'))}</h1>
      <p class="lede svc-intro">${escapeHtml(copyOf('services','subtitle','Clear packages. Honest scope. Craft first.'))}</p>
    </div>
      <div class="svc-grid">${list.map((x, i) => {
        const key = x.icon || ['cam','grid','play','compass'][i % 4];
        return `<article class="svc-card">
          <div class="svc-ico" aria-hidden="true">${ico[key] || ico.cam}</div>
          <h3>${escapeHtml(x.title)}</h3>
          <p>${escapeHtml(x.text || x.description || '')}</p>
        </article>`;
      }).join('')}</div>
      <div class="svc-foot">
        <p class="muted">Need something specific? Tell the studio what you have in mind.</p>
        <a class="btn" href="/contact.html">Get in touch</a>
      </div>`;
  } else if (page === 'contact') {
    // Channels rendered in contact.html
    return;
  } else if (page === 'policies') {
    const pol = await api('/policies');
    const policies = pol.policies || {};
    root.innerHTML = `<div class="page-hero"><p class="eyebrow">${escapeHtml(copyOf('policies','eyebrow','Legal'))}</p><h1>${escapeHtml(copyOf('policies','title','Policies'))}</h1></div>
      <div class="pol-list">${Object.keys(policies).map((k) => `
        <article><h3>${escapeHtml(policies[k].title || k)}</h3><p>${escapeHtml(policies[k].body || '')}</p></article>`).join('')}</div>`;
  } else if (page === 'account') {
    if (!currentUser) {
      root.innerHTML = `<div class="page-hero"><p class="eyebrow">Contact</p><h1>Reach the studio</h1>
        <p class="muted">WhatsApp, Instagram, or email — no account needed.</p>
        <a class="btn" href="/contact.html">Open contact</a></div>`;
    } else {
      root.innerHTML = `<div class="page-hero"><p class="eyebrow">Welcome</p>
        <h1>${escapeHtml(currentUser.name)}</h1>
        <p class="muted">@${escapeHtml(currentUser.username)}</p></div>
        <div class="dash-grid">
          <article class="tile"><h3>Profile</h3><p>${escapeHtml(currentUser.name)} · @${escapeHtml(currentUser.username)}</p></article>
          <article class="tile"><h3>Contact</h3><p><a href="/contact.html" style="color:var(--accent)">WhatsApp · Instagram · Email</a></p></article>
          <article class="tile"><h3>Calls</h3><p class="muted">Voice & video — coming soon.</p></article>
        </div>
        <p style="margin:8px 0 16px"><a class="btn" href="/contact.html">WhatsApp · Instagram · Email</a></p>
        <button type="button" class="btn btn-ghost" id="btnLogout">Sign out</button>
        <hr style="border:none;border-top:1px solid var(--line);margin:24px 0"/>
        <h2 style="font-size:1.1rem">Profile</h2>
        <form id="nameForm" class="form" style="max-width:360px;text-align:left;margin:12px auto 24px">
          <label><span>Display name</span><input name="name" required minlength="2" maxlength="60" value="${escapeHtml(currentUser.name || '')}"/></label>
          <button type="submit" class="btn btn-block">Save name</button>
        </form>
        <h2 style="font-size:1.1rem">Change password</h2>
        <form id="pwForm" class="form" style="max-width:360px;text-align:left;margin:12px auto">
          <label><span>Current</span><input name="current_password" type="password" required minlength="6"/></label>
          <label><span>New (min 8)</span><input name="new_password" type="password" required minlength="8"/></label>
          <p class="form-error hidden" id="pwErr"></p>
          <button type="submit" class="btn btn-block">Update password</button>
        </form>`;
      $('btnLogout')?.addEventListener('click', logout);
      $('nameForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = new FormData(e.target).get('name');
        try {
          const data = await api('/auth/profile', { method: 'PATCH', body: { name } });
          currentUser = data.user;
          renderNavAuth();
          alert('Name updated');
        } catch (err) { alert(err.message); }
      });
      $('pwForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api('/auth/password', {
            method: 'POST',
            body: {
              current_password: fd.get('current_password'),
              new_password: fd.get('new_password')
            }
          });
          alert('Password updated');
          e.target.reset();
          await refreshSession();
        } catch (err) {
          const pe = $('pwErr');
          if (pe) { pe.textContent = err.message; pe.classList.remove('hidden'); }
        }
      });
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
  const toggleMenu = (force) => {
    const drawer = $('navDrawer');
    const btn = $('navToggle');
    const scrim = $('navScrim');
    if (!drawer || !btn) return;
    const open = force != null ? force : !drawer.classList.contains('open');
    drawer.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (scrim) {
      scrim.hidden = !open;
      scrim.classList.toggle('show', open);
    }
    document.body.style.overflow = open ? 'hidden' : '';
  };
  $('navToggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  $('navClose')?.addEventListener('click', () => toggleMenu(false));
  $('navScrim')?.addEventListener('click', () => toggleMenu(false));
  $('navLinks')?.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => toggleMenu(false));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleMenu(false);
  });
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
    const err = $('authError');
    err.classList.add('hidden');
    const fd = new FormData(e.target);
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');
    const body = { username, password };
    if (mode === 'register') {
      body.name = String(fd.get('name') || '').trim();
      if (!body.name) {
        err.textContent = 'Name is required to join';
        err.classList.remove('hidden');
        return;
      }
    }
    if (!username || !password) {
      err.textContent = 'Username and password are required';
      err.classList.remove('hidden');
      return;
    }
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login';
      const data = await api(path, { method: 'POST', body });
      if (!data.token) throw new Error('No session returned');
      setToken(data.token);
      if (window.StudioAPI) window.StudioAPI.setToken(data.token);
      try {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
      } catch (_) {}
      currentUser = data.user;
      closeModal();
      document.getElementById('authWall')?.remove();
      renderNavAuth();
      location.reload();
    } catch (ex) {
      const msg = (ex && ex.message) ? ex.message : 'Could not sign in';
      err.textContent = msg;
      err.classList.remove('hidden');
    }
  });
}

function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('as_theme', t); } catch (_) {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#f6f3ee' : '#0a0a0b');
}
function initTheme() {
  let t = 'dark';
  try {
    t = localStorage.getItem('as_theme') || 'dark';
  } catch (_) {}
  applyTheme(t);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(cur === 'light' ? 'dark' : 'light');
}

function applySiteCopy(site) {
  siteCache = site || {};
  const brand = siteCache.brand || "Artist's Studio";
  const brandEl = document.querySelector('.nav-brand');
  if (brandEl) brandEl.innerHTML = escapeHtml(brand).replace("Studio", "<span>Studio</span>");
  // nav link labels
  const map = [
    ['home', 'Home'], ['about', 'About'], ['portfolio', 'Work'], ['reels', 'Reels'],
    ['services', 'Services'], ['contact', 'Contact'], ['policies', 'Policies']
  ];
  map.forEach(([slug, fb]) => {
    const a = document.querySelector(`.nav-links a[href$="${slug === 'home' ? 'index.html' : slug + '.html'}"]`);
    if (a) {
      const ico = a.querySelector('.nav-ico');
      const label = copyOf('nav', slug, fb);
      a.innerHTML = (ico ? ico.outerHTML + ' ' : '') + escapeHtml(label);
    }
  });
  // footer
  const foot = document.querySelector('.foot-brand, .foot span, .foot');
  const fl = copyOf('footer', 'line', '');
  if (fl && document.getElementById('footLine')) {
    document.getElementById('footLine').textContent = fl;
  }
}

async function boot() {
  initTheme();
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  } catch (_) {}
  document.body.classList.remove('booting', 'locked');
  document.getElementById('authWall')?.remove();
  document.documentElement.classList.remove('needs-auth');
  const nav = $('site-nav');
  const foot = $('site-foot');
  const modals = $('site-modals');
  if (nav) nav.outerHTML = navHtml();
  if (foot) foot.outerHTML = footHtml();
  if (modals) modals.innerHTML = '';
  bindGlobal();
  renderNavAuth();
  // optional session — never required for browsing
  try { await refreshSession(); } catch (_) {}
  try {
    const data = await api('/site');
    applySiteCopy(data.site || data);
  } catch (_) {}
  document.querySelectorAll('main, .home-grid, #page-root, #chatRoot, #feed, .reels-shell').forEach((el) => {
    el.style.visibility = '';
  });
  try { await renderPage(); } catch (e) { console.error(e); }
}

function showAuthWall() {
  /* disabled — site is public; contact via WA / IG / Email */
  document.getElementById('authWall')?.remove();
  document.body.classList.remove('locked');
}

boot();

