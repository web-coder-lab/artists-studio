const API = '/api/v1';
const TOKEN_KEY = 'as_token';
const token = () => localStorage.getItem(TOKEN_KEY);
const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token()) headers.Authorization = 'Bearer ' + token();
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

function formatSize(n) {
  n = +n || 0;
  if (n < 1024) return n + ' B';
  if (n < 1e6) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1e6).toFixed(1) + ' MB';
}

function attachmentHtml(att) {
  if (!att) return '';
  if (att.kind === 'image') return '<div class="att"><img data-auth-src="' + escape(att.url) + '" class="att-img" alt=""/></div>';
  if (att.kind === 'video') return '<div class="att"><video data-auth-src="' + escape(att.url) + '" class="att-vid" controls></video></div>';
  return '<div class="att file"><a data-auth-href="' + escape(att.url) + '" href="#">' + escape(att.name) + '</a> <span class="att-size">' + formatSize(att.size) + '</span></div>';
}

async function hydrateAuthMedia(root) {
  const t = token();
  if (!t || !root) return;
  for (const img of root.querySelectorAll('img[data-auth-src]')) {
    try {
      const r = await fetch(img.getAttribute('data-auth-src'), { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) continue;
      img.src = URL.createObjectURL(await r.blob());
    } catch (_) {}
  }
  for (const vid of root.querySelectorAll('video[data-auth-src]')) {
    try {
      const r = await fetch(vid.getAttribute('data-auth-src'), { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) continue;
      vid.src = URL.createObjectURL(await r.blob());
    } catch (_) {}
  }
  for (const a of root.querySelectorAll('a[data-auth-href]')) {
    a.onclick = async (e) => {
      e.preventDefault();
      const r = await fetch(a.getAttribute('data-auth-href'), { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) return;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = a.textContent || 'file'; link.click();
      URL.revokeObjectURL(url);
    };
  }
}


function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let activeConv = null;
let pollTimer = null;


let callCtrl = null;
function ensureCallCtrl() {
  if (callCtrl || !window.StudioCall) return;
  callCtrl = window.StudioCall.createCallController({
    getToken: token,
    sendSignal: (signal) => {
      if (!socket || socket.readyState !== 1 || !callCtrl?.getCallId()) return;
      socket.send(JSON.stringify({ type: 'signal', call_id: callCtrl.getCallId(), signal }));
    },
    role: 'admin',
    onLocalStream: (stream) => { const v = document.getElementById('localVideo'); if (v) v.srcObject = stream; },
    onRemoteStream: (stream) => { const v = document.getElementById('remoteVideo'); if (v) v.srcObject = stream; },
    onStatus: (s) => { const t = document.getElementById('callTitle'); if (t) t.textContent = s; }
  });
}

function showIncomingCall(call) {
  let b = document.getElementById('incomingBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'incomingBanner';
    b.className = 'incoming-banner';
    document.body.appendChild(b);
  }
  b.classList.remove('hidden');
  b.innerHTML = '<h3>' + escape(call.from_name || 'User') + (call.from_username ? ' · @' + escape(call.from_username) : '') + '</h3>' +
    '<p>Incoming ' + (call.mode === 'video' ? 'Video' : 'Voice') + ' Call</p>' +
    '<div class="row"><button type="button" class="btn btn-sm btn-ghost" id="rejCall">Decline</button>' +
    '<button type="button" class="btn btn-sm" id="accCall">Accept</button></div>';
  document.getElementById('rejCall').onclick = async () => {
    try { await api('/calls/' + call.id + '/reject'); } catch (_) {}
    b.classList.add('hidden');
  };
  document.getElementById('accCall').onclick = async () => {
    b.classList.add('hidden');
    ensureCallCtrl();
    showAdminCallUi(call);
    try {
      callCtrl.setCallId(call.id);
      await callCtrl.adminAccept(call.id, call.mode);
    } catch (e) { alert(e.message); hideAdminCallUi(); }
  };
}

function showAdminCallUi(call) {
  let el = document.getElementById('callOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'callOverlay';
    el.className = 'call-overlay';
    el.innerHTML = '<h2 id="callTitle">Connecting…</h2><p class="sub" id="callSub"></p>' +
      '<div class="call-videos"><video id="remoteVideo" autoplay playsinline></video><video id="localVideo" autoplay playsinline muted></video></div>' +
      '<div class="call-actions"><button type="button" class="ghost" id="btnMute">Mute</button>' +
      '<button type="button" class="ghost" id="btnCam">Camera</button>' +
      '<button type="button" class="end" id="btnEndCall">End</button></div>';
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
  document.getElementById('callSub').textContent = (call.from_name || '') + ' · ' + call.mode;
  document.getElementById('btnEndCall').onclick = () => { callCtrl?.end(); hideAdminCallUi(); };
  document.getElementById('btnMute').onclick = () => {
    const m = callCtrl?.toggleMute();
    document.getElementById('btnMute').textContent = m ? 'Unmute' : 'Mute';
  };
  document.getElementById('btnCam').onclick = () => {
    const o = callCtrl?.toggleCamera();
    document.getElementById('btnCam').textContent = o ? 'Camera on' : 'Camera off';
  };
}
function hideAdminCallUi() {
  document.getElementById('callOverlay')?.classList.add('hidden');
}


let socket = null;
function connectWs() {
  const t = token();
  if (!t) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = proto + '//' + location.host + '/ws';
  try { socket && socket.close(); } catch (_) {}
  socket = new WebSocket(wsUrl);
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'auth', token: t }));
  };
  socket.onmessage = (ev) => {
    let data;
    try { data = JSON.parse(ev.data); } catch { return; }
    if (data.type === 'notification' && data.kind === 'message') {
      showToast(data.name || data.username || 'User', data.body || 'New message', data.username);
      loadConversations().catch(() => {});
      if (activeConv === data.conversation_id) loadThread(activeConv, true).catch(() => {});
    }
    if (data.type === 'new_message') {
      loadConversations().catch(() => {});
      if (activeConv === data.conversation_id) loadThread(activeConv, true).catch(() => {});
    }
    if (data.type === 'incoming_call' && data.call) {
      showIncomingCall(data.call);
    }
    if (data.type === 'notification' && data.kind === 'call' && data.call_id) {
      // banner also from incoming_call
    }
    if (data.type === 'signal') {
      ensureCallCtrl();
      callCtrl?.handleSignal(data);
    }
    if (data.type === 'call_status' && data.call) {
      if (['ended', 'rejected'].includes(data.call.status)) {
        hideAdminCallUi();
        document.getElementById('incomingBanner')?.classList.add('hidden');
        callCtrl?.end();
      }
    }
  };
  socket.onclose = () => setTimeout(connectWs, 4000);
}

