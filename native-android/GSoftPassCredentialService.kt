// native-android/GSoftPassCredentialService.kt
package com.gsoftpass.app.autofill

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePasswordCredentialRequest
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.CreateEntry
import androidx.credentials.provider.CredentialProviderService
import androidx.credentials.provider.ProviderClearCredentialStateRequest

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class GSoftPassCredentialService : CredentialProviderService() {

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>
    ) {
        try {
            when (request) {
                is BeginCreatePasswordCredentialRequest -> {
                    val saveIntent = Intent(applicationContext, GSoftPassCredentialSaveActivity::class.java).apply {
                        setPackage(packageName)
                    }
                    // FLAG_MUTABLE es obligatorio para que Android adjunte la contraseña al PendingIntent
                    val pendingIntent = PendingIntent.getActivity(
                        applicationContext,
                        9101,
                        saveIntent,
                        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                    )

                    val createEntry = CreateEntry(
                        accountName = "GSoftPass",
                        pendingIntent = pendingIntent,
                        description = "Guardar contraseña en tu bóveda cifrada"
                    )

                    callback.onResult(
                        BeginCreateCredentialResponse(
                            createEntries = listOf(createEntry)
                        )
                    )
                }
                else -> {
                    callback.onResult(BeginCreateCredentialResponse(emptyList()))
                }
            }
        } catch (e: Exception) {
            callback.onError(CreateCredentialUnknownException(e.message))
        }
    }

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>
    ) {
        // El autorrellenado en línea y desplegable ya se resuelve mediante GSoftPassAutofillService
        callback.onResult(BeginGetCredentialResponse(emptyList()))
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>
    ) {
        callback.onResult(null)
    }
}