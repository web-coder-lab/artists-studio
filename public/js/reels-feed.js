(function () {
  const API = '/api/v1';
  const TOKEN_KEY = 'as_token';
  const token = () => localStorage.getItem(TOKEN_KEY);
  const $ = (id) => document.getElementById(id);

  const svg = {
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.6-9.5-9A5.5 5.5 0 0 1 12 5a5.5 5.5 0 0 1 9.5 7c-2.5 4.4-9.5 9-9.5 9z"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9l-5 4v-4.5A3 3 0 0 1 4 14V6z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 0 1 2 2v16l-7-4-7 4V5a2 2 0 0 1 2-2z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v10M8 7l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  async function api(path, opts = {}) {
    if (window.StudioAPI && !(opts.body instanceof FormData)) {
      return window.StudioAPI.api(path, opts);
    }
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

  let activeReelId = null;

  function netWatch() {
    const chip = $('offlineChip');
    const sync = () => {
      if (!navigator.onLine) chip?.classList.remove('hidden');
      else chip?.classList.add('hidden');
    };
    window.addEventListener('online', () => { sync(); load().catch(() => {}); });
    window.addEventListener('offline', sync);
    sync();
  }

  async function load() {
    const feed = $('feed');
    if (!navigator.onLine) {
      feed.innerHTML = '<div class="empty-reels"><div class="spinner"></div><p>Waiting for connection…</p></div>';
      return;
    }
    feed.innerHTML = '<div class="reel-loader"><div class="spinner"></div><p>Loading reels…</p></div>';
    // saved link injected once
    if (!document.getElementById('savedLink')) {
      const a = document.createElement('a');
      a.id = 'savedLink';
      a.href = '/saved.html';
      a.textContent = 'Saved';
      a.style.cssText = 'position:fixed;top:64px;right:12px;z-index:20;color:#fff;background:rgba(0,0,0,.45);padding:8px 12px;border-radius:999px;font-size:.8rem;text-decoration:none';
      document.body.appendChild(a);
    }
    try {
      const data = await api('/reels');
      const items = data.items || [];
      if (!items.length) {
        feed.innerHTML = '<div class="empty-reels"><p>No reels yet</p><p style="font-size:.85rem;opacity:.7">When the studio uploads from gallery, they appear here.</p></div>';
        return;
      }
      feed.innerHTML = items.map((r) => {
        const isVid = r.media_type === 'video' || /\.(mp4|webm)(\?|$)/i.test(r.url || '');
        const media = isVid
          ? `<video src="${escape(r.url)}" loop playsinline muted preload="metadata"></video>`
          : `<img src="${escape(r.url || r.thumb)}" alt="" loading="lazy"/>`;
        return `<section class="reel-slide" data-id="${r.id}">
          ${media}<div class="reel-grad"></div>
          <div class="reel-actions">
            <button type="button" data-like="${r.id}" class="${r.liked ? 'liked' : ''}" aria-label="Like">${svg.heart}</button>
            <span data-lc="${r.id}">${r.likes || 0}</span>
            <button type="button" data-comment="${r.id}" aria-label="Comment">${svg.chat}</button>
            <span data-cc="${r.id}">${r.comments_count || 0}</span>
            <button type="button" data-save="${r.id}" aria-label="Save">${svg.bookmark}</button>
            <span data-sc="${r.id}">${r.saves || 0}</span>
            <button type="button" data-copy="${r.id}" aria-label="Share">${svg.share}</button>
            <span>Share</span>
            <button type="button" data-mute class="mute-btn" aria-label="Sound">♪</button>
            <span>Sound</span>
          </div>
          <div class="reel-meta"><h2>${escape(r.title || 'Reel')}</h2></div>
        </section>`;
      }).join('');

      const vids = feed.querySelectorAll('video');
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.play().catch(() => {});
            en.target.muted = true;
          } else en.target.pause();
        });
      }, { threshold: 0.65 });
      vids.forEach((v) => io.observe(v));
    } catch (e) {
      feed.innerHTML = `<div class="empty-reels"><p>${escape(e.message || 'Could not load')}</p>
        <button type="button" class="btn btn-sm" id="retryReels" style="margin-top:12px">Retry</button></div>`;
      $('retryReels')?.addEventListener('click', () => load());
    }
  }

  let lastTap = 0;
  $('feed').addEventListener('click', async (e) => {
    const mute = e.target.closest('[data-mute]');
    if (mute) {
      const slide = mute.closest('.reel-slide');
      const vid = slide && slide.querySelector('video');
      if (vid) {
        vid.muted = !vid.muted;
        mute.classList.toggle('on', !vid.muted);
      }
      return;
    }
    // double-tap on media to like
    const media = e.target.closest('.reel-slide video, .reel-slide img');
    if (media && !e.target.closest('.reel-actions')) {
      const now = Date.now();
      if (now - lastTap < 320) {
        const slide = media.closest('.reel-slide');
        const likeBtn = slide && slide.querySelector('[data-like]');
        if (likeBtn) likeBtn.click();
        lastTap = 0;
        return;
      }
      lastTap = now;
    }
    const like = e.target.closest('[data-like]');
    const save = e.target.closest('[data-save]');
    const comment = e.target.closest('[data-comment]');
    const copy = e.target.closest('[data-copy]');
    try {
      if (like) {
        if (!token()) return alert('Sign in to like');
        const r = await api('/reels/' + like.dataset.like + '/like', { method: 'POST', body: {} });
        like.classList.toggle('liked', r.liked);
        const el = document.querySelector('[data-lc="' + like.dataset.like + '"]');
        if (el) el.textContent = r.likes;
      }
      if (save) {
        if (!token()) return alert('Sign in to save');
        const r = await api('/reels/' + save.dataset.save + '/save', { method: 'POST', body: {} });
        const el = document.querySelector('[data-sc="' + save.dataset.save + '"]');
        if (el) el.textContent = r.saves;
      }
      if (comment) {
        activeReelId = +comment.dataset.comment;
        openComments(activeReelId);
      }
      if (copy) {
        const url = location.origin + '/reels.html#reel-' + copy.dataset.copy;
        await navigator.clipboard.writeText(url);
        alert('Link copied');
      }
    } catch (err) { alert(err.message); }
  });

  async function openComments(id) {
    try {
      const data = await api('/reels/' + id + '/comments');
      $('commentList').innerHTML = (data.comments || []).map((c) =>
        `<p><span class="u">@${escape(c.username)}</span><br/>${escape(c.body)}</p>`
      ).join('') || '<p style="color:#8a857c">No comments yet</p>';
    } catch {
      $('commentList').innerHTML = '<p style="color:#8a857c">Could not load comments</p>';
    }
    $('comments').classList.add('open');
  }

  $('closeComments').onclick = () => $('comments').classList.remove('open');
  $('commentForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!token()) return alert('Sign in to comment');
    if (!activeReelId) return;
    const body = new FormData(e.target).get('body');
    await api('/reels/' + activeReelId + '/comments', { method: 'POST', body: { body } });
    e.target.reset();
    openComments(activeReelId);
    const el = document.querySelector('[data-cc="' + activeReelId + '"]');
    if (el) el.textContent = String((+el.textContent || 0) + 1);
  };

  netWatch();
  load().catch(console.error);
})();
