package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun SecurityScreen(api: ApiClient) {
    var dash by remember { mutableStateOf<JSONObject?>(null) }
    var audit by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    var msg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun load() {
        scope.launch {
            runCatching {
                dash = api.securityDashboard()
                val arr = api.securityAudit()
                audit = (0 until arr.length()).map { arr.getJSONObject(it) }.take(30)
                err = null
            }.onFailure { err = it.message }
        }
    }
    LaunchedEffect(Unit) { load() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Security", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        msg?.let { Text(it, color = Accent, fontSize = 13.sp) }
        dash?.let { d ->
            SecStat("Failed logins 24h", d.optInt("failed_logins_24h").toString())
            SecStat("Active sessions", d.optInt("active_sessions").toString())
            SecStat("Locked accounts", d.optInt("locked_accounts").toString())
            SecStat("Your IP", d.optString("your_ip", "—"))
        }
        Spacer(Modifier.height(12.dp))
        OutlinedButton(
            onClick = {
                scope.launch {
                    runCatching {
                        api.revokeAllSessions()
                        msg = "All sessions revoked"
                        load()
                    }.onFailure { err = it.message }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Danger)
        ) { Text("Revoke all sessions") }
        Spacer(Modifier.height(16.dp))
        Text("Recent audit", color = TextC, fontWeight = FontWeight.Medium)
        audit.forEach { a ->
            Text(
                "${a.optString("at")} · ${a.optString("action")} · ${a.optString("username")}",
                color = Muted, fontSize = 12.sp, modifier = Modifier.padding(vertical = 2.dp)
            )
        }
    }
}

@Composable
private fun SecStat(label: String, value: String) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = CardBg)) {
        Row(Modifier.padding(14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = Muted)
            Text(value, color = Accent, fontWeight = FontWeight.SemiBold)
        }
    }
}
