# Security rollout — 6 phases (no Admin APK rebuild)

## Phase 1 — Foundation (DONE)
- Well-known + static: robots, sitemap, favicon.ico/svg, manifest, browserconfig
- `/.well-known/security.txt`, `/.well-known/change-password` → contact
- Security headers + HSTS (behind HTTPS)
- Clean `/health` + `/api/v1/health` (no secrets)
- HTTPS redirect behind proxy
- robots Disallow `/api/` and probe paths

## Phase 2 — Edge defense (DONE)
- Tighter CORS allowlist (default site origin; APK no-Origin OK)
- Global + route rate limits → 429
- WAF-lite (bad UA, probe paths → 404)

## Phase 3 — Admin + uploads (DONE)
- Admin key timing-safe compare, fail lockout → 429
- IP allowlist via ADMIN_ALLOWED_IPS (optional)
- Upload magic-byte check → 400
- Failed admin key audit log

## Phase 4 — CAPTCHA (DONE)
- GET /api/v1/captcha + /captcha/new
- requireCaptcha on visitor/contact/comments
- Admin X-Admin-Key skips CAPTCHA (APK safe)

## Phase 5 — Database (no migrate)
- Path allowlist writes
- Strip secrets from public API
- JSON size/validate
- Admin export snapshot

## Phase 6 — Audit + finish
- Audit polish
- Professional 404 for `/admin` probes
- Final verification checklist
