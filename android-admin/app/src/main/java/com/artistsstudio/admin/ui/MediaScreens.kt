package com.artistsstudio.admin.ui

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
fun AnalyticsScreen(api: ApiClient) {
    var reels by remember { mutableStateOf(listOf<JSONObject>()) }
    var photos by remember { mutableStateOf(listOf<JSONObject>()) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        runCatching {
            val r = api.reelAnalytics()
            reels = (0 until r.length()).map { r.getJSONObject(it) }
            val p = api.portfolioAnalytics()
            photos = (0 until p.length()).map { p.getJSONObject(it) }
            err = null
        }.onFailure { err = it.message }
    }
    LaunchedEffect(Unit) { load() }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Analytics", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Medium)
            TextButton(onClick = { load() }) { Text("Refresh", color = Accent) }
        }
        err?.let { Text(it, color = Danger, fontSize = 13.sp) }
        Text("Reels", color = Accent, modifier = Modifier.padding(top = 12.dp))
        LazyColumn(Modifier.weight(1f)) {
            items(reels) { r ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = CardBg)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(r.optString("title"), color = TextC, fontWeight = FontWeight.Medium)
                        Text(r.optString("description"), color = Muted, fontSize = 12.sp, maxLines = 2)
                        Text(
                            "Views ${r.optInt("views")} · Likes ${r.optInt("likes")} · Comments ${r.optInt("comments")} · Shares ${r.optInt("shares")} · Saves ${r.optInt("saves")}",
                            color = Muted, fontSize = 12.sp
                        )
                    }
                }
            }
            item { Text("Photos", color = Accent, modifier = Modifier.padding(top = 16.dp)) }
            items(photos) { p ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = CardBg)) {
                    Row(Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(p.optString("title"), color = TextC, modifier = Modifier.weight(1f))
                        Text("♥ ${p.optInt("likes")} · Save ${p.optInt("saves")}", color = Muted, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun UploadPhotoScreen(api: ApiClient, onDone: () -> Unit) {
    val ctx = LocalContext.current
    var title by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var caption by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            status = "Uploading…"
            runCatching {
                val file = uriToCacheFile(ctx.contentResolver, uri, ctx.cacheDir)
                val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
                api.uploadPortfolio(file, mime, title.ifBlank { "Untitled" }, category, caption)
                status = "Uploaded — live on site"
                onDone()
            }.onFailure { status = it.message }
            busy = false
        }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Upload photo", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Medium)
        OutlinedTextField(title, { title = it }, label = { Text("Title") }, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), colors = studioFieldColors())
        OutlinedTextField(category, { category = it }, label = { Text("Category") }, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), colors = studioFieldColors())
        OutlinedTextField(caption, { caption = it }, label = { Text("Caption") }, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), colors = studioFieldColors())
        status?.let { Text(it, color = if (it.startsWith("Upload")) Accent else Danger, fontSize = 13.sp) }
        Button(
            onClick = { pick.launch("image/*") },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = androidx.compose.ui.graphics.Color(0xFF14110D))
        ) { Text(if (busy) "Please wait…" else "Choose photo & upload") }
    }
}

@Composable
fun UploadReelScreen(api: ApiClient, onDone: () -> Unit) {
    val ctx = LocalContext.current
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            status = "Uploading…"
            runCatching {
                val file = uriToCacheFile(ctx.contentResolver, uri, ctx.cacheDir)
                val mime = ctx.contentResolver.getType(uri) ?: "video/mp4"
                api.uploadReel(file, mime, title.ifBlank { "Reel" }, description)
                status = "Uploaded — live on reels"
                onDone()
            }.onFailure { status = it.message }
            busy = false
        }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Upload reel", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Medium)
        Text("TikTok-style: title + description", color = Muted, fontSize = 13.sp)
        OutlinedTextField(title, { title = it }, label = { Text("Title") }, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), colors = studioFieldColors())
        OutlinedTextField(description, { description = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), minLines = 3, colors = studioFieldColors())
        status?.let { Text(it, color = if (it.startsWith("Upload")) Accent else Danger, fontSize = 13.sp) }
        Button(
            onClick = { pick.launch("video/*") },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = androidx.compose.ui.graphics.Color(0xFF14110D))
        ) { Text(if (busy) "Please wait…" else "Choose video & upload") }
    }
}

private fun uriToCacheFile(cr: ContentResolver, uri: Uri, cacheDir: File): File {
    var name = "upload.bin"
    cr.query(uri, null, null, null, null)?.use { c ->
        val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (i >= 0 && c.moveToFirst()) name = c.getString(i) ?: name
    }
    val out = File(cacheDir, "up_${System.currentTimeMillis()}_$name")
    cr.openInputStream(uri)?.use { input ->
        FileOutputStream(out).use { input.copyTo(it) }
    } ?: throw Exception("Cannot read file")
    return out
}
