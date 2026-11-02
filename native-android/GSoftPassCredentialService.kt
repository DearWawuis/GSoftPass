// native-android/GSoftPassCredentialService.kt
package com.gsoftpass.app.autofill

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.*
import androidx.credentials.provider.*

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class GSoftPassCredentialService : CredentialProviderService() {

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>
    ) {
        // Abre GSoftPass para confirmar y guardar la nueva Clave de Acceso (Passkey) en la Bóveda
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            putExtra("GSOFTPASS_ACTION", "CREATE_PASSKEY")
        } ?: Intent()

        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            1001,
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val createEntry = CreateEntry.Builder(
            "Bóveda GSoftPass (Zero-Knowledge)",
            pendingIntent
        ).setDescription("Guardar Clave de acceso (Passkey) cifrada con AES-256").build()

        val response = BeginCreateCredentialResponse.Builder()
            .setCreateEntries(listOf(createEntry))
            .build()

        callback.onResult(response)
    }

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>
    ) {
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            putExtra("GSOFTPASS_ACTION", "GET_PASSKEY")
        } ?: Intent()

        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            1002,
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val credentialEntries = mutableListOf<CredentialEntry>()
        request.beginGetCredentialOptions.forEach { option ->
            if (option is BeginGetPublicKeyCredentialOption) {
                credentialEntries.add(
                    PublicKeyCredentialEntry.Builder(
                        applicationContext,
                        "Usar Clave de Acceso de GSoftPass",
                        pendingIntent,
                        option
                    ).setDisplayName("GSoftPass Passkey").build()
                )
            }
        }

        val response = BeginGetCredentialResponse.Builder()
            .setCredentialEntries(credentialEntries)
            .build()

        callback.onResult(response)
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>
    ) {
        callback.onResult(null)
    }
}