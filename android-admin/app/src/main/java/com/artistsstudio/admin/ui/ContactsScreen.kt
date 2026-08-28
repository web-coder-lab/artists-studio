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
fun ContactsScreen(api: ApiClient) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            runCatching {
                val arr = api.contacts()
                items = (0 until arr.length()).map { arr.getJSONObject(it) }
                err = null
            }.onFailure { err = it.message }
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Contact form", color = TextC, fontSize = 22.sp, fontWeight = FontWeight.Medium)
                Text("Inbox from the website form", color = Muted, fontSize = 13.sp)
            }
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }
        Spacer(Modifier.height(10.dp))
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        if (items.isEmpty()) {
            Text("No form messages", color = Muted, modifier = Modifier.padding(top = 24.dp))
        }
        LazyColumn {
            items(items, key = { it.optInt("id") }) { c ->
                val id = c.optInt("id")
                val status = c.optString("status", "new")
                Card(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    colors = CardDefaults.cardColors(containerColor = CardBg)
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Text(c.optString("name"), color = TextC, fontWeight = FontWeight.Medium)
                        val email = c.optString("email")
                        if (email.isNotBlank()) Text(email, color = Muted, fontSize = 12.sp)
                        Text(c.optString("message"), color = Muted, fontSize = 13.sp, maxLines = 4)
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Status: $status", color = Accent, fontSize = 12.sp)
                            if (status == "new") {
                                TextButton(onClick = {
                                    scope.launch {
                                        runCatching {
                                            api.patchContact(id, "read")
                                            load()
                                        }.onFailure { err = it.message }
                                    }
                                }) { Text("Mark read", color = Accent, fontSize = 12.sp) }
                            }
                        }
                    }
                }
            }
        }
    }
}
