# Artist's Studio — Admin (Android)

**Native Jetpack Compose** admin client (no WebView).

- Gate: "Server is starting...." + timer until `/health`
- Login → JWT admin
- Home dashboard, Chat list, Contact form list
- API: `https://artists-studio.onrender.com/api/v1/`

## Build
Open in Android Studio or:

```bash
./gradlew :app:assembleDebug
```

Requires Android SDK. GitHub Actions workflow can produce APK artifact.
