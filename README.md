# Artist's Studio — Phase 11 Security

**API:** https://artists-studio.onrender.com  

## Admin panel (hard path)
`/Hjwihebdiggeksyevkdibendkxbskjwowhdjfidvbebd`  

`/admin` and `/admin.html` → **404**

## IP allowlist
Render env: `ADMIN_ALLOWED_IPS=1.2.3.4,5.6.7.8`  
Empty = all IPs (dev only). Admin APIs + hard path check allowlist.

## Site lock
All public content APIs require JWT. UI shows sign-in wall until identity exists.

## Security
- Failed login lock (5 / 15min)
- Sessions + revoke
- Audit log
- Security dashboard in admin
- Security headers + CSP
- RBAC: superadmin / admin / moderator / user

## Symbols UI
Nav and Contact channels use symbols (not word labels).
