// native-android/GSoftPassCredentialService.kt
package com.gsoftpass.app.autofill

import android.app.slice.Slice
import android.app.slice.SliceSpec
import android.credentials.ClearCredentialStateException
import android.credentials.CreateCredentialException
import android.credentials.GetCredentialException
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import android.service.credentials.*
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class GSoftPassCredentialService : CredentialProviderService() {

    override fun onBeginCreateCredential(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>
    ) {
        val slice = Slice.Builder(
            Uri.parse("content://com.gsoftpass.app/create"),
            SliceSpec("CreateEntry", 1)
        ).build()

        val createEntry = CreateEntry(slice)
        val response = BeginCreateCredentialResponse.Builder()
            .addCreateEntry(createEntry)
            .build()

        callback.onResult(response)
    }

    override fun onBeginGetCredential(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>
    ) {
        val response = BeginGetCredentialResponse.Builder().build()
        callback.onResult(response)
    }

    override fun onClearCredentialState(
        request: ClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialStateException>
    ) {
        callback.onResult(null)
    }
}