// native-android/GSoftPassAutofillService.kt
package com.gsoftpass.app.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.graphics.BlendMode
import android.graphics.Color
import android.graphics.drawable.Icon
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.*
import android.text.InputType
import android.util.Size
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import android.widget.inline.InlinePresentationSpec
import androidx.annotation.RequiresApi
import org.json.JSONArray
import org.json.JSONObject

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

        // No mostrar pop-up de autocompletado sobre el propio login maestro de GSoftPass
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

        // 1. CONFIGURAR EL POP-UP INFERIOR PERSISTENTE PARA GUARDAR CONTRASEÑA (ESTILO LASTPASS)
        val saveTypes = (if (usernameField != null) SaveInfo.SAVE_DATA_TYPE_USERNAME else 0) or
                        (if (passwordField != null) SaveInfo.SAVE_DATA_TYPE_PASSWORD else 0)
        val requiredIds = listOfNotNull(usernameField?.id, passwordField?.id).toTypedArray()

        if (requiredIds.isNotEmpty()) {
            val saveBuilder = SaveInfo.Builder(saveTypes, requiredIds)
                .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)

            responseBuilder.setSaveInfo(saveBuilder.build())
        }

        // 2. BUSCAR CUENTAS GUARDADAS (EJ. TWITCH) Y ORDENARLAS POR COINCIDENCIA
        val allCredentials = parseVaultCredentials(rawVaultJson)
        val sortedCredentials = allCredentials.sortedByDescending { cred ->
            val nameClean = cred.optString("name", "").lowercase()
            val urlClean = cred.optString("url", "").lowercase()
            when {
                webDomainFound.isNotEmpty() && (urlClean.contains(webDomainFound) || webDomainFound.contains(nameClean)) -> 100
                nameClean.isNotEmpty() && clientPackage.contains(nameClean) -> 90
                urlClean.isNotEmpty() && clientPackage.split(".").any { it.length > 3 && urlClean.contains(it) } -> 80
                else -> 10
            }
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

        var addedDatasets = 0

        for ((index, cred) in sortedCredentials.withIndex()) {
            val accName = cred.optString("name", "Cuenta")
            val accUser = cred.optString("username", "")
            val accPass = cred.optString("password", "")
            if (accUser.isEmpty() && accPass.isEmpty()) continue

            val label = if (accUser.isNotEmpty()) "$accName ($accUser)" else accName

            // Vista del Menú Desplegable junto a los campos
            val remoteViews = RemoteViews(packageName, android.R.layout.simple_list_item_2).apply {
                setTextViewText(android.R.id.text1, "🛡️ $accName")
                setTextViewText(android.R.id.text2, accUser.ifEmpty { "Autocompletar con GSoftPass" })
            }

            val datasetBuilder = if (dropdownEnabled) {
                Dataset.Builder(remoteViews)
            } else {
                Dataset.Builder()
            }

            // Vista de Autocompletar en Línea (Encima del Teclado en Android 11+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && inlineEnabled && inlineSpecs.isNotEmpty() && index < maxInline) {
                val spec = inlineSpecs[index.coerceAtMost(inlineSpecs.size - 1)]
                val inlinePresentation = buildInlinePresentation(spec, label, accUser, index)
                if (inlinePresentation != null) {
                    datasetBuilder.setInlinePresentation(inlinePresentation)
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

        // Si aún no hay cuentas para esa app pero hay campos de login, agregamos un dataset disparador
        // para que Android siempre mantenga vivo el monitoreo y muestre el Pop-up inferior de Guardar al enviar el formulario
        if (addedDatasets == 0 && requiredIds.isNotEmpty()) {
            val fallbackViews = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
                setTextViewText(android.R.id.text1, "🛡️ GSoftPass: Abrir Bóveda")
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

    @RequiresApi(Build.VERSION_CODES.R)
    private fun buildInlinePresentation(
        spec: InlinePresentationSpec,
        title: String,
        subtitle: String,
        index: Int
    ): InlinePresentation? {
        return try {
            val pendingIntent = PendingIntent.getActivity(
                applicationContext,
                8000 + index,
                packageManager.getLaunchIntentForPackage(packageName) ?: Intent(),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            // Construcción del Slice compatible con Android Autofill Inline Suggestion V1
            val sliceUri = android.net.Uri.parse("content://com.gsoftpass.app/inline/$index")
            val sliceSpec = android.app.slice.SliceSpec("androidx.autofill.inline.ui.version:v1", 1)
            val sliceBuilder = android.app.slice.Slice.Builder(sliceUri, sliceSpec)

            val contentBuilder = android.app.slice.Slice.Builder(sliceBuilder)
                .addText(title, null, listOf("androidx.autofill.inline.ui.version:v1:title"))
            if (subtitle.isNotEmpty()) {
                contentBuilder.addText(subtitle, null, listOf("androidx.autofill.inline.ui.version:v1:subtitle"))
            }

            val attributionBuilder = android.app.slice.Slice.Builder(sliceBuilder)
                .addAction(
                    pendingIntent,
                    android.app.slice.Slice.Builder(sliceBuilder).build(),
                    "androidx.autofill.inline.ui.version:v1:attribution"
                )

            sliceBuilder.addSubSlice(contentBuilder.build(), "androidx.autofill.inline.ui.version:v1:content")
            sliceBuilder.addSubSlice(attributionBuilder.build(), "androidx.autofill.inline.ui.version:v1:attribution")

            InlinePresentation(sliceBuilder.build(), spec, false)
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Se ejecuta cuando el usuario presiona "Guardar" en el Pop-up inferior de Android
     * después de iniciar sesión en Twitch o cualquier aplicación/sitio web.
     */
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

            // También la agregamos de inmediato a SYNCED_VAULT_ITEMS para que esté disponible al instante
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
}