package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*

@Composable
fun HomeShell(api: ApiClient, adminName: String, onLogout: () -> Unit) {
    var tab by remember { mutableStateOf(0) }
    var chatId by remember { mutableStateOf<Int?>(null) }
    var chatTitle by remember { mutableStateOf("") }
    var morePage by remember { mutableStateOf(0) }

    if (chatId != null) {
        ChatThreadScreen(api, chatId!!, chatTitle) { chatId = null }
        return
    }
    if (tab == 4 && morePage == 1) {
        Column(Modifier.fillMaxSize()) {
            TextButton(onClick = { morePage = 0 }, modifier = Modifier.padding(8.dp)) {
                Text("‹ More", color = Accent)
            }
            CmsScreen(api)
        }
        return
    }
    if (tab == 4 && morePage == 2) {
        Column(Modifier.fillMaxSize()) {
            TextButton(onClick = { morePage = 0 }, modifier = Modifier.padding(8.dp)) {
                Text("‹ More", color = Accent)
            }
            SecurityScreen(api)
        }
        return
    }

    Scaffold(
        containerColor = Bg,
        bottomBar = {
            NavigationBar(containerColor = CardBg) {
                listOf("Home", "Chat", "Inbox", "Alerts", "More").forEachIndexed { i, label ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i; if (i != 4) morePage = 0 },
                        icon = { Text(if (tab == i) "●" else "○", color = if (tab == i) Accent else Muted) },
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
                0 -> DashboardScreen(api, adminName, onLogout)
                1 -> ChatListScreen(api) { id, title -> chatId = id; chatTitle = title }
                2 -> ContactsScreen(api)
                3 -> NotificationsScreen(api)
                else -> MoreMenu(
                    onCms = { morePage = 1 },
                    onSecurity = { morePage = 2 },
                    onLogout = onLogout
                )
            }
        }
    }
}

@Composable
private fun MoreMenu(onCms: () -> Unit, onSecurity: () -> Unit, onLogout: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("More", color = TextC, fontSize = 22.sp)
        Text("CMS & security", color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(12.dp))
        Card(onClick = onCms, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), colors = CardDefaults.cardColors(containerColor = CardBg)) {
            Column(Modifier.padding(16.dp)) {
                Text("CMS", color = TextC, fontWeight = FontWeight.Medium)
                Text("Site · Socials · Portfolio · Reels · Publish", color = Muted, fontSize = 13.sp)
            }
        }
        Card(onClick = onSecurity, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), colors = CardDefaults.cardColors(containerColor = CardBg)) {
            Column(Modifier.padding(16.dp)) {
                Text("Security", color = TextC, fontWeight = FontWeight.Medium)
                Text("Sessions · Audit · Failed logins", color = Muted, fontSize = 13.sp)
            }
        }
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onLogout) { Text("Sign out", color = Accent) }
        Text("Phase 5 complete · API-only admin", color = Muted, fontSize = 11.sp)
    }
}
