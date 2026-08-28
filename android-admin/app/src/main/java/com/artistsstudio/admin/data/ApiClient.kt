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

class ApiClient(private val session: SessionStore) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(45, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build()

    private val base = BuildConfig.API_BASE
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun health(): JSONObject = get("health", auth = false)

    suspend fun login(username: String, password: String): JSONObject {
        val body = JSONObject()
            .put("username", username)
            .put("password", password)
        return post("auth/login", body, auth = false)
    }

    suspend fun me(): JSONObject = get("auth/me")

    suspend fun dashboard(): JSONObject = get("admin/dashboard")

    suspend fun conversations(): JSONArray {
        val o = get("conversations")
        return o.optJSONArray("items") ?: JSONArray()
    }

    suspend fun messages(conversationId: Int): JSONObject =
        get("conversations/$conversationId/messages")

    suspend fun sendMessage(conversationId: Int, text: String): JSONObject {
        val body = JSONObject().put("body", text)
        return post("conversations/$conversationId/messages", body)
    }

    suspend fun contacts(): JSONArray {
        val o = get("admin/contacts")
        return o.optJSONArray("items") ?: JSONArray()
    }

    suspend fun dbStatus(): JSONObject = get("admin/db-status")

    suspend fun notifications(): JSONArray {
        val o = get("admin/notifications")
        return o.optJSONArray("items") ?: JSONArray()
    }

    private suspend fun get(path: String, auth: Boolean = true): JSONObject =
        withContext(Dispatchers.IO) {
            val b = Request.Builder().url(base + path)
            if (auth) {
                val t = session.token() ?: throw Exception("Not signed in")
                b.header("Authorization", "Bearer $t")
            }
            val res = client.newCall(b.get().build()).execute()
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
                throw Exception(err?.ifBlank { null } ?: "HTTP ${res.code}")
            }
            if (text.isBlank()) JSONObject() else JSONObject(text)
        }

    private suspend fun post(path: String, body: JSONObject, auth: Boolean = true): JSONObject =
        withContext(Dispatchers.IO) {
            val b = Request.Builder()
                .url(base + path)
                .post(body.toString().toRequestBody(json))
            if (auth) {
                val t = session.token() ?: throw Exception("Not signed in")
                b.header("Authorization", "Bearer $t")
            }
            val res = client.newCall(b.build()).execute()
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
                throw Exception(err?.ifBlank { null } ?: "HTTP ${res.code}")
            }
            if (text.isBlank()) JSONObject() else JSONObject(text)
        }
}
