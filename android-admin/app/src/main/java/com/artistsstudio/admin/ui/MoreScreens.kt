package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.BuildConfig
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun MoreHub(api: ApiClient) {
    var sub by remember { mutableStateOf(0) }
    val tabs = listOf("Publish", "Security", "Settings")
    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = sub, containerColor = CardBg, contentColor = Accent) {
            tabs.forEachIndexed { i, label ->
                Tab(selected = sub == i, onClick = { sub = i }, text = { Text(label, fontSize = 12.sp) })
            }
        }
        when (sub) {
            0 -> PublishScreen(api)
            1 -> SecurityScreen(api)
            2 -> SettingsScreen(api)
        }
    }
}

@Composable
fun PublishScreen(api: ApiClient) {
    var versions by remember { mutableStateOf(listOf<JSONObject>()) }
    var publishedAt by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            runCatching {
                val v = api.versions()
                publishedAt = v.optString("published_at")
                val arr = v.optJSONArray("items") ?: org.json.JSONArray()
                versions = (0 until arr.length()).map { arr.getJSONObject(it) }.reversed()
            }.onFailure { msg = it.message }
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text("Publish", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        Text("Last: ${publishedAt.ifBlank { "—" }}", color = Muted, fontSize = 12.sp)
        msg?.let { Text(it, color = if (it.startsWith("Published") || it.startsWith("Restored")) Accent else Danger, fontSize = 13.sp) }

        Field("Note (optional)", note) { note = it }
        Button(
            onClick = {
                scope.launch {
                    runCatching {
                        api.publish(note)
                        msg = "Published"
                        load()
                    }.onFailure { msg = it.message }
                }
            },
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
        ) { Text("Publish snapshot") }

        Text("Versions", color = Accent, fontSize = 14.sp, modifier = Modifier.padding(top = 12.dp))
        versions.forEach { item ->
            Card(
                colors = CardDefaults.cardColors(containerColor = CardBg),
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
            ) {
                Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(item.optString("label"), color = TextC, fontSize = 14.sp)
                        Text(item.optString("created_at"), color = Muted, fontSize = 11.sp)
                    }
                    TextButton(onClick = {
                        scope.launch {
                            runCatching {
                                api.restoreVersion(item.optInt("id"))
                                msg = "Restored ${item.optString("label")}"
                                load()
                            }.onFailure { msg = it.message }
                        }
                    }) { Text("Restore", color = Accent) }
                }
            }
        }
    }
}

@Composable
fun SecurityScreen(api: ApiClient) {
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var msg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            runCatching { data = api.securityDashboard() }.onFailure { msg = it.message }
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text("Security", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        msg?.let { Text(it, color = Accent, fontSize = 13.sp) }
        data?.let { d ->
            Text("Failed logins 24h: ${d.optInt("failed_logins_24h")}", color = Muted, fontSize = 13.sp)
            Text("Active sessions: ${d.optInt("active_sessions")}", color = Muted, fontSize = 13.sp)
            Text("Locked accounts: ${d.optInt("locked_accounts")}", color = Muted, fontSize = 13.sp)
            Text("Audit entries: ${d.optInt("audit_count")}", color = Muted, fontSize = 13.sp)
        }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                scope.launch {
                    runCatching {
                        api.revokeAllSessions()
                        msg = "All sessions revoked"
                        load()
                    }.onFailure { msg = it.message }
                }
            },
            colors = ButtonDefaults.buttonColors(containerColor = Danger, contentColor = TextC),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Revoke all sessions") }
        TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
    }
}

@Composable
fun SettingsScreen(api: ApiClient) {
    var health by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        runCatching {
            val h = api.health()
            health = "${h.optString("status")} · ${h.optString("phase")} · ${h.optString("db")}"
        }.onFailure { health = it.message ?: "error" }
    }
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Settings", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(12.dp))
        Text("API base", color = Muted, fontSize = 12.sp)
        Text(BuildConfig.API_BASE, color = TextC, fontSize = 13.sp)
        Spacer(Modifier.height(8.dp))
        Text("App version", color = Muted, fontSize = 12.sp)
        Text(BuildConfig.VERSION_NAME, color = TextC, fontSize = 13.sp)
        Spacer(Modifier.height(8.dp))
        Text("Server health", color = Muted, fontSize = 12.sp)
        Text(health, color = TextC, fontSize = 13.sp)
        Spacer(Modifier.height(8.dp))
        Text("Auth", color = Muted, fontSize = 12.sp)
        Text("X-Admin-Key (no login screen)", color = TextC, fontSize = 13.sp)
        Spacer(Modifier.height(16.dp))
        Text(
            "PIN lock optional — Phase 8 polish",
            color = Muted,
            fontSize = 12.sp
        )
    }
}
