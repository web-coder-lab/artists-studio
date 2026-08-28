package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*

@Composable
fun HomeShell(api: ApiClient, adminName: String, onLogout: () -> Unit) {
    var tab by remember { mutableStateOf(0) }
    var chatId by remember { mutableStateOf<Int?>(null) }
    var chatTitle by remember { mutableStateOf("") }

    if (chatId != null) {
        ChatThreadScreen(api, chatId!!, chatTitle) {
            chatId = null
        }
        return
    }

    Scaffold(
        containerColor = Bg,
        bottomBar = {
            NavigationBar(containerColor = CardBg) {
                listOf("Home", "Chat", "Inbox", "Alerts").forEachIndexed { i, label ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i },
                        icon = {
                            Text(
                                if (tab == i) "●" else "○",
                                color = if (tab == i) Accent else Muted
                            )
                        },
                        label = { Text(label, fontSize = 11.sp) },
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
                0 -> DashboardScreen(api, adminName, onLogout)
                1 -> ChatListScreen(api) { id, title ->
                    chatId = id
                    chatTitle = title
                }
                2 -> ContactsScreen(api)
                else -> NotificationsScreen(api)
            }
        }
    }
}
