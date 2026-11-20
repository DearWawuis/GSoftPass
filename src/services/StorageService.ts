// src/services/StorageService.ts
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const memoryFallback: Record<string, string> = {};

export class StorageService {
  /**
   * expo-secure-store en Android crashea nativamente si la clave contiene
   * caracteres fuera de [a-zA-Z0-9._-] o si está vacía.
   */
  private static sanitizeKey(key: string): string {
    const clean = (key || 'default_key').replace(/[^a-zA-Z0-9._-]/g, '_');
    return clean.substring(0, 120);
  }

  static async setItem(key: string, value: string): Promise<void> {
    const safeKey = this.sanitizeKey(key);
    const safeValue = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    memoryFallback[safeKey] = safeValue;

    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(safeKey, safeValue);
        }
        return;
      }

      // En Android Keystore el límite seguro de SecureStore es ~2000 caracteres.
      if (safeValue.length < 1950) {
        await SecureStore.setItemAsync(safeKey, safeValue);
      } else {
        // Si la bóveda crece, dividimos en fragmentos seguros de 1800 bytes
        const chunkSize = 1800;
        const totalChunks = Math.ceil(safeValue.length / chunkSize);
        await SecureStore.setItemAsync(`${safeKey}__chunks`, String(totalChunks));
        for (let i = 0; i < totalChunks; i++) {
          const chunk = safeValue.slice(i * chunkSize, (i + 1) * chunkSize);
          await SecureStore.setItemAsync(`${safeKey}__part_${i}`, chunk);
        }
      }
    } catch {
      // Nunca lanzar excepción no controlada hacia el hilo principal de React Native
    }
  }

  static async getItem(key: string): Promise<string | null> {
    const safeKey = this.sanitizeKey(key);

    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
          return localStorage.getItem(safeKey);
        }
        return memoryFallback[safeKey] ?? null;
      }

      const chunksCountStr = await SecureStore.getItemAsync(`${safeKey}__chunks`);
      if (chunksCountStr) {
        const totalChunks = parseInt(chunksCountStr, 10);
        if (!isNaN(totalChunks) && totalChunks > 0) {
          let combined = '';
          for (let i = 0; i < totalChunks; i++) {
            const part = await SecureStore.getItemAsync(`${safeKey}__part_${i}`);
            if (part !== null) combined += part;
          }
          if (combined) return combined;
        }
      }

      const direct = await SecureStore.getItemAsync(safeKey);
      return direct ?? memoryFallback[safeKey] ?? null;
    } catch {
      return memoryFallback[safeKey] ?? null;
    }
  }

  static async removeItem(key: string): Promise<void> {
    const safeKey = this.sanitizeKey(key);
    delete memoryFallback[safeKey];

    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(safeKey);
        }
        return;
      }

      const chunksCountStr = await SecureStore.getItemAsync(`${safeKey}__chunks`);
      if (chunksCountStr) {
        const totalChunks = parseInt(chunksCountStr, 10);
        for (let i = 0; i < totalChunks; i++) {
          await SecureStore.deleteItemAsync(`${safeKey}__part_${i}`);
        }
        await SecureStore.deleteItemAsync(`${safeKey}__chunks`);
      }

      await SecureStore.deleteItemAsync(safeKey);
    } catch {}
  }
}