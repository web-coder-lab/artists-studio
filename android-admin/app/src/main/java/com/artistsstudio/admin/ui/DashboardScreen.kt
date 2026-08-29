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
fun DashboardScreen(api: ApiClient) {
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var db by remember { mutableStateOf<JSONObject?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            loading = true
            err = null
            runCatching {
                data = api.dashboard()
                db = api.dbStatus()
            }.onFailure { err = it.message }
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Dashboard", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
                Text("Live from domain", color = Muted, fontSize = 12.sp)
            }
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }

        if (loading) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                color = Accent,
                trackColor = Line
            )
        }
        err?.let { Text(it, color = Danger, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp)) }

        val d = data
        if (d != null) {
            Spacer(Modifier.height(12.dp))
            StatGrid(
                listOf(
                    "Portfolio" to d.optInt("portfolio").toString(),
                    "Reels" to d.optInt("reels").toString(),
                    "Total likes" to d.optInt("total_likes").toString(),
                    "Publish" to d.optString("publish_status", "—"),
                    "DB" to d.optString("db_status", d.optString("db", "—")),
                    "Versions" to d.optInt("versions").toString()
                )
            )
            Spacer(Modifier.height(16.dp))
            Text("Server", color = Accent, fontSize = 14.sp)
            Text("Time: ${d.optString("server_time")}", color = Muted, fontSize = 12.sp)
            db?.let {
                Text(
                    "Driver: ${it.optString("driver")} · ${it.optString("repo")}",
                    color = Muted,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

@Composable
private fun StatGrid(items: List<Pair<String, String>>) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { (label, value) ->
                    Card(
                        modifier = Modifier.weight(1f),
                        colors = CardDefaults.cardColors(containerColor = CardBg)
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Text(label, color = Muted, fontSize = 12.sp)
                            Text(value, color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}
