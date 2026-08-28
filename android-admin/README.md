# Studio Admin — Android

**Kotlin · Jetpack Compose · OkHttp · no WebView**

Website has **no browser admin**. This app talks only to REST API.

## Phase status
| Phase | Scope | Status |
|-------|--------|--------|
| 1–2 | Domain admin UI removed + REST API | Done (server) |
| **3** | **Gate · Login · Dashboard** | **This build** |
| 4 | Chat + contacts + notifications | Next |
| 5 | CMS + security + publish | Next |

## Phase 3 screens
1. **Gate** — “Server is starting…” until `GET /health`
2. **Login** — `POST /auth/login` (admin roles only)
3. **Dashboard** — `GET /admin/dashboard` + `GET /admin/db-status`

Session stored in DataStore. Keep-alive WorkManager pings API every ~15 min.

## API base
`https://artists-studio.onrender.com/api/v1/`  
See `../ADMIN_API.md`

## Build
Open `android-admin` in Android Studio → Run  
or Actions → **Studio Admin APK**