function showToast(name, body, username) {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99;display:flex;flex-direction:column;gap:8px;max-width:320px';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.style.cssText = 'background:#18181b;border:1px solid rgba(196,165,116,.35);border-radius:14px;padding:12px 14px;box-shadow:0 12px 40px rgba(0,0,0,.4);color:#f4f1ea;font-size:.9rem';
  el.innerHTML = '<strong style="color:#c4a574">' + escape(name) + (username ? ' · @' + escape(username) : '') + '</strong><div style="color:#9c978c;margin-top:4px">' + escape(body) + '</div>';
  host.appendChild(el);
  setTimeout(() => el.remove(), 6000);
  // browser notification if permitted
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(name + (username ? ' · @' + username : ''), { body: body }); } catch (_) {}
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}



async function boot() {
  if (!token()) return;
  try {
    const { user } = await api('/auth/me');
    if (user.role !== 'admin') throw new Error('Admin only');
    $('who').textContent = '@' + user.username;
    $('loginGate').classList.add('hidden');
    $('adminApp').classList.remove('hidden');
    document.getElementById('bottomNav')?.classList.remove('hidden');
    loadDashboard();
    await loadConversations();
    await loadContacts();
    connectWs();
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      loadConversations().catch(() => {});
    }, 15000);
  } catch {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function loadConversations() {
  const data = await api('/conversations');
  const list = $('convList');
  if (!data.items.length) {
    list.innerHTML = '<div class="chat-empty">No chats yet</div>';
    return;
  }
  list.innerHTML = data.items.map((c) => `
    <button type="button" class="conv-item ${activeConv === c.id ? 'active' : ''}" data-id="${c.id}">
      <div class="row">
        <span class="name">${escape(c.name || c.username || 'User')}${c.unread ? ' <span class="badge">' + c.unread + '</span>' : ''}</span>
        <span class="time">${fmtTime(c.last_at)}</span>
      </div>
      <p class="preview">${escape(c.last_message || '—')} ${c.username ? '· @' + escape(c.username) : ''}</p>
    </button>`).join('');
}

async function loadThread(id, scroll = true) {
  activeConv = id;
  document.getElementById('adminChat')?.classList.add('thread-open');
  const data = await api('/conversations/' + id + '/messages');
  $('threadEmpty').classList.add('hidden');
  const active = $('threadActive');
  active.classList.remove('hidden');
  active.style.display = 'flex';
  $('thName').textContent = data.conversation.name || data.conversation.username || 'User';
  $('thSub').textContent = data.conversation.username ? '@' + data.conversation.username : '';
  $('thread').innerHTML = (data.messages || []).map((m) => {
    const mine = m.sender_role === 'admin';
    return `<div class="bubble-row ${mine ? 'mine' : 'theirs'}">
      <div class="bubble ${mine ? 'mine' : 'theirs'}">
        ${m.body ? '<div>' + escape(m.body) + '</div>' : ''}
        ${attachmentHtml(m.attachment)}
        <div class="meta"><span>${fmtTime(m.created_at)}</span></div>
      </div>
    </div>`;
  }).join('') || '<div class="chat-empty">No messages</div>';
  if (scroll) $('thread').scrollTop = $('thread').scrollHeight;
  hydrateAuthMedia($('thread'));
  await loadConversations();
}

$('convList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  loadThread(+b.dataset.id);
});

