package com.artistsstudio.admin

import android.app.Application
import com.artistsstudio.admin.work.KeepAliveWorker

class AdminApp : Application() {
    override fun onCreate() {
        super.onCreate()
        KeepAliveWorker.schedule(this)
    }
}
