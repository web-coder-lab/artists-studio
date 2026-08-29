package com.artistsstudio.admin.data

import com.artistsstudio.admin.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Phase 4 — domain connection via X-Admin-Key (no login screen).
 */
class ApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(45, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val base = BuildConfig.API_BASE
    private val adminKey = BuildConfig.ADMIN_KEY
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun health(): JSONObject = get("health", auth = false)

    suspend fun dashboard(): JSONObject = get("admin/dashboard")

    suspend fun dbStatus(): JSONObject = get("admin/db-status")

    suspend fun logs(limit: Int = 30): JSONArray =
        get("admin/logs?limit=$limit").optJSONArray("items") ?: JSONArray()

    private suspend fun get(path: String, auth: Boolean = true) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path)
        if (auth) b.header("X-Admin-Key", adminKey)
        parse(client.newCall(b.get().build()).execute())
    }

    private fun parse(res: okhttp3.Response): JSONObject {
        val text = res.body?.string().orEmpty()
        if (res.code !in 200..299) {
            val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
            throw Exception(err?.ifBlank { null } ?: "HTTP ${res.code}")
        }
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }
}
