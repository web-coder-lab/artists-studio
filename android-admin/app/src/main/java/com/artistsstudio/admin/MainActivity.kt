package com.artistsstudio.admin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

private val Accent = Color(0xFFC4A574)
private val Bg = Color(0xFF0A0A0B)
private val Card = Color(0xFF121214)
private val Text = Color(0xFFF4F1EA)
private val Muted = Color(0xFF9C978C)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("studio_admin", MODE_PRIVATE)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Accent,
                    background = Bg,
                    surface = Card,
                    onPrimary = Color(0xFF14110D),
                    onBackground = Text,
                    onSurface = Text
                )
            ) {
                Surface(Modifier.fillMaxSize(), color = Bg) {
                    AdminRoot(prefs)
                }
            }
        }
    }
}

private val http = OkHttpClient.Builder()
    .connectTimeout(90, TimeUnit.SECONDS)
    .readTimeout(90, TimeUnit.SECONDS)
    .build()

private const val BASE = BuildConfig.API_BASE

@Composable
fun AdminRoot(prefs: android.content.SharedPreferences) {
    var token by remember { mutableStateOf(prefs.getString("token", null)) }
    var gateDone by remember { mutableStateOf(false) }
    var gateMsg by remember { mutableStateOf("Server is starting....") }
    var seconds by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        while (!gateDone) {
            try {
                val ok = withContext(Dispatchers.IO) {
                    val req = Request.Builder().url(BASE + "health").get().build()
                    http.newCall(req).execute().use { it.isSuccessful }
                }
                if (ok) gateDone = true
            } catch (_: Exception) {
                gateMsg = "Server is starting...."
            }
            if (!gateDone) {
                delay(2500)
                seconds += 2
            }
        }
    }

    when {
        !gateDone -> GateScreen(gateMsg, seconds)
        token == null -> LoginScreen { t ->
            prefs.edit().putString("token", t).apply()
            token = t
        }
        else -> HomeScreen(token!!) {
            prefs.edit().remove("token").apply()
            token = null
        }
    }
}

@Composable
fun GateScreen(msg: String, seconds: Int) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(msg, color = Text, fontSize = 20.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(12.dp))
            Text("${seconds}s", color = Muted)
            Spacer(Modifier.height(16.dp))
            CircularProgressIndicator(color = Accent)
        }
    }
}

@Composable
fun LoginScreen(onOk: (String) -> Unit) {
    var user by remember { mutableStateOf("admin") }
    var pass by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("Studio Admin", color = Text, fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
        Text("Native control — not WebView", color = Muted, fontSize = 14.sp)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(user, { user = it }, label = { Text("Username") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(pass, { pass = it }, label = { Text("Password") }, modifier = Modifier.fillMaxWidth())
        err?.let { Text(it, color = Color(0xFFE07A6A), modifier = Modifier.padding(top = 8.dp)) }
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = {
                loading = true
                err = null
                scope.launch {
                    try {
                        val body = JSONObject().put("username", user).put("password", pass).toString()
                        val req = Request.Builder()
                            .url(BASE + "auth/login")
                            .post(body.toRequestBody("application/json".toMediaType()))
                            .build()
                        val t = withContext(Dispatchers.IO) {
                            http.newCall(req).execute().use { resp ->
                                val s = resp.body?.string().orEmpty()
                                if (!resp.isSuccessful) throw Exception(JSONObject(s).optString("error", "Login failed"))
                                val jo = JSONObject(s)
                                if (jo.getJSONObject("user").optString("role") != "admin")
                                    throw Exception("Admin only")
                                jo.getString("token")
                            }
                        }
                        onOk(t)
                    } catch (e: Exception) {
                        err = e.message
                    } finally {
                        loading = false
                    }
                }
            },
            enabled = !loading,
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color(0xFF14110D)),
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (loading) "…" else "Sign in") }
    }
}

@Composable
fun HomeScreen(token: String, onLogout: () -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    var dash by remember { mutableStateOf<JSONObject?>(null) }
    var contacts by remember { mutableStateOf(listOf<JSONObject>()) }
    var convos by remember { mutableStateOf(listOf<JSONObject>()) }
    val scope = rememberCoroutineScope()

    fun authGet(path: String): String {
        val req = Request.Builder().url(BASE + path)
            .header("Authorization", "Bearer $token").get().build()
        return http.newCall(req).execute().use { it.body?.string().orEmpty() }
    }

    LaunchedEffect(tab) {
        withContext(Dispatchers.IO) {
            try {
                when (tab) {
                    0 -> dash = JSONObject(authGet("admin/dashboard"))
                    1 -> {
                        val o = JSONObject(authGet("conversations"))
                        val arr = o.optJSONArray("items")
                        convos = buildList {
                            if (arr != null) for (i in 0 until arr.length()) add(arr.getJSONObject(i))
                        }
                    }
                    2 -> {
                        val o = JSONObject(authGet("admin/contacts"))
                        val arr = o.optJSONArray("items")
                        contacts = buildList {
                            if (arr != null) for (i in 0 until arr.length()) add(arr.getJSONObject(i))
                        }
                    }
                }
            } catch (_: Exception) {}
        }
    }

    Scaffold(
        containerColor = Bg,
        bottomBar = {
            NavigationBar(containerColor = Card) {
                NavigationBarItem(tab == 0, { tab = 0 }, { Text("Home") }, label = { Text("Home") })
                NavigationBarItem(tab == 1, { tab = 1 }, { Text("Chat") }, label = { Text("Chat") })
                NavigationBarItem(tab == 2, { tab = 2 }, { Text("Contact") }, label = { Text("Contact") })
                NavigationBarItem(tab == 3, { tab = 3 }, { Text("More") }, label = { Text("More") })
            }
        }
    ) { pad ->
        Column(Modifier.padding(pad).padding(16.dp)) {
            when (tab) {
                0 -> {
                    Text("Dashboard", color = Text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(12.dp))
                    dash?.let { d ->
                        Stat("Users", d.optInt("users").toString())
                        Stat("Chat unread", d.optInt("chat_unread").toString())
                        Stat("Contact new", d.optInt("contacts_new").toString())
                        Stat("Portfolio", d.optInt("portfolio").toString())
                        Stat("Reels", d.optInt("reels").toString())
                    } ?: Text("Loading…", color = Muted)
                    Spacer(Modifier.height(16.dp))
                    TextButton(onClick = onLogout) { Text("Sign out") }
                }
                1 -> {
                    Text("Chat Inbox", color = Text, fontSize = 22.sp)
                    LazyColumn {
                        items(convos) { c ->
                            ListItem(
                                headlineContent = { Text(c.optString("name", c.optString("username"))) },
                                supportingContent = { Text(c.optString("last_message"), color = Muted) }
                            )
                        }
                    }
                }
                2 -> {
                    Text("Contact form", color = Text, fontSize = 22.sp)
                    LazyColumn {
                        items(contacts) { c ->
                            ListItem(
                                headlineContent = { Text(c.optString("name")) },
                                supportingContent = { Text(c.optString("message"), color = Muted, maxLines = 2) }
                            )
                        }
                    }
                }
                else -> {
                    Text("Remote control", color = Text, fontSize = 22.sp)
                    Text("Site, socials, portfolio gallery upload, reels, publish — API ready. Expand screens next.", color = Muted)
                    Text("API: $BASE", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }
    }
}

@Composable
fun Stat(label: String, value: String) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = Card)) {
        Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = Muted)
            Text(value, color = Accent, fontWeight = FontWeight.SemiBold)
        }
    }
}
