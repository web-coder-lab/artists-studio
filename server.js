const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { load, save } = require('./db');
const sec = require('./security');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'artists-studio-phase1-dev-secret-change-me';
const ROOT = __dirname;

const app = express();
app.use(sec.securityHeaders);
// block easy admin URLs before static
app.use((req, res, next) => {
  const p = (req.path || '').toLowerCase();
  if (p === '/admin' || p === '/admin/' || p === '/admin.html' || p === '/_panel.html') {
    return res.status(404).send('Not found');
  }
  next();
});
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/media/public', express.static(path.join(__dirname, 'uploads', 'public')));

const uploadPrivateDir = path.join(ROOT, 'uploads', 'private');
const uploadPublicDir = path.join(ROOT, 'uploads', 'public');
fs.mkdirSync(uploadPrivateDir, { recursive: true });
fs.mkdirSync(uploadPublicDir, { recursive: true });

const privateStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadPrivateDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '-' + safe);
  }
});

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]);

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.has(file.mimetype) || /\.(jpe?g|png|webp|gif|mp4|webm|pdf|docx?|txt)$/i.test(file.originalname)) {
    cb(null, true);
  } else cb(new Error('File type not allowed'));
}

const publicStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadPublicDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '-' + safe);
  }
});
const uploadPublic = multer({
  storage: publicStorage,
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  fileFilter
});
const uploadChat = multer({
  storage: privateStorage,
  limits: { fileSize: 40 * 1024 * 1024, files: 1 },
  fileFilter
});



const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contact submissions. Try later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' }
});

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = load();
    const user = db.users.find((u) => u.id === payload.sub);
    if (user && user.status === 'active') req.user = user;
  } catch (_) {}
  next();
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = load();
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}


function adminOnly(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
    return res.status(403).json({ error: 'Admin only' });
  }
  if (!sec.ipAllowed(req)) {
    sec.audit(load(), { action: 'admin_ip_blocked', ip: sec.clientIp(req), path: req.path });
    return res.status(403).json({ error: 'IP not allowed' });
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.user || !['admin', 'superadmin', 'moderator'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Staff only' });
  }
  if (!sec.ipAllowed(req)) {
    return res.status(403).json({ error: 'IP not allowed' });
  }
  next();
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    status: u.status,
    created_at: u.created_at,
    last_login: u.last_login
  };
}

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', service: 'artists-studio', phase: 11 });
});

// ——— Public CMS ———
app.get('/api/v1/site', auth, (req, res) => {
  const db = load();
  res.json({ site: db.site, pages: db.pages, theme: db.theme || {} });
});

app.get('/api/v1/pages/:slug', auth, (req, res) => {
  const db = load();
  const page = db.pages[req.params.slug];
  if (!page || !page.published) return res.status(404).json({ error: 'Page not found' });
  res.json({ page, site: db.site });
});

app.get('/api/v1/portfolio', auth, (req, res) => {
  const db = load();
  res.json({ items: db.portfolio || [] });
});

app.get('/api/v1/reels', auth, (req, res) => {
  const db = load();
  const items = (db.reels || []).map((r) => {
    const likes = (db.reel_likes || []).filter((x) => x.reel_id === r.id).length;
    const saves = (db.reel_saves || []).filter((x) => x.reel_id === r.id).length;
    const comments_count = (db.reel_comments || []).filter((x) => x.reel_id === r.id).length;
    let liked = false, saved = false;
    if (req.user) {
      liked = (db.reel_likes || []).some((x) => x.reel_id === r.id && x.user_id === req.user.id);
      saved = (db.reel_saves || []).some((x) => x.reel_id === r.id && x.user_id === req.user.id);
    }
    return { ...r, likes, saves, comments_count, liked, saved };
  });
  res.json({ items });
});

app.get('/api/v1/socials', auth, (req, res) => {
  const db = load();
  res.json({ socials: db.socials || {} });
});

app.get('/api/v1/policies/:slug', auth, (req, res) => {
  const db = load();
  const pol = (db.policies || {})[req.params.slug];
  if (!pol) return res.status(404).json({ error: 'Policy not found' });
  res.json({ policy: { slug: req.params.slug, ...pol } });
});

app.get('/api/v1/policies', auth, (req, res) => {
  const db = load();
  res.json({ policies: db.policies || {} });
});

// WhatsApp prefill helper (client can also build this; API documents contract)
app.get('/api/v1/whatsapp-prefill', authOptional, (req, res) => {
  const db = load();
  const number = String(db.socials?.whatsapp || '').replace(/\D/g, '');
  let username = 'Guest';
  let name = 'Guest';
  if (req.user) {
    username = req.user.username;
    name = req.user.name;
  }
  const text =
    `Username: @${username}\nName: ${name}\n\n`;
  const url = number
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : null;
  res.json({
    number,
    username,
    name,
    text,
    url,
    warning: 'Please don’t remove Name / Username'
  });
});


