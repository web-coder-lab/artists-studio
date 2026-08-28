package com.artistsstudio.admin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.data.SessionStore
import com.artistsstudio.admin.ui.GateScreen
import com.artistsstudio.admin.ui.HomeShell
import com.artistsstudio.admin.ui.LoginScreen
import com.artistsstudio.admin.ui.theme.Bg
import com.artistsstudio.admin.ui.theme.StudioTheme
import com.artistsstudio.admin.work.KeepAliveWorker
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Phase 3–4: Gate → Login → Home (Dashboard · Chat · Contacts · Notifications)
 */
class MainActivity : ComponentActivity() {
    private lateinit var session: SessionStore
    private lateinit var api: ApiClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(applicationContext)
        api = ApiClient(session)
        KeepAliveWorker.schedule(applicationContext)

        setContent {
            StudioTheme {
                Surface(Modifier.fillMaxSize(), color = Bg) {
                    AppRoot(api, session)
                }
            }
        }
    }
}

@Composable
fun AppRoot(api: ApiClient, session: SessionStore) {
    var stage by remember { mutableStateOf("gate") }
    var loginLoading by remember { mutableStateOf(false) }
    var loginError by remember { mutableStateOf<String?>(null) }
    var adminName by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    when (stage) {
        "gate" -> GateScreen(api) {
            scope.launch {
                val token = session.token()
                if (token.isNullOrBlank()) {
                    stage = "login"
                    return@launch
                }
                val ok = runCatching {
                    val me = api.me()
                    val u = me.optJSONObject("user") ?: JSONObject()
                    val role = u.optString("role")
                    if (role !in listOf("admin", "superadmin", "moderator")) {
                        session.clear()
                        false
                    } else {
                        adminName = u.optString("name").ifBlank { u.optString("username") }
                        true
                    }
                }.getOrDefault(false)
                stage = if (ok) "home" else "login"
            }
        }
        "login" -> LoginScreen(loginLoading, loginError) { user, pass ->
            scope.launch {
                loginLoading = true
                loginError = null
                try {
                    val res = api.login(user, pass)
                    val token = res.optString("token")
                    val u = res.optJSONObject("user") ?: JSONObject()
                    val role = u.optString("role")
                    when {
                        role !in listOf("admin", "superadmin", "moderator") ->
                            loginError = "Admin account required"
                        token.isBlank() -> loginError = "No token returned"
                        else -> {
                            session.save(token, u.optString("name"), role)
                            adminName = u.optString("name").ifBlank { u.optString("username") }
                            stage = "home"
                        }
                    }
                } catch (e: Exception) {
                    loginError = e.message ?: "Login failed"
                }
                loginLoading = false
            }
        }
        else -> HomeShell(api, adminName) {
            scope.launch {
                runCatching { api.logout() }
                session.clear()
                loginError = null
                stage = "login"
            }
        }
    }
}
