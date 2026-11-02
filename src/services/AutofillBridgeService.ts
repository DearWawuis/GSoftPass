// src/services/AutofillBridgeService.ts
import { Platform, Linking } from 'react-native';
import { VaultItem } from '../types/vault';
import { StorageService } from './StorageService';

export interface AutofillCandidate {
  id: string;
  name: string;
  url: string;
  username: string;
  password?: string;
  masterEmail?: string;
  brandColor?: string;
}

export class AutofillBridgeService {
  private static AUTOFILL_CACHE_KEY = 'autofill_quick_index';

  /**
   * Sincroniza las cuentas de tipo 'account' y 'passkey' con el índice rápido
   * que consumen el AutofillService de Android y la Extensión de Edge.
   */
  static async syncVaultWithSystemAutofill(items: VaultItem[]): Promise<void> {
    const candidates: AutofillCandidate[] = items
      .filter((item) => item.type === 'account' || item.type === 'passkey')
      .map((item) => ({
        id: item.id,
        name: item.name,
        url: (item.url || '').toLowerCase(),
        username: item.username || item.masterEmail || '',
        password: item.password || '',
        masterEmail: item.masterEmail,
        brandColor: item.brandColor,
      }));

    await StorageService.setItem(this.AUTOFILL_CACHE_KEY, JSON.stringify(candidates));

    // Si corre como Extensión en Microsoft Edge, actualiza también chrome.storage.local
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const chromeGlobal = (window as any).chrome;
      if (chromeGlobal && chromeGlobal.storage && chromeGlobal.storage.local) {
        chromeGlobal.storage.local.set({ gsoftpass_autofill_cache: candidates });
      }
    }
  }

  /**
   * Busca cuentas coincidentes cuando el usuario toca un input en cualquier app o sitio web
   */
  static findMatchingAccounts(
    items: VaultItem[],
    appPackageOrUrl: string
  ): VaultItem[] {
    const query = appPackageOrUrl.trim().toLowerCase();
    if (!query) return [];

    return items.filter((item) => {
      if (item.type !== 'account' && item.type !== 'passkey') return false;
      const itemUrl = (item.url || '').toLowerCase();
      const itemName = item.name.toLowerCase();
      return (
        itemUrl.includes(query) ||
        query.includes(itemName) ||
        itemName.includes(query.replace(/^com\./, '').split('.')[0])
      );
    });
  }

  /**
   * Abre directamente la pantalla de Ajustes de Android -> "Servicio de Autocompletado"
   * para que elijas GSoftPass en lugar de Samsung Pass o Google.
   */
  static async openAndroidAutofillSettings(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        await Linking.sendIntent('android.settings.REQUEST_SET_AUTOFILL_SERVICE', [
          { key: 'package', value: 'package:com.gsoftpass.app' },
        ]);
      } catch {
        await Linking.openSettings();
      }
    }
  }
}