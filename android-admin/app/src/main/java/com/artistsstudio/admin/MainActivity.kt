package com.artistsstudio.admin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.data.SessionStore
import com.artistsstudio.admin.work.KeepAliveWorker
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

private val Bg = Color(0xFF0A0A0B)
private val CardBg = Color(0xFF141416)
private val Accent = Color(0xFFC4A574)
private val Muted = Color(0xFF9C978C)
private val TextC = Color(0xFFF4F1EA)

class MainActivity : ComponentActivity() {
    private lateinit var session: SessionStore
    private lateinit var api: ApiClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(applicationContext)
        api = ApiClient(session)
        KeepAliveWorker.schedule(applicationContext)

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Bg,
                    surface = CardBg,
                    primary = Accent,
                    onPrimary = Color(0xFF14110D),
                    onBackground = TextC,
                    onSurface = TextC
                )
            ) {
                Surface(Modifier.fillMaxSize(), color = Bg) {
                    AppRoot(api, session)
                }
            }
        }
    }
}

@Composable
fun AppRoot(api: ApiClient, session: SessionStore) {
    var phase by remember { mutableStateOf("gate") } // gate | login | home
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        // Gate: wait for server
        var secs = 0
        while (secs < 120) {
            val ok = runCatching {
                val h = api.health()
                h.optString("status") == "ok"
            }.getOrDefault(false)
            if (ok) break
            delay(2000)
            secs += 2
        }
        val token = session.token()
        if (token.isNullOrBlank()) {
            phase = "login"
        } else {
            val meOk = runCatching {
                val me = api.me()
                val role = me.optJSONObject("user")?.optString("role").orEmpty()
                role == "admin" || role == "superadmin" || role == "moderator"
            }.getOrDefault(false)
            phase = if (meOk) "home" else "login"
        }
    }

    when (phase) {
        "gate" -> GateScreen()
        "login" -> LoginScreen(error) { user, pass ->
            scope.launch {
                error = null
                try {
                    val res = api.login(user, pass)
                    val token = res.optString("token")
                    val u = res.optJSONObject("user") ?: JSONObject()
                    val role = u.optString("role")
                    if (role != "admin" && role != "superadmin" && role != "moderator") {
                        error = "Admin account required"
                        return@launch
                    }
                    session.save(token, u.optString("name"), role)
                    phase = "home"
                } catch (e: Exception) {
                    error = e.message ?: "Login failed"
                }
            }
        }
        else -> HomeShell(api, session) {
            scope.launch {
                session.clear()
                phase = "login"
            }
        }
    }
}

@Composable
fun GateScreen() {
    var t by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            t++
        }
    }
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Artist's Studio", color = Accent, fontSize = 14.sp, letterSpacing = 2.sp)
        Spacer(Modifier.height(12.dp))
        Text("Server is starting…", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(8.dp))
        Text("${t}s — waiting for health", color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(24.dp))
        LinearProgressIndicator(
            modifier = Modifier.fillMaxWidth(0.5f),
            color = Accent,
            trackColor = Color(0xFF2A2A2E)
        )
    }
}

@Composable
fun LoginScreen(error: String?, onLogin: (String, String) -> Unit) {
    var user by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("Studio Admin", color = TextC, fontSize = 28.sp, fontWeight = FontWeight.Medium)
        Text("Sign in with an admin account", color = Muted, fontSize = 14.sp)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = user,
            onValueChange = { user = it },
            label = { Text("Username") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = pass,
            onValueChange = { pass = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors()
        )
        if (!error.isNullOrBlank()) {
            Text(error, color = Color(0xFFE07A6A), modifier = Modifier.padding(top = 12.dp))
        }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { onLogin(user.trim(), pass) },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color(0xFF14110D)),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Sign in")
        }
    }
}

@Composable
fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Accent,
    unfocusedBorderColor = Color(0xFF2A2A2E),
    focusedLabelColor = Accent,
    unfocusedLabelColor = Muted,
    cursorColor = Accent,
    focusedTextColor = TextC,
    unfocusedTextColor = TextC
)

@Composable
fun HomeShell(api: ApiClient, session: SessionStore, onLogout: () -> Unit) {
    var tab by remember { mutableStateOf(0) }
    var chatId by remember { mutableStateOf<Int?>(null) }

    if (chatId != null) {
        ChatThreadScreen(api, chatId!!) { chatId = null }
        return
    }

    Scaffold(
        containerColor = Bg,
        bottomBar = {
            NavigationBar(containerColor = CardBg) {
                listOf("Home", "Chat", "Inbox", "More").forEachIndexed { i, label ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i },
                        icon = { Text(if (tab == i) "●" else "○", color = if (tab == i) Accent else Muted) },
                        label = { Text(label, fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Accent,
                            selectedTextColor = Accent,
                            unselectedIconColor = Muted,
                            unselectedTextColor = Muted,
                            indicatorColor = Color(0xFF1C1C1F)
                        )
                    )
                }
            }
        }
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (tab) {
                0 -> DashboardTab(api, onLogout)
                1 -> ChatListTab(api) { chatId = it }
                2 -> ContactsTab(api)
                else -> MoreTab(api, onLogout)
            }
        }
    }
}

