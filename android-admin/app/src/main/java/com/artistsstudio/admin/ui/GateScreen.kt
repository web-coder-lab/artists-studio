package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.Accent
import com.artistsstudio.admin.ui.theme.Muted
import com.artistsstudio.admin.ui.theme.TextC
import kotlinx.coroutines.delay

/**
 * Phase 3 — wait until server health is OK (Render cold start).
 */
@Composable
fun GateScreen(api: ApiClient, onReady: (serverOk: Boolean) -> Unit) {
    var seconds by remember { mutableStateOf(0) }
    var status by remember { mutableStateOf("Connecting…") }

    LaunchedEffect(Unit) {
        var ok = false
        while (seconds < 90) {
            status = "Server is starting…"
            ok = runCatching {
                val h = api.health()
                h.optString("status") == "ok"
            }.getOrDefault(false)
            if (ok) {
                status = "Server online"
                delay(400)
                onReady(true)
                return@LaunchedEffect
            }
            delay(2000)
            seconds += 2
        }
        // timeout — still open login; user can retry
        status = "Server slow — continue"
        delay(600)
        onReady(false)
    }

    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            "ARTIST'S STUDIO",
            color = Accent,
            fontSize = 12.sp,
            letterSpacing = 3.sp,
            fontWeight = FontWeight.Medium
        )
        Spacer(Modifier.height(16.dp))
        Text("Admin Control", color = TextC, fontSize = 26.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(8.dp))
        Text(status, color = Muted, fontSize = 14.sp)
        Spacer(Modifier.height(6.dp))
        Text("${seconds}s", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(28.dp))
        LinearProgressIndicator(
            modifier = Modifier.fillMaxWidth(0.55f),
            color = Accent,
            trackColor = Muted.copy(alpha = 0.25f)
        )
        Spacer(Modifier.height(20.dp))
        Text("API only · no browser panel", color = Muted, fontSize = 11.sp)
    }
}