// ——— Contact form (Phase 3) ———
app.post('/api/v1/contact', contactLimiter, authOptional, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!message || message.length < 5) {
    return res.status(400).json({ error: 'Message is required (min 5 characters)' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message too long' });
  }
  const db = load();
  if (!Array.isArray(db.contacts)) db.contacts = [];
  if (db._seq.contacts == null) db._seq.contacts = db.contacts.length;
  const id = ++db._seq.contacts;
  const entry = {
    id,
    name,
    username: req.user ? req.user.username : (String(req.body?.username || '').trim() || null),
    user_id: req.user ? req.user.id : null,
    email: email || null,
    phone: phone || null,
    message,
    status: 'new',
    created_at: new Date().toISOString(),
    read_at: null
  };
  db.contacts.unshift(entry);
  save(db);
  res.status(201).json({ id: entry.id, status: entry.status });
});

app.get('/api/v1/admin/contacts', auth, adminOnly, (req, res) => {
  const db = load();
  let list = Array.isArray(db.contacts) ? db.contacts.slice() : [];
  const status = req.query.status;
  if (status) list = list.filter((c) => c.status === status);
  res.json({
    items: list,
    unread: list.filter((c) => c.status === 'new').length
  });
});

app.get('/api/v1/admin/contacts/:id', auth, adminOnly, (req, res) => {
  const db = load();
  const item = (db.contacts || []).find((c) => c.id === +req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
});

app.patch('/api/v1/admin/contacts/:id', auth, adminOnly, (req, res) => {
  const db = load();
  const item = (db.contacts || []).find((c) => c.id === +req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const status = String(req.body?.status || '').trim();
  const allowed = ['new', 'read', 'replied', 'closed'];
  if (status && allowed.includes(status)) {
    item.status = status;
    if (status === 'read' && !item.read_at) item.read_at = new Date().toISOString();
  }
  save(db);
  res.json({ item });
});

// ——— Auth (Phase 1) ———
app.post('/api/v1/auth/register', authLimiter, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !name || !password) {
    return res.status(400).json({ error: 'Username, name and password are required' });
  }
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ error: 'Username: 3–24 letters, numbers, underscore' });
  }
  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: 'Name must be 2–60 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = load();
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const id = ++db._seq.users;
  const user = {
    id,
    username,
    name,
    password_hash: bcrypt.hashSync(password, 10),
    role: 'user',
    status: 'active',
    created_at: new Date().toISOString(),
    last_login: null
  };
  db.users.push(user);
  save(db);

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/v1/auth/login', authLimiter, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const db = load();
  const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  const ip = sec.clientIp(req);
  if (sec.isLocked(db, username)) {
    return res.status(429).json({ error: 'Account temporarily locked. Try later.' });
  }
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    sec.recordFailedLogin(db, username, ip);
    sec.audit(db, { action: 'login_failed', username, ip });
    save(db);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Account disabled' });
  }
  sec.clearFailed(db, username);
  user.last_login = new Date().toISOString();
  const sid = sec.createSession(db, user, ip, req.headers['user-agent']);
  sec.audit(db, { action: 'login_ok', username: user.username, role: user.role, ip });
  save(db);
  res.json({ token: signToken(user), session_id: sid, user: publicUser(user) });
});

app.get('/api/v1/auth/me', auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/v1/auth/logout', auth, (_req, res) => {
  res.json({ ok: true });
});


// ——— Messaging / Contact Artist (Phase 4) ———
function ensureChatSeq(db) {
  if (!Array.isArray(db.conversations)) db.conversations = [];
  if (!Array.isArray(db.messages)) db.messages = [];
  if (db._seq.conversations == null) db._seq.conversations = db.conversations.length;
  if (db._seq.messages == null) db._seq.messages = db.messages.length;
}

function getOrCreateUserConversation(db, user) {
  ensureChatSeq(db);
  let conv = db.conversations.find((c) => c.user_id === user.id && c.type === 'artist');
  if (!conv) {
    const id = ++db._seq.conversations;
    conv = {
      id,
      type: 'artist',
      user_id: user.id,
      username: user.username,
      name: user.name,
      last_message: null,
      last_at: null,
      user_unread: 0,
      admin_unread: 0,
      created_at: new Date().toISOString()
    };
    db.conversations.push(conv);
  }
  return conv;
}

function publicMessage(m) {
  const out = {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_role: m.sender_role,
    sender_id: m.sender_id,
    sender_name: m.sender_name,
    body: m.body,
    status: m.status,
    created_at: m.created_at,
    attachment: null
  };
  if (m.attachment) {
    out.attachment = {
      id: m.attachment.id,
      name: m.attachment.name,
      mime: m.attachment.mime,
      size: m.attachment.size,
      kind: m.attachment.kind,
      url: '/api/v1/media/private/' + m.attachment.id
    };
  }
  return out;
}

