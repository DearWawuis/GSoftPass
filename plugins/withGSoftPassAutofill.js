// plugins/withGSoftPassAutofill.js
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withAutofillAndPasskeysManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    if (!mainApplication.service) mainApplication.service = [];

    // 1. Servicio de Autocompletado (Contraseñas)
    const autofillServiceName = '.autofill.GSoftPassAutofillService';
    if (!mainApplication.service.some((s) => s.$['android:name'] === autofillServiceName)) {
      mainApplication.service.push({
        $: {
          'android:name': autofillServiceName,
          'android:label': 'GSoftPass Autocompletado',
          'android:permission': 'android.permission.BIND_AUTOFILL_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.service.autofill.AutofillService' } }] },
        ],
        'meta-data': [
          { $: { 'android:name': 'android.autofill', 'android:resource': '@xml/autofill_service_config' } },
        ],
      });
    }

    // 2. Servicio de Claves de Acceso / Passkeys (Android 14+)
    const passkeyServiceName = '.autofill.GSoftPassCredentialService';
    if (!mainApplication.service.some((s) => s.$['android:name'] === passkeyServiceName)) {
      mainApplication.service.push({
        $: {
          'android:name': passkeyServiceName,
          'android:label': 'GSoftPass Passkeys',
          'android:permission': 'android.permission.BIND_CREDENTIAL_PROVIDER_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.credentials.CredentialProviderService' } }] },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.credentials.provider',
              'android:resource': '@xml/credential_provider_config',
            },
          },
        ],
      });
    }

    return config;
  });
}

function withAutofillNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;

      const xmlDestDir = path.join(platformRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDestDir, { recursive: true });
      ['autofill_service_config.xml', 'credential_provider_config.xml'].forEach((file) => {
        const src = path.join(projectRoot, 'native-android', file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(xmlDestDir, file));
      });

      const ktDestDir = path.join(platformRoot, 'app/src/main/java/com/gsoftpass/app/autofill');
      fs.mkdirSync(ktDestDir, { recursive: true });
      ['GSoftPassAutofillService.kt', 'GSoftPassCredentialService.kt'].forEach((file) => {
        const src = path.join(projectRoot, 'native-android', file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(ktDestDir, file));
      });

      return config;
    },
  ]);
}

module.exports = function withGSoftPassAutofill(config) {
  config = withAutofillAndPasskeysManifest(config);
  config = withAutofillNativeFiles(config);
  return config;
};