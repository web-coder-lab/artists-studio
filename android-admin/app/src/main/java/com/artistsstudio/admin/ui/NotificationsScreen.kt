package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
fun NotificationsScreen(api: ApiClient) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            runCatching {
                val arr = api.notifications()
                items = (0 until arr.length()).map { arr.getJSONObject(it) }
                err = null
            }.onFailure { err = it.message }
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Notifications", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
                Text("New messages from users", color = Muted, fontSize = 13.sp)
            }
            Column {
                TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
                TextButton(onClick = {
                    scope.launch {
                        runCatching { api.markNotificationsRead(); load() }
                            .onFailure { err = it.message }
                    }
                }) { Text("Mark all read", color = Muted, fontSize = 12.sp) }
            }
        }
        Spacer(Modifier.height(10.dp))
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        if (items.isEmpty()) {
            Text("No notifications", color = Muted, modifier = Modifier.padding(top = 24.dp))
        }
        LazyColumn {
            items(items, key = { it.optInt("id") }) { n ->
                val read = n.optBoolean("read")
                Card(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (read) CardBg else androidx.compose.ui.graphics.Color(0xFF1C1915)
                    )
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Text(
                            n.optString("name").ifBlank { n.optString("username") },
                            color = TextC,
                            fontWeight = FontWeight.Medium
                        )
                        Text(n.optString("text"), color = Muted, fontSize = 13.sp)
                        Text(n.optString("at"), color = Muted, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}
