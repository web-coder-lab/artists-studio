# Studio Admin — Android (Phase D)

**Kotlin · Jetpack Compose · no WebView**

## Features
- **Gate** — “Server is starting…” until `/api/v1/health` OK
- **Login** — JWT admin / superadmin / moderator only
- **Home** — dashboard stats
- **Chat** — conversation list + thread reply
- **Contact inbox** — form submissions list
- **Keep-alive** — WorkManager ~15 min pings `ping` + `health` (helps free-tier wake)
- **BootReceiver** — reschedule keep-alive after reboot
- **FCM** — optional; add Firebase `google-services.json` later for push

## API
`https://artists-studio.onrender.com/api/v1/`

## Build APK
### Android Studio
Open `android-admin/` → Run / Build APK.

### CLI
```bash
cd android-admin
gradle wrapper --gradle-version 8.2.1
./gradlew :app:assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

### GitHub Actions
Workflow: `.github/workflows/android-admin.yml` → artifact **studio-admin-apk**.

## Login
Same admin credentials as web panel (`admin` + your password).