@Composable
fun DashboardTab(api: ApiClient, onLogout: () -> Unit) {
    var dash by remember { mutableStateOf<JSONObject?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        runCatching { dash = api.dashboard() }.onFailure { err = it.message }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Control Center", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
            TextButton(onClick = {
                scope.launch { runCatching { dash = api.dashboard() } }
            }) { Text("Refresh", color = Accent) }
        }
        Spacer(Modifier.height(12.dp))
        err?.let { Text(it, color = Color(0xFFE07A6A)) }
        val d = dash
        if (d != null) {
            Stat("Users", d.optInt("users").toString())
            Stat("Conversations", d.optInt("conversations").toString())
            Stat("Chat unread", d.optInt("chat_unread").toString())
            Stat("Contacts new", d.optInt("contacts_new").toString())
            Stat("Portfolio", d.optInt("portfolio").toString())
            Stat("Reels", d.optInt("reels").toString())
        }
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onLogout) { Text("Sign out", color = Muted) }
    }
}

@Composable
fun Stat(label: String, value: String) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = CardBg)
    ) {
        Row(
            Modifier.padding(14.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(label, color = Muted)
            Text(value, color = Accent, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun ChatListTab(api: ApiClient, onOpen: (Int) -> Unit) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        while (true) {
            runCatching {
                val arr = api.conversations()
                items = (0 until arr.length()).map { arr.getJSONObject(it) }
                err = null
            }.onFailure { err = it.message }
            delay(8000)
        }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Messages", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
        err?.let { Text(it, color = Color(0xFFE07A6A), fontSize = 13.sp) }
        Spacer(Modifier.height(8.dp))
        LazyColumn {
            items(items, key = { it.optInt("id") }) { c ->
                val id = c.optInt("id")
                val title = c.optString("name").ifBlank { c.optString("username") }
                val last = c.optString("last_message")
                val unread = c.optInt("unread")
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .clickable { onOpen(id) },
                    colors = CardDefaults.cardColors(containerColor = CardBg)
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(title, color = TextC, fontWeight = FontWeight.Medium)
                            if (unread > 0) Text("$unread", color = Accent, fontSize = 12.sp)
                        }
                        if (last.isNotBlank()) {
                            Text(last, color = Muted, fontSize = 13.sp, maxLines = 2)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ChatThreadScreen(api: ApiClient, conversationId: Int, onBack: () -> Unit) {
    var messages by remember { mutableStateOf(listOf<JSONObject>()) }
    var title by remember { mutableStateOf("Chat") }
    var draft by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    suspend fun reload() {
        val data = api.messages(conversationId)
        val conv = data.optJSONObject("conversation")
        if (conv != null) {
            title = conv.optString("name").ifBlank { conv.optString("username") }
        }
        val arr = data.optJSONArray("messages") ?: org.json.JSONArray()
        messages = (0 until arr.length()).map { arr.getJSONObject(it) }
    }

    LaunchedEffect(conversationId) {
        while (true) {
            runCatching { reload(); err = null }.onFailure { err = it.message }
            delay(5000)
        }
    }
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }

    Column(Modifier.fillMaxSize().background(Bg)) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onBack) { Text("‹ Back", color = Accent) }
            Text(title, color = TextC, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 8.dp))
        }
        err?.let { Text(it, color = Color(0xFFE07A6A), modifier = Modifier.padding(horizontal = 16.dp)) }
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).padding(horizontal = 12.dp)
        ) {
            items(messages, key = { it.optInt("id") }) { m ->
                val mine = m.optString("sender_role") == "admin"
                val body = m.optString("body")
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start
                ) {
                    Surface(
                        color = if (mine) Color(0xFF2A241C) else Color(0xFF161618),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Text(
                            body,
                            color = TextC,
                            modifier = Modifier.padding(10.dp).widthIn(max = 280.dp)
                        )
                    }
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Reply…", color = Muted) },
                colors = fieldColors()
            )
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = {
                    val text = draft.trim()
                    if (text.isEmpty()) return@Button
                    scope.launch {
                        runCatching {
                            api.sendMessage(conversationId, text)
                            draft = ""
                            reload()
                        }.onFailure { err = it.message }
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color(0xFF14110D))
            ) { Text("Send") }
        }
    }
}

@Composable
fun ContactsTab(api: ApiClient) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    LaunchedEffect(Unit) {
        runCatching {
            val arr = api.contacts()
            items = (0 until arr.length()).map { arr.getJSONObject(it) }
        }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Contact form", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(8.dp))
        LazyColumn {
            items(items) { c ->
                Card(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    colors = CardDefaults.cardColors(containerColor = CardBg)
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Text(c.optString("name"), color = TextC, fontWeight = FontWeight.Medium)
                        Text(c.optString("message"), color = Muted, fontSize = 13.sp, maxLines = 3)
                    }
                }
            }
        }
    }
}

@Composable
fun MoreTab(api: ApiClient, onLogout: () -> Unit) {
    var db by remember { mutableStateOf("…") }
    LaunchedEffect(Unit) {
        runCatching { db = api.dbStatus().optString("driver", "?") }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("More", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(12.dp))
        Text("Database: $db", color = Muted)
        Text("API: ${BuildConfig.API_BASE}", color = Muted, fontSize = 12.sp)
        Text("Keep-alive: every ~15 min (WorkManager)", color = Muted, fontSize = 12.sp)
        Text("FCM: add google-services.json to enable push", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(24.dp))
        TextButton(onClick = onLogout) { Text("Sign out", color = Accent) }
    }
}
