package com.artistsstudio.admin.ui

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

@Composable
fun MediaHub(api: ApiClient) {
    var sub by remember { mutableStateOf(0) }
    val tabs = listOf("Portfolio", "Reels", "Upload")
    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = sub, containerColor = CardBg, contentColor = Accent) {
            tabs.forEachIndexed { i, label ->
                Tab(selected = sub == i, onClick = { sub = i }, text = { Text(label, fontSize = 13.sp) })
            }
        }
        when (sub) {
            0 -> PortfolioList(api)
            1 -> ReelsList(api)
            2 -> UploadWizard(api)
        }
    }
}

@Composable
fun PortfolioList(api: ApiClient) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var msg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            runCatching {
                val arr = api.portfolio()
                items = (0 until arr.length()).map { arr.getJSONObject(it) }
            }.onFailure { msg = it.message }
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Portfolio", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }
        msg?.let { Text(it, color = Danger, fontSize = 12.sp) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
            items(items, key = { it.optInt("id") }) { item ->
                Card(colors = CardDefaults.cardColors(containerColor = CardBg), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(item.optString("title", "Untitled"), color = TextC, fontSize = 15.sp)
                            Text(item.optString("caption"), color = Muted, fontSize = 12.sp)
                        }
                        TextButton(onClick = {
                            scope.launch {
                                runCatching {
                                    api.deletePortfolio(item.optInt("id"))
                                    msg = "Deleted"
                                    load()
                                }.onFailure { msg = it.message }
                            }
                        }) { Text("Delete", color = Danger) }
                    }
                }
            }
        }
    }
}

@Composable
fun ReelsList(api: ApiClient) {
    var items by remember { mutableStateOf(listOf<JSONObject>()) }
    var msg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            runCatching {
                val arr = api.reels()
                items = (0 until arr.length()).map { arr.getJSONObject(it) }
            }.onFailure { msg = it.message }
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Reels", color = TextC, fontSize = 18.sp, fontWeight = FontWeight.Medium)
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }
        msg?.let { Text(it, color = Danger, fontSize = 12.sp) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
            items(items, key = { it.optInt("id") }) { item ->
                Card(colors = CardDefaults.cardColors(containerColor = CardBg), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(item.optString("title", "Reel"), color = TextC, fontSize = 15.sp)
                            Text(item.optString("description"), color = Muted, fontSize = 12.sp, maxLines = 2)
                            Text(
                                "♥ ${item.optInt("likes")} · 💬 ${item.optInt("comments_count")}",
                                color = Muted,
                                fontSize = 11.sp
                            )
                        }
                        TextButton(onClick = {
                            scope.launch {
                                runCatching {
                                    api.deleteReel(item.optInt("id"))
                                    msg = "Deleted"
                                    load()
                                }.onFailure { msg = it.message }
                            }
                        }) { Text("Delete", color = Danger) }
                    }
                }
            }
        }
    }
}

/**
 * Upload wizard:
 * Step 0 — pick type (photo / reel)
 * Step 1 — pick file + preview name
 * Step 2 — title + description → Upload
 */
@Composable
fun UploadWizard(api: ApiClient) {
    var step by remember { mutableStateOf(0) }
    var isReel by remember { mutableStateOf(true) }
    var uri by remember { mutableStateOf<Uri?>(null) }
    var fileName by remember { mutableStateOf("") }
    var mime by remember { mutableStateOf("video/mp4") }
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<String?>(null) }
    var uploading by remember { mutableStateOf(false) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    val pickVideo = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { u ->
        if (u != null) {
            uri = u
            fileName = u.lastPathSegment ?: "video"
            mime = ctx.contentResolver.getType(u) ?: "video/mp4"
            step = 2
        }
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { u ->
        if (u != null) {
            uri = u
            fileName = u.lastPathSegment ?: "photo"
            mime = ctx.contentResolver.getType(u) ?: "image/jpeg"
            step = 2
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text("Upload", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Medium)
        msg?.let {
            Text(
                it,
                color = if (it.startsWith("Uploaded")) Accent else Danger,
                fontSize = 13.sp,
                modifier = Modifier.padding(vertical = 6.dp)
            )
        }

        when (step) {
            0 -> {
                Text("Choose type", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(bottom = 12.dp))
                Button(
                    onClick = { isReel = true; step = 1 },
                    colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Reel / Video") }
                Spacer(Modifier.height(10.dp))
                OutlinedButton(
                    onClick = { isReel = false; step = 1 },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Accent)
                ) { Text("Portfolio photo") }
            }
            1 -> {
                Text(if (isReel) "Select video" else "Select photo", color = Muted, fontSize = 13.sp)
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = {
                        if (isReel) pickVideo.launch("video/*") else pickImage.launch("image/*")
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Pick from gallery") }
                TextButton(onClick = { step = 0 }) { Text("← Back", color = Muted) }
            }
            2 -> {
                Text("Selected: $fileName", color = Muted, fontSize = 12.sp)
                Field("Title", title) { title = it }
                Field(
                    if (isReel) "Description (TikTok-style)" else "Caption",
                    description,
                    singleLine = false
                ) { description = it }
                Spacer(Modifier.height(12.dp))
                if (uploading) {
                    LinearProgressIndicator(Modifier.fillMaxWidth(), color = Accent, trackColor = Line)
                    Text("Uploading…", color = Muted, fontSize = 12.sp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { step = 1; uri = null }) { Text("← Back", color = Muted) }
                    Button(
                        enabled = !uploading && uri != null,
                        onClick = {
                            val u = uri ?: return@Button
                            scope.launch {
                                uploading = true
                                msg = null
                                runCatching {
                                    val file = copyUriToCache(ctx, u, fileName)
                                    if (isReel) {
                                        api.uploadReel(file, mime, title.ifBlank { "Reel" }, description)
                                    } else {
                                        api.uploadPortfolio(file, mime, title.ifBlank { "Untitled" }, description)
                                    }
                                    file.delete()
                                    msg = "Uploaded · live on site"
                                    step = 0
                                    uri = null
                                    title = ""
                                    description = ""
                                }.onFailure { msg = it.message }
                                uploading = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
                        modifier = Modifier.weight(1f)
                    ) { Text("Upload") }
                }
            }
        }
    }
}

private fun copyUriToCache(ctx: Context, uri: Uri, name: String): File {
    val safe = name.replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "upload.bin" }
    val out = File(ctx.cacheDir, "up_${System.currentTimeMillis()}_$safe")
    ctx.contentResolver.openInputStream(uri)?.use { input ->
        FileOutputStream(out).use { output -> input.copyTo(output) }
    } ?: throw Exception("Cannot read file")
    return out
}
