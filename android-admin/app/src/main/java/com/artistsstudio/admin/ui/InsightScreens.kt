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
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun InsightHub(api: ApiClient) {
    var sub by remember { mutableStateOf(0) }
    val tabs = listOf("Analytics", "Logs", "Devices")
    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = sub, containerColor = CardBg, contentColor = Accent) {
            tabs.forEachIndexed { i, label ->
                Tab(selected = sub == i, onClick = { sub = i }, text = { Text(label, fontSize = 12.sp) })
            }
        }
        when (sub) {
            0 -> AnalyticsScreen(api)
            1 -> LogsScreen(api)
            2 -> DevicesScreen(api)
        }
    }
}

@Composable
fun AnalyticsScreen(api: ApiClient) {
    var reels by remember { mutableStateOf(listOf<JSONObject>()) }
    var photos by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            runCatching {
                val r = api.reelsAnalytics()
                reels = (0 until r.length()).map { r.getJSONObject(it) }
                val p = api.portfolioAnalytics()
                photos = (0 until p.length()).map { p.getJSONObject(it) }
            }.onFailure { err = it.message }
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Analytics", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }
        err?.let { Text(it, color = Danger, fontSize = 12.sp) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text("Reels", color = Accent, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp)) }
            items(reels, key = { "r${it.optInt("id")}" }) { item ->
                StatCard(
                    item.optString("title", "Reel"),
                    "Views ${item.optInt("views")} · ♥ ${item.optInt("likes")} · 💬 ${item.optInt("comments")} · ↗ ${item.optInt("shares")}"
                )
            }
            item { Text("Photos", color = Accent, fontSize = 14.sp, modifier = Modifier.padding(top = 12.dp)) }
            items(photos, key = { "p${it.optInt("id")}" }) { item ->
                StatCard(
                    item.optString("title", "Photo"),
                    "♥ ${item.optInt("likes")} · Save ${item.optInt("saves")}"
                )
            }
        }
    }
}

@Composable
fun LogsScreen(api: ApiClient) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            runCatching {
                val arr = api.logs(80)
                items = (0 until arr.length()).map { arr.getJSONObject(it) }
            }.onFailure { err = it.message }
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Logs", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }
        err?.let { Text(it, color = Danger, fontSize = 12.sp) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(items, key = { it.optString("id", it.optString("at")) }) { item ->
                Card(colors = CardDefaults.cardColors(containerColor = CardBg), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp)) {
                        Text(
                            "${item.optString("type")} · ${item.optString("action")}",
                            color = TextC,
                            fontSize = 13.sp
                        )
                        Text(item.optString("at"), color = Muted, fontSize = 11.sp)
                        val text = item.optString("text")
                        if (text.isNotBlank()) Text(text, color = Muted, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun DevicesScreen(api: ApiClient) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        runCatching {
            val arr = api.visitors()
            items = (0 until arr.length()).map { arr.getJSONObject(it) }
        }.onFailure { err = it.message }
    }
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Text("Visitor devices", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        Text("Mobile profiles in DB (no browser cookies)", color = Muted, fontSize = 12.sp)
        err?.let { Text(it, color = Danger, fontSize = 12.sp) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
            items(items, key = { it.optString("mobile") }) { item ->
                StatCard(
                    item.optString("mobile"),
                    "Seen ${item.optString("last_seen")} · likes ${item.optJSONArray("portfolio_likes")?.length() ?: 0}"
                )
            }
        }
    }
}

@Composable
private fun StatCard(title: String, sub: String) {
    Card(colors = CardDefaults.cardColors(containerColor = CardBg), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(title, color = TextC, fontSize = 14.sp)
            Text(sub, color = Muted, fontSize = 12.sp)
        }
    }
}
