package com.artistsstudio.admin.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("studio_admin")

class SessionStore(private val context: Context) {
    private val tokenKey = stringPreferencesKey("token")
    private val nameKey = stringPreferencesKey("name")
    private val roleKey = stringPreferencesKey("role")

    val tokenFlow: Flow<String?> = context.dataStore.data.map { it[tokenKey] }

    suspend fun token(): String? = context.dataStore.data.first()[tokenKey]
    suspend fun name(): String? = context.dataStore.data.first()[nameKey]
    suspend fun role(): String? = context.dataStore.data.first()[roleKey]

    suspend fun save(token: String, name: String, role: String) {
        context.dataStore.edit {
            it[tokenKey] = token
            it[nameKey] = name
            it[roleKey] = role
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
