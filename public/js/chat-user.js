(function () {
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
  let callCtrl = null;

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
      if (data.type === 'signal' && callCtrl) callCtrl.handleSignal(data);
      if (data.type === 'call_status') onCallStatus(data.call);
    };
    socket.onclose = () => setTimeout(connectWs, 4000);
  }

  function sendSignal(signal) {
    if (!socket || socket.readyState !== 1 || !callCtrl?.getCallId()) return;
    socket.send(JSON.stringify({
      type: 'signal',
      call_id: callCtrl.getCallId(),
      signal
    }));
  }

  function onCallStatus(call) {
    if (!call) return;
    if (call.status === 'rejected') {
      setCallUi('Call declined', true);
      setTimeout(hideCallOverlay, 2000);
      callCtrl?.end();
    } else if (call.status === 'ended') {
      setCallUi('Call ended', true);
      setTimeout(hideCallOverlay, 1500);
      callCtrl?.end();
    } else if (call.status === 'active') {
      setCallUi('Connected', false);
    }
  }

  function showCallOverlay(title, sub) {
    let el = $('callOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'callOverlay';
      el.className = 'call-overlay';
      el.innerHTML = `
        <h2 id="callTitle"></h2>
        <p class="sub" id="callSub"></p>
        <div class="call-videos">
          <video id="remoteVideo" autoplay playsinline></video>
          <video id="localVideo" autoplay playsinline muted></video>
        </div>
        <div class="call-actions">
          <button type="button" class="ghost" id="btnMute">Mute</button>
          <button type="button" class="ghost" id="btnCam">Camera</button>
          <button type="button" class="end" id="btnEndCall">End</button>
        </div>`;
      document.body.appendChild(el);
      $('btnEndCall').onclick = () => { callCtrl?.end(); hideCallOverlay(); };
      $('btnMute').onclick = () => {
        const muted = callCtrl?.toggleMute();
        $('btnMute').textContent = muted ? 'Unmute' : 'Mute';
      };
      $('btnCam').onclick = () => {
        const off = callCtrl?.toggleCamera();
        $('btnCam').textContent = off ? 'Camera on' : 'Camera off';
      };
    }
    el.classList.remove('hidden');
    setCallUi(title, false);
    if (sub) $('callSub').textContent = sub;
  }
  function setCallUi(title, hideVideos) {
    const t = $('callTitle');
    if (t) t.textContent = title;
  }
  function hideCallOverlay() {
    $('callOverlay')?.classList.add('hidden');
    const rv = $('remoteVideo'); const lv = $('localVideo');
    if (rv) rv.srcObject = null;
    if (lv) lv.srcObject = null;
  }

  function initCallCtrl() {
    callCtrl = window.StudioCall.createCallController({
      getToken: token,
      getSocket: () => socket,
      sendSignal,
      role: 'user',
      onLocalStream: (stream) => {
        const v = $('localVideo');
        if (v) v.srcObject = stream;
      },
      onRemoteStream: (stream) => {
        const v = $('remoteVideo');
        if (v) v.srcObject = stream;
      },
      onStatus: (s) => setCallUi(s === 'calling' ? 'Calling artist…' : s, false)
    });
  }

  function attachmentHtml(att) {
    if (!att) return '';
    if (att.kind === 'image') return `<div class="att"><img data-auth-src="${escape(att.url)}" alt="${escape(att.name)}" class="att-img"/></div>`;
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
    el.innerHTML = messages.map((m) => {
      const mine = m.sender_role === 'user';
      return `<div class="bubble-row ${mine ? 'mine' : 'theirs'}">
        <div class="bubble ${mine ? 'mine' : 'theirs'}">
          ${m.body ? `<div>${escape(m.body)}</div>` : ''}
          ${attachmentHtml(m.attachment)}
          <div class="meta"><span>${fmtTime(m.created_at)}</span>${mine ? '<span>' + escape(m.status || '') + '</span>' : ''}</div>
        </div>
      </div>`;
    }).join('') || '<div class="chat-empty">Say assalam o alaikum — start the conversation.</div>';
    el.scrollTop = el.scrollHeight;
    hydrateAuthMedia(el);
  }

  async function loadMessages() {
    if (!convId) return;
    const data = await api('/conversations/' + convId + '/messages');
    renderThread(data.messages || []);
  }

  async function bootChat() {
    if (!token()) return;
    try { await api('/auth/me'); } catch { return; }
    $('gate')?.classList.add('hidden');
    const root = $('chatRoot');
    if (!root) return;
    root.classList.remove('hidden');
    root.innerHTML = `
      <div class="chat-app">
        <div class="chat-header">
          <div>
            <h1>Artist's Studio</h1>
            <p class="sub">Private chat · media · calls</p>
          </div>
        </div>
        <div class="call-bar">
          <button type="button" class="primary" id="btnVoice">Voice call</button>
          <button type="button" id="btnVideo">Video call</button>
        </div>
        <div class="chat-thread-wrap">
          <div class="chat-thread" id="thread"></div>
          <form class="chat-compose" id="compose">
            <label class="attach-btn" title="Attach">+
              <input type="file" name="file" id="fileInput" accept="image/*,video/mp4,video/webm,.pdf,.doc,.docx,.txt"/>
            </label>
            <span class="file-chip hidden" id="fileChip"></span>
            <textarea name="body" rows="1" placeholder="Type a message"></textarea>
            <button type="submit">Send</button>
          </form>
        </div>
      </div>`;
    const list = await api('/conversations');
    if (list.items && list.items[0]) convId = list.items[0].id;
    else {
      const created = await api('/chat/artist', { method: 'POST', body: JSON.stringify({}) });
      convId = created.conversation_id;
    }
    await loadMessages();
    initCallCtrl();
    connectWs();

    $('btnVoice').onclick = async () => {
      try {
        showCallOverlay('Calling…', 'Voice');
        await callCtrl.userStart('voice');
      } catch (e) { alert(e.message); hideCallOverlay(); }
    };
    $('btnVideo').onclick = async () => {
      try {
        showCallOverlay('Calling…', 'Video');
        await callCtrl.userStart('video');
      } catch (e) { alert(e.message); hideCallOverlay(); }
    };

    const fileInput = $('fileInput');
    const chip = $('fileChip');
    fileInput.onchange = () => {
      if (fileInput.files[0]) { chip.textContent = fileInput.files[0].name; chip.classList.remove('hidden'); }
      else chip.classList.add('hidden');
    };
    $('compose').onsubmit = async (e) => {
      e.preventDefault();
      const ta = e.target.querySelector('textarea');
      const body = String(ta.value || '').trim();
      const file = fileInput.files[0];
      if (!body && !file) return;
      const fd = new FormData();
      if (body) fd.append('body', body);
      if (file) fd.append('file', file);
      ta.value = ''; fileInput.value = ''; chip.classList.add('hidden');
      await api('/conversations/' + convId + '/messages', { method: 'POST', body: fd });
      await loadMessages();
    };
    clearInterval(pollTimer);
    pollTimer = setInterval(() => loadMessages().catch(() => {}), 20000);
  }

  const tryBoot = () => { if (token()) bootChat().catch(console.error); };
  tryBoot();
  setTimeout(tryBoot, 400);
  setTimeout(tryBoot, 1200);
})();
