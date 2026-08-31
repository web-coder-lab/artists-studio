const fs = require('fs');
const githubDb = require('./github-db');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'studio.json');
fs.mkdirSync(dataDir, { recursive: true });

const DATABASE_URL = process.env.DATABASE_URL || '';
let pgPool = null;
let ready = false;
let memoryCache = null;

function defaultDb() {
  return {
    users: [
      {
        id: 1,
        username: 'admin',
        name: 'Studio Admin',
        password_hash: bcrypt.hashSync('admin123', 10),
        role: 'superadmin',
        status: 'active',
        must_change_password: true,
        created_at: new Date().toISOString(),
        last_login: null
      }
    ],
    site: {
      brand: "Artist's Studio",
      tagline: 'Photography · Direction · Craft',
      hero_title: 'A quiet space for work that holds attention.',
      hero_subtitle:
        "Artist's Studio is a private atelier online — portfolio, conversation, and collaboration under one calm roof.",
      profile_name: 'Studio Artist',
      profile_role: 'Photographer & Director',
      profile_bio: 'I make images that feel still and honest — portraits, editorial, and quiet documentary work.',
      about:
        "Artist's Studio began as a small practice and grew into a place for clients and collaborators who value restraint and clarity.",
      services: [
        { title: 'Portrait sessions', body: 'Directed sittings with calm pacing and natural light preference.' },
        { title: 'Editorial / lookbook', body: 'Series work for brands and personal projects.' },
        { title: 'Consultation', body: 'Shot planning, references, and delivery notes.' }
      ]
    },
    theme: {
      accent: '#c4a574',
      background: '#0a0a0b',
      text: '#f4f1ea',
      font_display: 'Cormorant Garamond',
      font_body: 'DM Sans'
    },
    pages: {
      home: { slug: 'home', title: 'Home', published: true },
      about: { slug: 'about', title: 'About', published: true },
      portfolio: { slug: 'portfolio', title: 'Portfolio', published: true },
      reels: { slug: 'reels', title: 'Reels', published: true },
      services: { slug: 'services', title: 'Services', published: true },
      contact: { slug: 'contact', title: 'Contact', published: true }
    },
    portfolio: [],
    reels: [],
    socials: {
      whatsapp: '923244015101',
      email: 'abdullahshah5919@gmail.com',
      instagram: 'https://www.instagram.com/aartistsstudios?igsh=YTllNTA0cXZkOXJj',
      youtube: ''
    },
    policies: {
      privacy: {
        slug: 'privacy',
        title: 'Privacy',
        body: 'We collect only what is needed to run Artist\'s Studio accounts, messages, and optional contact forms.'
      },
      terms: {
        slug: 'terms',
        title: 'Terms',
        body: 'By using Artist\'s Studio you agree to respectful use of messaging and media features.'
      }
    },
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
    security: {
      failed_logins: [],
      sessions: [],
      audit: [],
      locks: {}
    },
    _seq: {
      users: 1,
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

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return defaultDb();
  let changed = false;
  if (!Array.isArray(raw.users)) { raw.users = defaultDb().users; changed = true; }
  if (!raw.site) { raw.site = defaultDb().site; changed = true; }
  if (!raw.theme) { raw.theme = defaultDb().theme; changed = true; }
  if (!raw.pages) { raw.pages = defaultDb().pages; changed = true; }
  if (!Array.isArray(raw.portfolio)) { raw.portfolio = []; changed = true; }
  if (!Array.isArray(raw.reels)) { raw.reels = []; changed = true; }
  if (!raw.socials) { raw.socials = defaultDb().socials; changed = true; }
  if (!raw.policies) { raw.policies = defaultDb().policies; changed = true; }
  if (!Array.isArray(raw.contacts)) { raw.contacts = []; changed = true; }
  if (!Array.isArray(raw.conversations)) { raw.conversations = []; changed = true; }
  if (!Array.isArray(raw.messages)) { raw.messages = []; changed = true; }
  if (!Array.isArray(raw.media)) { raw.media = []; changed = true; }
  if (!Array.isArray(raw.calls)) { raw.calls = []; changed = true; }
  if (!Array.isArray(raw.versions)) { raw.versions = []; changed = true; }
  if (!Array.isArray(raw.reel_likes)) { raw.reel_likes = []; changed = true; }
  if (!Array.isArray(raw.reel_comments)) { raw.reel_comments = []; changed = true; }
  if (!Array.isArray(raw.reel_saves)) { raw.reel_saves = []; changed = true; }
  if (!raw.security) {
    raw.security = { failed_logins: [], sessions: [], audit: [], locks: {} };
    changed = true;
  }
  if (!raw.security.failed_logins) raw.security.failed_logins = [];
  if (!raw.security.sessions) raw.security.sessions = [];
  if (!raw.security.audit) raw.security.audit = [];
  if (!raw.security.locks) raw.security.locks = {};
  if (!raw._seq) raw._seq = defaultDb()._seq;
  // ensure admin has must_change_password flag if missing (legacy)
  raw.users.forEach((u) => {
    if (u.role === 'superadmin' && u.must_change_password === undefined) {
      // don't force existing if already logged in production; only new seeds
      u.must_change_password = false;
    }
  });
  return { data: raw, changed };
}

async function initPg() {
  if (!DATABASE_URL) return false;
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') || process.env.PGSSL === '1'
      ? { rejectUnauthorized: false }
      : undefined
  });
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS studio_store (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const r = await pgPool.query('SELECT data FROM studio_store WHERE id = 1');
  if (!r.rows.length) {
    const d = defaultDb();
    await pgPool.query(
      'INSERT INTO studio_store (id, data) VALUES (1, $1::jsonb)',
      [JSON.stringify(d)]
    );
    memoryCache = d;
  } else {
    const { data } = normalize(r.rows[0].data);
    memoryCache = data;
  }
  ready = true;
  console.log('DB: PostgreSQL connected (persistent)');
  return true;
}

function loadFile() {
  if (!fs.existsSync(dbFile)) {
    const d = defaultDb();
    saveFile(d);
    return d;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    const { data, changed } = normalize(raw);
    if (changed) saveFile(data);
    return data;
  } catch (e) {
    console.error('DB file corrupt, reseeding', e.message);
    const d = defaultDb();
    saveFile(d);
    return d;
  }
}

function saveFile(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

function load() {
  if (githubDb.enabled() && ready) {
    try {
      return githubDb.load();
    } catch (e) {
      console.error('github load', e.message);
    }
  }
  if (pgPool && memoryCache) {
    return memoryCache;
  }
  return loadFile();
}

function save(db) {
  if (githubDb.enabled() && ready) {
    try {
      githubDb.save(db);
      return;
    } catch (e) {
      console.error('github save', e.message);
    }
  }
  memoryCache = db;
  if (pgPool) {
    pgPool
      .query(
        `INSERT INTO studio_store (id, data, updated_at) VALUES (1, $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [JSON.stringify(db)]
      )
      .catch((e) => console.error('PG save error', e.message));
    return;
  }
  saveFile(db);
}

async function init() {
  // Phase F: GitHub is primary when configured
  if (githubDb.enabled()) {
    try {
      await githubDb.init(defaultDb());
      memoryCache = null; // use github load()
      ready = true;
      // keep optional PG as mirror later — not required
      return;
    } catch (e) {
      console.error('GitHub DB failed, falling back:', e.message);
    }
  }
  try {
    if (DATABASE_URL) {
      await initPg();
      return;
    }
  } catch (e) {
    console.error('PG init failed, falling back to file:', e.message);
    pgPool = null;
  }
  memoryCache = loadFile();
  ready = true;
  console.log('DB: file store', dbFile);
}

function exportPublicSafe(db) {
  const copy = JSON.parse(JSON.stringify(db || {}));
  // Phase 5 — never expose secrets on "safe" export / accidental public use
  if (Array.isArray(copy.users)) {
    copy.users = copy.users.map((u) => {
      if (!u || typeof u !== 'object') return u;
      const { password_hash, ...rest } = u;
      return rest;
    });
  }
  if (copy._admin_credentials) {
    copy._admin_credentials = {
      username: copy._admin_credentials.username || 'admin',
      password: '[redacted]',
      note: copy._admin_credentials.note || ''
    };
  }
  if (copy.security) {
    if (copy.security.sessions) {
      copy.security.sessions = (copy.security.sessions || []).map((s) => ({
        id: s.id,
        username: s.username,
        created_at: s.created_at,
        ip: s.ip
      }));
    }
  }
  delete copy.jwt_secret;
  return copy;
}

/** Full backup for admin only (includes hashes — protect with admin key) */
function exportFullBackup(db) {
  return JSON.parse(JSON.stringify(db || {}));
}

module.exports = { load, save, init, defaultDb, exportPublicSafe, exportFullBackup, githubDb };
