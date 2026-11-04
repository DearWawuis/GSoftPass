// src/services/AutofillBridgeService.ts
import { NativeModules, Platform } from 'react-native';
import { VaultItem } from '../types/vault';
import { StorageService } from './StorageService';

declare const chrome: any;

const { GSoftPassAutofill } = NativeModules;

export interface AutofillPreferences {
  inlineAutofillEnabled: boolean;   // Mostrar sugerencias encima del teclado
  dropdownAutofillEnabled: boolean; // Mostrar sugerencias en menú desplegable junto a los campos
}

export class AutofillBridgeService {
  static async getPreferences(): Promise<AutofillPreferences> {
    const raw = await StorageService.getItem('gsoftpass_autofill_prefs');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    return {
      inlineAutofillEnabled: true,
      dropdownAutofillEnabled: true,
    };
  }

  static async savePreferences(prefs: AutofillPreferences, currentItems: VaultItem[]): Promise<void> {
    await StorageService.setItem('gsoftpass_autofill_prefs', JSON.stringify(prefs));
    await this.syncVaultWithSystemAutofill(currentItems);
  }

  static async isAndroidAutofillEnabled(): Promise<boolean> {
    if (Platform.OS === 'android' && GSoftPassAutofill?.isAutofillServiceEnabled) {
      try {
        return await GSoftPassAutofill.isAutofillServiceEnabled();
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Sincroniza la bóveda tanto con la Extensión MS Edge como con el Servicio Nativo de Android
   */
  static async syncVaultWithSystemAutofill(items: VaultItem[]): Promise<void> {
    const simplified = items
      .filter((i) => i.type === 'account' || i.password || i.username)
      .map((i) => ({
        id: i.id,
        name: i.name,
        url: i.url || '',
        username: i.username || i.masterEmail || '',
        password: i.password || '',
        masterEmail: i.masterEmail,
      }));

    const jsonPayload = JSON.stringify(simplified);
    await StorageService.setItem('autofill_synced_credentials', jsonPayload);

    // 1. Sincronizar con el Servicio Nativo de Android (SharedPreferences compartidas con Kotlin)
    if (Platform.OS === 'android' && GSoftPassAutofill?.syncCredentials) {
      try {
        const prefs = await this.getPreferences();
        await GSoftPassAutofill.syncCredentials(
          jsonPayload,
          prefs.inlineAutofillEnabled,
          prefs.dropdownAutofillEnabled
        );
      } catch {}
    }

    // 2. Sincronizar con la extensión de Microsoft Edge
    if (Platform.OS === 'web' && typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ gsoftpass_autofill_cache: simplified });
    }
  }

  /**
   * Abre directamente el selector de Android:
   * "Elegir servicio preferido para guardar e introducir contraseñas, claves de acceso e información de autorrellenado"
   */
  static async openAndroidAutofillSettings(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    if (GSoftPassAutofill?.openSystemAutofillSettings) {
      return await GSoftPassAutofill.openSystemAutofillSettings();
    }
    return false;
  }

  /**
   * Recupera las cuentas que el usuario haya guardado desde el Pop-up inferior de Android
   */
  static async consumeAndroidSavedAccounts(): Promise<
    Array<{ name: string; url: string; username: string; password: string }>
  > {
    if (Platform.OS === 'android' && GSoftPassAutofill?.consumePendingSavedCredentials) {
      try {
        const jsonStr = await GSoftPassAutofill.consumePendingSavedCredentials();
        return JSON.parse(jsonStr || '[]');
      } catch {
        return [];
      }
    }
    return [];
  }
}