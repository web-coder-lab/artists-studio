package com.artistsstudio.admin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artistsstudio.admin.data.ApiClient
import com.artistsstudio.admin.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun StudioHub(api: ApiClient) {
    var sub by remember { mutableStateOf(0) }
    val tabs = listOf("Texts", "Design", "Socials")
    Column(Modifier.fillMaxSize()) {
        TabRow(
            selectedTabIndex = sub,
            containerColor = CardBg,
            contentColor = Accent
        ) {
            tabs.forEachIndexed { i, label ->
                Tab(
                    selected = sub == i,
                    onClick = { sub = i },
                    text = { Text(label, fontSize = 13.sp) }
                )
            }
        }
        when (sub) {
            0 -> TextsScreen(api)
            1 -> DesignScreen(api)
            2 -> SocialsScreen(api)
        }
    }
}

@Composable
fun TextsScreen(api: ApiClient) {
    var brand by remember { mutableStateOf("") }
    var tagline by remember { mutableStateOf("") }
    var heroTitle by remember { mutableStateOf("") }
    var heroSub by remember { mutableStateOf("") }
    var aboutTitle by remember { mutableStateOf("") }
    var aboutBody by remember { mutableStateOf("") }
    var contactTitle by remember { mutableStateOf("") }
    var contactSub by remember { mutableStateOf("") }
    var cta by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            loading = true
            msg = null
            runCatching {
                val c = api.getContent()
                val site = c.optJSONObject("site") ?: JSONObject()
                brand = site.optString("brand")
                tagline = site.optString("tagline")
                val copy = site.optJSONObject("copy") ?: JSONObject()
                val home = copy.optJSONObject("home") ?: JSONObject()
                val about = copy.optJSONObject("about") ?: JSONObject()
                val contact = copy.optJSONObject("contact") ?: JSONObject()
                heroTitle = home.optString("hero_title", site.optString("hero_title"))
                heroSub = home.optString("hero_subtitle", site.optString("hero_subtitle"))
                aboutTitle = about.optString("title", "About")
                aboutBody = about.optString("body", site.optString("about"))
                contactTitle = contact.optString("title", "Contact")
                contactSub = contact.optString("subtitle", "")
                cta = home.optString("cta_primary", "View work")
            }.onFailure { msg = it.message }
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text("Texts (CMS)", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Medium)
        Text("Live on website after Save", color = Muted, fontSize = 12.sp)
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical = 12.dp), color = Accent, trackColor = Line)
        msg?.let { Text(it, color = if (it.startsWith("Saved")) Accent else Danger, fontSize = 13.sp, modifier = Modifier.padding(vertical = 6.dp)) }

        Field("Brand", brand) { brand = it }
        Field("Tagline", tagline) { tagline = it }
        Field("Hero title", heroTitle) { heroTitle = it }
        Field("Hero subtitle", heroSub) { heroSub = it }
        Field("About title", aboutTitle) { aboutTitle = it }
        Field("About body", aboutBody, singleLine = false) { aboutBody = it }
        Field("Contact title", contactTitle) { contactTitle = it }
        Field("Contact subtitle", contactSub) { contactSub = it }
        Field("Primary CTA", cta) { cta = it }

        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                scope.launch {
                    msg = null
                    runCatching {
                        val site = JSONObject()
                            .put("brand", brand)
                            .put("tagline", tagline)
                            .put(
                                "copy",
                                JSONObject()
                                    .put(
                                        "home",
                                        JSONObject()
                                            .put("hero_title", heroTitle)
                                            .put("hero_subtitle", heroSub)
                                            .put("cta_primary", cta)
                                    )
                                    .put(
                                        "about",
                                        JSONObject()
                                            .put("title", aboutTitle)
                                            .put("body", aboutBody)
                                    )
                                    .put(
                                        "contact",
                                        JSONObject()
                                            .put("title", contactTitle)
                                            .put("subtitle", contactSub)
                                    )
                            )
                        api.putContent(JSONObject().put("site", site))
                        msg = "Saved · live on site"
                    }.onFailure { msg = it.message }
                }
            },
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Save texts") }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun DesignScreen(api: ApiClient) {
    var accent by remember { mutableStateOf("#d4b483") }
    var background by remember { mutableStateOf("#070708") }
    var text by remember { mutableStateOf("#f6f3ec") }
    var mode by remember { mutableStateOf("dark") }
    var msg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        runCatching {
            val t = api.getTheme()
            accent = t.optString("accent", accent)
            background = t.optString("background", background)
            text = t.optString("text", text)
            mode = t.optString("mode", mode)
        }.onFailure { msg = it.message }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text("Design", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Medium)
        Text("Theme colors · mode", color = Muted, fontSize = 12.sp)
        msg?.let { Text(it, color = if (it.startsWith("Saved")) Accent else Danger, fontSize = 13.sp, modifier = Modifier.padding(vertical = 6.dp)) }

        Field("Accent", accent) { accent = it }
        Field("Background", background) { background = it }
        Field("Text", text) { text = it }
        Field("Mode (dark/light)", mode) { mode = it }

        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                scope.launch {
                    runCatching {
                        api.putTheme(
                            JSONObject()
                                .put("accent", accent)
                                .put("background", background)
                                .put("text", text)
                                .put("mode", mode)
                        )
                        msg = "Saved · design live"
                    }.onFailure { msg = it.message }
                }
            },
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Save design") }
    }
}

@Composable
fun SocialsScreen(api: ApiClient) {
    var wa by remember { mutableStateOf("") }
    var ig by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        runCatching {
            val s = api.getSocials()
            wa = s.optString("whatsapp")
            ig = s.optString("instagram")
            email = s.optString("email")
        }.onFailure { msg = it.message }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text("Socials", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Medium)
        Text("WhatsApp · Instagram · Email", color = Muted, fontSize = 12.sp)
        msg?.let { Text(it, color = if (it.startsWith("Saved")) Accent else Danger, fontSize = 13.sp, modifier = Modifier.padding(vertical = 6.dp)) }

        Field("WhatsApp (digits)", wa) { wa = it }
        Field("Instagram URL", ig) { ig = it }
        Field("Email", email) { email = it }

        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                scope.launch {
                    runCatching {
                        api.putSocials(
                            JSONObject()
                                .put("whatsapp", wa)
                                .put("instagram", ig)
                                .put("email", email)
                        )
                        msg = "Saved · contact page updated"
                    }.onFailure { msg = it.message }
                }
            },
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Save socials") }
    }
}

@Composable
fun Field(label: String, value: String, singleLine: Boolean = true, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = singleLine,
        minLines = if (singleLine) 1 else 3,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Accent,
            unfocusedBorderColor = Line,
            focusedLabelColor = Accent,
            unfocusedLabelColor = Muted,
            focusedTextColor = TextC,
            unfocusedTextColor = TextC,
            cursorColor = Accent
        )
    )
}
