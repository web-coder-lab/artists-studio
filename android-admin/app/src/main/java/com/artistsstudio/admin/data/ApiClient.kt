package com.artistsstudio.admin.data

import com.artistsstudio.admin.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class ApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.MINUTES)
        .writeTimeout(10, TimeUnit.MINUTES)
        .callTimeout(12, TimeUnit.MINUTES)
        .build()

    private val base = BuildConfig.API_BASE
    private val adminKey = BuildConfig.ADMIN_KEY
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun health(): JSONObject = get("health", auth = false)
    suspend fun dashboard(): JSONObject = get("admin/dashboard")
    suspend fun dbStatus(): JSONObject = get("admin/db-status")
    suspend fun logs(limit: Int = 50): JSONArray =
        get("admin/logs?limit=$limit").optJSONArray("items") ?: JSONArray()

    suspend fun getContent(): JSONObject = get("admin/content")
    suspend fun putContent(body: JSONObject): JSONObject = put("admin/content", body)
    suspend fun getTheme(): JSONObject = get("admin/theme").optJSONObject("theme") ?: get("admin/theme")
    suspend fun putTheme(theme: JSONObject): JSONObject =
        put("admin/theme", JSONObject().put("theme", theme))
    suspend fun getSocials(): JSONObject =
        get("admin/socials").optJSONObject("socials") ?: get("admin/socials")
    suspend fun putSocials(socials: JSONObject): JSONObject =
        put("admin/socials", JSONObject().put("socials", socials))

    suspend fun portfolio(): JSONArray =
        get("admin/portfolio").optJSONArray("items") ?: JSONArray()
    suspend fun reels(): JSONArray =
        get("admin/reels").optJSONArray("items") ?: JSONArray()
    suspend fun deletePortfolio(id: Int): JSONObject = delete("admin/portfolio/$id")
    suspend fun deleteReel(id: Int): JSONObject = delete("admin/reels/$id")

    suspend fun portfolioAnalytics(): JSONArray =
        get("admin/portfolio/analytics").optJSONArray("items") ?: JSONArray()
    suspend fun reelsAnalytics(): JSONArray =
        get("admin/reels/analytics").optJSONArray("items") ?: JSONArray()

    suspend fun publish(note: String = ""): JSONObject =
        post("admin/publish", JSONObject().put("note", note))
    suspend fun versions(): JSONObject = get("admin/versions")
    suspend fun restoreVersion(id: Int): JSONObject =
        post("admin/versions/$id/restore", JSONObject())

    suspend fun securityDashboard(): JSONObject = get("admin/security/dashboard")
    suspend fun securityAudit(): JSONObject = get("admin/security/audit")
    suspend fun revokeAllSessions(): JSONObject =
        post("admin/security/sessions/revoke-all", JSONObject())

    suspend fun visitors(): JSONArray =
        get("admin/visitors").optJSONArray("items") ?: JSONArray()

    suspend fun uploadPortfolio(file: File, mime: String, title: String, caption: String): JSONObject =
        withContext(Dispatchers.IO) {
            val body = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("file", file.name, file.asRequestBody(mime.toMediaType()))
                .addFormDataPart("title", title)
                .addFormDataPart("caption", caption)
                .build()
            val req = Request.Builder().url(base + "admin/portfolio/upload")
                .header("X-Admin-Key", adminKey).post(body).build()
            parse(client.newCall(req).execute())
        }

    suspend fun uploadReel(file: File, mime: String, title: String, description: String): JSONObject =
        withContext(Dispatchers.IO) {
            val body = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("file", file.name, file.asRequestBody(mime.toMediaType()))
                .addFormDataPart("title", title)
                .addFormDataPart("description", description)
                .build()
            val req = Request.Builder().url(base + "admin/reels/upload")
                .header("X-Admin-Key", adminKey).post(body).build()
            parse(client.newCall(req).execute())
        }

    private suspend fun get(path: String, auth: Boolean = true) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path)
        if (auth) b.header("X-Admin-Key", adminKey)
        parse(client.newCall(b.get().build()).execute())
    }

    private suspend fun put(path: String, body: JSONObject) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path)
            .header("X-Admin-Key", adminKey)
            .put(body.toString().toRequestBody(json))
        parse(client.newCall(b.build()).execute())
    }

    private suspend fun post(path: String, body: JSONObject) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path)
            .header("X-Admin-Key", adminKey)
            .post(body.toString().toRequestBody(json))
        parse(client.newCall(b.build()).execute())
    }

    private suspend fun delete(path: String) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path)
            .header("X-Admin-Key", adminKey).delete()
        parse(client.newCall(b.build()).execute())
    }

    private fun parse(res: okhttp3.Response): JSONObject {
        val text = res.body?.string().orEmpty()
        if (res.code !in 200..299) {
            val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
            val hint = when {
                res.code == 413 -> "File too large for server"
                res.code == 502 || res.code == 504 -> "Server timeout — try a shorter video (<30s / under 25MB)"
                res.code == 401 || res.code == 403 -> "Admin key rejected"
                else -> null
            }
            throw Exception(err?.ifBlank { null } ?: hint ?: "HTTP ${res.code}: ${text.take(120)}")
        }
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }
}