function attachmentKind(mime, name) {
  if ((mime || '').startsWith('image/')) return 'image';
  if ((mime || '').startsWith('video/')) return 'video';
  return 'file';
}


// User: ensure conversation + list (single artist thread)
app.get('/api/v1/conversations', auth, (req, res) => {
  const db = load();
  if (req.user.role === 'admin') {
    ensureChatSeq(db);
    const items = db.conversations
      .slice()
      .sort((a, b) => String(b.last_at || b.created_at).localeCompare(String(a.last_at || a.created_at)))
      .map((c) => ({
        id: c.id,
        type: c.type,
        user_id: c.user_id,
        username: c.username,
        name: c.name,
        last_message: c.last_message,
        last_at: c.last_at,
        unread: c.admin_unread || 0
      }));
    const unread = items.reduce((n, x) => n + (x.unread || 0), 0);
    return res.json({ items, unread });
  }
  const conv = getOrCreateUserConversation(db, req.user);
  save(db);
  res.json({
    items: [{
      id: conv.id,
      type: conv.type,
      title: "Artist's Studio",
      last_message: conv.last_message,
      last_at: conv.last_at,
      unread: conv.user_unread || 0
    }]
  });
});

app.get('/api/v1/conversations/:id/messages', auth, (req, res) => {
  const db = load();
  ensureChatSeq(db);
  const id = +req.params.id;
  const conv = db.conversations.find((c) => c.id === id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  if (req.user.role !== 'admin' && conv.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const msgs = db.messages
    .filter((m) => m.conversation_id === id)
    .sort((a, b) => a.id - b.id)
    .map(publicMessage);
  // mark read for viewer
  if (req.user.role === 'admin') {
    conv.admin_unread = 0;
    db.messages.forEach((m) => {
      if (m.conversation_id === id && m.sender_role === 'user' && m.status !== 'read') m.status = 'read';
    });
  } else {
    conv.user_unread = 0;
    db.messages.forEach((m) => {
      if (m.conversation_id === id && m.sender_role === 'admin' && m.status !== 'read') m.status = 'read';
    });
  }
  save(db);
  res.json({
    conversation: {
      id: conv.id,
      name: conv.name,
      username: conv.username,
      title: req.user.role === 'admin' ? (conv.name || conv.username) : "Artist's Studio"
    },
    messages: msgs
  });
});

app.post('/api/v1/conversations/:id/messages', auth, (req, res, next) => {
  uploadChat.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, (req, res) => {
  const body = String(req.body?.body || '').trim();
  const hasFile = !!req.file;
  if (!body && !hasFile) return res.status(400).json({ error: 'Message or file required' });
  if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });
  const db = load();
  ensureChatSeq(db);
  if (!db.media) db.media = [];
  if (db._seq.media == null) db._seq.media = db.media.length;
  const id = +req.params.id;
  let conv = db.conversations.find((c) => c.id === id);
  if (!conv && req.user.role !== 'admin') {
    conv = getOrCreateUserConversation(db, req.user);
  }
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  if (req.user.role !== 'admin' && conv.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  let attachment = null;
  if (hasFile) {
    const midMedia = ++db._seq.media;
    attachment = {
      id: midMedia,
      name: req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120),
      mime: req.file.mimetype,
      size: req.file.size,
      kind: attachmentKind(req.file.mimetype, req.file.originalname),
      storage: req.file.filename,
      owner_id: req.user.id,
      conversation_id: conv.id,
      visibility: 'private',
      created_at: new Date().toISOString()
    };
    db.media.push(attachment);
  }
  const mid = ++db._seq.messages;
  const preview = body || (attachment ? ('📎 ' + attachment.name) : '');
  const msg = {
    id: mid,
    conversation_id: conv.id,
    sender_role: req.user.role === 'admin' ? 'admin' : 'user',
    sender_id: req.user.id,
    sender_name: req.user.name,
    body: body || '',
    attachment: attachment ? {
      id: attachment.id,
      name: attachment.name,
      mime: attachment.mime,
      size: attachment.size,
      kind: attachment.kind
    } : null,
    status: 'sent',
    created_at: new Date().toISOString()
  };
  db.messages.push(msg);
  conv.last_message = preview.length > 80 ? preview.slice(0, 80) + '…' : preview;
  conv.last_at = msg.created_at;
  if (msg.sender_role === 'user') conv.admin_unread = (conv.admin_unread || 0) + 1;
  else conv.user_unread = (conv.user_unread || 0) + 1;
  if (msg.sender_role === 'user') {
    conv.name = req.user.name;
    conv.username = req.user.username;
  }
  save(db);
  try { notifyNewMessage(conv, msg); } catch (e) { console.error('ws notify', e.message); }
  res.status(201).json({ message: publicMessage(msg) });
});



// ——— Admin remote CMS + publish (Phases 8–9) ———
function snapshotConfig(db) {
  return {
    site: db.site,
    theme: db.theme,
    socials: db.socials,
    portfolio: db.portfolio,
    reels: db.reels,
    policies: db.policies,
    pages: db.pages
  };
}

function applyConfig(db, cfg) {
  if (!cfg) return;
  if (cfg.site) db.site = cfg.site;
  if (cfg.theme) db.theme = cfg.theme;
  if (cfg.socials) db.socials = cfg.socials;
  if (cfg.portfolio) db.portfolio = cfg.portfolio;
  if (cfg.reels) db.reels = cfg.reels;
  if (cfg.policies) db.policies = cfg.policies;
  if (cfg.pages) db.pages = cfg.pages;
}

app.get('/api/v1/admin/dashboard', auth, adminOnly, (req, res) => {
  const db = load();
  res.json({
    users: (db.users || []).filter((u) => u.role !== 'admin').length,
    contacts_new: (db.contacts || []).filter((c) => c.status === 'new').length,
    conversations: (db.conversations || []).length,
    chat_unread: (db.conversations || []).reduce((n, c) => n + (c.admin_unread || 0), 0),
    portfolio: (db.portfolio || []).length,
    reels: (db.reels || []).length,
    versions: (db.versions || []).length,
    published_at: db.published_at || null,
    has_draft: !!db.draft
  });
});

app.get('/api/v1/admin/site', auth, adminOnly, (req, res) => {
  const db = load();
  res.json({ site: db.site, theme: db.theme || {}, pages: db.pages });
});

app.put('/api/v1/admin/site', auth, adminOnly, (req, res) => {
  const db = load();
  const body = req.body || {};
  if (body.site && typeof body.site === 'object') {
    db.site = Object.assign({}, db.site, body.site);
  }
  if (body.theme && typeof body.theme === 'object') {
    db.theme = Object.assign({}, db.theme || {}, body.theme);
  }
  if (body.pages && typeof body.pages === 'object') {
    db.pages = Object.assign({}, db.pages, body.pages);
  }
  // keep working copy as draft until publish
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ site: db.site, theme: db.theme, pages: db.pages, draft: true });
});

