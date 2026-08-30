# Security rollout — 6 phases (no Admin APK rebuild)

## Phase 1 — Foundation (DONE)
- Well-known + static: robots, sitemap, favicon.ico/svg, manifest, browserconfig
- `/.well-known/security.txt`, `/.well-known/change-password` → contact
- Security headers + HSTS (behind HTTPS)
- Clean `/health` + `/api/v1/health` (no secrets)
- HTTPS redirect behind proxy
- robots Disallow `/api/` and probe paths

## Phase 2 — Edge defense
- Tighter CORS allowlist
- Global + route rate limits → 429
- WAF-lite (bad UA, probe paths → 404)

## Phase 3 — Admin + uploads
- Admin key 401, optional IP 403
- Upload MIME/size harden → 400
- Failed admin auth counters

## Phase 4 — CAPTCHA
- Math CAPTCHA public writes
- Admin key skips CAPTCHA (APK safe)

## Phase 5 — Database (no migrate)
- Path allowlist writes
- Strip secrets from public API
- JSON size/validate
- Admin export snapshot

## Phase 6 — Audit + finish
- Audit polish
- Professional 404 for `/admin` probes
- Final verification checklist
