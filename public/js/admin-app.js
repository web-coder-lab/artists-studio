const API = '/api/v1';
const TOKEN_KEY = 'as_token';
const token = () => localStorage.getItem(TOKEN_KEY);
const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token()) headers.Authorization = 'Bearer ' + token();
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
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
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      loadConversations().catch(() => {});
      if (activeConv) loadThread(activeConv, false).catch(() => {});
    }, 4000);
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
        <div>${escape(m.body)}</div>
        <div class="meta"><span>${fmtTime(m.created_at)}</span></div>
      </div>
    </div>`;
  }).join('') || '<div class="chat-empty">No messages</div>';
  if (scroll) $('thread').scrollTop = $('thread').scrollHeight;
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
  if (!body) return;
  e.target.reset();
  await api('/conversations/' + activeConv + '/messages', {
    method: 'POST',
    body: JSON.stringify({ body })
  });
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
  } catch (err) {
    $('loginErr').textContent = err.message;
    $('loginErr').classList.remove('hidden');
  }
});

boot();
