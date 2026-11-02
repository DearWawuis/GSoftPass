// src/services/StorageService.ts
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export class StorageService {
  static async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(`GSoftPass_${key}`, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  }

  static async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(`GSoftPass_${key}`);
    } else {
      return await SecureStore.getItemAsync(key);
    }
  }

  static async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(`GSoftPass_${key}`);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  }
}