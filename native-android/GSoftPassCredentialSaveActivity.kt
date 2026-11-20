// native-android/GSoftPassCredentialSaveActivity.kt
package com.gsoftpass.app.autofill

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi
import androidx.credentials.CreatePasswordRequest
import androidx.credentials.CreatePasswordResponse
import androidx.credentials.provider.PendingIntentHandler
import org.json.JSONArray
import org.json.JSONObject

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class GSoftPassCredentialSaveActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            val createRequest = PendingIntentHandler.retrieveProviderCreateCredentialRequest(intent)
            val passwordReq = createRequest?.callingRequest as? CreatePasswordRequest

            if (passwordReq != null) {
                val username = passwordReq.id
                val password = passwordReq.password
                val clientPackage = createRequest.callingAppInfo.packageName
                val origin = createRequest.callingAppInfo.origin ?: ""

                val appNiceName = when {
                    origin.isNotEmpty() -> origin.replace("https://", "").replace("http://", "").substringBefore("/")
                    clientPackage.contains("twitch", ignoreCase = true) -> "Twitch"
                    else -> clientPackage.substringAfterLast(".").replaceFirstChar { it.uppercase() }
                }

                val newEntry = JSONObject().apply {
                    put("id", "cred_${System.currentTimeMillis()}")
                    put("name", appNiceName)
                    put("url", if (origin.isNotEmpty()) origin else clientPackage)
                    put("username", username)
                    put("password", password)
                    put("timestamp", System.currentTimeMillis())
                }

                val prefs = getSharedPreferences("GSoftPassAutofillPrefs", Context.MODE_PRIVATE)

                val existingPending = JSONArray(prefs.getString("PENDING_SAVED_ITEMS", "[]") ?: "[]")
                existingPending.put(newEntry)

                val currentSynced = JSONArray(prefs.getString("SYNCED_VAULT_ITEMS", "[]") ?: "[]")
                currentSynced.put(newEntry)

                prefs.edit()
                    .putString("PENDING_SAVED_ITEMS", existingPending.toString())
                    .putString("SYNCED_VAULT_ITEMS", currentSynced.toString())
                    .apply()

                val resultIntent = Intent()
                PendingIntentHandler.setCreateCredentialResponse(resultIntent, CreatePasswordResponse())
                setResult(RESULT_OK, resultIntent)
            } else {
                setResult(RESULT_CANCELED)
            }
        } catch (_: Exception) {
            setResult(RESULT_CANCELED)
        }

        finish()
    }
}