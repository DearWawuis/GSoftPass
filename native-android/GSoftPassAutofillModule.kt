// native-android/GSoftPassAutofillModule.kt
package com.gsoftpass.app.autofill

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import com.facebook.react.bridge.*
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

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

        // Pre-descarga en segundo plano los iconos de IA (iconUrl) para el teclado de Android
        cacheCredentialIconsInBackground(credentialsJson)
        promise.resolve(true)
    }

    private fun cacheCredentialIconsInBackground(credentialsJson: String) {
        Thread {
            try {
                val iconsDir = File(reactContext.filesDir, "autofill_icons")
                if (!iconsDir.exists()) iconsDir.mkdirs()

                val arr = JSONArray(credentialsJson)
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val id = obj.optString("id", "").trim()
                    val iconUrl = obj.optString("iconUrl", "").trim()
                    if (id.isEmpty() || !iconUrl.startsWith("http")) continue

                    val safeId = id.replace(Regex("[^a-zA-Z0-9_-]"), "_")
                    val targetFile = File(iconsDir, "$safeId.png")
                    if (targetFile.exists() && targetFile.length() > 100) continue

                    try {
                        val conn = (URL(iconUrl).openConnection() as HttpURLConnection).apply {
                            connectTimeout = 5000
                            readTimeout = 5000
                            instanceFollowRedirects = true
                        }
                        if (conn.responseCode == HttpURLConnection.HTTP_OK) {
                            conn.inputStream.use { stream ->
                                val bmp = BitmapFactory.decodeStream(stream)
                                if (bmp != null) {
                                    val scaled = Bitmap.createScaledBitmap(bmp, 96, 96, true)
                                    FileOutputStream(targetFile).use { out ->
                                        scaled.compress(Bitmap.CompressFormat.PNG, 100, out)
                                    }
                                }
                            }
                        }
                        conn.disconnect()
                    } catch (_: Exception) {}
                }
            } catch (_: Exception) {}
        }.start()
    }

    @ReactMethod
    fun consumePendingSavedCredentials(promise: Promise) {
        val prefs = getPrefs()
        val pendingJson = prefs.getString("PENDING_SAVED_ITEMS", "[]") ?: "[]"
        prefs.edit().putString("PENDING_SAVED_ITEMS", "[]").apply()
        promise.resolve(pendingJson)
    }
}