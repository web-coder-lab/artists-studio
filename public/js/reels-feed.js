(function () {
  const feed = document.getElementById('feed');
  if (!feed) return;

  let activeReelId = null;
  let lastTap = 0;
  let items = [];

  const escape = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function api(path, opts) {
    if (window.StudioAPI && StudioAPI.api) return StudioAPI.api(path, opts);
    const headers = Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
    const token = localStorage.getItem('as_token');
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch('/api/v1' + path, {
      method: (opts && opts.method) || 'GET',
      headers,
      credentials: 'include',
      body: opts && opts.body != null ? JSON.stringify(opts.body) : undefined
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      return data;
    });
  }

  /* Clean stroke icons */
  const I = {
    heart: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 20s-7-4.35-9.2-8A5.2 5.2 0 0 1 12 6.2 5.2 5.2 0 0 1 21.2 12c-2.2 3.65-9.2 8-9.2 8z"/></svg>',
    heartFill: '<svg class="ico ico-fill" viewBox="0 0 24 24"><path d="M12 20s-7-4.35-9.2-8A5.2 5.2 0 0 1 12 6.2 5.2 5.2 0 0 1 21.2 12c-2.2 3.65-9.2 8-9.2 8z"/></svg>',
    comment: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.2V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
    bookmark: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1z"/></svg>',
    share: '<svg class="ico" viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 13.2 7.5 4.1M15.7 6.7l-7.5 4.1"/></svg>',
    volume: '<svg class="ico ico-sm" viewBox="0 0 24 24"><path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 7a7 7 0 0 1 0 10"/></svg>',
    mute: '<svg class="ico ico-sm" viewBox="0 0 24 24"><path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="m16 10 5 5M21 10l-5 5"/></svg>',
    burst: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.35-9.2-8A5.2 5.2 0 0 1 12 6.2 5.2 5.2 0 0 1 21.2 12c-2.2 3.65-9.2 8-9.2 8z"/></svg>'
  };

  function mediaUrl(url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('/')) return url;
    return '/' + url.replace(/^\//, '');
  }

  function isVideo(r) {
    const u = r.url || '';
    return r.media_type === 'video' || /\.(mp4|webm|mov|m4v|3gp)(\?|$)/i.test(u);
  }

  function slideHtml(r) {
    const src = mediaUrl(r.url);
    const thumb = mediaUrl(r.thumb || r.url);
    const media = isVideo(r)
      ? `<video src="${escape(src)}" playsinline loop muted preload="metadata"></video>`
      : `<img src="${escape(thumb)}" alt="${escape(r.title || 'Reel')}" loading="lazy"/>`;
    return `
      <article class="slide" data-id="${r.id}" id="reel-${r.id}">
        ${media}
        <div class="veil"></div>
        <div class="burst">${I.burst}</div>
        <div class="mute-pill" data-mute-pill>${I.mute}<span>Muted</span></div>
        <div class="rail">
          <div class="rail-item">
            <button type="button" class="rail-btn" data-like="${r.id}" aria-label="Like">${I.heart}</button>
            <span class="rail-count" data-lc="${r.id}">${r.likes || 0}</span>
          </div>
          <div class="rail-item">
            <button type="button" class="rail-btn" data-comment="${r.id}" aria-label="Comment">${I.comment}</button>
            <span class="rail-count" data-cc="${r.id}">${r.comments_count || 0}</span>
          </div>
          <div class="rail-item">
            <button type="button" class="rail-btn" data-save="${r.id}" aria-label="Save">${I.bookmark}</button>
            <span class="rail-count" data-sc="${r.id}">${r.saves || 0}</span>
          </div>
          <div class="rail-item">
            <button type="button" class="rail-btn" data-copy="${r.id}" aria-label="Share">${I.share}</button>
            <span class="rail-count">Share</span>
          </div>
        </div>
        <div class="meta">
          <div class="who">
            <div class="avatar">A</div>
            <strong>Artist's Studio</strong>
          </div>
          <h2>${escape(r.title || 'Reel')}</h2>
          <p>${escape(r.description || r.caption || '')}</p>
          <div class="tag">Studio reel</div>
        </div>
      </article>`;
  }

  function showMute(slide, muted) {
    const pill = slide.querySelector('[data-mute-pill]');
    if (!pill) return;
    pill.innerHTML = (muted ? I.mute : I.volume) + '<span>' + (muted ? 'Muted' : 'Sound on') + '</span>';
    pill.classList.add('show');
    clearTimeout(pill._t);
    pill._t = setTimeout(() => pill.classList.remove('show'), 1200);
  }

  function playVisible() {
    const mid = feed.scrollTop + feed.clientHeight / 2;
    feed.querySelectorAll('.slide').forEach((slide) => {
      const video = slide.querySelector('video');
      if (!video) return;
      const top = slide.offsetTop;
      const bottom = top + slide.offsetHeight;
      if (mid >= top && mid <= bottom) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }

  async function load() {
    try {
      const data = await api('/reels');
      items = data.items || data.reels || [];
      if (!items.length) {
        feed.innerHTML = `
          <div class="state">
            <h3>No reels yet</h3>
            <p>New vertical work will appear here.</p>
            <a href="/portfolio.html">View portfolio</a>
          </div>`;
        return;
      }
      feed.innerHTML = items.map(slideHtml).join('');
      playVisible();
      if (location.hash.startsWith('#reel-')) {
        const el = document.getElementById(location.hash.slice(1));
        if (el) el.scrollIntoView();
      }
    } catch (e) {
      feed.innerHTML = `
        <div class="state">
          <h3>Could not load</h3>
          <p>${escape(e.message || 'Network error')}</p>
          <a href="/reels.html">Retry</a>
        </div>`;
    }
  }

  feed.addEventListener('scroll', () => {
    clearTimeout(feed._t);
    feed._t = setTimeout(playVisible, 60);
  }, { passive: true });

  feed.addEventListener('click', async (e) => {
    const slide = e.target.closest('.slide');
    if (slide && !e.target.closest('button') && !e.target.closest('a')) {
      const now = Date.now();
      if (now - lastTap < 300) {
        const burst = slide.querySelector('.burst');
        if (burst) {
          burst.classList.remove('pop');
          void burst.offsetWidth;
          burst.classList.add('pop');
        }
        const likeBtn = slide.querySelector('[data-like]');
        if (likeBtn && !likeBtn.classList.contains('liked')) likeBtn.click();
        lastTap = 0;
        return;
      }
      lastTap = now;
      const video = slide.querySelector('video');
      if (video) {
        video.muted = !video.muted;
        showMute(slide, video.muted);
        video.play().catch(() => {});
      }
    }

    const like = e.target.closest('[data-like]');
    const save = e.target.closest('[data-save]');
    const comment = e.target.closest('[data-comment]');
    const copy = e.target.closest('[data-copy]');

    try {
      if (like) {
        like.classList.toggle('liked');
        like.innerHTML = like.classList.contains('liked') ? I.heartFill : I.heart;
        const el = document.querySelector('[data-lc="' + like.dataset.like + '"]');
        try {
          const r = await api('/reels/' + like.dataset.like + '/like', { method: 'POST', body: {} });
          like.classList.toggle('liked', !!r.liked);
          like.innerHTML = r.liked ? I.heartFill : I.heart;
          if (el && r.likes != null) el.textContent = r.likes;
        } catch (_) {
          if (el) {
            const n = (+el.textContent || 0) + (like.classList.contains('liked') ? 1 : -1);
            el.textContent = Math.max(0, n);
          }
        }
      }
      if (save) {
        save.classList.toggle('saved');
        const el = document.querySelector('[data-sc="' + save.dataset.save + '"]');
        try {
          const r = await api('/reels/' + save.dataset.save + '/save', { method: 'POST', body: {} });
          if (el && r.saves != null) el.textContent = r.saves;
        } catch (_) {}
      }
      if (comment) {
        activeReelId = +comment.dataset.comment;
        openComments(activeReelId);
      }
      if (copy) {
        const url = location.origin + '/reels.html#reel-' + copy.dataset.copy;
        await navigator.clipboard.writeText(url);
        const span = copy.parentElement && copy.parentElement.querySelector('.rail-count');
        if (span) {
          const old = span.textContent;
          span.textContent = 'Copied';
          setTimeout(() => { span.textContent = old; }, 1200);
        }
      }
    } catch (err) {
      console.warn(err);
    }
  });

  async function openComments(id) {
    const list = document.getElementById('commentList');
    const sheet = document.getElementById('comments');
    try {
      const data = await api('/reels/' + id + '/comments');
      list.innerHTML = (data.comments || []).map((c) =>
        `<p><span class="u">@${escape(c.username || 'guest')}</span><br/>${escape(c.body)}</p>`
      ).join('') || '<p style="color:#8a857c">No comments yet</p>';
    } catch {
      list.innerHTML = '<p style="color:#8a857c">Comments unavailable</p>';
    }
    sheet.classList.add('on');
  }

  document.getElementById('closeComments').onclick = () =>
    document.getElementById('comments').classList.remove('on');

  document.getElementById('commentForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!activeReelId) return;
    const body = new FormData(e.target).get('body');
    if (!body || !String(body).trim()) return;
    try {
      await api('/reels/' + activeReelId + '/comments', { method: 'POST', body: { body } });
      e.target.reset();
      openComments(activeReelId);
      const el = document.querySelector('[data-cc="' + activeReelId + '"]');
      if (el) el.textContent = String((+el.textContent || 0) + 1);
    } catch (err) {
      alert(err.message || 'Could not post');
    }
  };

  load();
})();
