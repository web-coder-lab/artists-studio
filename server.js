const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { load, save } = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'artists-studio-phase1-dev-secret-change-me';
const ROOT = __dirname;

const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(ROOT, 'public')));

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
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
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
  res.json({ status: 'ok', service: 'artists-studio', phase: 4 });
});

// ——— Public CMS ———
app.get('/api/v1/site', (_req, res) => {
  const db = load();
  res.json({ site: db.site, pages: db.pages });
});

app.get('/api/v1/pages/:slug', (req, res) => {
  const db = load();
  const page = db.pages[req.params.slug];
  if (!page || !page.published) return res.status(404).json({ error: 'Page not found' });
  res.json({ page, site: db.site });
});

app.get('/api/v1/portfolio', (_req, res) => {
  const db = load();
  res.json({ items: db.portfolio || [] });
});

app.get('/api/v1/reels', (_req, res) => {
  const db = load();
  res.json({ items: db.reels || [] });
});

app.get('/api/v1/socials', (_req, res) => {
  const db = load();
  res.json({ socials: db.socials || {} });
});

app.get('/api/v1/policies/:slug', (req, res) => {
  const db = load();
  const pol = (db.policies || {})[req.params.slug];
  if (!pol) return res.status(404).json({ error: 'Policy not found' });
  res.json({ policy: { slug: req.params.slug, ...pol } });
});

app.get('/api/v1/policies', (_req, res) => {
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
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Account disabled' });
  }
  user.last_login = new Date().toISOString();
  save(db);
  res.json({ token: signToken(user), user: publicUser(user) });
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
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_role: m.sender_role,
    sender_id: m.sender_id,
    sender_name: m.sender_name,
    body: m.body,
    status: m.status,
    created_at: m.created_at
  };
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

app.post('/api/v1/conversations/:id/messages', auth, (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body || body.length < 1) return res.status(400).json({ error: 'Message required' });
  if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });
  const db = load();
  ensureChatSeq(db);
  const id = +req.params.id;
  let conv = db.conversations.find((c) => c.id === id);
  if (!conv && req.user.role !== 'admin') {
    conv = getOrCreateUserConversation(db, req.user);
  }
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  if (req.user.role !== 'admin' && conv.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const mid = ++db._seq.messages;
  const msg = {
    id: mid,
    conversation_id: conv.id,
    sender_role: req.user.role === 'admin' ? 'admin' : 'user',
    sender_id: req.user.id,
    sender_name: req.user.name,
    body,
    status: 'sent',
    created_at: new Date().toISOString()
  };
  db.messages.push(msg);
  conv.last_message = body.length > 80 ? body.slice(0, 80) + '…' : body;
  conv.last_at = msg.created_at;
  if (msg.sender_role === 'user') conv.admin_unread = (conv.admin_unread || 0) + 1;
  else conv.user_unread = (conv.user_unread || 0) + 1;
  // sync name/username
  if (msg.sender_role === 'user') {
    conv.name = req.user.name;
    conv.username = req.user.username;
  }
  save(db);
  res.status(201).json({ message: publicMessage(msg) });
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
  res.status(201).json({ conversation_id: conv.id, message: publicMessage(msg) });
});


app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, () => console.log("Artist's Studio on :" + PORT));
