// native-android/GSoftPassCredentialService.kt
package com.gsoftpass.app.autofill

import android.app.PendingIntent
import android.content.Intent
import android.credentials.ClearCredentialStateException
import android.credentials.CreateCredentialException
import android.credentials.GetCredentialException
import android.graphics.drawable.Icon
import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import android.service.credentials.*
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class GSoftPassCredentialService : CredentialProviderService() {

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>
    ) {
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            putExtra("GSOFTPASS_ACTION", "CREATE_PASSKEY")
        } ?: Intent()

        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            1001,
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val slice = android.app.slice.Slice.Builder(
            android.net.Uri.parse("content://com.gsoftpass.app/create"),
            android.app.slice.SliceSpec("CreateEntry", 1)
        ).build()

        val createEntry = CreateEntry(slice)
        val response = BeginCreateCredentialResponse.Builder()
            .addCreateEntry(createEntry)
            .build()

        callback.onResult(response)
    }

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>
    ) {
        val response = BeginGetCredentialResponse.Builder().build()
        callback.onResult(response)
    }

    override fun onClearCredentialStateRequest(
        request: ClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialStateException>
    ) {
        callback.onResult(null)
    }
}