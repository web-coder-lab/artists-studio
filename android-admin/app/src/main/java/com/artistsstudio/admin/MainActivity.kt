package com.artistsstudio.admin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.GateScreen
import com.artistsstudio.admin.ui.HomeShell
import com.artistsstudio.admin.ui.theme.Bg
import com.artistsstudio.admin.ui.theme.StudioTheme

/**
 * Phase 4: Gate → Dashboard (no login).
 */
class MainActivity : ComponentActivity() {
    private val api = ApiClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            StudioTheme {
                Surface(Modifier.fillMaxSize(), color = Bg) {
                    var ready by remember { mutableStateOf(false) }
                    if (!ready) {
                        GateScreen(api) { ready = true }
                    } else {
                        HomeShell(api)
                    }
                }
            }
        }
    }
}