app.get('/api/v1/admin/socials', auth, adminOnly, (req, res) => {
  res.json({ socials: load().socials });
});

app.put('/api/v1/admin/socials', auth, adminOnly, (req, res) => {
  const db = load();
  const s = req.body?.socials || req.body || {};
  db.socials = Object.assign({}, db.socials, {
    whatsapp: s.whatsapp != null ? String(s.whatsapp).replace(/\D/g, '') : db.socials.whatsapp,
    email: s.email != null ? String(s.email).trim() : db.socials.email,
    instagram: s.instagram != null ? String(s.instagram).trim() : db.socials.instagram,
    youtube: s.youtube != null ? String(s.youtube).trim() : db.socials.youtube
  });
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ socials: db.socials });
});

app.put('/api/v1/admin/policies/:slug', auth, adminOnly, (req, res) => {
  const db = load();
  const slug = req.params.slug;
  if (!db.policies[slug]) return res.status(404).json({ error: 'Unknown policy' });
  const title = req.body?.title;
  const body = req.body?.body;
  if (title != null) db.policies[slug].title = String(title);
  if (body != null) db.policies[slug].body = String(body);
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ policy: { slug, ...db.policies[slug] } });
});

app.post('/api/v1/admin/portfolio', auth, adminOnly, (req, res) => {
  const db = load();
  if (db._seq.portfolio == null) db._seq.portfolio = (db.portfolio || []).length;
  const id = ++db._seq.portfolio;
  const item = {
    id,
    title: String(req.body?.title || 'Untitled').trim(),
    category: String(req.body?.category || '').trim(),
    image: String(req.body?.image || '').trim(),
    caption: String(req.body?.caption || '').trim()
  };
  db.portfolio.push(item);
  db.draft = snapshotConfig(db);
  save(db);
  res.status(201).json({ item });
});

app.patch('/api/v1/admin/portfolio/:id', auth, adminOnly, (req, res) => {
  const db = load();
  const item = (db.portfolio || []).find((x) => x.id === +req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  ['title', 'category', 'image', 'caption'].forEach((k) => {
    if (req.body?.[k] != null) item[k] = String(req.body[k]);
  });
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ item });
});

app.delete('/api/v1/admin/portfolio/:id', auth, adminOnly, (req, res) => {
  const db = load();
  db.portfolio = (db.portfolio || []).filter((x) => x.id !== +req.params.id);
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ ok: true });
});

