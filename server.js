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
  res.json({ status: 'ok', service: 'artists-studio', phase: 2 });
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

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, () => console.log("Artist's Studio Phase 2 on :" + PORT));
