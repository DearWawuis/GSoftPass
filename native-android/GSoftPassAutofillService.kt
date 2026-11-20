// native-android/GSoftPassAutofillService.kt
package com.gsoftpass.app.autofill

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BlendMode
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.Icon
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.*
import android.text.InputType
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import android.widget.inline.InlinePresentationSpec
import androidx.annotation.RequiresApi
import androidx.autofill.inline.v1.InlineSuggestionUi
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

@RequiresApi(Build.VERSION_CODES.O)
class GSoftPassAutofillService : AutofillService() {

    data class ParsedField(
        val id: AutofillId,
        val isPassword: Boolean,
        val currentValue: String
    )

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val contexts = request.fillContexts
        if (contexts.isEmpty()) {
            callback.onSuccess(null)
            return
        }

        val structure: AssistStructure = contexts[contexts.size - 1].structure
        val clientPackage = structure.activityComponent?.packageName?.lowercase() ?: ""

        if (clientPackage == packageName.lowercase()) {
            callback.onSuccess(null)
            return
        }

        val detectedFields = mutableListOf<ParsedField>()
        var webDomainFound = ""

        for (i in 0 until structure.windowNodeCount) {
            val rootNode = structure.getWindowNodeAt(i).rootViewNode
            traverseNodeForFill(rootNode, detectedFields) { domain ->
                if (domain.isNotEmpty()) webDomainFound = domain.lowercase()
            }
        }

        val passwordField = detectedFields.lastOrNull { it.isPassword }
        val usernameField = detectedFields.lastOrNull { !it.isPassword }

        if (usernameField == null && passwordField == null) {
            callback.onSuccess(null)
            return
        }

        val prefs = getSharedPreferences("GSoftPassAutofillPrefs", Context.MODE_PRIVATE)
        val inlineEnabled = prefs.getBoolean("INLINE_AUTOFILL_ENABLED", true)
        val dropdownEnabled = prefs.getBoolean("DROPDOWN_AUTOFILL_ENABLED", true)
        val rawVaultJson = prefs.getString("SYNCED_VAULT_ITEMS", "[]") ?: "[]"

        val responseBuilder = FillResponse.Builder()

        val saveTypes = (if (usernameField != null) SaveInfo.SAVE_DATA_TYPE_USERNAME else 0) or
                        (if (passwordField != null) SaveInfo.SAVE_DATA_TYPE_PASSWORD else 0)
        val requiredIds = listOfNotNull(usernameField?.id, passwordField?.id).toTypedArray()

