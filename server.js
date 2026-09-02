const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { load, save, init: initDb, exportPublicSafe, exportFullBackup } = require('./db');
const sec = require('./security');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '';
let JWT_SECRET_EFFECTIVE = JWT_SECRET;
if (!JWT_SECRET_EFFECTIVE || JWT_SECRET_EFFECTIVE.length < 32) {
  // Prefer env JWT_SECRET in production. Fallback keeps service up but is weaker.
  JWT_SECRET_EFFECTIVE = JWT_SECRET_EFFECTIVE || 'artists-studio-dev-only-not-for-production-use!!';
  console.warn('SECURITY: Set JWT_SECRET (32+ chars) via environment for production.');
  if (process.env.REQUIRE_JWT_SECRET === '1') {
    console.error('FATAL: REQUIRE_JWT_SECRET=1 and JWT_SECRET missing/short');
    process.exit(1);
  }
}
const ROOT = __dirname;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(sec.securityHeaders);
// Phase 2 — WAF-lite: probe paths + noisy bots (before static)
const PROBE_PATHS = new Set([
  '/admin', '/admin/', '/admin.html', '/_panel.html', '/login', '/login/',
  '/wp-admin', '/wp-login.php', '/xmlrpc.php', '/.env', '/config.php',
  '/phpmyadmin', '/administrator', '/admin/login', '/api/admin', '/api/admin/'
]);
const BAD_UA = [
  'sqlmap', 'nikto', 'nmap', 'masscan', 'dirbuster', 'gobuster',
  'wget/', 'python-requests/', 'curl/'  // curl alone still allowed for health via empty path rules below
];
app.use((req, res, next) => {
  const pth = (req.path || '').toLowerCase();
  if (PROBE_PATHS.has(pth) || pth.startsWith('/wp-') || pth.startsWith('/.git')) {
    return res.status(404).type('text/plain').send('Not found');
  }
  // obvious query injection probes on any path
  const q = String(req.url || '');
  if (/(\bunion\b.*\bselect\b|<script|javascript:|\.\.\/)/i.test(q)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  // only block known scanners — do not block empty UA (APK may omit)
  if (ua && (ua.includes('sqlmap') || ua.includes('nikto') || ua.includes('dirbuster') || ua.includes('gobuster') || ua.includes('nessus'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});
const CORS_ORIGINS = String(
  process.env.CORS_ORIGINS ||
    'https://artists-studio.onrender.com,http://localhost:3000,http://127.0.0.1:3000'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // APK / curl / same-origin: no Origin header → allow
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.includes('*')) return cb(null, true);
    if (CORS_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'X-Requested-With']
}));
app.use(express.json({ limit: '32kb' }));


/* ——— Browser theme shell for paths / API (content negotiation) ——— */
function wantsHtml(req) {
  // Never theme real API clients (fetch / APK / curl json)
  if (req.headers['x-admin-key']) return false;
  if (String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest') return false;
  if (req.query && String(req.query.format || '').toLowerCase() === 'json') return false;
  const accept = String(req.headers.accept || '').toLowerCase();
  // Any application/json in Accept → JSON (browsers often send json+html together on fetch)
  if (accept.includes('application/json')) return false;
  const dest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
  const mode = String(req.headers['sec-fetch-mode'] || '').toLowerCase();
  // Only full document navigations get HTML shells
  if (dest === 'document' || mode === 'navigate') return true;
  if (dest === 'empty' || dest === '' || mode === 'cors' || mode === 'no-cors') return false;
  if (accept.includes('text/html') && !accept.includes('*/*')) return true;
  return false;
}

function escapeHtmlShell(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function studioShellPage({ title, eyebrow, lead, bodyHtml, statusCode }) {
  const t = escapeHtmlShell(title || "Artist's Studio");
  const eb = escapeHtmlShell(eyebrow || 'Studio');
  const ld = escapeHtmlShell(lead || '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="theme-color" content="#0a0a0b"/>
  <meta name="robots" content="noindex"/>
  <title>${t} — Artist's Studio</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="/css/studio.css"/>
</head>
<body data-page="doc">
  <div class="grain" aria-hidden="true"></div>
  <div id="site-nav"></div>
  <main class="legal-main doc-main">
    <p class="eyebrow">${eb}</p>
    <h1>${t}</h1>
    ${ld ? `<p class="legal-updated">${ld}</p>` : ''}
    <div class="doc-panel">${bodyHtml || ''}</div>
    <p class="legal-nav">
      <a href="/">Home</a><span class="dot">·</span>
      <a href="/terms.html">Terms</a><span class="dot">·</span>
      <a class="license-link" href="/license.html">License</a>
    </p>
  </main>
  <div id="site-foot"></div>
  <script src="/js/api-client.js"></script>
  <script src="/js/app.js"></script>
  <script>
    try {
      var th = localStorage.getItem('as_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', th === 'light' ? 'light' : 'dark');
    } catch (e) {}
  </script>
</body>
</html>`;
}

function redactForHtml(value, depth) {
  if (depth > 6) return '…';
  if (value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((x) => redactForHtml(x, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const lk = String(k).toLowerCase();
      if (/(password|secret|token|hash|authorization|github_pat|admin_key|private)/i.test(lk)) {
        out[k] = '—';
        continue;
      }
      out[k] = redactForHtml(v, depth + 1);
    }
    return out;
  }
  return value;
}

function jsonAsThemedHtml(req, res, status, payload) {
  const pathLabel = escapeHtmlShell(req.path || '/api');
  const safe = redactForHtml(payload, 0);
  const st = status || 200;
  let bodyHtml = '';
  const pth = String(req.path || '');

  if (pth.includes('/captcha') && safe && (safe.question || safe.id)) {
    bodyHtml = `
      <div class="svc-card">
        <p class="svc-kicker">Verification</p>
        <p class="svc-q">${escapeHtmlShell(safe.question || '—')}</p>
        <p class="doc-note">Solve this when the studio asks for a check. Apps send the answer with the request — this page is only a readable view.</p>
        <dl class="svc-dl">
          <div><dt>Reference</dt><dd><code>${escapeHtmlShell(safe.id || '')}</code></dd></div>
          <div><dt>Expires</dt><dd>${escapeHtmlShell(safe.expires_in != null ? safe.expires_in + 's' : '—')}</dd></div>
        </dl>
      </div>`;
  } else if (pth.endsWith('/health') && safe && safe.status) {
    bodyHtml = `
      <div class="svc-card svc-ok">
        <p class="svc-kicker">Status</p>
        <p class="svc-q">${escapeHtmlShell(String(safe.status).toUpperCase())}</p>
        <p class="doc-note">Studio systems are responding. Technical clients still receive JSON on this same address.</p>
      </div>`;
  } else {
    let pretty = '';
    try { pretty = escapeHtmlShell(JSON.stringify(safe, null, 2)); } catch (_) { pretty = '{}'; }
    bodyHtml = `<p class="doc-note">This address is part of the studio interface. Authorized applications use it programmatically.</p>
<pre class="doc-pre">${pretty}</pre>`;
  }

  const html = studioShellPage({
    title: pth.includes('/captcha') ? 'Check' : (pth.endsWith('/health') ? 'Health' : 'Studio service'),
    eyebrow: 'Interface',
    lead: pathLabel + (st !== 200 ? ' · ' + st : ''),
    bodyHtml
  });
  res.status(st).type('html').send(html);
}

/** Wrap res.json so browser navigations get themed pages; clients still get JSON */
function installJsonThemeShim() {
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!wantsHtml(req)) return next();
    const pathName = req.path || '';
    const isApi = pathName.startsWith('/api/');
    if (!isApi) return next();
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.headersSent) return originalJson(body);
      return jsonAsThemedHtml(req, res, res.statusCode || 200, body);
    };
    next();
  });
}
installJsonThemeShim();

/** Themed HTML viewer for public text/meta docs when opened in a browser */
const THEMED_TEXT_FILES = new Set([
  'humans.txt', 'llms.txt', 'ai.txt', 'privacy.txt', 'terms.txt', 'copyright.txt',
  'security.txt', 'robots.txt'
]);
app.get(['/humans.txt', '/llms.txt', '/ai.txt', '/privacy.txt', '/terms.txt', '/copyright.txt', '/security.txt', '/robots.txt'], (req, res, next) => {
  if (!wantsHtml(req)) return next();
  const base = path.basename(req.path);
  if (!THEMED_TEXT_FILES.has(base)) return next();
  const fp = path.join(ROOT, 'public', base);
  fs.readFile(fp, 'utf8', (err, text) => {
    if (err) return next();
    const html = studioShellPage({
      title: base,
      eyebrow: 'Document',
      lead: 'Public studio document',
      bodyHtml: `<pre class="doc-pre doc-pre-wrap">${escapeHtmlShell(text)}</pre>`
    });
    res.type('html').send(html);
  });
});

app.get(['/meta/build.txt', '/meta/version.dat'], (req, res, next) => {
  if (!wantsHtml(req)) return next();
  const rel = req.path.replace(/^\//, '');
  const fp = path.join(ROOT, 'public', rel);
  fs.readFile(fp, 'utf8', (err, text) => {
    if (err) return next();
    const html = studioShellPage({
      title: path.basename(rel),
      eyebrow: 'Build',
      lead: 'Public version stamp',
      bodyHtml: `<pre class="doc-pre">${escapeHtmlShell(text)}</pre>`
    });
    res.type('html').send(html);
  });
});

const THEMED_XML = [
  '/sitemap.xml', '/sitemap-index.xml', '/sitemap-pages.xml', '/sitemap-images.xml',
  '/feed.xml', '/opensearch.xml', '/browserconfig.xml', '/crossdomain.xml', '/clientaccesspolicy.xml'
];
app.get(THEMED_XML, (req, res, next) => {
  if (!wantsHtml(req)) return next();
  const rel = req.path.replace(/^\//, '');
  const fp = path.join(ROOT, 'public', rel);
  fs.readFile(fp, 'utf8', (err, text) => {
    if (err) return next();
    const html = studioShellPage({
      title: path.basename(rel),
      eyebrow: 'Catalog',
      lead: 'Structured studio document',
      bodyHtml: `<pre class="doc-pre doc-pre-wrap">${escapeHtmlShell(text)}</pre>`
    });
    res.type('html').send(html);
  });
});

app.get(['/manifest.json', '/manifest.webmanifest', '/site.webmanifest', '/.well-known/assetlinks.json', '/.well-known/apple-app-site-association', '/.well-known/security.txt'], (req, res, next) => {
  if (!wantsHtml(req)) return next();
  let fp = path.join(ROOT, 'public', req.path.replace(/^\//, ''));
  if (req.path.startsWith('/.well-known/')) {
    fp = path.join(ROOT, 'public', '.well-known', path.basename(req.path));
  }
  fs.readFile(fp, 'utf8', (err, text) => {
    if (err) return next();
    const html = studioShellPage({
      title: path.basename(req.path),
      eyebrow: 'App',
      lead: 'Public configuration',
      bodyHtml: `<pre class="doc-pre doc-pre-wrap">${escapeHtmlShell(text)}</pre>`
    });
    res.type('html').send(html);
  });
});


// Never serve secrets / source / backups from web root
app.use((req, res, next) => {
  const pth = (req.path || '').toLowerCase();
  if (
    pth.includes('.env') ||
    pth.endsWith('.git') ||
    pth.includes('/.git/') ||
    pth.endsWith('.md') ||
    pth.endsWith('.map') ||
    pth.includes('backup') ||
    pth.endsWith('.zip') ||
    pth.endsWith('package.json') ||
    pth.endsWith('server.js') ||
    pth.endsWith('db.js') ||
    pth.includes('node_modules')
  ) {
    return res.status(404).type('text/plain').send('Not found');
  }
  next();
});
// Public well-known (must stay standard paths)

/* ——— Mobile (-m) vs PC (-p) page shells ——— */
function isMobileDevice(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return true; // tablets → mobile shell
  return false;
}

const PAGE_BASES = new Set([
  'home', 'about', 'portfolio', 'reels', 'services', 'contact',
  'terms', 'privacy', 'license', 'policies', 'offline', 'saved'
]);

const LEGACY_MAP = {
  '/': 'home',
  '/index.html': 'home',
  '/about.html': 'about',
  '/portfolio.html': 'portfolio',
  '/reels.html': 'reels',
  '/services.html': 'services',
  '/contact.html': 'contact',
  '/terms.html': 'terms',
  '/privacy.html': 'privacy',
  '/license.html': 'license',
  '/policies.html': 'policies',
  '/offline.html': 'offline',
  '/account.html': 'contact',
  '/chat.html': 'contact',
  '/saved.html': 'saved'
};

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const pth = req.path || '/';
  if (pth.startsWith('/api') || pth.startsWith('/css') || pth.startsWith('/js') || pth.startsWith('/media') || pth.startsWith('/.well-known')) {
    return next();
  }

  const mobile = isMobileDevice(req);

  // Explicit -m / -p files
  const m = pth.match(/^\/([a-z0-9]+)-(m|p)\.html$/i);
  if (m) {
    const base = m[1].toLowerCase();
    const kind = m[2].toLowerCase();
    if (!PAGE_BASES.has(base)) return next();
    if (kind === 'm' && !mobile) {
      // PC opened mobile link → teleport to PC page
      return res.redirect(302, '/' + base + '-p.html');
    }
    if (kind === 'p' && mobile) {
      // Mobile must not use PC files
      return res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));
    }
    return next(); // allowed
  }

  // Legacy short URLs → correct shell
  if (Object.prototype.hasOwnProperty.call(LEGACY_MAP, pth)) {
    const base = LEGACY_MAP[pth];
    const dest = '/' + base + (mobile ? '-m' : '-p') + '.html';
    return res.redirect(302, dest);
  }

  next();
});


app.use('/.well-known', express.static(path.join(ROOT, 'public', '.well-known'), {
  dotfiles: 'allow',
  index: false,
  fallthrough: true
}));
app.use(express.static(path.join(ROOT, 'public'), {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res, filePath) => {
    if (/hero-portrait|studio-portrait/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  }
}));
app.use('/media/public', express.static(path.join(__dirname, 'uploads', 'public')));

/* ——— Phase 1: well-known + HTTPS nudge + probe-safe static ——— */
app.get('/.well-known/change-password', (_req, res) => {
  res.redirect(302, '/contact.html');
});
app.get('/favicon.ico', (req, res, next) => {
  const ico = path.join(ROOT, 'public', 'favicon.ico');
  if (fs.existsSync(ico)) return res.type('image/x-icon').sendFile(ico);
  return res.redirect(302, '/favicon.svg');
});
// Force HTTPS when behind proxy (Render)
app.use((req, res, next) => {
  const proto = String(req.headers['x-forwarded-proto'] || '');
  if (proto && proto !== 'https' && process.env.FORCE_HTTPS !== '0') {
    const host = req.headers.host || 'artists-studio.onrender.com';
    return res.redirect(301, 'https://' + host + req.originalUrl);
  }
  next();
});


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
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/3gpp2',
  'video/x-matroska', 'video/x-msvideo', 'video/avi', 'video/mpeg',
  'application/octet-stream',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]);

function fileFilter(_req, file, cb) {
  const name = file.originalname || '';
  const mime = (file.mimetype || '').toLowerCase();
  if (mime.startsWith('video/') || mime.startsWith('image/')) return cb(null, true);
  if (ALLOWED_MIME.has(mime)) return cb(null, true);
  if (/\.(jpe?g|png|webp|gif|heic|heif|mp4|webm|mov|m4v|3gp|mkv|avi|pdf|docx?|txt)$/i.test(name)) {
    return cb(null, true);
  }
  cb(new Error('File type not allowed: ' + (mime || name || 'unknown')));
}

const publicStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadPublicDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '-' + safe);
  }
});
let sharp = null;
try { sharp = require('sharp'); } catch (_) { console.warn('sharp not installed — uploads stored as-is'); }

async function compressImageIfNeeded(filePath, mime) {
  if (!sharp || !(mime || '').startsWith('image/')) return filePath;
  if ((mime || '').includes('gif') || (mime || '').includes('svg')) return filePath;
  try {
    const out = filePath + '.opt.jpg';
    await sharp(filePath)
      .rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(out);
    fs.unlinkSync(filePath);
    fs.renameSync(out, filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ? filePath : filePath.replace(/\.[^.]+$/, '.jpg'));
    return filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ? filePath : filePath.replace(/\.[^.]+$/, '.jpg');
  } catch (e) {
    console.warn('compress skip', e.message);
    return filePath;
  }
}


/** Phase 3 — basic magic-byte / extension consistency for uploads */
function assertSafeUpload(file) {
  if (!file || !file.path) throw new Error('No file');
  const name = String(file.originalname || file.filename || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  const buf = Buffer.alloc(16);
  const fd = fs.openSync(file.path, 'r');
  try {
    fs.readSync(fd, buf, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isGif = buf.slice(0, 3).toString() === 'GIF';
  const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  const isMp4 = buf.slice(4, 8).toString() === 'ftyp' || (buf[0] === 0 && buf[4] === 0x66);
  const isWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  const looksImage = isPng || isJpg || isGif || isWebp;
  const looksVideo = isMp4 || isWebm || mime.startsWith('video/');
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(name)) {
    if (!looksImage && !mime.includes('heic') && !mime.includes('heif')) {
      throw new Error('File content does not match an image');
    }
  }
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp)$/i.test(name)) {
    // MOV/3GP often lack simple magic — allow declared video mime with video extension
    if (!looksVideo && !/\.(mov|m4v|3gp|mkv|avi)$/i.test(name) && !mime.startsWith('video/')) {
      throw new Error('File content does not match a video');
    }
  }
  // Block executable signatures
  if (buf.slice(0, 2).toString() === 'MZ' || buf.slice(0, 4).toString('hex') === '7f454c46') {
    throw new Error('Executable files are not allowed');
  }
  return true;
}

const uploadPublic = multer({
  storage: publicStorage,
  limits: { fileSize: 120 * 1024 * 1024, files: 1 },
  fileFilter
});
const uploadChat = multer({
  storage: privateStorage,
  limits: { fileSize: 40 * 1024 * 1024, files: 1 },
  fileFilter
});



/* Phase 2 — rate limits */
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

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' }
});

const engageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many actions. Try later.' }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads. Try later.' }
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Admin rate limit. Try later.' }
});

// Apply global API throttle (APK + site share this; 120/min is enough)
app.use('/api/', apiLimiter);

app.use('/api/v1/admin', adminLimiter);

/* ——— Phase 4: math CAPTCHA (public writes; admin key skips) ——— */
const captchaStore = new Map(); // id → { answer, exp }
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

function issueCaptcha() {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const id = crypto.randomBytes(16).toString('hex');
  captchaStore.set(id, { answer: a + b, exp: Date.now() + CAPTCHA_TTL_MS });
  // prune occasionally
  if (captchaStore.size > 2000) {
    const now = Date.now();
    for (const [k, v] of captchaStore) {
      if (v.exp < now) captchaStore.delete(k);
    }
  }
  return { id, question: `${a} + ${b}`, expires_in: 300 };
}

function verifyCaptcha(id, answer) {
  if (!id) return false;
  const row = captchaStore.get(String(id));
  if (!row) return false;
  captchaStore.delete(String(id)); // one-time
  if (Date.now() > row.exp) return false;
  const n = Number(answer);
  if (!Number.isFinite(n)) return false;
  return n === row.answer;
}

function hasValidAdminKeyHeader(req) {
  const headerKey = req.headers['x-admin-key'] ? String(req.headers['x-admin-key']).trim() : '';
  if (headerKey && typeof adminKeyEqual === 'function' && adminKeyEqual(headerKey)) return true;
  const bearer = String(req.headers.authorization || '').startsWith('Bearer ')
    ? String(req.headers.authorization).slice(7).trim()
    : '';
  if (bearer && typeof adminKeyEqual === 'function' && adminKeyEqual(bearer)) return true;
  return false;
}

/** Require math captcha unless valid admin key (APK safe) */
function requireCaptcha(req, res, next) {
  if (hasValidAdminKeyHeader(req) || req.adminKeyAuth) return next();
  const id = req.headers['x-captcha-id'] || req.body?.captcha_id || req.query?.captcha_id;
  const answer = req.headers['x-captcha-answer'] || req.body?.captcha_answer || req.query?.captcha_answer;
  if (!verifyCaptcha(id, answer)) {
    return res.status(400).json({ error: 'Captcha required or invalid', captcha_required: true });
  }
  next();
}

app.get('/api/v1/captcha', apiLimiter, (_req, res) => {
  res.json(issueCaptcha());
});
app.get('/api/v1/captcha/new', apiLimiter, (_req, res) => {
  res.json(issueCaptcha());
});



function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  const cookies = parseCookies(req);
  return cookies.as_token || cookies.as_session || null;
}

function setAuthCookie(res, token) {
  const maxAge = 30 * 24 * 60 * 60; // 30 days
  const secure = process.env.RENDER || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    'as_token=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + secure,
    'as_logged=1; Path=/; SameSite=Lax; Max-Age=' + maxAge + secure
  ]);
}

function clearAuthCookie(res) {
  const secure = process.env.RENDER || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    'as_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure,
    'as_logged=; Path=/; SameSite=Lax; Max-Age=0' + secure
  ]);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET_EFFECTIVE,
    { expiresIn: '30d' }
  );
}

function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET_EFFECTIVE);
    const db = load();
    const user = db.users.find((u) => u.id === payload.sub);
    if (user && user.status === 'active') req.user = user;
  } catch (_) {}
  next();
}

/** Admin app key (no login UI). Header: X-Admin-Key or Authorization: Bearer <ADMIN_KEY> */
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.STUDIO_ADMIN_KEY || 'StudioAdminKey-2026-ChangeMe';

/** In-memory failed admin-key attempts (IP → {count, until}) */
const adminFailMap = new Map();
const ADMIN_FAIL_MAX = 12;
const ADMIN_FAIL_WINDOW_MS = 15 * 60 * 1000;

function adminKeyEqual(provided) {
  try {
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(String(ADMIN_KEY || ''));
    if (a.length !== b.length) {
      // still do a compare to reduce trivial timing leaks on length
      crypto.timingSafeEqual(b, b);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function noteAdminKeyFail(req) {
  const ip = sec.clientIp(req) || 'unknown';
  const now = Date.now();
  let row = adminFailMap.get(ip);
  if (!row || now > row.until) row = { count: 0, until: now + ADMIN_FAIL_WINDOW_MS };
  row.count += 1;
  row.until = now + ADMIN_FAIL_WINDOW_MS;
  adminFailMap.set(ip, row);
  try {
    const db = load();
    sec.audit(db, { action: 'admin_key_failed', ip, path: req.path, count: row.count });
    save(db);
  } catch (_) {}
  return row;
}

function adminKeyBlocked(req) {
  const ip = sec.clientIp(req) || 'unknown';
  const row = adminFailMap.get(ip);
  if (!row) return false;
  if (Date.now() > row.until) {
    adminFailMap.delete(ip);
    return false;
  }
  return row.count >= ADMIN_FAIL_MAX;
}

function tryAdminKey(req) {
  const headerKey = req.headers['x-admin-key'] ? String(req.headers['x-admin-key']).trim() : '';
  const bearer = String(req.headers.authorization || '').startsWith('Bearer ')
    ? String(req.headers.authorization).slice(7).trim()
    : '';
  // Explicit X-Admin-Key: failures count toward lockout
  if (headerKey) {
    if (adminKeyBlocked(req)) return false;
    if (!adminKeyEqual(headerKey)) {
      noteAdminKeyFail(req);
      return false;
    }
  } else if (bearer && adminKeyEqual(bearer)) {
    // Bearer matches admin key (APK may use either form)
    if (adminKeyBlocked(req)) return false;
  } else {
    return false; // JWT or missing — not an admin-key attempt
  }
  adminFailMap.delete(sec.clientIp(req) || 'unknown');
  req.user = {
    id: 0,
    username: 'admin',
    name: 'Studio Admin',
    role: 'superadmin',
    status: 'active',
    auth_via: 'admin_key'
  };
  req.adminKeyAuth = true;
  return true;
}

function auth(req, res, next) {
  if (tryAdminKey(req)) return next();
  if (req.headers['x-admin-key'] && adminKeyBlocked(req)) {
    return res.status(429).json({ error: 'Too many failed admin attempts. Try later.' });
  }
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  // If token equals failed admin key path already handled; try JWT
  try {
    const payload = jwt.verify(token, JWT_SECRET_EFFECTIVE);
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


/** Sync superadmin from GitHub: Admin/Password login/credentials.json */
function syncAdminCredentials(db) {
  const cred = db._admin_credentials;
  if (!cred || !cred.username || !cred.password) return;
  const uname = String(cred.username).trim();
  const plain = String(cred.password);
  if (!uname || !plain) return;
  let admin = (db.users || []).find((u) => u.role === 'superadmin' || u.username.toLowerCase() === uname.toLowerCase());
  if (!admin) {
    if (db._seq.users == null) db._seq.users = (db.users || []).length;
    admin = {
      id: ++db._seq.users,
      username: uname,
      name: 'Studio Admin',
      password_hash: bcrypt.hashSync(plain, 10),
      role: 'superadmin',
      status: 'active',
      must_change_password: false,
      created_at: new Date().toISOString(),
      last_login: null
    };
    db.users = db.users || [];
    db.users.push(admin);
  } else {
    // update username + rehash if plain password changed (always rehash from file)
    admin.username = uname;
    admin.role = 'superadmin';
    admin.status = 'active';
    try {
      if (!bcrypt.compareSync(plain, admin.password_hash)) {
        admin.password_hash = bcrypt.hashSync(plain, 10);
      }
    } catch (_) {
      admin.password_hash = bcrypt.hashSync(plain, 10);
    }
  }
}

function persistUserAccount(db, user) {
  try {
    if (db && typeof require('./github-db').writeUserAccount === 'function') {
      const gh = require('./github-db');
      const conv = (db.conversations || []).find((c) => c.user_id === user.id);
      let messages = [];
      if (conv) {
        messages = (db.messages || []).filter((m) => m.conversation_id === conv.id);
      }
      gh.writeUserAccount(user, {
        conversation_id: conv ? conv.id : null,
        messages: messages.map((m) => ({
          id: m.id,
          sender_role: m.sender_role,
          body: m.body,
          status: m.status,
          created_at: m.created_at
        }))
      }).catch((e) => console.error('user account write', e.message));
      if (conv) {
        gh.writeUserChat(user.username, conv.id, messages).catch(() => {});
      }
    }
  } catch (e) {
    console.error('persistUserAccount', e.message);
  }
}

function nextMediaId(db, key, list) {
  const arr = list || [];
  let max = 0;
  for (const x of arr) {
    const n = Number(x && x.id) || 0;
    if (n > max) max = n;
  }
  if (!db._seq || typeof db._seq !== 'object') db._seq = {};
  const cur = Math.max(Number(db._seq[key]) || 0, max);
  db._seq[key] = cur + 1;
  return db._seq[key];
}

function isAdminRole(role) {
  return role === 'admin' || role === 'superadmin';
}
function isStaffRole(role) {
  return role === 'admin' || role === 'superadmin' || role === 'moderator';
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

app.get('/api/v1/ping', (_req, res) => {
  res.json({ ok: true, t: Date.now() });
});

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', t: Date.now() });
});
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', t: Date.now() });
});

// ——— Public CMS ———
app.get('/api/v1/site', authOptional, (req, res) => {
  const db = load();
  res.json({ site: db.site || {}, pages: db.pages || {}, theme: db.theme || {} });
});

app.get('/api/v1/pages/:slug', authOptional, (req, res) => {
  const db = load();
  const page = db.pages[req.params.slug];
  if (!page || !page.published) return res.status(404).json({ error: 'Page not found' });
  res.json({ page, site: db.site });
});


function actorId(req) {
  if (req.user && req.user.id) return 'u:' + req.user.id;
  const mobile = String(req.headers['x-mobile'] || req.body?.mobile || '').replace(/\D/g, '').slice(-15);
  if (mobile.length >= 10) return 'm:' + mobile;
  const g = String(req.headers['x-guest-id'] || req.body?.guest_id || '').trim().slice(0, 64);
  return g ? 'g:' + g : null;
}

app.get('/api/v1/portfolio', authOptional, (req, res) => {
  const db = load();
  const aid = actorId(req);
  const items = (db.portfolio || []).map((p) => {
    const likes = (db.portfolio_likes || []).filter((x) => x.portfolio_id === p.id).length;
    const saves = (db.portfolio_saves || []).filter((x) => x.portfolio_id === p.id).length;
    const liked = aid ? (db.portfolio_likes || []).some((x) => x.portfolio_id === p.id && x.actor === aid) : false;
    const saved = aid ? (db.portfolio_saves || []).some((x) => x.portfolio_id === p.id && x.actor === aid) : false;
    return { ...p, likes, saves, liked, saved };
  });
  res.json({ items });
});

app.get('/api/v1/reels', authOptional, (req, res) => {
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

app.get('/api/v1/socials', authOptional, (req, res) => {
  const db = load();
  res.json({ socials: db.socials || {} });
});

app.get('/api/v1/policies/:slug', authOptional, (req, res) => {
  const db = load();
  const pol = (db.policies || {})[req.params.slug];
  if (!pol) return res.status(404).json({ error: 'Policy not found' });
  res.json({ policy: { slug: req.params.slug, ...pol } });
});

app.get('/api/v1/policies', authOptional, (req, res) => {
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
app.post('/api/v1/contact', contactLimiter, requireCaptcha, authOptional, (_req, res) => {
  return res.status(410).json({ error: 'Use WhatsApp, Instagram, or email on the Contact page.' });
});
app.post('/api/v1/contact_disabled', contactLimiter, authOptional, (req, res) => {
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
app.post('/api/v1/auth/register', authLimiter, (_req, res) => {
  return res.status(410).json({ error: 'Public registration closed. Contact via WhatsApp, Instagram, or email.' });
});
app.post('/api/v1/auth/register_disabled', authLimiter, (req, res) => {
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
  try { persistUserAccount(db, user); } catch (_) {}

  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/v1/auth/login', authLimiter, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const db = load();
  try { syncAdminCredentials(db); } catch (e) { console.error('syncAdmin', e.message); }
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
  // Public site has no user accounts — only admin roles may sign in (Admin APK)
  if (!isAdminRole(user.role)) {
    return res.status(403).json({ error: 'User accounts disabled. Contact studio via WhatsApp / Instagram / email.' });
  }
  sec.clearFailed(db, username);
  user.last_login = new Date().toISOString();
  const sid = sec.createSession(db, user, ip, req.headers['user-agent']);
  sec.audit(db, { action: 'login_ok', username: user.username, role: user.role, ip });
  save(db);
  try { persistUserAccount(db, user); } catch (_) {}
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ token, session_id: sid, user: publicUser(user) });
});

app.get('/api/v1/auth/me', auth, (req, res) => {
  const token = extractToken(req);
  res.json({ user: publicUser(req.user), token: token || undefined });
});


app.patch('/api/v1/auth/profile', auth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: 'Name must be 2–60 characters' });
  }
  const db = load();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  user.name = name;
  sec.audit(db, { action: 'profile_updated', username: user.username, ip: sec.clientIp(req) });
  save(db);
  res.json({ user: publicUser(user) });
});

app.post('/api/v1/auth/password', auth, authLimiter, (req, res) => {
  const current = String(req.body?.current_password || '');
  const next = String(req.body?.new_password || '');
  if (!current || !next) return res.status(400).json({ error: 'Current and new password required' });
  if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  if (current === next) return res.status(400).json({ error: 'New password must differ from current' });
  const db = load();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  user.password_hash = bcrypt.hashSync(next, 10);
  user.must_change_password = false;
  sec.audit(db, { action: 'password_changed', username: user.username, ip: sec.clientIp(req) });
  // revoke other sessions optional — keep current
  save(db);
  res.json({ ok: true, user: publicUser(user) });
});

app.get('/api/v1/admin/backup', auth, adminOnly, (req, res) => {
  const db = load();
  sec.audit(db, { action: 'backup_export', username: req.user && req.user.username, ip: sec.clientIp(req) });
  save(db);
  const payload = typeof exportFullBackup === 'function' ? exportFullBackup(db) : db;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="artists-studio-backup.json"');
  res.send(JSON.stringify(payload, null, 2));
});

app.get('/api/v1/admin/db/export', auth, adminOnly, (req, res) => {
  const db = load();
  const mode = String(req.query.mode || 'full');
  sec.audit(db, { action: 'db_export', mode, username: req.user && req.user.username, ip: sec.clientIp(req) });
  save(db);
  const payload = mode === 'safe' ? exportPublicSafe(db) : (typeof exportFullBackup === 'function' ? exportFullBackup(db) : db);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="artists-studio-db-' + mode + '.json"');
  res.send(JSON.stringify(payload, null, 2));
});

app.get('/api/v1/admin/db-status', auth, adminOnly, (_req, res) => {
  const github = !!(process.env.GITHUB_DB_TOKEN || process.env.GITHUB_TOKEN);
  const pg = !!process.env.DATABASE_URL;
  res.json({
    persistent: github || pg,
    driver: github ? 'github' : pg ? 'postgres' : 'file',
    repo: process.env.GITHUB_DB_REPO || 'web-coder-lab/dstabase7837638362826373',
    note: github
      ? 'Primary store: GitHub repo (Artists studio / Admin + Front tables)'
      : pg
        ? 'PostgreSQL'
        : 'File store'
  });
});

app.get('/api/v1/admin/security/summary', auth, adminOnly, (req, res) => {
  const db = load();
  const s = sec.ensureSecurity(db);
  res.json({
    failed_logins_recent: (s.failed_logins || []).slice(0, 20),
    locks: s.locks || {},
    sessions_count: (s.sessions || []).length,
    audit_recent: (s.audit || []).slice(0, 30),
    admin_key_lockouts: typeof adminFailMap !== 'undefined' ? adminFailMap.size : 0
  });
});


app.post('/api/v1/auth/logout', auth, (req, res) => {
  clearAuthCookie(res);
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
  if (!isAdminRole(req.user.role)) {
    return res.status(410).json({ error: 'In-site chat removed. Use WhatsApp, Instagram, or email.' });
  }
  const db = load();
  if (isAdminRole(req.user.role)) {
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
  if (!isAdminRole(req.user.role)) {
    return res.status(410).json({ error: 'In-site chat removed.' });
  }
  const db = load();
  ensureChatSeq(db);
  const id = +req.params.id;
  const conv = db.conversations.find((c) => c.id === id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  if (!isAdminRole(req.user.role) && conv.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const msgs = db.messages
    .filter((m) => m.conversation_id === id)
    .sort((a, b) => a.id - b.id)
    .map(publicMessage);
  // mark read for viewer
  if (isAdminRole(req.user.role)) {
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
      title: isAdminRole(req.user.role) ? (conv.name || conv.username) : "Artist's Studio"
    },
    messages: msgs
  });
});

app.post('/api/v1/conversations/:id/messages', auth, (req, res, next) => {
  if (!isAdminRole(req.user.role)) {
    return res.status(410).json({ error: 'In-site chat removed.' });
  }
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
  if (!conv && !isAdminRole(req.user.role)) {
    conv = getOrCreateUserConversation(db, req.user);
  }
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  if (!isAdminRole(req.user.role) && conv.user_id !== req.user.id) {
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
    sender_role: isAdminRole(req.user.role) ? 'admin' : 'user',
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

app.get('/api/v1/admin/notifications', auth, adminOnly, (req, res) => {
  const db = load();
  const notes = Array.isArray(db.admin_notifications) ? db.admin_notifications.slice(-50).reverse() : [];
  res.json({ items: notes });
});

app.post('/api/v1/admin/notifications/read', auth, adminOnly, (req, res) => {
  const db = load();
  (db.admin_notifications || []).forEach((n) => { n.read = true; });
  save(db);
  res.json({ ok: true });
});


// ——— Admin read lists (API-only control plane) ———
app.get('/api/v1/admin/portfolio', auth, adminOnly, (req, res) => {
  const db = load();
  res.json({ items: db.portfolio || [] });
});

app.get('/api/v1/admin/reels', auth, adminOnly, (req, res) => {
  const db = load();
  const seen = new Set();
  let max = 0;
  let changed = false;
  const items = (db.reels || []).map((r, i) => {
    let id = Number(r && r.id) || 0;
    if (!id || seen.has(id)) {
      id = max + 1;
      changed = true;
    }
    seen.add(id);
    if (id > max) max = id;
    if (r && r.id !== id) {
      r = Object.assign({}, r, { id });
      changed = true;
    }
    return r;
  });
  if (changed) {
    db.reels = items;
    if (!db._seq) db._seq = {};
    db._seq.reels = max;
    try { save(db); } catch (_) {}
  }
  res.json({ items });
});

app.patch('/api/v1/admin/reels/:id', auth, adminOnly, (req, res) => {
  const db = load();
  const item = (db.reels || []).find((x) => x.id === +req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (req.body?.title != null) item.title = String(req.body.title).trim();
  if (req.body?.caption != null) item.caption = String(req.body.caption).trim();
  save(db);
  res.json({ item });
});

app.get('/api/v1/admin/policies', auth, adminOnly, (req, res) => {
  const db = load();
  res.json({ policies: db.policies || {} });
});

app.get('/api/v1/admin/theme', auth, adminOnly, (req, res) => {
  const db = load();
  res.json({ theme: db.theme || {} });
});

app.put('/api/v1/admin/theme', auth, adminOnly, (req, res) => {
  const db = load();
  const incoming = req.body?.theme || req.body || {};
  if (typeof incoming !== 'object') return res.status(400).json({ error: 'theme object required' });
  db.theme = Object.assign({}, db.theme || {}, {
    accent: incoming.accent != null ? String(incoming.accent).trim() : (db.theme && db.theme.accent),
    background: incoming.background != null ? String(incoming.background).trim() : (db.theme && db.theme.background),
    text: incoming.text != null ? String(incoming.text).trim() : (db.theme && db.theme.text),
    mode: incoming.mode != null ? String(incoming.mode).trim() : (db.theme && db.theme.mode) || 'dark',
    radius: incoming.radius != null ? String(incoming.radius).trim() : (db.theme && db.theme.radius)
  });
  pushLog(db, { type: 'design', action: 'theme_save', by: req.user && req.user.username, theme: db.theme });
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ theme: db.theme, ok: true });
});

app.get('/api/v1/admin/pages', auth, adminOnly, (req, res) => {
  const db = load();
  res.json({ pages: db.pages || {} });
});

app.put('/api/v1/admin/pages', auth, adminOnly, (req, res) => {
  const db = load();
  if (req.body?.pages && typeof req.body.pages === 'object') {
    db.pages = { ...db.pages, ...req.body.pages };
    save(db);
  }
  res.json({ pages: db.pages });
});

/** Catalog of admin API routes for the Android client */
app.get('/api/v1/admin/catalog', auth, adminOnly, (_req, res) => {
  res.json({
    version: 1,
    mode: 'api_only',
    note: 'Browser admin UI removed — use Studio Admin Android app',
    groups: {
      auth: ['POST /auth/login', 'GET /auth/me', 'POST /auth/logout', 'POST /auth/password', 'PATCH /auth/profile'],
      dashboard: ['GET /admin/dashboard', 'GET /admin/db-status', 'GET /admin/logs', 'GET /admin/notifications'],
      chat: ['GET /conversations', 'GET /conversations/:id/messages', 'POST /conversations/:id/messages'],
      contacts: ['GET /admin/contacts', 'GET /admin/contacts/:id', 'PATCH /admin/contacts/:id'],
      cms: ['GET|PUT /admin/content', 'GET|PUT /admin/site', 'GET|PUT /admin/socials', 'GET|PUT /admin/theme', 'GET|PUT /admin/pages', 'GET|PUT /admin/policies'],
      portfolio: ['GET|POST /admin/portfolio', 'PATCH|DELETE /admin/portfolio/:id', 'POST /admin/portfolio/upload', 'GET /admin/portfolio/analytics'],
      reels: ['GET|POST /admin/reels', 'PATCH|DELETE /admin/reels/:id', 'POST /admin/reels/upload', 'GET /admin/reels/analytics'],
      visitors: ['GET /admin/visitors', 'POST /visitor/register', 'POST /visitor/restore'],
      queue: ['GET /admin/upload-queue', 'POST /admin/upload-queue/:id/retry'],
      users: ['GET /admin/users', 'PATCH /admin/users/:id'],
      publish: ['POST /admin/publish', 'GET /admin/versions', 'POST /admin/versions/:id/restore', 'GET /admin/preview'],
      security: ['GET /admin/security/dashboard', 'GET /admin/security/rate-chart', 'GET /admin/security/audit', 'POST /admin/security/sessions/:id/revoke'],
      backup: ['GET /admin/backup'],
      calls: ['POST /calls/:id/accept', 'POST /calls/:id/reject', 'POST /calls/:id/end']
    }
  });
});

app.get('/api/v1/admin/dashboard', auth, adminOnly, (req, res) => {
  const db = load();
  const portfolio = db.portfolio || [];
  const reels = db.reels || [];
  const totalReelLikes = (db.reel_likes || []).length;
  const totalPhotoLikes = (db.portfolio_likes || []).length;
  const totalLikes = totalReelLikes + totalPhotoLikes;
  const dbMode = process.env.GITHUB_DB_TOKEN || process.env.GITHUB_TOKEN
    ? 'github'
    : process.env.DATABASE_URL
      ? 'postgres'
      : 'file';
  res.json({
    portfolio: portfolio.length,
    reels: reels.length,
    total_likes: totalLikes,
    reel_likes: totalReelLikes,
    photo_likes: totalPhotoLikes,
    photo_saves: (db.portfolio_saves || []).length,
    reel_saves: (db.reel_saves || []).length,
    versions: (db.versions || []).length,
    published_at: db.published_at || null,
    publish_status: db.published_at ? 'published' : 'never',
    has_draft: !!db.draft,
    db_status: dbMode,
    db: dbMode,
    server_time: new Date().toISOString()
  });
});



function ensureLogs(db) {
  if (!Array.isArray(db.admin_logs)) db.admin_logs = [];
  return db.admin_logs;
}

function pushLog(db, entry) {
  const logs = ensureLogs(db);
  logs.unshift({
    id: (logs[0] && logs[0].id ? logs[0].id : 0) + 1,
    at: new Date().toISOString(),
    ...entry
  });
  if (logs.length > 300) logs.length = 300;
}

app.get('/api/v1/admin/logs', auth, adminOnly, (req, res) => {
  const db = load();
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const type = String(req.query.type || '').trim();
  let items = ensureLogs(db).slice();
  // merge recent security audit as log-like entries
  const audit = ((db.security && db.security.audit) || []).slice(0, 50).map((a) => ({
    id: 'a-' + a.id,
    at: a.at,
    type: 'security',
    action: a.action,
    detail: a
  }));
  const engagement = (db.admin_notifications || []).slice(-40).reverse().map((n) => ({
    id: 'n-' + n.id,
    at: n.at,
    type: n.kind || 'engagement',
    action: n.kind,
    text: n.text,
    detail: n
  }));
  let merged = items.concat(audit).concat(engagement);
  merged.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (type) merged = merged.filter((x) => String(x.type || x.action || '').includes(type));
  res.json({ items: merged.slice(0, limit) });
});

/** Full remote content — every visible string */
app.get('/api/v1/admin/content', auth, adminOnly, (req, res) => {
  const db = load();
  res.json({
    site: db.site || {},
    theme: db.theme || {},
    pages: db.pages || {},
    socials: db.socials || {},
    policies: db.policies || {}
  });
});

app.put('/api/v1/admin/content', auth, adminOnly, (req, res) => {
  const db = load();
  const b = req.body || {};
  if (b.site && typeof b.site === 'object') {
    db.site = Object.assign({}, db.site || {}, b.site);
    if (b.site.copy && typeof b.site.copy === 'object') {
      db.site.copy = Object.assign({}, (db.site.copy || {}), b.site.copy);
      for (const k of Object.keys(b.site.copy)) {
        if (b.site.copy[k] && typeof b.site.copy[k] === 'object') {
          db.site.copy[k] = Object.assign({}, (db.site.copy || {})[k] || {}, b.site.copy[k]);
        }
      }
    }
    if (Array.isArray(b.site.services)) db.site.services = b.site.services;
  }
  if (b.theme && typeof b.theme === 'object') db.theme = Object.assign({}, db.theme || {}, b.theme);
  if (b.pages && typeof b.pages === 'object') db.pages = Object.assign({}, db.pages || {}, b.pages);
  if (b.socials && typeof b.socials === 'object') db.socials = Object.assign({}, db.socials || {}, b.socials);
  if (b.policies && typeof b.policies === 'object') {
    db.policies = db.policies || {};
    for (const k of Object.keys(b.policies)) {
      db.policies[k] = Object.assign({}, db.policies[k] || {}, b.policies[k]);
    }
  }
  pushLog(db, { type: 'cms', action: 'content_save', by: req.user && req.user.username });
  save(db);
  res.json({ ok: true, site: db.site, theme: db.theme, pages: db.pages, socials: db.socials, policies: db.policies });
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
  if (body.site && body.site.copy && typeof body.site.copy === 'object') {
    db.site.copy = Object.assign({}, (db.site && db.site.copy) || {}, body.site.copy);
  }
  pushLog(db, { type: 'cms', action: 'site_save', by: req.user && req.user.username });
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ site: db.site, theme: db.theme, pages: db.pages, draft: true, ok: true });
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
  pushLog(db, { type: 'socials', action: 'socials_save', by: req.user && req.user.username });
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ socials: db.socials, ok: true });
});

app.put('/api/v1/admin/policies', auth, adminOnly, (req, res) => {
  const db = load();
  const incoming = req.body?.policies || req.body || {};
  if (typeof incoming !== 'object') return res.status(400).json({ error: 'policies object required' });
  db.policies = db.policies || {};
  for (const slug of Object.keys(incoming)) {
    const row = incoming[slug] || {};
    db.policies[slug] = Object.assign({}, db.policies[slug] || {}, {
      title: row.title != null ? String(row.title) : (db.policies[slug] && db.policies[slug].title),
      body: row.body != null ? String(row.body) : (db.policies[slug] && db.policies[slug].body),
      slug
    });
  }
  pushLog(db, { type: 'cms', action: 'policies_save', by: req.user && req.user.username });
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ policies: db.policies, ok: true });
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
  const id = +req.params.id;
  db.portfolio = (db.portfolio || []).filter((x) => x.id !== id);
  pushLog(db, { type: 'media', action: 'portfolio_delete', id, by: req.user && req.user.username });
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ ok: true });
});

app.post('/api/v1/admin/reels', auth, adminOnly, (req, res) => {
  const db = load();
  db.reels = db.reels || [];
  const id = nextMediaId(db, 'reels', db.reels);
  const item = {
    id,
    title: String(req.body?.title || 'Reel').trim(),
    description: String(req.body?.description || req.body?.caption || '').trim(),
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
  const id = +req.params.id;
  db.reels = (db.reels || []).filter((x) => x.id !== id);
  pushLog(db, { type: 'media', action: 'reel_delete', id, by: req.user && req.user.username });
  db.draft = snapshotConfig(db);
  save(db);
  res.json({ ok: true });
});

app.get('/api/v1/admin/users', auth, adminOnly, (req, res) => {
  const db = load();
  const items = (db.users || [])
    .filter((u) => !isAdminRole(u.role))
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
  pushLog(db, { type: 'publish', action: 'publish', version: id, by: req.user && req.user.username });
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
app.post('/api/v1/admin/portfolio/upload', uploadLimiter, auth, adminOnly, (req, res, next) => {
  uploadPublic.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Image too large (max 120MB).'
        : (err.message || 'Upload failed');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}, async (req, res) => {
  if (req.file) {
    try { req.file.path = await compressImageIfNeeded(req.file.path, req.file.mimetype); req.file.filename = path.basename(req.file.path); } catch (_) {}
  }
  if (!req.file) return res.status(400).json({ error: 'Image file required' });
  try { assertSafeUpload(req.file); } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: e.message || 'Invalid file' });
  }

  const db = load();
  db.portfolio = db.portfolio || [];
  const id = nextMediaId(db, 'portfolio', db.portfolio);
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
  pushLog(db, { type: 'media', action: 'portfolio_upload', id: item.id, title: item.title, by: req.user && req.user.username });
  db.draft = typeof snapshotConfig === 'function' ? snapshotConfig(db) : db.draft;
  save(db);
  res.status(201).json({ item, ok: true });
});

app.post('/api/v1/admin/reels/upload', uploadLimiter, auth, adminOnly, (req, res, next) => {
  uploadPublic.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Video too large (max 120MB). Compress or pick a shorter clip.'
        : (err.message || 'Upload failed');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}, async (req, res) => {
  try {
  if (req.file && (req.file.mimetype || '').startsWith('image/')) {
    try { req.file.path = await compressImageIfNeeded(req.file.path, req.file.mimetype); req.file.filename = path.basename(req.file.path); } catch (_) {}
  }
  if (!req.file) return res.status(400).json({ error: 'Video/image file required — field name must be file' });
  try { assertSafeUpload(req.file); } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: e.message || 'Invalid file' });
  }

  const db = load();
  db.reels = db.reels || [];
  const id = nextMediaId(db, 'reels', db.reels);
  const name = (req.file.originalname || req.file.filename || '').toLowerCase();
  const mime = (req.file.mimetype || '').toLowerCase();
  const isVideo = mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp|mkv|avi)$/i.test(name) || /\.(mp4|webm|mov|m4v|3gp|mkv|avi)$/i.test(req.file.filename || '');
  const item = {
    id,
    title: String(req.body?.title || 'Reel').trim(),
    description: String(req.body?.description || req.body?.caption || '').trim(),
    thumb: isVideo ? '' : '/media/public/' + req.file.filename,
    url: '/media/public/' + req.file.filename,
    media_type: isVideo ? 'video' : 'image',
    size: req.file.size || 0,
    likes: 0,
    saves: 0,
    comments_count: 0,
    source: 'gallery',
    created_at: new Date().toISOString()
  };
  db.reels = db.reels || [];
  db.reels.push(item);
  pushLog(db, { type: 'media', action: 'reel_upload', id: item.id, title: item.title, by: req.user && req.user.username });
  db.draft = typeof snapshotConfig === 'function' ? snapshotConfig(db) : db.draft;
  try { save(db); } catch (e) { console.error('reel save', e.message); }
  res.status(201).json({ item, ok: true, url: item.url });
  } catch (e) {
    console.error('reel upload', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Reels engagement
app.get('/api/v1/reels/saved', auth, (req, res) => {
  const db = load();
  const ids = new Set(
    (db.reel_saves || []).filter((x) => x.user_id === req.user.id).map((x) => x.reel_id)
  );
  const items = (db.reels || [])
    .filter((r) => ids.has(r.id))
    .map((r) => {
      const likes = (db.reel_likes || []).filter((x) => x.reel_id === r.id).length;
      const saves = (db.reel_saves || []).filter((x) => x.reel_id === r.id).length;
      return {
        id: r.id,
        title: r.title,
        url: r.url,
        thumb: r.thumb || r.url,
        media_type: r.media_type || 'image',
        likes,
        saves,
        liked: (db.reel_likes || []).some((x) => x.reel_id === r.id && x.user_id === req.user.id),
        saved: true,
        comments_count: (db.reel_comments || []).filter((x) => x.reel_id === r.id).length
      };
    });
  res.json({ items });
});

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

app.post('/api/v1/reels/:id/like', engageLimiter, auth, (req, res) => {
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
  if (liked) {
    const reel = (db.reels || []).find((r) => r.id === id);
    notifyAdminEngagement('reel_like', {
      reel_id: id,
      title: reel?.title,
      username: req.user.username,
      name: req.user.name,
      text: `${req.user.name || req.user.username} liked reel "${reel?.title || id}"`
    });
  }
  res.json({ liked, likes });
});

app.post('/api/v1/reels/:id/save', engageLimiter, auth, (req, res) => {
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

app.post('/api/v1/reels/:id/comments', engageLimiter, authOptional, (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body || body.length > 500) return res.status(400).json({ error: 'Comment required (max 500)' });
  const db = load();
  const id = +req.params.id;
  if (!(db.reels || []).some((r) => r.id === id)) return res.status(404).json({ error: 'Not found' });
  db.reel_comments = db.reel_comments || [];
  if (db._seq.reel_comments == null) db._seq.reel_comments = db.reel_comments.length;
  const u = req.user || null;
  const guestName = String(req.body?.name || '').trim().slice(0, 40) || 'Guest';
  const c = {
    id: ++db._seq.reel_comments,
    reel_id: id,
    user_id: u ? u.id : null,
    username: u ? u.username : 'guest',
    name: u ? (u.name || u.username) : guestName,
    body,
    created_at: new Date().toISOString()
  };
  db.reel_comments.push(c);
  save(db);
  const reel = (db.reels || []).find((r) => r.id === id);
  try {
    notifyAdminEngagement('reel_comment', {
      reel_id: id,
      title: reel?.title,
      username: c.username,
      name: c.name,
      text: `${c.name} commented on "${reel?.title || id}": ${body.slice(0, 80)}`
    });
  } catch (_) {}
  res.status(201).json({ comment: c });
});

app.get('/api/v1/reels/:id/comments', (req, res) => {
  const db = load();
  const id = +req.params.id;
  const comments = (db.reel_comments || []).filter((c) => c.reel_id === id);
  res.json({ comments });
});





// ——— Visitors (mobile profile in DB — no browser cookies) ———
function normMobile(m) {
  return String(m || '').replace(/\D/g, '').slice(-15);
}

function ensureVisitors(db) {
  if (!db.visitors || typeof db.visitors !== 'object') db.visitors = {};
  return db.visitors;
}

app.post('/api/v1/visitor/register', engageLimiter, requireCaptcha, (req, res) => {
  const mobile = normMobile(req.body?.mobile);
  if (mobile.length < 10) return res.status(400).json({ error: 'Valid mobile required' });
  const db = load();
  const vs = ensureVisitors(db);
  if (!vs[mobile]) {
    vs[mobile] = {
      mobile,
      portfolio_likes: [],
      portfolio_saves: [],
      reel_likes: [],
      reel_saves: [],
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };
  } else {
    vs[mobile].last_seen = new Date().toISOString();
  }
  save(db);
  res.json({ ok: true, mobile, profile: vs[mobile] });
});

app.post('/api/v1/visitor/restore', engageLimiter, requireCaptcha, (req, res) => {
  const mobile = normMobile(req.body?.mobile);
  if (mobile.length < 10) return res.status(400).json({ error: 'Valid mobile required' });
  const db = load();
  const vs = ensureVisitors(db);
  const profile = vs[mobile];
  if (!profile) return res.status(404).json({ error: 'No profile for this mobile' });
  profile.last_seen = new Date().toISOString();
  save(db);
  res.json({ ok: true, mobile, profile });
});

app.get('/api/v1/admin/visitors', auth, adminOnly, (req, res) => {
  const db = load();
  const vs = ensureVisitors(db);
  const items = Object.values(vs).sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
  res.json({ items, count: items.length });
});

app.get('/api/v1/admin/upload-queue', auth, adminOnly, (req, res) => {
  const db = load();
  res.json({ items: db.upload_queue || [], note: 'Failed uploads appear here for retry' });
});

app.post('/api/v1/admin/upload-queue/:id/retry', auth, adminOnly, (req, res) => {
  const db = load();
  const q = db.upload_queue || [];
  const item = q.find((x) => String(x.id) === String(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  item.status = 'pending';
  item.updated_at = new Date().toISOString();
  save(db);
  res.json({ ok: true, item });
});

// ——— Portfolio like / save (public optional guest) ———
app.post('/api/v1/portfolio/:id/like', engageLimiter, authOptional, (req, res) => {
  const db = load();
  const id = +req.params.id;
  if (!(db.portfolio || []).some((x) => x.id === id)) return res.status(404).json({ error: 'Not found' });
  const aid = actorId(req);
  if (!aid) return res.status(400).json({ error: 'Guest id required' });
  db.portfolio_likes = db.portfolio_likes || [];
  const i = db.portfolio_likes.findIndex((x) => x.portfolio_id === id && x.actor === aid);
  let liked;
  if (i >= 0) { db.portfolio_likes.splice(i, 1); liked = false; }
  else {
    db.portfolio_likes.push({ portfolio_id: id, actor: aid, at: new Date().toISOString() });
    liked = true;
  }
  save(db);
  const likes = db.portfolio_likes.filter((x) => x.portfolio_id === id).length;
  if (aid && aid.startsWith('m:')) {
    const mobile = aid.slice(2);
    const vs = ensureVisitors(db);
    if (!vs[mobile]) {
      vs[mobile] = { mobile, portfolio_likes: [], portfolio_saves: [], reel_likes: [], reel_saves: [], created_at: new Date().toISOString(), last_seen: new Date().toISOString() };
    }
    const set = new Set(vs[mobile].portfolio_likes || []);
    if (liked) set.add(id); else set.delete(id);
    vs[mobile].portfolio_likes = [...set];
    vs[mobile].last_seen = new Date().toISOString();
  }
  if (liked) {
    const item = (db.portfolio || []).find((x) => x.id === id);
    notifyAdminEngagement('portfolio_like', {
      portfolio_id: id,
      title: item?.title,
      text: `Someone liked photo "${item?.title || id}"`
    });
  }
  res.json({ liked, likes });
});

app.post('/api/v1/portfolio/:id/save', engageLimiter, authOptional, (req, res) => {
  const db = load();
  const id = +req.params.id;
  if (!(db.portfolio || []).some((x) => x.id === id)) return res.status(404).json({ error: 'Not found' });
  const aid = actorId(req);
  if (!aid) return res.status(400).json({ error: 'Guest id required' });
  db.portfolio_saves = db.portfolio_saves || [];
  const i = db.portfolio_saves.findIndex((x) => x.portfolio_id === id && x.actor === aid);
  let saved;
  if (i >= 0) { db.portfolio_saves.splice(i, 1); saved = false; }
  else {
    db.portfolio_saves.push({ portfolio_id: id, actor: aid, at: new Date().toISOString() });
    saved = true;
  }
  save(db);
  res.json({ saved, saves: db.portfolio_saves.filter((x) => x.portfolio_id === id).length });
});

app.post('/api/v1/reels/:id/view', authOptional, (req, res) => {
  const db = load();
  const id = +req.params.id;
  const reel = (db.reels || []).find((r) => r.id === id);
  if (!reel) return res.status(404).json({ error: 'Not found' });
  reel.views = (reel.views || 0) + 1;
  save(db);
  res.json({ views: reel.views });
});

app.post('/api/v1/reels/:id/share', authOptional, (req, res) => {
  const db = load();
  const id = +req.params.id;
  const reel = (db.reels || []).find((r) => r.id === id);
  if (!reel) return res.status(404).json({ error: 'Not found' });
  reel.shares = (reel.shares || 0) + 1;
  save(db);
  notifyAdminEngagement('reel_share', {
    reel_id: id,
    title: reel.title,
    text: `Reel "${reel.title || id}" was shared`
  });
  res.json({ shares: reel.shares });
});

/** Admin: full reel analytics board */
app.get('/api/v1/admin/reels/analytics', auth, adminOnly, (req, res) => {
  const db = load();
  const items = (db.reels || []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description || r.caption || '',
    url: r.url,
    thumb: r.thumb || r.url,
    media_type: r.media_type || 'video',
    views: r.views || 0,
    shares: r.shares || 0,
    likes: (db.reel_likes || []).filter((x) => x.reel_id === r.id).length,
    saves: (db.reel_saves || []).filter((x) => x.reel_id === r.id).length,
    comments: (db.reel_comments || []).filter((x) => x.reel_id === r.id).length,
    created_at: r.created_at
  }));
  res.json({ items });
});

app.get('/api/v1/admin/portfolio/analytics', auth, adminOnly, (req, res) => {
  const db = load();
  const items = (db.portfolio || []).map((p) => ({
    id: p.id,
    title: p.title,
    image: p.image,
    likes: (db.portfolio_likes || []).filter((x) => x.portfolio_id === p.id).length,
    saves: (db.portfolio_saves || []).filter((x) => x.portfolio_id === p.id).length
  }));
  res.json({ items });
});

// ——— Phase 11 Security ———
app.get('/api/v1/admin/security/rate-chart', auth, adminOnly, (req, res) => {
  const db = load();
  const s = db.security || {};
  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, failed: 0, audit: 0 }));
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  (s.failed_logins || []).forEach((f) => {
    const ts = new Date(f.at).getTime();
    if (now - ts > day) return;
    hours[new Date(ts).getHours()].failed++;
  });
  (s.audit || []).forEach((a) => {
    const ts = new Date(a.at).getTime();
    if (now - ts > day) return;
    hours[new Date(ts).getHours()].audit++;
  });
  res.json({ hours, failed_24h: hours.reduce((n, h) => n + h.failed, 0), audit_24h: hours.reduce((n, h) => n + h.audit, 0) });
});

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

app.post('/api/v1/calls', auth, (_req, res) => {
  return res.status(410).json({ error: 'Calls disabled. Contact via WhatsApp / Instagram / email.' });
});
app.post('/api/v1/calls_disabled', auth, (req, res) => {
  if (isAdminRole(req.user.role)) {
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
  if (!isAdminRole(req.user.role) && call.from_user_id !== req.user.id) {
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
  if (!isAdminRole(req.user.role) && call.from_user_id !== req.user.id) {
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
app.post('/api/v1/chat/artist', auth, (_req, res) => {
  return res.status(410).json({ error: 'In-site chat removed.' });
});
app.post('/api/v1/chat/artist_disabled', auth, (req, res) => {
  if (isAdminRole(req.user.role)) {
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
// Phase 1–2: NO browser admin UI on domain — API only
app.get(sec.ADMIN_PATH, (_req, res) => {
  res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));
});
app.get([
  '/admin', '/admin.html', '/admin/', '/_panel.html',
  '/login', '/login/', '/wp-admin', '/wp-login.php',
  '/phpmyadmin', '/administrator', '/.env'
], (_req, res) => {
  res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').sendFile(path.join(ROOT, 'public', 'robots.txt'));
});
app.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').sendFile(path.join(ROOT, 'public', 'sitemap.xml'));
});
app.get('/favicon.svg', (_req, res) => {
  res.type('image/svg+xml').sendFile(path.join(ROOT, 'public', 'favicon.svg'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

// Phase 6 — no stack traces to clients
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('request error', err && err.message);
  if (req.path && req.path.startsWith('/api/')) {
    const status = err.status || err.statusCode || 500;
    return res.status(status).json({ error: status >= 500 ? 'Server error' : (err.message || 'Request failed') });
  }
  res.status(500).sendFile(path.join(ROOT, 'public', '404.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));
});

app.use((req, res) => {
  if (req.path && req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));
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

function notifyAdminEngagement(kind, payload) {
  try {
    const db = load();
    if (!Array.isArray(db.admin_notifications)) db.admin_notifications = [];
    const id = (db.admin_notifications.length ? db.admin_notifications[db.admin_notifications.length - 1].id : 0) + 1;
    const row = {
      id,
      kind,
      ...payload,
      at: new Date().toISOString(),
      read: false
    };
    db.admin_notifications.push(row);
    if (db.admin_notifications.length > 200) db.admin_notifications = db.admin_notifications.slice(-150);
    save(db);
    broadcastAdmin({ type: 'toast', title: kind, body: payload.text || payload.title || kind });
    broadcastAdmin({ type: 'engagement', ...row });
  } catch (e) {
    console.error('engagement notify', e.message);
  }
}

function notifyNewMessage(conv, msg) {
  // persist per-user chat file
  try {
    const db = load();
    const u = (db.users || []).find((x) => x.id === conv.user_id);
    if (u) persistUserAccount(db, u);
  } catch (_) {}

  const preview = msg.body || (msg.attachment ? ('File: ' + (msg.attachment.name || 'attachment')) : '');
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
    },
    notify: {
      username: conv.username,
      name: conv.name,
      text: preview
    }
  };
  // Persist in-app admin notification when user messages
  if (msg.sender_role === 'user') {
    const db = load();
    if (!Array.isArray(db.admin_notifications)) db.admin_notifications = [];
    db.admin_notifications.push({
      id: (db.admin_notifications.length ? db.admin_notifications[db.admin_notifications.length - 1].id : 0) + 1,
      kind: 'message',
      conversation_id: conv.id,
      username: conv.username,
      name: conv.name,
      text: String(preview).slice(0, 200),
      at: new Date().toISOString(),
      read: false
    });
    if (db.admin_notifications.length > 200) db.admin_notifications = db.admin_notifications.slice(-150);
    save(db);
    broadcastAdmin(payload);
    broadcastAdmin({ type: 'toast', title: conv.name || conv.username, body: preview });
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
    if (data.type === 'typing' && data.conversation_id) {
      const meta = wsClients.get(ws);
      if (!meta) return;
      const payload = {
        type: 'typing',
        conversation_id: +data.conversation_id,
        from_role: meta.role,
        from_name: meta.name || meta.username,
        typing: !!data.typing
      };
      if (isAdminRole(meta.role)) {
        // admin typing -> notify user of that conversation
        const db = load();
        const conv = (db.conversations || []).find((c) => c.id === +data.conversation_id);
        if (conv) broadcastUser(conv.user_id, payload);
      } else {
        broadcastAdmin(payload);
      }
      return;
    }
    if (data.type === 'auth' && data.token) {
      try {
        const payload = jwt.verify(data.token, JWT_SECRET_EFFECTIVE);
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

app.use((err, _req, res, _next) => {
  console.error(err && err.message ? err.message : err);
  if (res.headersSent) return;
  const status = err.status || 500;
  res.status(status).json({ error: status >= 500 ? 'Server error' : (err.message || 'Error') });
});

initDb()
  .then(() => {
    try {
      const d = load();
      syncAdminCredentials(d);
      save(d);
      console.log('Admin credentials synced from GitHub Password login');
    } catch (e) {
      console.error('admin cred sync', e.message);
    }
    server.listen(PORT, () => console.log("Artist's Studio on :" + PORT + " (HTTP + WS /ws)"));
  })
  .catch((e) => {
    console.error('DB init fatal', e);
    process.exit(1);
  });

