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

  let activeReelId = null;

  async function load() {
    const data = await api('/reels');
    const feed = $('feed');
    const items = data.items || [];
    if (!items.length) {
      feed.innerHTML = '<div class="empty-reels"><p>No reels yet.</p><p>Admin uploads from gallery in the control app.</p></div>';
      return;
    }
    feed.innerHTML = items.map((r) => {
      const media = (r.media_type === 'video' || (r.url || '').match(/\.mp4|webm/i))
        ? `<video src="${r.url}" loop playsinline muted autoplay></video>`
        : `<img src="${r.url || r.thumb}" alt=""/>`;
      return `<section class="reel-slide" data-id="${r.id}">
        ${media}
        <div class="reel-actions">
          <button type="button" data-like="${r.id}">♥</button><span data-lc="${r.id}">${r.likes || 0}</span>
          <button type="button" data-comment="${r.id}">💬</button><span data-cc="${r.id}">${r.comments_count || 0}</span>
          <button type="button" data-save="${r.id}">bookmark</button><span data-sc="${r.id}">${r.saves || 0}</span>
          <button type="button" data-copy="${r.id}">↗</button><span>Share</span>
        </div>
        <div class="reel-meta"><h2>${escape(r.title || 'Reel')}</h2></div>
      </section>`;
    }).join('');

    // autoplay when visible
    const vids = feed.querySelectorAll('video');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) en.target.play().catch(() => {});
        else en.target.pause();
      });
    }, { threshold: 0.6 });
    vids.forEach((v) => io.observe(v));
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  $('feed').addEventListener('click', async (e) => {
    const like = e.target.closest('[data-like]');
    const save = e.target.closest('[data-save]');
    const comment = e.target.closest('[data-comment]');
    const copy = e.target.closest('[data-copy]');
    try {
      if (like) {
        if (!token()) return alert('Sign in to like');
        const r = await api('/reels/' + like.dataset.like + '/like', { method: 'POST', body: '{}' });
        const el = document.querySelector('[data-lc="' + like.dataset.like + '"]');
        if (el) el.textContent = r.likes;
      }
      if (save) {
        if (!token()) return alert('Sign in to save');
        const r = await api('/reels/' + save.dataset.save + '/save', { method: 'POST', body: '{}' });
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
    const data = await api('/reels/' + id + '/comments');
    $('commentList').innerHTML = (data.comments || []).map((c) =>
      `<p><span class="u">@${escape(c.username)}</span><br/>${escape(c.body)}</p>`
    ).join('') || '<p class="muted">No comments yet</p>';
    $('comments').classList.add('open');
  }

  $('closeComments').onclick = () => $('comments').classList.remove('open');
  $('commentForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!token()) return alert('Sign in to comment');
    if (!activeReelId) return;
    const body = new FormData(e.target).get('body');
    await api('/reels/' + activeReelId + '/comments', { method: 'POST', body: JSON.stringify({ body }) });
    e.target.reset();
    openComments(activeReelId);
    const el = document.querySelector('[data-cc="' + activeReelId + '"]');
    if (el) el.textContent = String((+el.textContent || 0) + 1);
  };

  load().catch(console.error);
})();