app.post('/api/v1/admin/reels', auth, adminOnly, (req, res) => {
  const db = load();
  if (db._seq.reels == null) db._seq.reels = (db.reels || []).length;
  const id = ++db._seq.reels;
  const item = {
    id,
    title: String(req.body?.title || 'Reel').trim(),
    thumb: String(req.body?.thumb || '').trim(),
    url: String(req.body?.url || '#').trim()
  };
  db.reels.push(item);
  db.draft = snapshotConfig(db);
  save(db);
  res.status(201).json({ item });
});

app.delete('/api/v1/admin/reels/:id', auth, adminOnly, (req, res) => {
  const db = load();
  db.reels = (db.reels || []).filter((x) => x.id !== +req.params.id);
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ ok: true });
});

app.get('/api/v1/admin/users', auth, adminOnly, (req, res) => {
  const db = load();
  const items = (db.users || [])
    .filter((u) => u.role !== 'admin')
    .map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      status: u.status,
      created_at: u.created_at,
      last_login: u.last_login
    }));
  res.json({ items });
});

app.patch('/api/v1/admin/users/:id', auth, adminOnly, (req, res) => {
  const db = load();
  const user = db.users.find((u) => u.id === +req.params.id);
  if (!user || user.role === 'admin') return res.status(404).json({ error: 'Not found' });
  const status = String(req.body?.status || '');
  if (['active', 'disabled'].includes(status)) user.status = status;
  save(db);
  res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      status: user.status
    }
  });
});

// Publish pipeline
app.post('/api/v1/admin/publish', auth, adminOnly, (req, res) => {
  const db = load();
  if (!Array.isArray(db.versions)) db.versions = [];
  if (db._seq.versions == null) db._seq.versions = db.versions.length;
  const snap = snapshotConfig(db);
  const id = ++db._seq.versions;
  const version = {
    id,
    label: 'v' + id,
    note: String(req.body?.note || '').trim(),
    created_at: new Date().toISOString(),
    config: snap
  };
  db.versions.push(version);
  db.draft = null;
  db.published_at = version.created_at;
  // live config is already db fields
  save(db);
  res.json({ version: { id: version.id, label: version.label, created_at: version.created_at, note: version.note } });
});

app.get('/api/v1/admin/versions', auth, adminOnly, (req, res) => {
  const db = load();
  const items = (db.versions || [])
    .slice()
    .reverse()
    .map((v) => ({ id: v.id, label: v.label, note: v.note, created_at: v.created_at }));
  res.json({ items, published_at: db.published_at || null, has_draft: !!db.draft });
});

app.post('/api/v1/admin/versions/:id/restore', auth, adminOnly, (req, res) => {
  const db = load();
  const v = (db.versions || []).find((x) => x.id === +req.params.id);
  if (!v || !v.config) return res.status(404).json({ error: 'Version not found' });
  applyConfig(db, v.config);
  db.draft = null;
  db.published_at = new Date().toISOString();
  save(db);
  res.json({ ok: true, restored: v.label, site: db.site, socials: db.socials });
});

app.get('/api/v1/admin/preview', auth, adminOnly, (req, res) => {
  const db = load();
  const cfg = db.draft || snapshotConfig(db);
  res.json({ preview: cfg, is_draft: !!db.draft });
});



// ——— Gallery uploads (no external URL required) Phase 10 ———
app.post('/api/v1/admin/portfolio/upload', auth, adminOnly, (req, res, next) => {
  uploadPublic.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image file required' });
  const db = load();
  if (db._seq.portfolio == null) db._seq.portfolio = (db.portfolio || []).length;
  const id = ++db._seq.portfolio;
  const item = {
    id,
    title: String(req.body?.title || 'Untitled').trim(),
    category: String(req.body?.category || '').trim(),
    image: '/media/public/' + req.file.filename,
    caption: String(req.body?.caption || '').trim(),
    source: 'gallery'
  };
  db.portfolio = db.portfolio || [];
  db.portfolio.push(item);
  db.draft = typeof snapshotConfig === 'function' ? snapshotConfig(db) : db.draft;
  save(db);
  res.status(201).json({ item });
});

app.post('/api/v1/admin/reels/upload', auth, adminOnly, (req, res, next) => {
  uploadPublic.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Video/image file required' });
  const db = load();
  if (db._seq.reels == null) db._seq.reels = (db.reels || []).length;
  const id = ++db._seq.reels;
  const isVideo = (req.file.mimetype || '').startsWith('video/');
  const item = {
    id,
    title: String(req.body?.title || 'Reel').trim(),
    thumb: isVideo ? '' : '/media/public/' + req.file.filename,
    url: '/media/public/' + req.file.filename,
    media_type: isVideo ? 'video' : 'image',
    likes: 0,
    saves: 0,
    comments_count: 0,
    source: 'gallery',
    created_at: new Date().toISOString()
  };
  db.reels = db.reels || [];
  db.reels.push(item);
  db.draft = typeof snapshotConfig === 'function' ? snapshotConfig(db) : db.draft;
  save(db);
  res.status(201).json({ item });
});

