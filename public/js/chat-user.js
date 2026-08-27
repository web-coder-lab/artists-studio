(function () {
  const API = '/api/v1';
  const TOKEN_KEY = 'as_token';
  const token = () => localStorage.getItem(TOKEN_KEY);
  const $ = (id) => document.getElementById(id);

  const ICONS = {
    wa: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#25D366" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.79 14.16c-.24.68-1.4 1.25-1.93 1.33-.49.07-1.12.1-1.81-.11-.42-.13-.96-.31-1.65-.61-2.9-1.26-4.79-4.2-4.94-4.39-.14-.19-1.19-1.58-1.19-3.02 0-1.43.75-2.14 1.02-2.43.26-.29.58-.36.77-.36h.55c.18 0 .42-.07.66.5.24.59.82 2.01.89 2.16.07.14.12.31.02.5-.1.19-.14.31-.28.48-.14.17-.3.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.52 1.89 1.05.94 1.93 1.23 2.21 1.37.28.14.44.12.6-.07.17-.19.7-.81.89-1.09.19-.28.37-.23.63-.14.26.09 1.66.78 1.95.93.28.14.47.21.54.33.07.12.07.68-.17 1.36z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="igG" x1="0" y1="24" x2="24" y2="0"><stop stop-color="#f58529"/><stop offset=".5" stop-color="#dd2a7b"/><stop offset="1" stop-color="#8134af"/></linearGradient></defs><rect x="3" y="3" width="18" height="18" rx="5" stroke="url(#igG)" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" stroke="url(#igG)" stroke-width="1.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="#dd2a7b"/></svg>',
    em: '<svg viewBox="0 0 24 24" fill="none" stroke="#c4a574" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M5 12h12M13 6l6 6-6 6"/></svg>',
    attach: '<svg viewBox="0 0 24 24"><path d="M21 12.5V17a5 5 0 0 1-10 0V7a3 3 0 0 1 6 0v9.5a1.5 1.5 0 0 1-3 0V8"/></svg>',
    studio: '✦'
  };

  async function api(path, opts = {}) {
    if (window.StudioAPI && !(opts.body instanceof FormData)) {
      return window.StudioAPI.api(path, opts);
    }
    const headers = { ...(opts.headers || {}) };
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token()) headers.Authorization = 'Bearer ' + token();
    const res = await fetch(API + path, { ...opts, headers, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed');
    return data;
  }

  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function formatSize(n) {
    n = +n || 0;
    if (n < 1024) return n + ' B';
    if (n < 1e6) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1e6).toFixed(1) + ' MB';
  }

  let convId = null;
  let pollTimer = null;
  let socket = null;
  let socials = {};
  let channelsHidden = false;

  function showNet(msg) {
    let b = document.getElementById('netBanner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'netBanner';
      b.className = 'net-banner hidden';
      document.body.appendChild(b);
    }
    if (!msg) { b.classList.add('hidden'); return; }
    b.textContent = msg;
    b.classList.remove('hidden');
  }

  window.addEventListener('offline', () => showNet("You're offline"));
  window.addEventListener('online', () => {
    showNet(null);
    if (convId) loadMessages().catch(() => {});
  });

  async function loadSocials() {
    try {
      const data = await api('/socials');
      socials = data.socials || {};
    } catch (_) { socials = {}; }
  }

  function channelButtonsHtml() {
    const wa = (socials.whatsapp || '').replace(/\D/g, '');
    const ig = socials.instagram || '';
    const em = socials.email || '';
    const parts = [];
    if (wa) parts.push(`<button type="button" class="channel-btn wa" data-channel="whatsapp" title="WhatsApp">${ICONS.wa}<span>WhatsApp</span></button>`);
    if (ig) parts.push(`<a class="channel-btn ig" href="${escape(ig)}" target="_blank" rel="noopener" title="Instagram">${ICONS.ig}<span>Instagram</span></a>`);
    if (em) parts.push(`<a class="channel-btn em" href="mailto:${escape(em)}" title="Email">${ICONS.em}<span>Email</span></a>`);
    return parts.join('') || '<span class="muted">Channels unavailable</span>';
  }

  function bindChannelClicks(root) {
    root?.querySelectorAll('[data-channel="whatsapp"]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          const data = await api('/whatsapp-prefill');
          if (!data.url) { alert('WhatsApp not available'); return; }
          if (confirm("Please don't remove Name / Username from the message.\n\nOpen WhatsApp?")) {
            window.open(data.url, '_blank', 'noopener');
          }
        } catch (e) { alert(e.message); }
      };
    });
  }

  function hideFrontChannels() {
    if (channelsHidden) return;
    channelsHidden = true;
    $('frontChannels')?.classList.add('hidden');
    $('settingsBtn')?.classList.remove('hidden');
  }

  function openSettings() {
    let sheet = $('settingsSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'settingsSheet';
      sheet.className = 'settings-sheet';
      sheet.innerHTML = `
        <div class="settings-card">
          <h3>Reach the studio</h3>
          <p class="muted">WhatsApp, Instagram, or email — outside private chat.</p>
          <div class="channel-row" id="settingsChannels"></div>
          <p style="margin-top:18px;text-align:right">
            <button type="button" class="btn btn-ghost" id="closeSettings">Close</button>
          </p>
        </div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener('click', (e) => {
        if (e.target === sheet || e.target.id === 'closeSettings') sheet.classList.add('hidden');
      });
    }
    const box = $('settingsChannels');
    box.innerHTML = channelButtonsHtml();
    bindChannelClicks(box);
    sheet.classList.remove('hidden');
  }

  function connectWs() {
    const t = token();
    if (!t) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try { socket && socket.close(); } catch (_) {}
    socket = new WebSocket(proto + '//' + location.host + '/ws');
    socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token: t }));
    socket.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (data.type === 'new_message' && data.conversation_id === convId) loadMessages().catch(() => {});
    };
    socket.onclose = () => setTimeout(connectWs, 4000);
  }

  function attachmentHtml(att) {
    if (!att) return '';
    if (att.kind === 'image') return `<div class="att"><img data-auth-src="${escape(att.url)}" alt="" class="att-img"/></div>`;
    if (att.kind === 'video') return `<div class="att"><video data-auth-src="${escape(att.url)}" class="att-vid" controls></video></div>`;
    return `<div class="att file"><a data-auth-href="${escape(att.url)}" href="#">${escape(att.name)}</a>
      <span class="att-size">${formatSize(att.size)}</span></div>`;
  }

  async function hydrateAuthMedia(root) {
    const t = token();
    if (!t || !root) return;
    for (const img of root.querySelectorAll('img[data-auth-src]')) {
      try {
        const r = await fetch(img.getAttribute('data-auth-src'), { headers: { Authorization: 'Bearer ' + t } });
        if (r.ok) img.src = URL.createObjectURL(await r.blob());
      } catch (_) {}
    }
    for (const vid of root.querySelectorAll('video[data-auth-src]')) {
      try {
        const r = await fetch(vid.getAttribute('data-auth-src'), { headers: { Authorization: 'Bearer ' + t } });
        if (r.ok) vid.src = URL.createObjectURL(await r.blob());
      } catch (_) {}
    }
    for (const a of root.querySelectorAll('a[data-auth-href]')) {
      a.onclick = async (e) => {
        e.preventDefault();
        const r = await fetch(a.getAttribute('data-auth-href'), { headers: { Authorization: 'Bearer ' + t } });
        if (!r.ok) return;
        const url = URL.createObjectURL(await r.blob());
        const link = document.createElement('a');
        link.href = url; link.download = a.textContent || 'file'; link.click();
        URL.revokeObjectURL(url);
      };
    }
  }

  function renderThread(messages) {
    const el = $('thread');
    if (!el) return;
    if (messages && messages.length) hideFrontChannels();
    el.innerHTML = messages.map((m) => {
      const mine = m.sender_role === 'user';
      return `<div class="bubble-row ${mine ? 'mine' : 'theirs'}">
        <div class="bubble ${mine ? 'mine' : 'theirs'}">
          ${m.body ? `<div>${escape(m.body)}</div>` : ''}
          ${attachmentHtml(m.attachment)}
          <div class="meta"><span>${fmtTime(m.created_at)}</span></div>
        </div>
      </div>`;
    }).join('') || '<div class="chat-empty">Message the studio privately.<br/>Or use WhatsApp · Instagram · Email above.</div>';
    el.scrollTop = el.scrollHeight;
    hydrateAuthMedia(el);
  }

  async function loadMessages() {
    if (!convId) return;
    const data = await api('/conversations/' + convId + '/messages');
    renderThread(data.messages || []);
  }

  async function bootChat() {
    await loadSocials();

    const guest = $('guestChannels');
    if (guest && !token()) {
      guest.innerHTML = channelButtonsHtml();
      guest.className = 'channel-row';
      guest.style.cssText = 'justify-content:center;margin-top:20px';
      bindChannelClicks(guest);
    }

    if (!token()) return;
    try { await api('/auth/me'); } catch { return; }

    $('gate')?.classList.add('hidden');
    const root = $('chatRoot');
    if (!root) return;
    root.classList.remove('hidden');
    channelsHidden = false;

    root.innerHTML = `
      <div class="chat-app">
        <div class="chat-header">
          <div class="avatar">${ICONS.studio}</div>
          <div>
            <h1>Artist's Studio</h1>
            <p class="sub">Private conversation</p>
          </div>
          <div class="chat-header-actions">
            <button type="button" class="icon-btn hidden" id="settingsBtn" title="Channels">${ICONS.settings}</button>
          </div>
        </div>
        <div class="channel-stage" id="frontChannels">
          <p class="hint">Reach out</p>
          <div class="channel-row">${channelButtonsHtml()}</div>
        </div>
        <div class="chat-thread-wrap">
          <div class="chat-thread" id="thread"></div>
          <form class="chat-compose" id="compose">
            <label class="attach-btn" title="Attach">${ICONS.attach}
              <input type="file" name="file" id="fileInput" accept="image/*,video/mp4,video/webm,.pdf,.doc,.docx,.txt"/>
            </label>
            <span class="file-chip hidden" id="fileChip"></span>
            <textarea name="body" rows="1" placeholder="Message…" id="msgInput"></textarea>
            <button type="submit" title="Send">${ICONS.send}</button>
          </form>
        </div>
      </div>`;

    bindChannelClicks($('frontChannels'));
    $('settingsBtn').onclick = openSettings;

    const list = await api('/conversations');
    if (list.items && list.items[0]) convId = list.items[0].id;
    else {
      const created = await api('/chat/artist', { method: 'POST', body: {} });
      convId = created.conversation_id;
    }
    await loadMessages();
    connectWs();

    const fileInput = $('fileInput');
    const chip = $('fileChip');
    const msgInput = $('msgInput');

    msgInput.addEventListener('input', () => {
      msgInput.style.height = 'auto';
      msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
      if (msgInput.value.trim().length > 0) hideFrontChannels();
    });
    fileInput.onchange = () => {
      if (fileInput.files[0]) {
        chip.textContent = fileInput.files[0].name;
        chip.classList.remove('hidden');
        hideFrontChannels();
      } else chip.classList.add('hidden');
    };

    $('compose').onsubmit = async (e) => {
      e.preventDefault();
      const body = String(msgInput.value || '').trim();
      const file = fileInput.files[0];
      if (!body && !file) return;
      if (!navigator.onLine) { showNet("You're offline"); return; }
      hideFrontChannels();
      const fd = new FormData();
      if (body) fd.append('body', body);
      if (file) fd.append('file', file);
      msgInput.value = '';
      msgInput.style.height = 'auto';
      fileInput.value = '';
      chip.classList.add('hidden');
      try {
        await api('/conversations/' + convId + '/messages', { method: 'POST', body: fd });
        await loadMessages();
      } catch (err) { alert(err.message); }
    };

    clearInterval(pollTimer);
    pollTimer = setInterval(() => loadMessages().catch(() => {}), 20000);
  }

  const tryBoot = () => { bootChat().catch(console.error); };
  tryBoot();
  setTimeout(tryBoot, 400);
  setTimeout(tryBoot, 1200);
})();
