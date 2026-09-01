/** Shared fetch — cookies + localStorage session */
(function (global) {
  const API_BASE = '/api/v1';
  const TOKEN_KEY = 'as_token';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
  }
  function setToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (!(opts.body instanceof FormData) && opts.body != null && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const tok = getToken();
    if (tok) headers.Authorization = 'Bearer ' + tok;

    const method = String(opts.method || 'GET').toUpperCase();
    const maxAttempts = opts.retry === false ? 1 : (method === 'GET' ? 2 : 1);
    let res;
    let lastNetErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ctrl = new AbortController();
      const ms = opts.timeoutMs || 45000;
      const timer = setTimeout(() => ctrl.abort(), ms);
      try {
        res = await fetch(API_BASE + path, {
          ...opts,
          headers,
          credentials: 'include',
          signal: ctrl.signal,
          body:
            opts.body != null && !(opts.body instanceof FormData) && typeof opts.body === 'object'
              ? JSON.stringify(opts.body)
              : opts.body
        });
        clearTimeout(timer);
        lastNetErr = null;
        break;
      } catch (e) {
        clearTimeout(timer);
        lastNetErr = e;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
      }
    }
    if (lastNetErr) {
      if (lastNetErr.name === 'AbortError') throw new Error('Request timed out. Check connection and try again.');
      throw new Error('Network error. Check your connection.');
    }

    let data = {};
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch (_) { data = {}; }
    }

    // restore token from /auth/me when cookie session exists
    if (data.token && path.indexOf('/auth/') === 0) {
      setToken(data.token);
    }

    if (res.status === 401) {
      if (!path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
        // only clear on definitive auth failure, not network
        setToken(null);
      }
      const err = new Error(data.error || 'Unauthorized');
      err.status = 401;
      err.auth = true;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  global.StudioAPI = { API_BASE, TOKEN_KEY, getToken, setToken, api };
})(window);