$('compose').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeConv) return;
  const fd = new FormData(e.target);
  const body = String(fd.get('body') || '').trim();
  const file = fd.get('file');
  const hasFile = file && file.size;
  if (!body && !hasFile) return;
  const out = new FormData();
  if (body) out.append('body', body);
  if (hasFile) out.append('file', file);
  e.target.reset();
  const chip = document.getElementById('fileChipAdmin');
  if (chip) chip.classList.add('hidden');
  await api('/conversations/' + activeConv + '/messages', { method: 'POST', body: out });
  await loadThread(activeConv);
});

$('backList').addEventListener('click', () => {
  activeConv = null;
  document.getElementById('adminChat')?.classList.remove('thread-open');
  $('threadActive').classList.add('hidden');
  $('threadEmpty').classList.remove('hidden');
});

/* old data-tab removed */

async function loadContacts() {
  const data = await api('/admin/contacts');
  $('contactMeta').textContent = data.unread + ' new · ' + data.items.length + ' total';
  $('contactList').innerHTML = data.items.length ? data.items.map((c) => `
    <div class="contact-item ${c.status === 'new' ? 'new' : ''}" data-cid="${c.id}">
      <strong>${escape(c.name)}</strong>${c.username ? ' · @' + escape(c.username) : ''}
      <p class="muted" style="margin:6px 0 0;font-size:.9rem">${escape((c.message || '').slice(0, 120))}</p>
      <p class="muted" style="margin:6px 0 0;font-size:.75rem">${escape(c.status)} · ${fmtTime(c.created_at)}</p>
    </div>`).join('') : '<p class="muted">No form messages</p>';
}

$('contactList').addEventListener('click', async (e) => {
  const row = e.target.closest('[data-cid]');
  if (!row) return;
  const { item } = await api('/admin/contacts/' + row.dataset.cid);
  if (item.status === 'new') {
    await api('/admin/contacts/' + item.id, { method: 'PATCH', body: JSON.stringify({ status: 'read' }) });
    loadContacts();
  }
  const d = $('contactDetail');
  d.classList.remove('hidden');
  d.innerHTML = `<h3 style="margin-top:0">${escape(item.name)}</h3>
    <p class="muted">${item.email || ''} ${item.phone || ''}</p>
    <pre style="white-space:pre-wrap;font-family:inherit">${escape(item.message)}</pre>
    <button type="button" class="btn btn-sm" data-st="replied" data-id="${item.id}">Mark replied</button>
    <button type="button" class="btn btn-sm btn-ghost" data-st="closed" data-id="${item.id}">Close</button>`;
});

$('contactDetail').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-st]');
  if (!b) return;
  await api('/admin/contacts/' + b.dataset.id, { method: 'PATCH', body: JSON.stringify({ status: b.dataset.st }) });
  loadContacts();
});

$('adminLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginErr').classList.add('hidden');
  const fd = new FormData(e.target);
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') })
    });
    if (data.user.role !== 'admin') throw new Error('Admin only');
    localStorage.setItem(TOKEN_KEY, data.token);
    boot();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
  } catch (err) {
    $('loginErr').textContent = err.message;
    $('loginErr').classList.remove('hidden');
  }
});

boot();

document.getElementById('fileInputAdmin')?.addEventListener('change', (e) => {
  const chip = document.getElementById('fileChipAdmin');
  if (!chip) return;
  if (e.target.files[0]) { chip.textContent = e.target.files[0].name; chip.classList.remove('hidden'); }
  else chip.classList.add('hidden');
});

