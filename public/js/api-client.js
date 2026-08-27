/** Shared fetch for Artist's Studio — timeout, auth, errors */
(function (global) {
  const API_BASE = '/api/v1';
  const TOKEN_KEY = 'as_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (!(opts.body instanceof FormData) && opts.body != null && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const tok = getToken();
    if (tok) headers.Authorization = 'Bearer ' + tok;

    const ctrl = new AbortController();
    const ms = opts.timeoutMs || 45000;
    const timer = setTimeout(() => ctrl.abort(), ms);

    let res;
    try {
      res = await fetch(API_BASE + path, {
        ...opts,
        headers,
        signal: ctrl.signal,
        body:
          opts.body != null && !(opts.body instanceof FormData) && typeof opts.body === 'object'
            ? JSON.stringify(opts.body)
            : opts.body
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('Request timed out. Check connection and try again.');
      throw new Error('Network error. Check your connection.');
    }
    clearTimeout(timer);

    let data = {};
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch (_) { data = {}; }
    }

    if (res.status === 401) {
      // session expired / invalid — clear identity except on login/register paths
      if (!path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
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
