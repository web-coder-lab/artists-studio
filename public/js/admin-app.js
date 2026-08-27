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
  $('threadActive').classList.add('hidden');
  $('threadEmpty').classList.remove('hidden');
});

document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $('tabChat').classList.toggle('hidden', tab !== 'chat');
    $('tabContact').classList.toggle('hidden', tab !== 'contact');
  });
});

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
