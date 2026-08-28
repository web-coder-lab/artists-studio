# Artist's Studio — Admin API (API-only)

**Base:** `https://artists-studio.onrender.com/api/v1`  
**Auth:** `Authorization: Bearer <jwt>` after `POST /auth/login`  
**Roles:** `superadmin` | `admin` | `moderator`  
**Browser admin UI:** removed from domain.

## Phase plan
| Phase | Scope |
|-------|--------|
| 1–2 | Domain admin UI off + full REST catalog |
| 3 | Android shell: gate, login, dashboard |
| 4 | Chat + contacts + notifications |
| 5 | CMS (site/socials/portfolio/reels) + security + publish |

## Auth
- `POST /auth/login` `{ username, password }` → `{ token, user }`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/password` `{ current_password, new_password }`
- `PATCH /auth/profile` `{ name }`

## Control plane
- `GET /admin/catalog` — route map for the app
- `GET /admin/dashboard`
- `GET /admin/db-status`
- `GET /admin/notifications` · `POST /admin/notifications/read`
- `GET /admin/backup`

## Chat (same as web user API; admin sees all threads)
- `GET /conversations`
- `GET /conversations/:id/messages`
- `POST /conversations/:id/messages` `{ body }` or multipart file

## Contacts
- `GET /admin/contacts`
- `GET /admin/contacts/:id`
- `PATCH /admin/contacts/:id` `{ status }`

## CMS
- `GET|PUT /admin/site`
- `GET|PUT /admin/socials`
- `GET|PUT /admin/theme`
- `GET|PUT /admin/pages`
- `GET /admin/policies` · `PUT /admin/policies/:slug`

## Portfolio / Reels
- `GET|POST /admin/portfolio` · `PATCH|DELETE /admin/portfolio/:id` · `POST /admin/portfolio/upload`
- `GET|POST /admin/reels` · `PATCH|DELETE /admin/reels/:id` · `POST /admin/reels/upload`

## Users / publish / security
- `GET /admin/users` · `PATCH /admin/users/:id`
- `POST /admin/publish` · `GET /admin/versions` · `POST /admin/versions/:id/restore` · `GET /admin/preview`
- `GET /admin/security/dashboard` · `rate-chart` · `audit` · session revoke

## Realtime
- WebSocket `/ws` · auth message `{ type:"auth", token }` · events: `new_message`, `toast`, `typing`