// Reels engagement
app.get('/api/v1/reels/:id', authOptional, (req, res) => {
  const db = load();
  const item = (db.reels || []).find((r) => r.id === +req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const comments = (db.reel_comments || []).filter((c) => c.reel_id === item.id);
  let liked = false, saved = false;
  if (req.user) {
    liked = (db.reel_likes || []).some((x) => x.reel_id === item.id && x.user_id === req.user.id);
    saved = (db.reel_saves || []).some((x) => x.reel_id === item.id && x.user_id === req.user.id);
  }
  res.json({
    item: {
      ...item,
      likes: (db.reel_likes || []).filter((x) => x.reel_id === item.id).length,
      saves: (db.reel_saves || []).filter((x) => x.reel_id === item.id).length,
      comments_count: comments.length,
      liked,
      saved
    },
    comments
  });
});

app.post('/api/v1/reels/:id/like', auth, (req, res) => {
  const db = load();
  const id = +req.params.id;
  if (!(db.reels || []).some((r) => r.id === id)) return res.status(404).json({ error: 'Not found' });
  db.reel_likes = db.reel_likes || [];
  const i = db.reel_likes.findIndex((x) => x.reel_id === id && x.user_id === req.user.id);
  let liked;
  if (i >= 0) { db.reel_likes.splice(i, 1); liked = false; }
  else { db.reel_likes.push({ reel_id: id, user_id: req.user.id, at: new Date().toISOString() }); liked = true; }
  save(db);
  const likes = db.reel_likes.filter((x) => x.reel_id === id).length;
  res.json({ liked, likes });
});

app.post('/api/v1/reels/:id/save', auth, (req, res) => {
  const db = load();
  const id = +req.params.id;
  if (!(db.reels || []).some((r) => r.id === id)) return res.status(404).json({ error: 'Not found' });
  db.reel_saves = db.reel_saves || [];
  const i = db.reel_saves.findIndex((x) => x.reel_id === id && x.user_id === req.user.id);
  let saved;
  if (i >= 0) { db.reel_saves.splice(i, 1); saved = false; }
  else { db.reel_saves.push({ reel_id: id, user_id: req.user.id, at: new Date().toISOString() }); saved = true; }
  save(db);
  res.json({ saved, saves: db.reel_saves.filter((x) => x.reel_id === id).length });
});

app.post('/api/v1/reels/:id/comments', auth, (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comment required' });
  const db = load();
  const id = +req.params.id;
  if (!(db.reels || []).some((r) => r.id === id)) return res.status(404).json({ error: 'Not found' });
  db.reel_comments = db.reel_comments || [];
  if (db._seq.reel_comments == null) db._seq.reel_comments = db.reel_comments.length;
  const c = {
    id: ++db._seq.reel_comments,
    reel_id: id,
    user_id: req.user.id,
    username: req.user.username,
    name: req.user.name,
    body,
    created_at: new Date().toISOString()
  };
  db.reel_comments.push(c);
  save(db);
  res.status(201).json({ comment: c });
});

app.get('/api/v1/reels/:id/comments', (req, res) => {
  const db = load();
  const id = +req.params.id;
  const comments = (db.reel_comments || []).filter((c) => c.reel_id === id);
  res.json({ comments });
});



// ——— Phase 11 Security ———
app.get('/api/v1/admin/security/dashboard', auth, adminOnly, (req, res) => {
  const db = load();
  const s = sec.ensureSecurity(db);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const failed24 = s.failed_logins.filter((f) => new Date(f.at).getTime() > since).length;
  res.json({
    failed_logins_24h: failed24,
    active_sessions: s.sessions.length,
    locked_accounts: Object.keys(s.locks || {}).length,
    audit_count: s.audit.length,
    recent_audit: s.audit.slice(0, 30),
    recent_failed: s.failed_logins.slice(0, 20),
    sessions: s.sessions.slice(0, 30),
    admin_ips_configured: sec.ADMIN_IPS.length > 0,
    your_ip: sec.clientIp(req)
  });
});

app.post('/api/v1/admin/security/sessions/:id/revoke', auth, adminOnly, (req, res) => {
  const db = load();
  sec.revokeSession(db, req.params.id);
  sec.audit(db, { action: 'session_revoked', session_id: req.params.id, by: req.user.username, ip: sec.clientIp(req) });
  save(db);
  res.json({ ok: true });
});

app.post('/api/v1/admin/security/sessions/revoke-all', auth, adminOnly, (req, res) => {
  const db = load();
  const s = sec.ensureSecurity(db);
  const n = s.sessions.length;
  s.sessions = [];
  sec.audit(db, { action: 'sessions_revoke_all', by: req.user.username, count: n, ip: sec.clientIp(req) });
  save(db);
  res.json({ ok: true, revoked: n });
});

app.get('/api/v1/admin/security/audit', auth, adminOnly, (req, res) => {
  const db = load();
  const s = sec.ensureSecurity(db);
  res.json({ items: s.audit.slice(0, 100) });
});


// ——— Calls (Phase 7) ———
function ensureCalls(db) {
  if (!Array.isArray(db.calls)) db.calls = [];
  if (db._seq.calls == null) db._seq.calls = db.calls.length;
}

function publicCall(c) {
  return {
    id: c.id,
    conversation_id: c.conversation_id,
    mode: c.mode,
    status: c.status,
    from_user_id: c.from_user_id,
    from_name: c.from_name,
    from_username: c.from_username,
    created_at: c.created_at,
    answered_at: c.answered_at || null,
    ended_at: c.ended_at || null
  };
}

app.post('/api/v1/calls', auth, (req, res) => {
  if (req.user.role === 'admin') {
    return res.status(400).json({ error: 'Admin receives calls; user initiates' });
  }
  const mode = String(req.body?.mode || 'voice').toLowerCase();
  if (!['voice', 'video'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be voice or video' });
  }
  const db = load();
  ensureCalls(db);
  const conv = getOrCreateUserConversation(db, req.user);
  // end any ringing/active call for this user
  db.calls.forEach((c) => {
    if (c.from_user_id === req.user.id && ['ringing', 'active'].includes(c.status)) {
      c.status = 'ended';
      c.ended_at = new Date().toISOString();
    }
  });
  const id = ++db._seq.calls;
  const call = {
    id,
    conversation_id: conv.id,
    mode,
    status: 'ringing',
    from_user_id: req.user.id,
    from_name: req.user.name,
    from_username: req.user.username,
    created_at: new Date().toISOString(),
    answered_at: null,
    ended_at: null
  };
  db.calls.push(call);
  save(db);
  const payload = { type: 'incoming_call', call: publicCall(call) };
  try {
    broadcastAdmin(payload);
    broadcastAdmin({
      type: 'notification',
      kind: 'call',
      title: req.user.name,
      body: (mode === 'video' ? 'Video' : 'Voice') + ' call',
      username: req.user.username,
      name: req.user.name,
      call_id: id,
      mode,
      at: call.created_at
    });
  } catch (e) { console.error(e.message); }
  res.status(201).json({ call: publicCall(call) });
});

app.get('/api/v1/calls/:id', auth, (req, res) => {
  const db = load();
  ensureCalls(db);
  const call = db.calls.find((c) => c.id === +req.params.id);
  if (!call) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && call.from_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ call: publicCall(call) });
});

