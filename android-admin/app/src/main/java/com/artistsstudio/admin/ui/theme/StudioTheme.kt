package com.artistsstudio.admin.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Bg = Color(0xFF0A0A0B)
val CardBg = Color(0xFF141416)
val Accent = Color(0xFFC4A574)
val Muted = Color(0xFF9C978C)
val TextC = Color(0xFFF4F1EA)
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

@Composable
fun studioFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Accent,
    unfocusedBorderColor = Line,
    focusedLabelColor = Accent,
    unfocusedLabelColor = Muted,
    cursorColor = Accent,
    focusedTextColor = TextC,
    unfocusedTextColor = TextC,
    disabledTextColor = Muted
)
