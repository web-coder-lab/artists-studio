(function () {
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

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  let convId = null;
  let pollTimer = null;

  function renderThread(messages) {
    const el = $('thread');
    if (!el) return;
    el.innerHTML = messages.map((m) => {
      const mine = m.sender_role === 'user';
      return `<div class="bubble-row ${mine ? 'mine' : 'theirs'}">
        <div class="bubble ${mine ? 'mine' : 'theirs'}">
          <div>${escape(m.body)}</div>
          <div class="meta"><span>${fmtTime(m.created_at)}</span>${mine ? '<span>' + (m.status || '') + '</span>' : ''}</div>
        </div>
      </div>`;
    }).join('') || '<div class="chat-empty">Say assalam o alaikum — start the conversation.</div>';
    el.scrollTop = el.scrollHeight;
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function loadMessages() {
    if (!convId) return;
    const data = await api('/conversations/' + convId + '/messages');
    renderThread(data.messages || []);
  }

  async function bootChat() {
    if (!token()) return;
    try {
      await api('/auth/me');
    } catch {
      return;
    }
    $('gate').classList.add('hidden');
    const root = $('chatRoot');
    root.classList.remove('hidden');
    root.innerHTML = `
      <div class="chat-app">
        <div class="chat-header">
          <div>
            <h1>Artist's Studio</h1>
            <p class="sub">Private conversation</p>
          </div>
        </div>
        <div class="chat-thread-wrap">
          <div class="chat-thread" id="thread"></div>
          <form class="chat-compose" id="compose">
            <textarea name="body" rows="1" placeholder="Type a message" required></textarea>
            <button type="submit">Send</button>
          </form>
        </div>
      </div>`;
    const list = await api('/conversations');
    if (list.items && list.items[0]) {
      convId = list.items[0].id;
    } else {
      const created = await api('/chat/artist', { method: 'POST', body: JSON.stringify({}) });
      convId = created.conversation_id;
    }
    await loadMessages();
    $('compose').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = String(fd.get('body') || '').trim();
      if (!body) return;
      e.target.reset();
      await api('/conversations/' + convId + '/messages', {
        method: 'POST',
        body: JSON.stringify({ body })
      });
      await loadMessages();
    };
    clearInterval(pollTimer);
    pollTimer = setInterval(() => loadMessages().catch(() => {}), 5000);
  }

  // wait for app.js session; retry
  const tryBoot = () => {
    if (token()) bootChat().catch(console.error);
  };
  tryBoot();
  setTimeout(tryBoot, 400);
  setTimeout(tryBoot, 1200);
})();