app.post('/api/v1/calls/:id/accept', auth, adminOnly, (req, res) => {
  const db = load();
  ensureCalls(db);
  const call = db.calls.find((c) => c.id === +req.params.id);
  if (!call) return res.status(404).json({ error: 'Not found' });
  if (call.status !== 'ringing') return res.status(400).json({ error: 'Call not ringing' });
  call.status = 'active';
  call.answered_at = new Date().toISOString();
  save(db);
  const payload = { type: 'call_status', call: publicCall(call) };
  try {
    broadcastAdmin(payload);
    broadcastUser(call.from_user_id, payload);
  } catch (e) { console.error(e.message); }
  res.json({ call: publicCall(call) });
});

app.post('/api/v1/calls/:id/reject', auth, adminOnly, (req, res) => {
  const db = load();
  ensureCalls(db);
  const call = db.calls.find((c) => c.id === +req.params.id);
  if (!call) return res.status(404).json({ error: 'Not found' });
  call.status = 'rejected';
  call.ended_at = new Date().toISOString();
  save(db);
  const payload = { type: 'call_status', call: publicCall(call) };
  try {
    broadcastAdmin(payload);
    broadcastUser(call.from_user_id, payload);
  } catch (e) { console.error(e.message); }
  res.json({ call: publicCall(call) });
});

app.post('/api/v1/calls/:id/end', auth, (req, res) => {
  const db = load();
  ensureCalls(db);
  const call = db.calls.find((c) => c.id === +req.params.id);
  if (!call) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && call.from_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  call.status = 'ended';
  call.ended_at = new Date().toISOString();
  save(db);
  const payload = { type: 'call_status', call: publicCall(call) };
  try {
    broadcastAdmin(payload);
    broadcastUser(call.from_user_id, payload);
  } catch (e) { console.error(e.message); }
  res.json({ call: publicCall(call) });
});


