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
fun ContentEditorScreen(api: ApiClient) {
    var brand by remember { mutableStateOf("") }
    var tagline by remember { mutableStateOf("") }
    var heroTitle by remember { mutableStateOf("") }
    var heroSub by remember { mutableStateOf("") }
    var profileName by remember { mutableStateOf("") }
    var profileRole by remember { mutableStateOf("") }
    var profileBio by remember { mutableStateOf("") }
    var about by remember { mutableStateOf("") }
    var aboutTitle by remember { mutableStateOf("About") }
    var portTitle by remember { mutableStateOf("Portfolio") }
    var portEyebrow by remember { mutableStateOf("Selected work") }
    var reelsTitle by remember { mutableStateOf("Reels") }
    var contactTitle by remember { mutableStateOf("Get in touch") }
    var contactSub by remember { mutableStateOf("") }
    var ctaWork by remember { mutableStateOf("View work") }
    var ctaContact by remember { mutableStateOf("Contact") }
    var accent by remember { mutableStateOf("#d4b483") }
    var bg by remember { mutableStateOf("#070708") }
    var status by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() = scope.launch {
        runCatching {
            val c = api.getContent()
            val site = c.optJSONObject("site") ?: JSONObject()
            val theme = c.optJSONObject("theme") ?: JSONObject()
            val copy = site.optJSONObject("copy") ?: JSONObject()
            brand = site.optString("brand")
            tagline = site.optString("tagline")
            heroTitle = site.optString("hero_title")
            heroSub = site.optString("hero_subtitle")
            profileName = site.optString("profile_name")
            profileRole = site.optString("profile_role")
            profileBio = site.optString("profile_bio")
            about = site.optString("about")
            aboutTitle = copy.optJSONObject("about")?.optString("title") ?: "About"
            portTitle = copy.optJSONObject("portfolio")?.optString("title") ?: "Portfolio"
            portEyebrow = copy.optJSONObject("portfolio")?.optString("eyebrow") ?: "Selected work"
            reelsTitle = copy.optJSONObject("reels")?.optString("title") ?: "Reels"
            contactTitle = copy.optJSONObject("contact")?.optString("title") ?: "Get in touch"
            contactSub = copy.optJSONObject("contact")?.optString("subtitle") ?: ""
            ctaWork = copy.optJSONObject("home")?.optString("cta_work") ?: "View work"
            ctaContact = copy.optJSONObject("home")?.optString("cta_contact") ?: "Contact"
            accent = theme.optString("accent", "#d4b483")
            bg = theme.optString("background", "#070708")
        }.onFailure { status = it.message }
    }
    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("All page text & design", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Medium)
        Text("Changes go live on the website", color = Muted, fontSize = 13.sp)
        status?.let { Text(it, color = if (it.contains("Saved")) Accent else Danger, fontSize = 13.sp) }

        fun field(label: String, v: String, set: (String) -> Unit, lines: Int = 1) {
            OutlinedTextField(v, set, label = { Text(label) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), minLines = lines, colors = studioFieldColors())
        }
        Text("Brand", color = Accent, modifier = Modifier.padding(top = 12.dp))
        field("Brand name", brand) { brand = it }
        field("Tagline", tagline) { tagline = it }
        Text("Home", color = Accent, modifier = Modifier.padding(top = 12.dp))
        field("Hero title", heroTitle, { heroTitle = it }, 2)
        field("Hero subtitle", heroSub, { heroSub = it }, 2)
        field("CTA — View work", ctaWork) { ctaWork = it }
        field("CTA — Contact", ctaContact) { ctaContact = it }
        field("Profile name", profileName) { profileName = it }
        field("Profile role", profileRole) { profileRole = it }
        field("Profile bio", profileBio, { profileBio = it }, 2)
        Text("About / Portfolio / Reels / Contact", color = Accent, modifier = Modifier.padding(top = 12.dp))
        field("About title", aboutTitle) { aboutTitle = it }
        field("About body", about, { about = it }, 4)
        field("Portfolio eyebrow", portEyebrow) { portEyebrow = it }
        field("Portfolio title", portTitle) { portTitle = it }
        field("Reels title", reelsTitle) { reelsTitle = it }
        field("Contact title", contactTitle) { contactTitle = it }
        field("Contact subtitle", contactSub, { contactSub = it }, 2)
        Text("Design (theme)", color = Accent, modifier = Modifier.padding(top = 12.dp))
        field("Accent color", accent) { accent = it }
        field("Background color", bg) { bg = it }

        Button(
            onClick = {
                scope.launch {
                    runCatching {
                        val site = JSONObject()
                            .put("brand", brand).put("tagline", tagline)
                            .put("hero_title", heroTitle).put("hero_subtitle", heroSub)
                            .put("profile_name", profileName).put("profile_role", profileRole)
                            .put("profile_bio", profileBio).put("about", about)
                            .put("copy", JSONObject()
                                .put("home", JSONObject().put("cta_work", ctaWork).put("cta_contact", ctaContact))
                                .put("about", JSONObject().put("title", aboutTitle).put("body", about).put("eyebrow", "Studio"))
                                .put("portfolio", JSONObject().put("title", portTitle).put("eyebrow", portEyebrow))
                                .put("reels", JSONObject().put("title", reelsTitle).put("eyebrow", "Motion"))
                                .put("contact", JSONObject().put("title", contactTitle).put("subtitle", contactSub).put("eyebrow", "Connect"))
                            )
                        val theme = JSONObject().put("accent", accent).put("background", bg)
                        api.putContent(JSONObject().put("site", site).put("theme", theme))
                        status = "Saved — live on website"
                    }.onFailure { status = it.message }
                }
            },
            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = androidx.compose.ui.graphics.Color(0xFF14110D))
        ) { Text("Save all to website") }
    }
}
