// native-android/GSoftPassAutofillService.kt
package com.gsoftpass.app.autofill

import android.app.assist.AssistStructure
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.*
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.O)
class GSoftPassAutofillService : AutofillService() {

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val context = request.fillContexts
        val structure: AssistStructure = context[context.size - 1].structure

        val parsedFields = mutableMapOf<String, AutofillId>()
        parseStructure(structure, parsedFields)

        val usernameId = parsedFields["username"]
        val passwordId = parsedFields["password"]

        if (usernameId == null && passwordId == null) {
            callback.onSuccess(null)
            return
        }

        val saveTypes = (if (usernameId != null) SaveInfo.SAVE_DATA_TYPE_USERNAME else 0) or
                        (if (passwordId != null) SaveInfo.SAVE_DATA_TYPE_PASSWORD else 0)

        val requiredIds = listOfNotNull(usernameId, passwordId).toTypedArray()

        // FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE es indispensable para sitios web como GitHub
        // que redirigen mediante JavaScript al iniciar sesión en un navegador móvil
        val saveInfo = SaveInfo.Builder(saveTypes, requiredIds)
            .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)
            .build()

        val responseBuilder = FillResponse.Builder().setSaveInfo(saveInfo)

        val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, "🛡️ GSoftPass: Autocompletar o Guardar Cuenta")
        }

        val datasetBuilder = Dataset.Builder(presentation)
        usernameId?.let { datasetBuilder.setValue(it, AutofillValue.forText("")) }
        passwordId?.let { datasetBuilder.setValue(it, AutofillValue.forText("")) }

        responseBuilder.addDataset(datasetBuilder.build())
        callback.onSuccess(responseBuilder.build())
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        callback.onSuccess()
    }

    private fun parseStructure(structure: AssistStructure, fields: MutableMap<String, AutofillId>) {
        val nodes = structure.windowNodeCount
        for (i in 0 until nodes) {
            val node = structure.getWindowNodeAt(i).rootViewNode
            traverseNode(node, fields)
        }
    }

    private fun traverseNode(node: AssistStructure.ViewNode, fields: MutableMap<String, AutofillId>) {
        val hints = node.autofillHints
        val idEntry = (node.idEntry ?: "").lowercase()
        val hintText = (node.hint ?: "").toString().lowercase()
        val htmlName = node.htmlInfo?.attributes?.firstOrNull { it.first.lowercase() == "name" }?.second?.lowercase() ?: ""
        val htmlType = node.htmlInfo?.attributes?.firstOrNull { it.first.lowercase() == "type" }?.second?.lowercase() ?: ""

        node.autofillId?.let { autofillId ->
            if (hints?.contains(View.AUTOFILL_HINT_PASSWORD) == true ||
                htmlType == "password" ||
                idEntry.contains("pass") ||
                htmlName.contains("password") ||
                hintText.contains("contraseña") ||
                hintText.contains("password")
            ) {
                fields["password"] = autofillId
            } else if (hints?.contains(View.AUTOFILL_HINT_USERNAME) == true ||
                hints?.contains(View.AUTOFILL_HINT_EMAIL_ADDRESS) == true ||
                htmlType == "email" ||
                htmlName.contains("login") ||
                htmlName.contains("user") ||
                idEntry.contains("login") ||
                idEntry.contains("user") ||
                idEntry.contains("email") ||
                hintText.contains("correo") ||
                hintText.contains("username")
            ) {
                if (!fields.containsKey("username")) {
                    fields["username"] = autofillId
                }
            }
        }

        for (i in 0 until node.childCount) {
            traverseNode(node.getChildAt(i), fields)
        }
    }
}