// ——— Phase 8–9 CMS panels ———
function showPanel(name) {
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
  document.querySelectorAll('[data-panel]').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
  if (name === 'home') loadDashboard();
  if (name === 'site') loadSiteForm();
  if (name === 'socials') loadSocialsForm();
  if (name === 'portfolio') loadFolioAdmin();
  if (name === 'reels') loadReelsAdmin();
  if (name === 'users') loadUsers();
  if (name === 'versions') loadVersions();
  if (name === 'security') loadSecurity();
  if (name === 'contact') loadContacts();
  if (name === 'chat') loadConversations();
}

document.querySelectorAll('[data-panel]').forEach((btn) => {
  btn.addEventListener('click', () => showPanel(btn.dataset.panel));
});

async function loadDashboard() {
  try {
    const d = await api('/admin/dashboard');
    $('stats').innerHTML = [
      ['Users', d.users],
      ['Chat unread', d.chat_unread],
      ['Contact new', d.contacts_new],
      ['Portfolio', d.portfolio],
      ['Reels', d.reels],
      ['Versions', d.versions]
    ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    $('dashHint').textContent = d.has_draft ? 'Unpublished draft changes' : (d.published_at ? 'Published ' + new Date(d.published_at).toLocaleString() : 'Ready');
  } catch (e) { console.error(e); }
}

async function loadSiteForm() {
  const data = await api('/admin/site');
  const s = data.site || {};
  const f = $('siteForm');
  if (!f) return;
  f.brand.value = s.brand || '';
  f.tagline.value = s.tagline || '';
  f.hero_title.value = s.hero_title || '';
  f.hero_subtitle.value = s.hero_subtitle || '';
  f.profile_name.value = s.profile_name || '';
  f.profile_role.value = s.profile_role || '';
  f.profile_bio.value = s.profile_bio || '';
  f.about.value = s.about || '';
  f.accent.value = (data.theme && data.theme.accent) || '#c4a574';
}

$('siteForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await api('/admin/site', {
    method: 'PUT',
    body: JSON.stringify({
      site: {
        brand: f.brand.value,
        tagline: f.tagline.value,
        hero_title: f.hero_title.value,
        hero_subtitle: f.hero_subtitle.value,
        profile_name: f.profile_name.value,
        profile_role: f.profile_role.value,
        profile_bio: f.profile_bio.value,
        about: f.about.value
      },
      theme: { accent: f.accent.value }
    })
  });
  $('siteMsg').textContent = 'Saved (publish to snapshot version)';
});

async function loadSocialsForm() {
  const data = await api('/admin/socials');
  const s = data.socials || {};
  const f = $('socialsForm');
  if (!f) return;
  f.whatsapp.value = s.whatsapp || '';
  f.email.value = s.email || '';
  f.instagram.value = s.instagram || '';
  f.youtube.value = s.youtube || '';
}

$('socialsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await api('/admin/socials', {
    method: 'PUT',
    body: JSON.stringify({
      socials: {
        whatsapp: f.whatsapp.value,
        email: f.email.value,
        instagram: f.instagram.value,
        youtube: f.youtube.value
      }
    })
  });
  $('socialsMsg').textContent = 'Socials saved';
});

async function loadFolioAdmin() {
  const data = await api('/portfolio');
  $('folioList').innerHTML = (data.items || []).map((it) => `
    <div class="list-row">
      <div><strong>${escape(it.title)}</strong><div class="muted">${escape(it.category || '')}</div></div>
      <button type="button" class="btn btn-sm btn-ghost" data-del-folio="${it.id}">Delete</button>
    </div>`).join('') || '<p class="muted">No items</p>';
}

$('folioAdd')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api('/admin/portfolio/upload', { method: 'POST', body: fd });
  e.target.reset();
  loadFolioAdmin();
});

$('folioList')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del-folio]');
  if (!b) return;
  await api('/admin/portfolio/' + b.dataset.delFolio, { method: 'DELETE' });
  loadFolioAdmin();
});

async function loadReelsAdmin() {
  const data = await api('/reels');
  $('reelList').innerHTML = (data.items || []).map((it) => `
    <div class="list-row">
      <div><strong>${escape(it.title)}</strong></div>
      <button type="button" class="btn btn-sm btn-ghost" data-del-reel="${it.id}">Delete</button>
    </div>`).join('') || '<p class="muted">No reels</p>';
}

