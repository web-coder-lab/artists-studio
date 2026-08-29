package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*

/**
 * Phase 4 shell — Home tab = Dashboard.
 * Other tabs placeholders until later phases.
 */
@Composable
fun HomeShell(api: ApiClient) {
    var tab by remember { mutableStateOf(0) }
    val labels = listOf("Home", "Media", "Studio", "Insight", "More")

    Scaffold(
        containerColor = Bg,
        bottomBar = {
            NavigationBar(containerColor = CardBg, contentColor = Accent) {
                labels.forEachIndexed { i, label ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i },
                        icon = {
                            Text(if (tab == i) "●" else "○", color = if (tab == i) Accent else Muted)
                        },
                        label = { Text(label, fontSize = 10.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Accent,
                            selectedTextColor = Accent,
                            unselectedIconColor = Muted,
                            unselectedTextColor = Muted,
                            indicatorColor = Line
                        )
                    )
                }
            }
        }
    ) { pad ->
        Box(Modifier.padding(pad)) {
            when (tab) {
                0 -> DashboardScreen(api)
                else -> PlaceholderScreen(labels[tab], "Phase ${tab + 4} — coming next")
            }
        }
    }
}

@Composable
fun PlaceholderScreen(title: String, note: String) {
    androidx.compose.foundation.layout.Column(
        Modifier.padding(24.dp)
    ) {
        Text(title, color = TextC, fontSize = 22.sp)
        Text(note, color = Muted, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
    }
}
