package com.artistsstudio.admin.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.artistsstudio.admin.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class KeepAliveWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        return try {
            val client = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build()
            val urls = listOf(
                BuildConfig.SITE_BASE + "/api/v1/ping",
                BuildConfig.SITE_BASE + "/api/v1/health"
            )
            for (u in urls) {
                runCatching {
                    client.newCall(Request.Builder().url(u).get().build()).execute().close()
                }
            }
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        private const val UNIQUE = "studio_keepalive"

        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<KeepAliveWorker>(15, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE,
                ExistingPeriodicWorkPolicy.UPDATE,
                req
            )
        }
    }
}
