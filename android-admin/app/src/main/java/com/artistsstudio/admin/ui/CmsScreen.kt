package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject

private val OnAccent = Color(0xFF14110D)

@Composable
fun CmsScreen(api: ApiClient) {
    var tab by remember { mutableStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = tab, containerColor = CardBg, contentColor = Accent, edgePadding = 8.dp) {
            listOf("Texts", "Socials", "Portfolio", "Reels", "Upload", "Stats", "Publish").forEachIndexed { i, label ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(label, fontSize = 13.sp) })
            }
        }
        when (tab) {
            0 -> ContentEditorScreen(api)
            1 -> SocialsEditor(api)
            2 -> PortfolioList(api)
            3 -> ReelsList(api)
            4 -> UploadHub(api)
            5 -> AnalyticsScreen(api)
            else -> PublishPanel(api)
        }
    }
}

@Composable
private fun SiteEditor(api: ApiClient) {
    var brand by remember { mutableStateOf("") }
    var tagline by remember { mutableStateOf("") }
    var heroTitle by remember { mutableStateOf("") }
    var heroSub by remember { mutableStateOf("") }
    var about by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        runCatching {
            val o = api.getSite().optJSONObject("site") ?: JSONObject()
            brand = o.optString("brand"); tagline = o.optString("tagline")
            heroTitle = o.optString("hero_title"); heroSub = o.optString("hero_subtitle")
            about = o.optString("about")
        }.onFailure { err = it.message }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Site content", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        CmsField("Brand", brand) { brand = it }
        CmsField("Tagline", tagline) { tagline = it }
        CmsField("Hero title", heroTitle) { heroTitle = it }
        CmsField("Hero subtitle", heroSub) { heroSub = it }
        CmsField("About", about, false) { about = it }
        msg?.let { Text(it, color = Accent, fontSize = 13.sp) }
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        Button(
            onClick = {
                scope.launch {
                    runCatching {
                        api.putSite(JSONObject()
                            .put("brand", brand).put("tagline", tagline)
                            .put("hero_title", heroTitle).put("hero_subtitle", heroSub)
                            .put("about", about))
                        msg = "Saved"
                    }.onFailure { err = it.message }
                }
            },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = OnAccent)
        ) { Text("Save site") }
    }
}

@Composable
private fun SocialsEditor(api: ApiClient) {
    var wa by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var ig by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        runCatching {
            val o = api.getSocials().optJSONObject("socials") ?: JSONObject()
            wa = o.optString("whatsapp"); email = o.optString("email"); ig = o.optString("instagram")
        }.onFailure { err = it.message }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Socials", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        CmsField("WhatsApp", wa) { wa = it }
        CmsField("Email", email) { email = it }
        CmsField("Instagram URL", ig) { ig = it }
        msg?.let { Text(it, color = Accent, fontSize = 13.sp) }
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        Button(
            onClick = {
                scope.launch {
                    runCatching {
                        api.putSocials(JSONObject().put("whatsapp", wa).put("email", email).put("instagram", ig))
                        msg = "Saved"
                    }.onFailure { err = it.message }
                }
            },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = OnAccent)
        ) { Text("Save socials") }
    }
}

@Composable
private fun PortfolioList(api: ApiClient) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        runCatching {
            val arr = api.adminPortfolio()
            items = (0 until arr.length()).map { arr.getJSONObject(it) }
        }.onFailure { err = it.message }
    }
    LaunchedEffect(Unit) { load() }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Portfolio", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        if (items.isEmpty()) Text("No items", color = Muted, modifier = Modifier.padding(top = 16.dp))
        items.forEach { it ->
            val id = it.optInt("id")
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = CardBg)) {
                Row(Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(it.optString("title"), color = TextC, modifier = Modifier.weight(1f))
                    TextButton(onClick = {
                        scope.launch { runCatching { api.deletePortfolio(id); load() }.onFailure { e -> err = e.message } }
                    }) { Text("Delete", color = Danger, fontSize = 12.sp) }
                }
            }
        }
    }
}

@Composable
private fun ReelsList(api: ApiClient) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        runCatching {
            val arr = api.adminReels()
            items = (0 until arr.length()).map { arr.getJSONObject(it) }
        }.onFailure { err = it.message }
    }
    LaunchedEffect(Unit) { load() }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Reels", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        if (items.isEmpty()) Text("No reels", color = Muted, modifier = Modifier.padding(top = 16.dp))
        items.forEach { it ->
            val id = it.optInt("id")
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = CardBg)) {
                Row(Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(it.optString("title"), color = TextC, modifier = Modifier.weight(1f))
                    TextButton(onClick = {
                        scope.launch { runCatching { api.deleteReel(id); load() }.onFailure { e -> err = e.message } }
                    }) { Text("Delete", color = Danger, fontSize = 12.sp) }
                }
            }
        }
    }
}

@Composable
private fun PublishPanel(api: ApiClient) {
    var versions by remember { mutableStateOf(listOf<JSONObject>()) }
    var msg by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        runCatching {
            val arr = api.versions()
            versions = (0 until arr.length()).map { arr.getJSONObject(it) }
        }.onFailure { err = it.message }
    }
    LaunchedEffect(Unit) { load() }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Publish", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        Button(
            onClick = {
                scope.launch {
                    runCatching { api.publish(); msg = "Published"; load() }.onFailure { err = it.message }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = OnAccent)
        ) { Text("Publish now") }
        msg?.let { Text(it, color = Accent, modifier = Modifier.padding(top = 8.dp)) }
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        Spacer(Modifier.height(16.dp))
        Text("Versions", color = TextC, fontWeight = FontWeight.Medium)
        versions.forEach { v ->
            val id = v.optInt("id")
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = CardBg)) {
                Row(Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(v.optString("label", "v$id"), color = TextC)
                        Text(v.optString("created_at"), color = Muted, fontSize = 11.sp)
                    }
                    TextButton(onClick = {
                        scope.launch {
                            runCatching { api.restoreVersion(id); msg = "Restored #$id" }.onFailure { e -> err = e.message }
                        }
                    }) { Text("Restore", color = Accent, fontSize = 12.sp) }
                }
            }
        }
    }
}

@Composable
@Composable
private fun CmsField(label: String, value: String, single: Boolean = true, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) },
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        singleLine = single, minLines = if (single) 1 else 3, colors = studioFieldColors()
    )
}


@Composable
private fun UploadHub(api: ApiClient) {
    var mode by remember { mutableStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = mode == 0, onClick = { mode = 0 }, label = { Text("Photo") })
            FilterChip(selected = mode == 1, onClick = { mode = 1 }, label = { Text("Reel") })
        }
        if (mode == 0) UploadPhotoScreen(api) {}
        else UploadReelScreen(api) {}
    }
}
