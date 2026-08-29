/**
 * Phase F — GitHub-backed database (Postgres-style folder layout)
 * Repo: Artists studio / Admin + Front · one JSON file per table
 */
const https = require('https');

const REPO = process.env.GITHUB_DB_REPO || 'web-coder-lab/dstabase7837638362826373';
const TOKEN = process.env.GITHUB_DB_TOKEN || process.env.GITHUB_TOKEN || '';
const BRANCH = process.env.GITHUB_DB_BRANCH || 'main';
const ROOT = 'Artists studio';

/** path relative to repo root → key in in-memory db */
const TABLES = {
  'Admin/users/users.json': 'users',
  'Admin/Password login/credentials.json': '_admin_credentials',
  'Admin/sessions/sessions.json': '_sessions',
  'Admin/audit/audit.json': '_audit',
  'Admin/security/settings.json': '_security_settings',
  'Admin/security/locks.json': '_locks',
  'Admin/security/failed_logins.json': '_failed_logins',
  'Admin/notifications/notifications.json': 'admin_notifications',
  'Admin/visitors/visitors.json': 'visitors',
  'Admin/logs/logs.json': 'admin_logs',
  'Admin/contacts/contacts.json': 'contacts',
  'Admin/conversations/conversations.json': 'conversations',
  'Admin/messages/messages.json': 'messages',
  'Admin/media/media.json': 'media',
  'Admin/calls/calls.json': 'calls',
  'Admin/versions/versions.json': 'versions',
  'Front/portfolio/likes.json': 'portfolio_likes',
  'Front/portfolio/saves.json': 'portfolio_saves',
  'Front/reels/likes/likes.json': 'reel_likes',
  'Front/reels/comments/comments.json': 'reel_comments',
  'Front/reels/saves/saves.json': 'reel_saves',
  'Front/site/site.json': 'site',
  'Front/theme/theme.json': 'theme',
  'Front/pages/pages.json': 'pages',
  'Front/portfolio/portfolio.json': 'portfolio',
  'Front/reels/reels.json': 'reels',
  'Front/socials/socials.json': 'socials',
  'Front/policies/privacy.json': '_policy_privacy',
  'Front/policies/terms.json': '_policy_terms',
  'Front/draft/draft.json': 'draft',
  'Front/meta/seq.json': '_seq',
  'Front/meta/published_at.json': '_published_at'
};

let cache = null;
let shaMap = {}; // path → sha
let saveTimer = null;
let dirty = false;

function enabled() {
  return !!(TOKEN && REPO);
}

function ghRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'artists-studio-db',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {})
        }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = { raw: data };
          }
          if (res.statusCode >= 400) {
            const err = new Error(json.message || `GitHub ${res.statusCode}`);
            err.status = res.statusCode;
            err.body = json;
            return reject(err);
          }
          resolve(json);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function contentPath(rel) {
  const full = `${ROOT}/${rel}`.replace(/ /g, '%20');
  return `/repos/${REPO}/contents/${full}?ref=${BRANCH}`;
}

function putPath(rel) {
  const full = `${ROOT}/${rel}`.split('/').map(encodeURIComponent).join('/');
  return `/repos/${REPO}/contents/${full}`;
}

async function readFile(rel) {
  try {
    const j = await ghRequest('GET', contentPath(rel));
    if (!j || !j.content) return { data: null, sha: null };
    const text = Buffer.from(j.content, 'base64').toString('utf8');
    shaMap[rel] = j.sha;
    try {
      return { data: JSON.parse(text), sha: j.sha };
    } catch {
      return { data: null, sha: j.sha };
    }
  } catch (e) {
    if (e.status === 404) return { data: null, sha: null };
    throw e;
  }
}

async function writeFile(rel, obj, message) {
  const content = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
  const body = {
    message: message || `db: update ${rel}`,
    content,
    branch: BRANCH
  };
  if (shaMap[rel]) body.sha = shaMap[rel];
  try {
    const j = await ghRequest('PUT', putPath(rel), body);
    if (j.content && j.content.sha) shaMap[rel] = j.content.sha;
    return j;
  } catch (e) {
    // sha conflict — refetch and retry once
    if (e.status === 409 || e.status === 422) {
      const fresh = await readFile(rel);
      body.sha = fresh.sha;
      const j = await ghRequest('PUT', putPath(rel), body);
      if (j.content && j.content.sha) shaMap[rel] = j.content.sha;
      return j;
    }
    throw e;
  }
}

