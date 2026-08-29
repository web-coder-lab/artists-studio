package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Cold-start gate — no login. Waits until /health is ok. */
@Composable
fun GateScreen(api: ApiClient, onReady: () -> Unit) {
    var status by remember { mutableStateOf("Connecting to server…") }
    var tries by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    fun ping() {
        scope.launch {
            tries++
            status = "Server starting… ($tries)"
            runCatching {
                val h = api.health()
                if (h.optString("status") == "ok") {
                    status = "Connected · ${h.optString("phase")}"
                    delay(400)
                    onReady()
                } else {
                    status = "Waiting for server…"
                    delay(3000)
                    ping()
                }
            }.onFailure {
                status = "Retrying… ${it.message ?: ""}"
                delay(3500)
                ping()
            }
        }
    }

    LaunchedEffect(Unit) { ping() }

    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Artist's Studio", color = Accent, fontSize = 28.sp, fontWeight = FontWeight.Medium)
            Text("Admin", color = TextC, fontSize = 18.sp, modifier = Modifier.padding(top = 4.dp))
            Spacer(Modifier.height(28.dp))
            CircularProgressIndicator(color = Accent, strokeWidth = 2.dp, modifier = Modifier.size(36.dp))
            Spacer(Modifier.height(16.dp))
            Text(status, color = Muted, fontSize = 13.sp)
            Text("No login required", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}
