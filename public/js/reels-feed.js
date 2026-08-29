(function () {
  const $ = (id) => document.getElementById(id);
  const feed = $('feed');
  if (!feed) return;

  let activeReelId = null;
  let lastTap = 0;
  let items = [];

  function escape(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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
      if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
      return data;
    });
  }

  const svg = {
    like: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.2-4.5-9.4-8.2C1 10 2.2 6.5 5.4 5.3 7.6 4.5 10 5.4 12 7.5c2-2.1 4.4-3 6.6-2.2 3.2 1.2 4.4 4.7 2.8 7.5C19.2 16.5 12 21 12 21z"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
    comment: '<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>'
  };

  function slideHtml(r, index, total) {
    const media = (r.media_type === 'video' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(r.url || ''))
      ? `<video src="${escape(r.url)}" playsinline loop muted preload="metadata"></video>`
      : `<img src="${escape(r.thumb || r.url)}" alt="${escape(r.title)}" loading="lazy"/>`;
    const dots = Array.from({ length: Math.min(total, 8) }, (_, i) =>
      `<i class="${i === index % 8 ? 'on' : ''}"></i>`
    ).join('');
    return `
      <article class="reel-slide" data-id="${r.id}" id="reel-${r.id}">
        ${media}
        <div class="reel-grad"></div>
        <div class="heart-burst">♥</div>
        <div class="reel-progress">${dots}</div>
        <div class="reel-actions">
          <div class="act">
            <button type="button" data-like="${r.id}" aria-label="Like">${svg.like}</button>
            <span data-lc="${r.id}">${r.likes || 0}</span>
          </div>
          <div class="act">
            <button type="button" data-comment="${r.id}" aria-label="Comments">${svg.comment}</button>
            <span data-cc="${r.id}">${r.comments_count || 0}</span>
          </div>
          <div class="act">
            <button type="button" data-save="${r.id}" aria-label="Save">${svg.save}</button>
            <span data-sc="${r.id}">${r.saves || 0}</span>
          </div>
          <div class="act">
            <button type="button" data-copy="${r.id}" aria-label="Share">${svg.share}</button>
            <span>Share</span>
          </div>
        </div>
        <div class="reel-meta">
          <div class="reel-studio">
            <div class="reel-avatar">A</div>
            <strong>Artist's Studio</strong>
          </div>
          <h2>${escape(r.title || 'Reel')}</h2>
          <p>${escape(r.description || r.caption || '')}</p>
          <div class="reel-tag">Studio reel</div>
        </div>
      </article>`;
  }

  function playVisible() {
    const slides = [...feed.querySelectorAll('.reel-slide')];
    const mid = feed.scrollTop + feed.clientHeight / 2;
    slides.forEach((slide) => {
      const video = slide.querySelector('video');
      if (!video) return;
      const top = slide.offsetTop;
      const bottom = top + slide.offsetHeight;
      if (mid >= top && mid <= bottom) {
        video.muted = false;
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
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
          <div class="empty-reels">
            <h3>No reels yet</h3>
            <p>New work will appear here as vertical reels.</p>
            <a href="/portfolio.html">View portfolio</a>
          </div>`;
        return;
      }
      feed.innerHTML = items.map((r, i) => slideHtml(r, i, items.length)).join('');
      playVisible();
      // deep link
      if (location.hash.startsWith('#reel-')) {
        const el = document.getElementById(location.hash.slice(1));
        if (el) el.scrollIntoView();
      }
    } catch (e) {
      feed.innerHTML = `
        <div class="empty-reels">
          <h3>Could not load</h3>
          <p>${escape(e.message || 'Network error')}</p>
          <a href="/reels.html">Retry</a>
        </div>`;
    }
  }

  feed.addEventListener('scroll', () => {
    window.clearTimeout(feed._t);
    feed._t = window.setTimeout(playVisible, 80);
  }, { passive: true });

  feed.addEventListener('click', async (e) => {
    const slide = e.target.closest('.reel-slide');
    // double-tap like
    if (slide && !e.target.closest('button') && !e.target.closest('a')) {
      const now = Date.now();
      if (now - lastTap < 320) {
        const burst = slide.querySelector('.heart-burst');
        if (burst) {
          burst.classList.remove('pop');
          void burst.offsetWidth;
          burst.classList.add('pop');
        }
        const likeBtn = slide.querySelector('[data-like]');
        if (likeBtn) likeBtn.click();
        lastTap = 0;
        return;
      }
      lastTap = now;
      // single tap toggles mute on video
      const video = slide.querySelector('video');
      if (video) {
        video.muted = !video.muted;
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
        const el = document.querySelector('[data-lc="' + like.dataset.like + '"]');
        try {
          const r = await api('/reels/' + like.dataset.like + '/like', { method: 'POST', body: {} });
          like.classList.toggle('liked', !!r.liked);
          if (el) el.textContent = r.likes != null ? r.likes : el.textContent;
        } catch (_) {
          // optimistic UI already toggled; count nudge
          if (el) el.textContent = String((+el.textContent || 0) + (like.classList.contains('liked') ? 1 : -1));
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
        const span = copy.parentElement && copy.parentElement.querySelector('span');
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
    try {
      const data = await api('/reels/' + id + '/comments');
      $('commentList').innerHTML = (data.comments || []).map((c) =>
        `<p><span class="u">@${escape(c.username || 'guest')}</span><br/>${escape(c.body)}</p>`
      ).join('') || '<p style="color:#8a857c">No comments yet</p>';
    } catch {
      $('commentList').innerHTML = '<p style="color:#8a857c">Comments unavailable</p>';
    }
    $('comments').classList.add('open');
  }

  $('closeComments').onclick = () => $('comments').classList.remove('open');
  $('commentForm').onsubmit = async (e) => {
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

  // offline-ish loader message
  window.addEventListener('offline', () => {
    if (!items.length) {
      feed.innerHTML = `<div class="empty-reels"><h3>Offline</h3><p>Reconnect to load reels.</p></div>`;
    }
  });

  load();
})();
