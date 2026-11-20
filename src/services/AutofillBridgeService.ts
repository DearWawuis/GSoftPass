// src/services/AutofillBridgeService.ts
import { NativeModules, Platform } from 'react-native';
import { VaultItem } from '../types/vault';
import { StorageService } from './StorageService';

declare const chrome: any;

export interface AutofillPreferences {
  inlineAutofillEnabled: boolean;
  dropdownAutofillEnabled: boolean;
}

export class AutofillBridgeService {
  private static getNativeModule(): any | null {
    try {
      if (Platform.OS !== 'android') return null;
      return NativeModules?.GSoftPassAutofill ?? null;
    } catch {
      return null;
    }
  }

  static async getPreferences(): Promise<AutofillPreferences> {
    try {
      const raw = await StorageService.getItem('gsoftpass_autofill_prefs');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          inlineAutofillEnabled: Boolean(parsed?.inlineAutofillEnabled ?? true),
          dropdownAutofillEnabled: Boolean(parsed?.dropdownAutofillEnabled ?? true),
        };
      }
    } catch {}
    return {
      inlineAutofillEnabled: true,
      dropdownAutofillEnabled: true,
    };
  }

  static async savePreferences(
    prefs: AutofillPreferences,
    currentItems: VaultItem[]
  ): Promise<void> {
    try {
      await StorageService.setItem('gsoftpass_autofill_prefs', JSON.stringify(prefs));
      await this.syncVaultWithSystemAutofill(currentItems);
    } catch {}
  }

  static async isAndroidAutofillEnabled(): Promise<boolean> {
    try {
      const mod = this.getNativeModule();
      if (mod && typeof mod.isAutofillServiceEnabled === 'function') {
        const res = await mod.isAutofillServiceEnabled();
        return Boolean(res);
      }
    } catch {}
    return false;
  }

  static async syncVaultWithSystemAutofill(items: VaultItem[]): Promise<void> {
    try {
      const safeItems = Array.isArray(items) ? items : [];
      const simplified = safeItems
        .filter((i) => i && (i.type === 'account' || i.password || i.username))
        .map((i) => ({
          id: String(i.id || ''),
          name: String(i.name || 'Cuenta'),
          url: String(i.url || ''),
          username: String(i.username || i.masterEmail || ''),
          password: String(i.password || ''),
          masterEmail: String(i.masterEmail || ''),
          iconUrl: String(i.iconUrl || ''),
          brandColor: String(i.brandColor || '#6366F1'),
        }));

      const jsonPayload = JSON.stringify(simplified);
      await StorageService.setItem('autofill_synced_credentials', jsonPayload);

      const mod = this.getNativeModule();
      if (mod && typeof mod.syncCredentials === 'function') {
        const prefs = await this.getPreferences();
        await mod.syncCredentials(
          jsonPayload,
          Boolean(prefs.inlineAutofillEnabled),
          Boolean(prefs.dropdownAutofillEnabled)
        );
      }

      if (Platform.OS === 'web' && typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ gsoftpass_autofill_cache: simplified });
      }
    } catch {}
  }

  static async openAndroidAutofillSettings(): Promise<boolean> {
    try {
      const mod = this.getNativeModule();
      if (mod && typeof mod.openSystemAutofillSettings === 'function') {
        return Boolean(await mod.openSystemAutofillSettings());
      }
    } catch {}
    return false;
  }

  static async consumeAndroidSavedAccounts(): Promise<
    Array<{ name: string; url: string; username: string; password: string }>
  > {
    try {
      const mod = this.getNativeModule();
      if (mod && typeof mod.consumePendingSavedCredentials === 'function') {
        const jsonStr = await mod.consumePendingSavedCredentials();
        if (typeof jsonStr === 'string' && jsonStr.trim().startsWith('[')) {
          return JSON.parse(jsonStr);
        }
      }
    } catch {}
    return [];
  }
}