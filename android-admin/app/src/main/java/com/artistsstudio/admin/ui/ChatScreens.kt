package com.artistsstudio.admin.ui

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun ChatListScreen(api: ApiClient, onOpen: (Int, String) -> Unit) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        while (true) {
            runCatching {
                val arr = api.conversations()
                items = (0 until arr.length()).map { arr.getJSONObject(it) }
                err = null
            }.onFailure { err = it.message }
            loading = false
            delay(6000)
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Messages", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
        Text("Private chats from the site", color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(10.dp))
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        if (loading && items.isEmpty()) {
            CircularProgressIndicator(color = Accent, modifier = Modifier.padding(24.dp))
        }
        if (!loading && items.isEmpty()) {
            Text("No conversations yet", color = Muted, modifier = Modifier.padding(top = 24.dp))
        }
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
                        .clickable { onOpen(id, title) },
                    colors = CardDefaults.cardColors(containerColor = CardBg)
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(title, color = TextC, fontWeight = FontWeight.Medium)
                            if (unread > 0) {
                                Text("$unread new", color = Accent, fontSize = 12.sp)
                            }
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
fun ChatThreadScreen(
    api: ApiClient,
    conversationId: Int,
    title: String,
    onBack: () -> Unit
) {
    var messages by remember { mutableStateOf(listOf<JSONObject>()) }
    var draft by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }
    var sending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    suspend fun reload() {
        val data = api.messages(conversationId)
        val arr = data.optJSONArray("messages") ?: org.json.JSONArray()
        messages = (0 until arr.length()).map { arr.getJSONObject(it) }
    }

    LaunchedEffect(conversationId) {
        while (true) {
            runCatching { reload(); err = null }.onFailure { err = it.message }
            delay(4000)
        }
    }
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onBack) { Text("‹ Back", color = Accent) }
            Text(title, color = TextC, fontWeight = FontWeight.Medium, fontSize = 16.sp)
        }
        err?.let { Text(it, color = Danger, modifier = Modifier.padding(horizontal = 16.dp), fontSize = 12.sp) }
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
                        color = if (mine) androidx.compose.ui.graphics.Color(0xFF2A241C) else CardBg,
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Text(
                            body.ifBlank { "(attachment)" },
                            color = TextC,
                            modifier = Modifier.padding(10.dp).widthIn(max = 280.dp),
                            fontSize = 14.sp
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
                colors = studioFieldColors()
            )
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = {
                    val text = draft.trim()
                    if (text.isEmpty() || sending) return@Button
                    scope.launch {
                        sending = true
                        runCatching {
                            api.sendMessage(conversationId, text)
                            draft = ""
                            reload()
                        }.onFailure { err = it.message }
                        sending = false
                    }
                },
                enabled = !sending,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Accent,
                    contentColor = androidx.compose.ui.graphics.Color(0xFF14110D)
                )
            ) { Text(if (sending) "…" else "Send") }
        }
    }
}
