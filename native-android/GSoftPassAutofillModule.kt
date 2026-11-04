// native-android/GSoftPassAutofillModule.kt
package com.gsoftpass.app.autofill

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import com.facebook.react.bridge.*

class GSoftPassAutofillModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "GSoftPassAutofill"

    private fun getPrefs() =
        reactContext.getSharedPreferences("GSoftPassAutofillPrefs", Context.MODE_PRIVATE)

    @ReactMethod
    fun isAutofillServiceEnabled(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val afm = reactContext.getSystemService(AutofillManager::class.java)
            promise.resolve(afm?.hasEnabledAutofillServices() == true)
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openSystemAutofillSettings(promise: Promise) {
        try {
            val activity: Activity? = reactContext.currentActivity
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val intent = Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                }
                if (activity != null) {
                    activity.startActivityForResult(intent, 9001)
                } else {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    reactContext.startActivity(intent)
                }
                promise.resolve(true)
                return
            }
            promise.resolve(false)
        } catch (e: Exception) {
            try {
                val fallback = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(fallback)
                promise.resolve(true)
            } catch (ex: Exception) {
                promise.resolve(false)
            }
        }
    }

    @ReactMethod
    fun syncCredentials(
        credentialsJson: String,
        inlineEnabled: Boolean,
        dropdownEnabled: Boolean,
        promise: Promise
    ) {
        getPrefs().edit()
            .putString("SYNCED_VAULT_ITEMS", credentialsJson)
            .putBoolean("INLINE_AUTOFILL_ENABLED", inlineEnabled)
            .putBoolean("DROPDOWN_AUTOFILL_ENABLED", dropdownEnabled)
            .apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun consumePendingSavedCredentials(promise: Promise) {
        val prefs = getPrefs()
        val pendingJson = prefs.getString("PENDING_SAVED_ITEMS", "[]") ?: "[]"
        prefs.edit().putString("PENDING_SAVED_ITEMS", "[]").apply()
        promise.resolve(pendingJson)
    }
}