// User shortcut: open/create artist chat then post
app.post('/api/v1/chat/artist', auth, (req, res) => {
  if (req.user.role === 'admin') {
    return res.status(400).json({ error: 'Use conversation endpoints as admin' });
  }
  const body = String(req.body?.body || '').trim();
  const db = load();
  const conv = getOrCreateUserConversation(db, req.user);
  if (!body) {
    save(db);
    return res.json({ conversation_id: conv.id });
  }
  if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });
  const mid = ++db._seq.messages;
  const msg = {
    id: mid,
    conversation_id: conv.id,
    sender_role: 'user',
    sender_id: req.user.id,
    sender_name: req.user.name,
    body,
    status: 'sent',
    created_at: new Date().toISOString()
  };
  db.messages.push(msg);
  conv.last_message = body.length > 80 ? body.slice(0, 80) + '…' : body;
  conv.last_at = msg.created_at;
  conv.admin_unread = (conv.admin_unread || 0) + 1;
  conv.name = req.user.name;
  conv.username = req.user.username;
  save(db);
  try { notifyNewMessage(conv, msg); } catch (e) { console.error('ws notify', e.message); }
  res.status(201).json({ conversation_id: conv.id, message: publicMessage(msg) });
});



// Hard admin path (Phase 11) — not /admin
app.get(sec.ADMIN_PATH, (req, res) => {
  if (!sec.ipAllowed(req)) {
    return res.status(403).send('Forbidden');
  }
  res.sendFile(path.join(ROOT, 'public', '_panel.html'));
});
app.get(['/admin', '/admin.html', '/admin/'], (_req, res) => {
  res.status(404).send('Not found');
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});


// ——— Realtime WebSocket (Phase 6) ———
const http = require('http');
const { WebSocketServer } = require('ws');
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** @type {Map<WebSocket, { userId: number, role: string, username: string, name: string }>} */
const wsClients = new Map();

function wsSend(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcastAdmin(payload) {
  for (const [ws, meta] of wsClients) {
    if (meta.role === 'admin') wsSend(ws, payload);
  }
}

function broadcastUser(userId, payload) {
  for (const [ws, meta] of wsClients) {
    if (meta.userId === userId) wsSend(ws, payload);
  }
}

function notifyNewMessage(conv, msg) {
  const preview = msg.body || (msg.attachment ? ('📎 ' + (msg.attachment.name || 'file')) : '');
  const payload = {
    type: 'new_message',
    conversation_id: conv.id,
    message: publicMessage(msg),
    conversation: {
      id: conv.id,
      name: conv.name,
      username: conv.username,
      last_message: conv.last_message,
      last_at: conv.last_at,
      admin_unread: conv.admin_unread,
      user_unread: conv.user_unread
    }
  };
  if (msg.sender_role === 'user') {
    broadcastAdmin(payload);
    broadcastAdmin({
      type: 'notification',
      kind: 'message',
      title: conv.name || conv.username || 'User',
      body: preview,
      username: conv.username,
      name: conv.name,
      conversation_id: conv.id,
      at: msg.created_at
    });
  } else {
    broadcastUser(conv.user_id, payload);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(String(raw)); } catch { return; }
    if (data.type === 'auth' && data.token) {
      try {
        const payload = jwt.verify(data.token, JWT_SECRET);
        const db = load();
        const user = db.users.find((u) => u.id === payload.sub);
        if (!user || user.status !== 'active') {
          wsSend(ws, { type: 'auth_error', error: 'Unauthorized' });
          return;
        }
        wsClients.set(ws, {
          userId: user.id,
          role: user.role,
          username: user.username,
          name: user.name
        });
        wsSend(ws, { type: 'auth_ok', user: { id: user.id, username: user.username, role: user.role } });
      } catch {
        wsSend(ws, { type: 'auth_error', error: 'Invalid token' });
      }
      return;
    }
    if (data.type === 'ping') { wsSend(ws, { type: 'pong' }); return; }
    if (data.type === 'signal' && data.call_id != null) {
      const meta = wsClients.get(ws);
      if (!meta) return;
      const db = load();
      ensureCalls(db);
      const call = db.calls.find((c) => c.id === +data.call_id);
      if (!call) return;
      if (meta.role !== 'admin' && call.from_user_id !== meta.userId) return;
      const signalPayload = {
        type: 'signal',
        call_id: call.id,
        from_role: meta.role,
        signal: data.signal
      };
      if (meta.role === 'admin') {
        broadcastUser(call.from_user_id, signalPayload);
      } else {
        broadcastAdmin(signalPayload);
      }
    }
  });
  ws.on('close', () => wsClients.delete(ws));
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log("Artist's Studio on :" + PORT + " (HTTP + WS /ws)"));

