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

class ApiClient(private val session: SessionStore) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()
    private val base = BuildConfig.API_BASE
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun health(): JSONObject = get("health", false)
    suspend fun login(u: String, p: String) =
        post("auth/login", JSONObject().put("username", u).put("password", p), false)
    suspend fun me() = get("auth/me")
    suspend fun logout() = post("auth/logout", JSONObject())
    suspend fun dashboard() = get("admin/dashboard")
    suspend fun dbStatus() = get("admin/db-status")
    suspend fun notifications(): JSONArray = get("admin/notifications").optJSONArray("items") ?: JSONArray()
    suspend fun markNotificationsRead() = post("admin/notifications/read", JSONObject())
    suspend fun conversations(): JSONArray = get("conversations").optJSONArray("items") ?: JSONArray()
    suspend fun messages(id: Int) = get("conversations/$id/messages")
    suspend fun sendMessage(id: Int, text: String) =
        post("conversations/$id/messages", JSONObject().put("body", text))
    suspend fun contacts(): JSONArray = get("admin/contacts").optJSONArray("items") ?: JSONArray()
    suspend fun patchContact(id: Int, status: String) =
        patch("admin/contacts/$id", JSONObject().put("status", status))

    suspend fun getSite() = get("admin/site")
    suspend fun putSite(site: JSONObject) = put("admin/site", JSONObject().put("site", site))
    suspend fun getSocials() = get("admin/socials")
    suspend fun putSocials(s: JSONObject) = put("admin/socials", JSONObject().put("socials", s))
    suspend fun adminPortfolio(): JSONArray = get("admin/portfolio").optJSONArray("items") ?: JSONArray()
    suspend fun deletePortfolio(id: Int) = delete("admin/portfolio/$id")
    suspend fun adminReels(): JSONArray = get("admin/reels").optJSONArray("items") ?: JSONArray()
    suspend fun deleteReel(id: Int) = delete("admin/reels/$id")
    suspend fun publish() = post("admin/publish", JSONObject())
    suspend fun versions(): JSONArray = get("admin/versions").optJSONArray("items") ?: JSONArray()
    suspend fun restoreVersion(id: Int) = post("admin/versions/$id/restore", JSONObject())
    suspend fun securityDashboard() = get("admin/security/dashboard")
    suspend fun securityAudit(): JSONArray = get("admin/security/audit").optJSONArray("items") ?: JSONArray()
    suspend fun revokeAllSessions() = post("admin/security/sessions/revoke-all", JSONObject())

    suspend fun reelAnalytics(): JSONArray =
        get("admin/reels/analytics").optJSONArray("items") ?: JSONArray()
    suspend fun portfolioAnalytics(): JSONArray =
        get("admin/portfolio/analytics").optJSONArray("items") ?: JSONArray()

    suspend fun uploadPortfolio(file: File, mime: String, title: String, category: String, caption: String): JSONObject =
        withContext(Dispatchers.IO) {
            val body = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("file", file.name, file.asRequestBody(mime.toMediaType()))
                .addFormDataPart("title", title)
                .addFormDataPart("category", category)
                .addFormDataPart("caption", caption)
                .build()
            val req = Request.Builder().url(base + "admin/portfolio/upload").post(body)
                .header("Authorization", "Bearer ${tok()}").build()
            parse(client.newCall(req).execute())
        }

    suspend fun uploadReel(file: File, mime: String, title: String, description: String): JSONObject =
        withContext(Dispatchers.IO) {
            val body = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("file", file.name, file.asRequestBody(mime.toMediaType()))
                .addFormDataPart("title", title)
                .addFormDataPart("description", description)
                .addFormDataPart("caption", description)
                .build()
            val req = Request.Builder().url(base + "admin/reels/upload").post(body)
                .header("Authorization", "Bearer ${tok()}").build()
            parse(client.newCall(req).execute())
        }

    private suspend fun tok() = session.token() ?: throw Exception("Not signed in")
    private suspend fun get(path: String, auth: Boolean = true) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path)
        if (auth) b.header("Authorization", "Bearer ${tok()}")
        parse(client.newCall(b.get().build()).execute())
    }
    private suspend fun post(path: String, body: JSONObject, auth: Boolean = true) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path).post(body.toString().toRequestBody(json))
        if (auth) b.header("Authorization", "Bearer ${tok()}")
        parse(client.newCall(b.build()).execute())
    }
    private suspend fun put(path: String, body: JSONObject) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path).put(body.toString().toRequestBody(json))
            .header("Authorization", "Bearer ${tok()}")
        parse(client.newCall(b.build()).execute())
    }
    private suspend fun patch(path: String, body: JSONObject) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path).patch(body.toString().toRequestBody(json))
            .header("Authorization", "Bearer ${tok()}")
        parse(client.newCall(b.build()).execute())
    }
    private suspend fun delete(path: String) = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base + path).delete()
            .header("Authorization", "Bearer ${tok()}")
        parse(client.newCall(b.build()).execute())
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
