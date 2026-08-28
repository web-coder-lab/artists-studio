package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun DashboardScreen(api: ApiClient, adminName: String, onLogout: () -> Unit) {
    var dash by remember { mutableStateOf<JSONObject?>(null) }
    var db by remember { mutableStateOf<JSONObject?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    fun refresh() {
        scope.launch {
            loading = true
            err = null
            runCatching {
                dash = api.dashboard()
                db = api.dbStatus()
            }.onFailure { err = it.message }
            loading = false
        }
    }

    LaunchedEffect(Unit) { refresh() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Control Center", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
                Text(adminName.ifBlank { "Admin" }, color = Muted, fontSize = 13.sp)
            }
            TextButton(onClick = { refresh() }) {
                Text("Refresh", color = Accent)
            }
        }
        Spacer(Modifier.height(12.dp))
        if (loading && dash == null) {
            CircularProgressIndicator(color = Accent, modifier = Modifier.padding(24.dp))
        }
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        val d = dash
        if (d != null) {
            StatRow("Users", d.optInt("users").toString())
            StatRow("Conversations", d.optInt("conversations").toString())
            StatRow("Chat unread", d.optInt("chat_unread").toString())
            StatRow("Contacts (new)", d.optInt("contacts_new").toString())
            StatRow("Portfolio items", d.optInt("portfolio").toString())
            StatRow("Reels", d.optInt("reels").toString())
            StatRow("Versions", d.optInt("versions").toString())
        }
        Spacer(Modifier.height(16.dp))
        Text("Database", color = TextC, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        val s = db
        if (s != null) {
            StatRow("Driver", s.optString("driver", "—"))
            StatRow("Persistent", if (s.optBoolean("persistent")) "yes" else "no")
            val note = s.optString("note")
            if (note.isNotBlank()) {
                Text(note, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
            }
        }
        Spacer(Modifier.height(24.dp))
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Accent)
        ) {
            Text("Sign out")
        }
        Spacer(Modifier.height(12.dp))
        Text("Phase 3 · Gate + Login + Dashboard", color = Muted, fontSize = 11.sp)
    }
}

@Composable
private fun StatRow(label: String, value: String) {
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
