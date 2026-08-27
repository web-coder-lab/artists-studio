const crypto = require('crypto');

const ADMIN_PATH = process.env.ADMIN_PATH || '/Hjwihebdiggeksyevkdibendkxbskjwowhdjfidvbebd';
const ADMIN_IPS = String(process.env.ADMIN_ALLOWED_IPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

function ipAllowed(req) {
  if (!ADMIN_IPS.length) return true; // not configured = allow (set env in prod)
  const ip = clientIp(req).replace('::ffff:', '');
  return ADMIN_IPS.some((a) => a === ip || a === '*');
}

function ensureSecurity(db) {
  if (!db.security) {
    db.security = {
      failed_logins: [],
      locks: {},
      sessions: [],
      audit: []
    };
  }
  if (!Array.isArray(db.security.failed_logins)) db.security.failed_logins = [];
  if (!db.security.locks) db.security.locks = {};
  if (!Array.isArray(db.security.sessions)) db.security.sessions = [];
  if (!Array.isArray(db.security.audit)) db.security.audit = [];
  return db.security;
}

function audit(db, entry) {
  const s = ensureSecurity(db);
  s.audit.unshift({
    id: crypto.randomBytes(6).toString('hex'),
    at: new Date().toISOString(),
    ...entry
  });
  if (s.audit.length > 500) s.audit.length = 500;
}

function isLocked(db, username) {
  const s = ensureSecurity(db);
  const key = String(username || '').toLowerCase();
  const until = s.locks[key];
  if (!until) return false;
  if (Date.now() > until) {
    delete s.locks[key];
    return false;
  }
  return true;
}

function recordFailedLogin(db, username, ip) {
  const s = ensureSecurity(db);
  const key = String(username || '').toLowerCase();
  s.failed_logins.unshift({ username: key, ip, at: new Date().toISOString() });
  if (s.failed_logins.length > 200) s.failed_logins.length = 200;
  const recent = s.failed_logins.filter(
    (f) => f.username === key && Date.now() - new Date(f.at).getTime() < LOCK_MS
  );
  if (recent.length >= LOCK_AFTER) {
    s.locks[key] = Date.now() + LOCK_MS;
    audit(db, { action: 'account_locked', username: key, ip });
  }
}

function clearFailed(db, username) {
  const s = ensureSecurity(db);
  const key = String(username || '').toLowerCase();
  s.failed_logins = s.failed_logins.filter((f) => f.username !== key);
  delete s.locks[key];
}

function createSession(db, user, ip, ua) {
  const s = ensureSecurity(db);
  const sid = crypto.randomBytes(24).toString('hex');
  s.sessions.unshift({
    id: sid,
    user_id: user.id,
    username: user.username,
    role: user.role,
    ip,
    ua: String(ua || '').slice(0, 180),
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString()
  });
  if (s.sessions.length > 100) s.sessions.length = 100;
  return sid;
}

function revokeSession(db, sid) {
  const s = ensureSecurity(db);
  s.sessions = s.sessions.filter((x) => x.id !== sid);
}

function revokeUserSessions(db, userId) {
  const s = ensureSecurity(db);
  s.sessions = s.sessions.filter((x) => x.user_id !== userId);
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('X-XSS-Protection', '0');
  // light CSP
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline'; connect-src 'self' wss: https:; frame-ancestors 'none'"
  );
  next();
}

module.exports = {
  ADMIN_PATH,
  ADMIN_IPS,
  clientIp,
  ipAllowed,
  ensureSecurity,
  audit,
  isLocked,
  recordFailedLogin,
  clearFailed,
  createSession,
  revokeSession,
  revokeUserSessions,
  securityHeaders
};
