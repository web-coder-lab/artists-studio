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

## Phase 5 — Database (no migrate) (DONE)
- writeFile path allowlist + max 1.5MB JSON
- exportPublicSafe strips hashes/credentials
- GET /admin/db/export + /admin/backup (admin key)
- DB stays on GitHub repo

## Phase 6 — Audit + finish (DONE)
- Professional 404.html for probes (no path leak)
- API 404 JSON only `{ error: "Not found" }`
- Global error handler (no stacks)
- GET /api/v1/admin/security/summary
- Final verification checklist below

### Final checklist
| Check | Target |
|-------|--------|
| No admin key | 401 |
| Wrong admin key flood | 429 |
| IP allowlist (if set) | 403 |
| /admin probe | 404 page |
| Like flood | 429 |
| Bad upload | 400 |
| Captcha fail (public) | 400 |
| Health | { status, t } only |
| DB export | admin key only |

