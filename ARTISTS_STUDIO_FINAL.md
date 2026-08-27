# Artist's Studio — Final Verification & Android Admin Plan

**Last verified:** 2026-08-27  
**Public site:** https://artists-studio.onrender.com  
**GitHub:** https://github.com/web-coder-lab/artists-studio  
**Render service:** `artists-studio` (Node web service)

---

## 1. Server verification (all green)

| Check | Result |
|--------|--------|
| `GET /api/v1/health` | `200` · `{"status":"ok","service":"artists-studio","phase":3}` |
| `POST /api/v1/auth/login` | `200` · JWT issued |
| `GET /api/v1/site` | Brand + pages OK |
| `GET /api/v1/socials` | WhatsApp `923244015101`, email, Instagram OK |
| `GET /api/v1/portfolio` | 4 items |
| `GET /api/v1/reels` | OK |
| `GET /api/v1/policies` | OK |
| `POST /api/v1/contact` | Creates inquiry |
| `GET /api/v1/admin/contacts` | Admin auth required · list + unread |
| Public pages `/`, about, portfolio, reels, services, contact, account, policies | All `200` |
| `/admin.html` | `200` (temporary web admin; **final admin = Android app**) |

**Studio contacts (locked in API):**
- WhatsApp: `03244015101` → `wa.me/923244015101`
- Email: `abdullahshah5919@gmail.com`
- Instagram: `https://www.instagram.com/aartistsstudios?...`

**Seed admin (change in production):** `admin` / `admin123`

> Free Render cold starts: first request after idle may take 30–60s. Android gate screen + keep-alive (below) address this.

---

## 2. What is live today (Phases 1–3)

### Public website (multi-page, professional)
- **Not** one long scroll of everything — separate pages: Home, About, Portfolio, Reels, Services, Contact, Account, Policies
- No “Phase 1/2/3” labels on the public UI
- Theme: dark studio, Cormorant + DM Sans, gold accent
- Contact form → server → admin Contact inbox
- WhatsApp: prefill Username/Name + warning popup (“don’t remove Name/Username”)

### Backend API
- Auth: register, login (JWT), me, logout
- Public CMS read: site, portfolio, reels, socials, policies
- Contact submissions
- Admin contacts list / detail / status patch
- Rate limits on auth + contact

### Temporary web admin
- `/admin.html` — Contact inbox only  
- **Final:** full control moves to **Android Admin App** (this document’s plan)

---

## 3. Product architecture (final)

```
┌─────────────────────────────────────┐
│     Artist's Studio BACKEND         │
│  REST API · (later WS) · DB · Media │
└──────────────┬──────────────────────┘
               │
     ┌─────────┴──────────┐
     ▼                    ▼
 PUBLIC WEB            ADMIN ANDROID
 (visitors/users)      (owner control)
```

- Admin **never** edits the live DOM directly
- Admin changes **API / published config** → website re-fetches and renders
- Full remote control of site content, users, contact, (later) chat, media, builder

---

## 4. Design references (chat history + prior APK work)

From this project’s history (Div Store, FilePlanet, prior Compose/Kotlin attempts):

| Pattern to keep | Pattern to avoid |
|-----------------|------------------|
| Clear bottom navigation | Everything on one screen |
| Strong hierarchy, large type for titles | Cluttered multi-CTA hero |
| Dark surfaces + one accent | Random bright gradients |
| Thumb-friendly lists (Inbox) | Tiny dense tables |
| Empty states + loading | Silent failures |
| Separate screens per task | Modal-only navigation |

**Artist’s Studio visual direction (Android Admin):**
- Same DNA as the website: near-black (`#0A0A0B`), warm paper text (`#F4F1EA`), accent gold (`#C4A574`)
- Material 3 + Compose
- Photography-admin feel: calm, sparse chrome, list → detail flows

---

## 5. Android Admin App — stack (locked)

| Layer | Choice |
|--------|--------|
| Language | **Kotlin** |
| UI | **Jetpack Compose** |
| Min SDK | 26+ (recommend 26/28) |
| Networking | Retrofit + OkHttp |
| JSON | Kotlinx Serialization or Moshi |
| Auth storage | EncryptedSharedPreferences / DataStore |
| Images | Coil |
| Background work | WorkManager (keep-alive) |
| Nav | Navigation Compose (one graph, many screens) |
| IDE | Android Studio |

**Rule:** One concern per screen — **no single-page god UI**.

---

## 6. Server gate + keep-alive (required behaviour)

### 6.1 Cold-start gate (app open)

When the user opens the app:

1. Show **splash / gate** screen (not the main shell yet)
2. Ping `GET /api/v1/health` (with long timeout, e.g. 60–90s)
3. If server is waking / unreachable:
   - Copy: **“Server is starting….”**
   - **Timer** visible (elapsed seconds)
   - Optional subtle progress (indeterminate)
4. Retry every few seconds until health = OK **or** user cancels
5. Only then navigate to **Login** or **Home (Dashboard)** if session exists

```
App launch
   → GateScreen ("Server is starting…." + timer)
   → health OK
   → Login / Dashboard
```

### 6.2 Background keep-alive (anti–cold-start)

- While app process is alive (foreground **or** background, within OS limits):
  - **WorkManager PeriodicWork** ~ every **4 minutes** (flex allowed)
  - Also staggered targets if multiple services exist: **3 / 4 / 5 / 6 / 8 min** intervals (multiple one-off or distinct workers)
- Each tick: lightweight `GET /api/v1/health` (and optionally other service health URLs)
- Goal: reduce Render free-tier sleep; **not** a guarantee against all platform sleep policies
- Battery: constraints `NetworkType.CONNECTED`; avoid heavy payloads