$('reelAdd')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api('/admin/reels/upload', { method: 'POST', body: fd });
  e.target.reset();
  loadReelsAdmin();
});

$('reelList')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del-reel]');
  if (!b) return;
  await api('/admin/reels/' + b.dataset.delReel, { method: 'DELETE' });
  loadReelsAdmin();
});

async function loadUsers() {
  const data = await api('/admin/users');
  $('userList').innerHTML = (data.items || []).map((u) => `
    <div class="list-row">
      <div>
        <strong>${escape(u.name)}</strong> · @${escape(u.username)}
        <div class="muted">${escape(u.status)} · ${escape(u.created_at || '')}</div>
      </div>
      <button type="button" class="btn btn-sm btn-ghost" data-user="${u.id}" data-st="${u.status === 'active' ? 'disabled' : 'active'}">
        ${u.status === 'active' ? 'Disable' : 'Enable'}
      </button>
    </div>`).join('') || '<p class="muted">No users</p>';
}

$('userList')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-user]');
  if (!b) return;
  await api('/admin/users/' + b.dataset.user, {
    method: 'PATCH',
    body: JSON.stringify({ status: b.dataset.st })
  });
  loadUsers();
});

async function loadVersions() {
  const data = await api('/admin/versions');
  $('verMeta').textContent = data.has_draft
    ? 'Draft pending publish'
    : (data.published_at ? 'Last published ' + new Date(data.published_at).toLocaleString() : 'No versions yet');
  $('verList').innerHTML = (data.items || []).map((v) => `
    <div class="list-row">
      <div><strong>${escape(v.label)}</strong><div class="muted">${escape(v.note || '')} · ${escape(v.created_at)}</div></div>
      <button type="button" class="btn btn-sm btn-ghost" data-restore="${v.id}">Restore</button>
    </div>`).join('') || '<p class="muted">No snapshots</p>';
}

async function doPublish() {
  const note = prompt('Publish note (optional)') || '';
  await api('/admin/publish', { method: 'POST', body: JSON.stringify({ note }) });
  alert('Published');
  loadVersions();
  loadDashboard();
}

$('btnPublish')?.addEventListener('click', doPublish);
$('btnPublishQuick')?.addEventListener('click', doPublish);

$('verList')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-restore]');
  if (!b) return;
  if (!confirm('Restore this version to live site?')) return;
  await api('/admin/versions/' + b.dataset.restore + '/restore', { method: 'POST', body: '{}' });
  alert('Restored');
  loadVersions();
  loadSiteForm();
  loadSocialsForm();
});

// show bottom nav when logged in — hook into existing boot success
const _origBoot = typeof boot === 'function' ? boot : null;

async function loadSecurity() {
  try {
    const d = await api('/admin/security/dashboard');
    $('secStats').innerHTML = [
      ['Failed logins 24h', d.failed_logins_24h],
      ['Active sessions', d.active_sessions],
      ['Locked', d.locked_accounts],
      ['Audit events', d.audit_count]
    ].map(([k,v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    $('secIp').textContent = 'Your IP: ' + (d.your_ip || '') + (d.admin_ips_configured ? ' · allowlist ON' : ' · allowlist OFF (set ADMIN_ALLOWED_IPS)');
    $('secAudit').innerHTML = (d.recent_audit || []).map((a) =>
      `<div class="list-row"><div><strong>${escape(a.action)}</strong> ${escape(a.username||a.by||'')} <div class="muted">${escape(a.at)} · ${escape(a.ip||'')}</div></div></div>`
    ).join('') || '<p class="muted">No events</p>';
    $('secSessions').innerHTML = (d.sessions || []).map((s) =>
      `<div class="list-row"><div>@${escape(s.username)} · ${escape(s.ip)}<div class="muted">${escape(s.created_at)}</div></div>
      <button type="button" class="btn btn-sm btn-ghost" data-rev="${escape(s.id)}">Revoke</button></div>`
    ).join('') || '<p class="muted">No sessions</p>';
  } catch (e) { console.error(e); }
}
$('secSessions')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-rev]');
  if (!b) return;
  await api('/admin/security/sessions/' + b.dataset.rev + '/revoke', { method: 'POST', body: '{}' });
  loadSecurity();
});
$('btnRevokeAll')?.addEventListener('click', async () => {
  if (!confirm('Revoke all sessions?')) return;
  await api('/admin/security/sessions/revoke-all', { method: 'POST', body: '{}' });
  loadSecurity();
});