function defaultSlice() {
  return {
    users: [],
    site: {},
    theme: {},
    pages: {},
    portfolio: [],
    reels: [],
    socials: {},
    policies: {},
    contacts: [],
    conversations: [],
    messages: [],
    media: [],
    calls: [],
    versions: [],
    draft: null,
    published_at: null,
    reel_likes: [],
    reel_comments: [],
    reel_saves: [],
    admin_notifications: [],
    security: { failed_logins: [], sessions: [], audit: [], locks: {} },
    _seq: {
      users: 0,
      contacts: 0,
      conversations: 0,
      messages: 0,
      media: 0,
      portfolio: 0,
      reels: 0,
      calls: 0,
      versions: 0,
      reel_comments: 0
    }
  };
}

function assembleFromFiles(files) {
  const db = defaultSlice();
  for (const [rel, key] of Object.entries(TABLES)) {
    const raw = files[rel];
    if (raw == null) continue;
    if (key === 'users') {
      db.users = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
    } else if (key === 'portfolio' || key === 'reels') {
      db[key] = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
    } else if (key === 'contacts' || key === 'conversations' || key === 'messages' || key === 'media' || key === 'calls' || key === 'versions' || key === 'reel_likes' || key === 'reel_comments' || key === 'reel_saves' || key === 'portfolio_likes' || key === 'portfolio_saves' || key === 'admin_notifications') {
      db[key] = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
    } else if (key === '_sessions') {
      db.security.sessions = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
    } else if (key === '_audit') {
      db.security.audit = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
    } else if (key === '_failed_logins') {
      db.security.failed_logins = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
    } else if (key === '_locks') {
      db.security.locks = raw.locks || raw || {};
    } else if (key === '_security_settings') {
      db.security.settings = raw;
    } else if (key === '_policy_privacy') {
      db.policies = db.policies || {};
      db.policies.privacy = raw;
    } else if (key === '_policy_terms') {
      db.policies = db.policies || {};
      db.policies.terms = raw;
    } else if (key === 'visitors') {
      db.visitors = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw.profiles || raw) : {};
    } else if (key === 'admin_logs') {
      db.admin_logs = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
    } else if (key === '_admin_credentials') {
      db._admin_credentials = raw || null;
    } else if (key === '_seq') {
      db._seq = { ...db._seq, ...(raw || {}) };
    } else if (key === '_published_at') {
      db.published_at = raw.published_at || null;
    } else if (key === 'draft') {
      db.draft = raw && Object.keys(raw).length ? raw : null;
    } else {
      db[key] = raw;
    }
  }
  return db;
}

