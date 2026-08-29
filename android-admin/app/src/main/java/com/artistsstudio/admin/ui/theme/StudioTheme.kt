package com.artistsstudio.admin.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Bg = Color(0xFF050506)
val CardBg = Color(0xFF141416)
val Accent = Color(0xFFD4B483)
val Muted = Color(0xFF8A857B)
val TextC = Color(0xFFF7F4EF)
val Danger = Color(0xFFE07A6A)
val Line = Color(0xFF2A2A2E)

private val scheme = darkColorScheme(
    background = Bg,
    surface = CardBg,
    primary = Accent,
    onPrimary = Color(0xFF14110D),
    onBackground = TextC,
    onSurface = TextC,
    error = Danger
)

@Composable
fun StudioTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
