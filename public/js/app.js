const TOKEN_KEY = 'as_token';
const API = '/api/v1';

let mode = 'login';
let waUrl = null;
let currentUser = null;

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

async function loadPublic() {
  const [siteRes, folio, reels, socials, policies] = await Promise.all([
    api('/site'),
    api('/portfolio'),
    api('/reels'),
    api('/socials'),
    api('/policies'),
  ]);
  const s = siteRes.site || {};
  document.title = (s.brand || "Artist's Studio") + " — Studio";
  $('tagline').textContent = s.tagline || '';
  $('heroTitle').textContent = s.hero_title || '';
  $('heroSubtitle').textContent = s.hero_subtitle || '';
  $('profileName').textContent = s.profile_name || '';
  $('profileRole').textContent = s.profile_role || '';
  $('profileBio').textContent = s.profile_bio || '';
  $('aboutText').textContent = s.about || '';
  $('footBrand').textContent = s.brand || "Artist's Studio";

  $('folioGrid').innerHTML = (folio.items || []).map((it) => `
    <article class="folio-card">
      <img src="${escapeHtml(it.image)}" alt="${escapeHtml(it.title)}" loading="lazy"/>
      <div class="folio-meta">
        <h3>${escapeHtml(it.title)}</h3>
        <p>${escapeHtml(it.category || '')}${it.caption ? ' · ' + escapeHtml(it.caption) : ''}</p>
      </div>
    </article>`).join('');

  $('reelsRow').innerHTML = (reels.items || []).map((r) => `
    <a class="reel-card" href="${escapeHtml(r.url || '#')}">
      <img src="${escapeHtml(r.thumb)}" alt="" loading="lazy"/>
      <span>${escapeHtml(r.title)}</span>
    </a>`).join('');

  $('svcGrid').innerHTML = (s.services || []).map((x) => `
    <article class="svc-card"><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.text)}</p></article>`).join('');

  const soc = socials.socials || {};
  const em = $('btnEmail');
  if (soc.email) { em.href = 'mailto:' + soc.email; em.classList.remove('hidden'); }
  else em.classList.add('hidden');
  const ig = $('btnIg');
  if (soc.instagram) { ig.href = soc.instagram; ig.style.display = ''; }
  else ig.style.display = 'none';

  const pol = policies.policies || {};
  $('polLinks').innerHTML = Object.keys(pol).map((k) =>
    `<button type="button" data-pol="${escapeHtml(k)}">${escapeHtml(pol[k].title || k)}</button>`
  ).join('');
  $('polLinks').onclick = (e) => {
    const b = e.target.closest('[data-pol]');
    if (!b) return;
    const p = pol[b.dataset.pol];
    if (!p) return;
    $('polTitle').textContent = p.title;
    $('polText').textContent = p.body;
    $('polBody').classList.remove('hidden');
  };
}

function openModal(m) {
  mode = m;
  $('authError').classList.add('hidden');
  $('authForm').reset();
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

function closeModal() { $('authModal').classList.add('hidden'); }

function renderNav() {
  const nav = $('navActions');
  if (!currentUser) {
    nav.innerHTML = `<button type="button" class="linkish" data-open="login">Sign in</button>
      <button type="button" class="btn btn-sm" data-open="register">Join</button>`;
    $('viewDash').classList.add('hidden');
    return;
  }
  nav.innerHTML = `<span class="muted" style="font-size:.9rem">@${escapeHtml(currentUser.username)}</span>
    <button type="button" class="btn btn-sm btn-ghost" id="navLogout">Sign out</button>`;
  document.getElementById('navLogout')?.addEventListener('click', logout);
  $('viewDash').classList.remove('hidden');
  $('dashName').textContent = currentUser.name;
  $('dashMeta').textContent = '@' + currentUser.username + (currentUser.role === 'admin' ? ' · Admin' : '');
  $('tileProfile').textContent = currentUser.name + ' · @' + currentUser.username;
}

async function refreshSession() {
  if (!token()) { currentUser = null; renderNav(); return; }
  try {
    const { user } = await api('/auth/me');
    currentUser = user;
  } catch {
    setToken(null);
    currentUser = null;
  }
  renderNav();
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
  setToken(null);
  currentUser = null;
  renderNav();
}

async function openWhatsAppFlow() {
  try {
    const data = await api('/whatsapp-prefill');
    if (!data.url) {
      alert('WhatsApp number not configured yet.');
      return;
    }
    waUrl = data.url;
    $('waPreview').textContent = data.text + '(Your message…)';
    $('waModal').classList.remove('hidden');
  } catch (e) {
    alert(e.message);
  }
}

$('navToggle').addEventListener('click', () => {
  $('navLinks').classList.toggle('open');
});

document.body.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) openModal(open.getAttribute('data-open'));
  if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) closeModal();
  if (e.target.matches('[data-wa-close]') || e.target.closest('[data-wa-close]')) {
    $('waModal').classList.add('hidden');
    waUrl = null;
  }
});

$('authSwitch').addEventListener('click', () => openModal(mode === 'login' ? 'register' : 'login'));
$('btnWhatsApp').addEventListener('click', openWhatsAppFlow);
$('btnWhatsAppHero').addEventListener('click', openWhatsAppFlow);
$('waConfirm').addEventListener('click', () => {
  if (waUrl) window.open(waUrl, '_blank', 'noopener');
  $('waModal').classList.add('hidden');
});
$('btnLogout').addEventListener('click', logout);

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('authError').classList.add('hidden');
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
    renderNav();
  } catch (err) {
    $('authError').textContent = err.message;
    $('authError').classList.remove('hidden');
  } finally {
    $('authSubmit').disabled = false;
  }
});

loadPublic().catch((e) => console.error(e));
refreshSession();


$('contactForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('contactError');
  const ok = $('contactOk');
  err.classList.add('hidden');
  ok.classList.add('hidden');
  const fd = new FormData(e.target);
  const body = {
    name: fd.get('name'),
    email: fd.get('email'),
    phone: fd.get('phone'),
    message: fd.get('message'),
  };
  $('contactSubmit').disabled = true;
  try {
    await api('/contact', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset();
    ok.classList.remove('hidden');
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  } finally {
    $('contactSubmit').disabled = false;
  }
});