        if (requiredIds.isNotEmpty()) {
            val saveBuilder = SaveInfo.Builder(saveTypes, requiredIds)
                .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)
            responseBuilder.setSaveInfo(saveBuilder.build())
        }

        val allCredentials = parseVaultCredentials(rawVaultJson)
        val sortedCredentials = allCredentials.sortedByDescending { cred ->
            scoreCredentialMatch(cred, clientPackage, webDomainFound)
        }

        val inlineRequest = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && inlineEnabled) {
            request.inlineSuggestionsRequest
        } else null
        val inlineSpecs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && inlineRequest != null) {
            inlineRequest.inlinePresentationSpecs
        } else emptyList()
        val maxInline = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && inlineRequest != null) {
            inlineRequest.maxSuggestionCount
        } else 0

        val appIcon = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getAppIconUntinted(packageName)
        } else null

        var inlineSlotIndex = 0
        var addedDatasets = 0

        // 1. ICONO INICIAL FIJADO DE GSOFTPASS (A todo color, sin tinte blanco)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && inlineEnabled && inlineSpecs.isNotEmpty() && maxInline > 1 && requiredIds.isNotEmpty()) {
            val openAppIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
            val openPending = PendingIntent.getActivity(
                applicationContext,
                7000,
                openAppIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val pinnedSpec = inlineSpecs[0]
            val pinnedPresentation = buildPinnedBrandPresentation(pinnedSpec, appIcon, openPending)
            if (pinnedPresentation != null) {
                val brandViews = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
                    setTextViewText(android.R.id.text1, "Abrir Bóveda GSoftPass")
                }
                val brandDataset = Dataset.Builder(brandViews)
                    .setInlinePresentation(pinnedPresentation)
                    .setAuthentication(openPending.intentSender)
                requiredIds.forEach { id ->
                    brandDataset.setValue(id, AutofillValue.forText(""), brandViews)
                }
                try {
                    responseBuilder.addDataset(brandDataset.build())
                    inlineSlotIndex++
                } catch (_: Exception) {}
            }
        }

        // 2. CUENTAS GUARDADAS: Icono de la cuenta (IA) -> Correo/Usuario -> Nombre de la cuenta
        for ((index, cred) in sortedCredentials.withIndex()) {
            val accName = cred.optString("name", "Cuenta")
            val accUser = cred.optString("username", "")
            val accPass = cred.optString("password", "")
            if (accUser.isEmpty() && accPass.isEmpty()) continue

            val titleText = accUser.ifEmpty { accName }
            val subtitleText = if (accUser.isNotEmpty()) accName else "GSoftPass"

            val remoteViews = RemoteViews(packageName, android.R.layout.simple_list_item_2).apply {
                setTextViewText(android.R.id.text1, titleText)
                setTextViewText(android.R.id.text2, subtitleText)
            }

            val datasetBuilder = if (dropdownEnabled) {
                Dataset.Builder(remoteViews)
            } else {
                Dataset.Builder()
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && inlineEnabled && inlineSpecs.isNotEmpty() && inlineSlotIndex < maxInline) {
                val spec = inlineSpecs[inlineSlotIndex.coerceAtMost(inlineSpecs.size - 1)]
                val accountIcon = getCredentialIconUntinted(cred, clientPackage)
                val inlinePresentation = buildCredentialInlinePresentation(
                    spec = spec,
                    icon = accountIcon,
                    title = titleText,
                    subtitle = subtitleText,
                    requestCode = 8000 + index
                )
                if (inlinePresentation != null) {
                    datasetBuilder.setInlinePresentation(inlinePresentation)
                    inlineSlotIndex++
                }
            }

            if (!dropdownEnabled && !(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && inlineEnabled && inlineSpecs.isNotEmpty())) {
                continue
            }

            usernameField?.let {
                datasetBuilder.setValue(it.id, AutofillValue.forText(accUser), remoteViews)
            }
            passwordField?.let {
                datasetBuilder.setValue(it.id, AutofillValue.forText(accPass), remoteViews)
            }

            try {
                responseBuilder.addDataset(datasetBuilder.build())
                addedDatasets++
            } catch (_: Exception) {}
        }

        if (addedDatasets == 0 && requiredIds.isNotEmpty()) {
            val fallbackViews = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
                setTextViewText(android.R.id.text1, "GSoftPass: Abrir Bóveda")
            }
            val openAppIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
            val pendingIntent = PendingIntent.getActivity(
                applicationContext,
                7001,
                openAppIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val triggerDataset = Dataset.Builder(fallbackViews)
                .setAuthentication(pendingIntent.intentSender)

            requiredIds.forEach { id ->
                triggerDataset.setValue(id, AutofillValue.forText(""), fallbackViews)
            }
            try {
                responseBuilder.addDataset(triggerDataset.build())
            } catch (_: Exception) {}
        }

        callback.onSuccess(responseBuilder.build())
    }

    @SuppressLint("RestrictedApi")
    @RequiresApi(Build.VERSION_CODES.R)
    private fun buildPinnedBrandPresentation(
        spec: InlinePresentationSpec,
        appIcon: Icon?,
        pendingIntent: PendingIntent
    ): InlinePresentation? {
        return try {
            val contentBuilder = InlineSuggestionUi.newContentBuilder(pendingIntent)
                .setContentDescription("GSoftPass")
            if (appIcon != null) {
                contentBuilder.setStartIcon(appIcon)
            } else {
                contentBuilder.setTitle("GSoftPass")
            }
            InlinePresentation(contentBuilder.build().slice, spec, true)
        } catch (_: Exception) {
            null
        }
    }

    @SuppressLint("RestrictedApi")
    @RequiresApi(Build.VERSION_CODES.R)
    private fun buildCredentialInlinePresentation(
        spec: InlinePresentationSpec,
        icon: Icon?,
        title: String,
        subtitle: String,
        requestCode: Int
    ): InlinePresentation? {
        return try {
            val pendingIntent = PendingIntent.getActivity(
                applicationContext,
                requestCode,
                packageManager.getLaunchIntentForPackage(packageName) ?: Intent(),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val contentBuilder = InlineSuggestionUi.newContentBuilder(pendingIntent)
                .setTitle(title)
                .setSubtitle(subtitle)
                .setContentDescription("$title - $subtitle")

            if (icon != null) {
                contentBuilder.setStartIcon(icon)
            }

            InlinePresentation(contentBuilder.build().slice, spec, false)
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Preserva los colores originales del icono evitando que Gboard/Samsung lo pinte de blanco.
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private fun toUntintedIcon(bitmap: Bitmap): Icon {
        val scaled = if (bitmap.width != 96 || bitmap.height != 96) {
            Bitmap.createScaledBitmap(bitmap, 96, 96, true)
        } else {
            bitmap
        }
        return Icon.createWithBitmap(scaled).apply {
            setTintBlendMode(BlendMode.DST)
        }
    }

    /**
     * Obtiene el icono de la cuenta en orden de prioridad:
     * 1. Icono generado por IconAIService (descargado y cacheado en autofill_icons/<id>.png)
     * 2. Icono instalado de la app cliente (si el sistema lo permite)
     * 3. Insignia circular con el brandColor de IA y la inicial de la cuenta
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private fun getCredentialIconUntinted(cred: JSONObject, clientPackage: String): Icon {
        val id = cred.optString("id", "").trim()
        if (id.isNotEmpty()) {
            val safeId = id.replace(Regex("[^a-zA-Z0-9_-]"), "_")
            val iconFile = File(filesDir, "autofill_icons/$safeId.png")
            if (iconFile.exists()) {
                val bmp = BitmapFactory.decodeFile(iconFile.absolutePath)
                if (bmp != null) {
                    return toUntintedIcon(bmp)
                }
            }
        }

        val clientIcon = getAppIconUntinted(clientPackage)
        if (clientIcon != null) return clientIcon

        val accName = cred.optString("name", "C")
        val brandColor = cred.optString("brandColor", "#6366F1")
        return createBrandBadgeIcon(accName, brandColor)
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun createBrandBadgeIcon(name: String, hexColor: String): Icon {
        val size = 96
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = try {
                Color.parseColor(hexColor)
            } catch (_: Exception) {
                Color.parseColor("#6366F1")
            }
            style = Paint.Style.FILL
        }
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bgPaint)

        val letter = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "G"
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 46f
            isFakeBoldText = true
            textAlign = Paint.Align.CENTER
        }
        val textY = (size / 2f) - ((textPaint.descent() + textPaint.ascent()) / 2f)
        canvas.drawText(letter, size / 2f, textY, textPaint)

        return toUntintedIcon(bitmap)
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun getAppIconUntinted(targetPackage: String): Icon? {
        if (targetPackage.isEmpty()) return null
        return try {
            val drawable = packageManager.getApplicationIcon(targetPackage)
            val bitmap = drawableToBitmap(drawable)
            toUntintedIcon(bitmap)
        } catch (_: Exception) {
            null
        }
    }

    private fun drawableToBitmap(drawable: Drawable): Bitmap {
        if (drawable is BitmapDrawable && drawable.bitmap != null) {
            return drawable.bitmap
        }
        val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 96
        val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 96
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        return bitmap
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        val contexts = request.fillContexts
        if (contexts.isEmpty()) {
            callback.onSuccess()
            return
        }

        val structure = contexts[contexts.size - 1].structure
        val clientPackage = structure.activityComponent?.packageName ?: "app"
        val detectedFields = mutableListOf<ParsedField>()
        var webDomainFound = ""

        for (i in 0 until structure.windowNodeCount) {
            val rootNode = structure.getWindowNodeAt(i).rootViewNode
            traverseNodeForFill(rootNode, detectedFields) { domain ->
                if (domain.isNotEmpty()) webDomainFound = domain
            }
        }

        val savedPassword = detectedFields.lastOrNull { it.isPassword && it.currentValue.isNotEmpty() }?.currentValue ?: ""
        val savedUsername = detectedFields.lastOrNull { !it.isPassword && it.currentValue.isNotEmpty() }?.currentValue ?: ""

        if (savedPassword.isNotEmpty() || savedUsername.isNotEmpty()) {
            val prefs = getSharedPreferences("GSoftPassAutofillPrefs", Context.MODE_PRIVATE)
            val existingPending = JSONArray(prefs.getString("PENDING_SAVED_ITEMS", "[]") ?: "[]")

            val appNiceName = when {
                webDomainFound.isNotEmpty() -> webDomainFound
                clientPackage.contains("twitch") -> "Twitch"
                else -> clientPackage.substringAfterLast(".").replaceFirstChar { it.uppercase() }
            }

            val newEntry = JSONObject().apply {
                put("id", "autofill_${System.currentTimeMillis()}")
                put("name", appNiceName)
                put("url", if (webDomainFound.isNotEmpty()) "https://$webDomainFound" else clientPackage)
                put("username", savedUsername)
                put("password", savedPassword)
                put("timestamp", System.currentTimeMillis())
            }

            existingPending.put(newEntry)
            prefs.edit().putString("PENDING_SAVED_ITEMS", existingPending.toString()).apply()

            val currentSynced = JSONArray(prefs.getString("SYNCED_VAULT_ITEMS", "[]") ?: "[]")
            currentSynced.put(newEntry)
            prefs.edit().putString("SYNCED_VAULT_ITEMS", currentSynced.toString()).apply()
        }

        callback.onSuccess()
    }

    private fun parseVaultCredentials(jsonStr: String): List<JSONObject> {
        val list = mutableListOf<JSONObject>()
        try {
            val arr = JSONArray(jsonStr)
            for (i in 0 until arr.length()) {
                arr.optJSONObject(i)?.let { list.add(it) }
            }
        } catch (_: Exception) {}
        return list
    }

    private fun traverseNodeForFill(
        node: AssistStructure.ViewNode,
        fields: MutableList<ParsedField>,
        onWebDomain: (String) -> Unit
    ) {
        node.webDomain?.let { if (it.isNotEmpty()) onWebDomain(it) }

        val autofillId = node.autofillId
        val className = (node.className ?: "").lowercase()
        val idEntry = (node.idEntry ?: "").lowercase()
        val hintText = (node.hint ?: "").toString().lowercase()
        val autofillHints = node.autofillHints?.map { it.lowercase() } ?: emptyList()
        val inputType = node.inputType
        val htmlName = node.htmlInfo?.attributes?.firstOrNull { it.first.lowercase() == "name" }?.second?.lowercase() ?: ""
        val htmlType = node.htmlInfo?.attributes?.firstOrNull { it.first.lowercase() == "type" }?.second?.lowercase() ?: ""

        val isEditText = className.contains("edittext") ||
                         className.contains("autocompletetextview") ||
                         className.contains("textinput") ||
                         htmlType.isNotEmpty() ||
                         inputType != 0

        if (autofillId != null && isEditText) {
            val variation = inputType and InputType.TYPE_MASK_VARIATION
            val isPasswordInputType =
                variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD

            val isPassword = isPasswordInputType ||
                autofillHints.any { it.contains("password") } ||
                htmlType == "password" ||
                idEntry.contains("pass") ||
                idEntry.contains("pwd") ||
                htmlName.contains("pass") ||
                hintText.contains("contraseña") ||
                hintText.contains("password") ||
                hintText.contains("clave")

            val isUsername = !isPassword && (
                autofillHints.any { it.contains("username") || it.contains("email") || it.contains("phone") } ||
                variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
                variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS ||
                htmlType == "email" ||
                htmlType == "text" ||
                idEntry.contains("user") ||
                idEntry.contains("email") ||
                idEntry.contains("login") ||
                idEntry.contains("account") ||
                idEntry.contains("identifier") ||
                htmlName.contains("user") ||
                htmlName.contains("login") ||
                htmlName.contains("email") ||
                hintText.contains("usuario") ||
                hintText.contains("correo") ||
                hintText.contains("email") ||
                hintText.contains("username") ||
                hintText.contains("teléfono")
            )

            val currentText = node.autofillValue?.let {
                if (it.isText) it.textValue.toString() else ""
            } ?: (node.text?.toString() ?: "")

            if (isPassword) {
                fields.add(ParsedField(autofillId, true, currentText))
            } else if (isUsername) {
                fields.add(ParsedField(autofillId, false, currentText))
            }
        }

        for (i in 0 until node.childCount) {
            traverseNodeForFill(node.getChildAt(i), fields, onWebDomain)
        }
    }

    private fun scoreCredentialMatch(
        cred: JSONObject,
        clientPackage: String,
        webDomain: String
    ): Int {
        val brandAliases = mapOf(
            "twitch" to listOf("twitch", "jtvnw", "ttvnw"),
            "google" to listOf("google", "gmail", "youtube"),
            "microsoft" to listOf("microsoft", "outlook", "hotmail", "xbox", "live", "office"),
            "meta" to listOf("facebook", "instagram", "messenger", "threads", "katana", "orca"),
            "twitter" to listOf("twitter", "x.com"),
            "amazon" to listOf("amazon", "primevideo", "audible", "mshop"),
            "discord" to listOf("discord"),
            "netflix" to listOf("netflix", "mediaclient"),
            "spotify" to listOf("spotify"),
            "github" to listOf("github"),
            "steam" to listOf("steam", "valvesoftware"),
            "paypal" to listOf("paypal"),
            "mercadolibre" to listOf("mercadolibre", "mercadopago"),
            "bbva" to listOf("bbva", "bancomer")
        )

        val nameClean = cred.optString("name", "").lowercase()
        val urlClean = cred.optString("url", "").lowercase()
        val targetContext = "$clientPackage $webDomain".lowercase()
        val credContext = "$nameClean $urlClean".lowercase()

        var score = 0

        if (webDomain.isNotEmpty() && (urlClean.contains(webDomain) || webDomain.contains(nameClean))) {
            score += 120
        }

        for ((_, aliases) in brandAliases) {
            val targetMatches = aliases.any { targetContext.contains(it) }
            val credMatches = aliases.any { credContext.contains(it) }
            if (targetMatches && credMatches) {
                score += 100
                break
            }
        }

        val ignoreTokens = setOf("com", "net", "org", "app", "android", "mobile", "www", "http", "https", "login", "tv")
        val targetTokens = targetContext.split(Regex("[^a-z0-9]+")).filter { it.length >= 3 && it !in ignoreTokens }
        val credTokens = credContext.split(Regex("[^a-z0-9]+")).filter { it.length >= 3 && it !in ignoreTokens }

        for (tTok in targetTokens) {
            for (cTok in credTokens) {
                if (tTok == cTok) score += 60
                else if (tTok.length >= 4 && cTok.length >= 4 && (tTok.contains(cTok) || cTok.contains(tTok))) score += 40
            }
        }

        return score
    }
}