function disassemble(db) {
  const out = {};
  out['Admin/users/users.json'] = { items: db.users || [] };
  out['Admin/Password login/credentials.json'] = db._admin_credentials || { username: 'admin', password: '', note: 'Set admin password' };
  out['Admin/sessions/sessions.json'] = { items: (db.security && db.security.sessions) || [] };
  out['Admin/audit/audit.json'] = { items: (db.security && db.security.audit) || [] };
  out['Admin/security/settings.json'] = (db.security && db.security.settings) || {
    lock_after_failures: 5,
    lock_minutes: 15
  };
  out['Admin/security/locks.json'] = { locks: (db.security && db.security.locks) || {} };
  out['Admin/security/failed_logins.json'] = { items: (db.security && db.security.failed_logins) || [] };
  out['Admin/notifications/notifications.json'] = { items: db.admin_notifications || [] };
  out['Admin/visitors/visitors.json'] = { profiles: db.visitors || {} };
  out['Admin/logs/logs.json'] = { items: db.admin_logs || [] };
  out['Admin/contacts/contacts.json'] = { items: db.contacts || [] };
  out['Admin/conversations/conversations.json'] = { items: db.conversations || [] };
  out['Admin/messages/messages.json'] = { items: db.messages || [] };
  out['Admin/media/media.json'] = { items: db.media || [] };
  out['Admin/calls/calls.json'] = { items: db.calls || [] };
  out['Admin/versions/versions.json'] = { items: db.versions || [] };
  out['Front/reels/likes/likes.json'] = { items: db.reel_likes || [] };
  out['Front/reels/comments/comments.json'] = { items: db.reel_comments || [] };
  out['Front/reels/saves/saves.json'] = { items: db.reel_saves || [] };
  out['Front/site/site.json'] = db.site || {};
  out['Front/theme/theme.json'] = db.theme || {};
  out['Front/pages/pages.json'] = db.pages || {};
  out['Front/portfolio/portfolio.json'] = { items: db.portfolio || [] };
  out['Front/portfolio/likes.json'] = { items: db.portfolio_likes || [] };
  out['Front/portfolio/saves.json'] = { items: db.portfolio_saves || [] };
  out['Front/reels/reels.json'] = { items: db.reels || [] };
  out['Front/socials/socials.json'] = db.socials || {};
  out['Front/policies/privacy.json'] = (db.policies && db.policies.privacy) || {};
  out['Front/policies/terms.json'] = (db.policies && db.policies.terms) || {};
  out['Front/draft/draft.json'] = db.draft || {};
  out['Front/meta/seq.json'] = db._seq || {};
  out['Front/meta/published_at.json'] = { published_at: db.published_at || null };
  out['Front/meta/published_at.json'] = { published_at: db.published_at || null };
  return out;
}

async function loadAll() {
  const files = {};
  const rels = Object.keys(TABLES);
  // sequential to avoid secondary rate limits burst
  for (const rel of rels) {
    const { data } = await readFile(rel);
    files[rel] = data;
  }
  cache = assembleFromFiles(files);
  return cache;
}

async function saveAll(db, message) {
  cache = db;
  const parts = disassemble(db);
  for (const [rel, obj] of Object.entries(parts)) {
    await writeFile(rel, obj, message || `db: sync ${rel}`);
    // small delay for secondary rate limit
    await new Promise((r) => setTimeout(r, 150));
  }
  dirty = false;
}

function load() {
  if (!cache) throw new Error('GitHub DB not initialized — call init() first');
  return cache;
}

function save(db) {
  cache = db;
  dirty = true;
  // debounce writes — batch rapid API saves
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveAll(cache, 'db: auto-save').catch((e) => console.error('GitHub DB save', e.message));
  }, 800);
}

async function init(seedDb) {
  if (!enabled()) {
    console.warn('GitHub DB disabled — set GITHUB_DB_TOKEN + GITHUB_DB_REPO');
    return false;
  }
  try {
    await loadAll();
    // if empty users, seed from provided default
    if ((!cache.users || !cache.users.length) && seedDb) {
      cache = seedDb;
      await saveAll(cache, 'db: initial seed from app');
    }
    console.log('DB: GitHub', REPO, `(${Object.keys(TABLES).length} tables)`);
    return true;
  } catch (e) {
    console.error('GitHub DB init failed', e.message);
    throw e;
  }
}

async function flush() {
  if (dirty && cache) await saveAll(cache, 'db: flush');
}


async function writeUserAccount(user, chatExtra) {
  if (!enabled()) return;
  const uname = String(user.username || 'user').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const rel = `Admin/users/accounts/${uname}.json`;
  const payload = {
    id: user.id,
    username: user.username,
    name: user.name,
    password_hash: user.password_hash,
    role: user.role,
    status: user.status,
    must_change_password: !!user.must_change_password,
    created_at: user.created_at,
    last_login: user.last_login || null,
    chat: chatExtra || { conversation_id: null, messages: [] }
  };
  await writeFile(rel, payload, `db: user account ${uname}`);
}

async function writeUserChat(username, conversationId, messages) {
  if (!enabled()) return;
  const uname = String(username || 'user').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const rel = `Admin/users/chats/${uname}.json`;
  await writeFile(rel, {
    username,
    conversation_id: conversationId,
    messages: messages || [],
    updated_at: new Date().toISOString()
  }, `db: chat ${uname}`);
}

module.exports = {
  enabled,
  init,
  load,
  save,
  flush,
  loadAll,
  saveAll,
  writeUserAccount,
  writeUserChat,
  REPO,
  TABLES
};
