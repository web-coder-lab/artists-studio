# Studio Admin — Android

**Kotlin · Jetpack Compose · OkHttp · no WebView**

## Phases
| Phase | Scope | Status |
|-------|--------|--------|
| 1–2 | Domain admin UI off + REST | Done |
| 3 | Gate · Login · Dashboard | Done |
| **4** | **Chat · Contacts · Notifications** | **This build** |
| 5 | CMS · security · publish | Next |

## Tabs
- **Home** — dashboard + DB status
- **Chat** — conversation list → thread → reply (`POST …/messages`)
- **Inbox** — contact form + mark read
- **Alerts** — admin notifications + mark all read

## Build
Android Studio → `android-admin` → Run  
API: `https://artists-studio.onrender.com/api/v1/`