### 6.3 Multi-server wake (future)

If more than one Render service is used (API, media, etc.):

| Interval | Target example |
|----------|----------------|
| 3 min | Primary API health |
| 4 min | Same or secondary |
| 5–8 min | Extra services / static |

Config list of base URLs in app (remote-configurable later from admin settings).

---

## 7. Admin app — screen map (separate pages)

Bottom nav (main):

```
Home · Inbox · Builder · Media · More
```

| Screen | Purpose |
|--------|---------|
| **Gate** | Server starting + timer |
| **Login** | Admin username / password → JWT |
| **Dashboard (Home)** | Counts, recent activity, published version |
| **Contact Inbox** | Website form submissions (Phase 3 data) |
| **Contact Detail** | Message body, mark read/replied/closed |
| **Chat Inbox** | Private “Contact Artist” threads (Phase 4+) |
| **Chat Thread** | Messages + attachments |
| **Users** | List, enable/disable, open conversation |
| **Pages** | List of site pages |
| **Builder** | Section/component edit (later phases) |
| **Portfolio** | CRUD list |
| **Reels** | CRUD list |
| **Media library** | Upload / pick |
| **Socials & WhatsApp** | Numbers, Instagram, email |
| **Theme** | Colors / fonts (config) |
| **Policies** | Edit policy text |
| **SEO** | Titles / descriptions |
| **Versions** | Publish / restore (later) |
| **Settings** | Keep-alive intervals, API base URL, logout |

**Contact** (form queue) and **Inbox** (private chat) stay **separate** — as in the master plan.

---

## 8. API contract for Android (current + planned)

### Live now (wire these first)

```
GET  /api/v1/health
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me

GET  /api/v1/site
GET  /api/v1/portfolio
GET  /api/v1/reels
GET  /api/v1/socials
GET  /api/v1/policies
GET  /api/v1/whatsapp-prefill

POST /api/v1/contact

GET   /api/v1/admin/contacts
GET   /api/v1/admin/contacts/:id
PATCH /api/v1/admin/contacts/:id   { "status": "read"|"replied"|"closed" }
```

### Next backend slices (for full remote control)

```
# Site / builder
GET/PUT  /api/v1/admin/site
GET/PUT  /api/v1/admin/pages/:slug
GET/PUT  /api/v1/admin/socials
GET/PUT  /api/v1/admin/policies/:slug
POST     /api/v1/admin/portfolio
PATCH    /api/v1/admin/portfolio/:id
DELETE   /api/v1/admin/portfolio/:id
# same pattern for reels

# Users
GET    /api/v1/admin/users
PATCH  /api/v1/admin/users/:id   { "status": "active"|"disabled" }

# Messaging (Phase 4+)
GET/POST /api/v1/admin/conversations
GET/POST /api/v1/admin/conversations/:id/messages

# Publish
POST /api/v1/admin/publish
GET  /api/v1/admin/versions
POST /api/v1/admin/versions/:id/restore
```

All admin routes: `Authorization: Bearer <jwt>` + `role === admin`.

---

## 9. Suggested Android package structure

```
com.artistsstudio.admin
├── ArtistAdminApp.kt
├── ui/
│   ├── gate/GateScreen.kt
│   ├── auth/LoginScreen.kt
│   ├── home/DashboardScreen.kt
│   ├── contact/ContactListScreen.kt
│   ├── contact/ContactDetailScreen.kt
│   ├── users/UsersScreen.kt
│   ├── builder/...
│   ├── media/...
│   └── theme/StudioTheme.kt
├── data/
│   ├── api/StudioApi.kt
│   ├── api/Dto.kt
│   ├── repo/...
│   └── session/SessionStore.kt
├── work/ServerKeepAliveWorker.kt
└── nav/AdminNavGraph.kt
```

---

## 10. Implementation phases for the Android app (decision)

| App phase | Deliverable |
|-----------|-------------|
| **A0** | Project shell, StudioTheme, Navigation, GateScreen + health poll + timer |
| **A1** | Login + secure token + Dashboard shell |
| **A2** | Contact list + detail + status actions (uses live admin APIs) |
| **A3** | WorkManager keep-alive (4 min + staggered URLs) |
| **A4** | Socials / site text remote edit APIs + screens |
| **A5** | Portfolio / reels admin CRUD |
| **A6** | Users management |
| **A7** | Chat inbox (when backend Phase 4 ready) |
| **A8** | Builder + publish/versions |

**Recommended build order:** A0 → A1 → A2 → A3 (usable admin on phone) then remote CMS edits.

---

## 11. Security notes

- Store JWT encrypted; clear on logout
- Certificate pinning optional later
- No plaintext passwords in logs
- Admin-only endpoints enforced server-side
- Keep-alive is health-only — no auth secrets in query strings

---

## 12. Success criteria (Admin Android MVP)

- [ ] Cold server → user sees **“Server is starting….”** + timer → enters app when healthy  
- [ ] Background keep-alive pings ~ every 4 minutes  
- [ ] Admin login works against production API  
- [ ] Contact submissions visible and actionable on phone  
- [ ] Separate screens (not one mega-page)  
- [ ] Website remains multi-page professional public client  

---

## 13. Next concrete step

1. Scaffold Kotlin + Compose admin app (`artists-studio-admin`)  
2. Implement **GateScreen** + Retrofit health client  
3. Login + Contact inbox against `https://artists-studio.onrender.com`  

Website Phases 1–3 are verified and stable enough to drive the Android admin client.
