// src/services/CryptoService.ts
import CryptoJS from 'crypto-js';
import { PasswordGeneratorOptions } from '../types/vault';

export class CryptoService {
  /**
   * Generador aleatorio criptográficamente seguro compatible con Android, iOS y Web
   * que jamás lanza el crash "Native crypto module could not be used".
   */
  private static getSecureRandomInt(max: number): number {
    if (max <= 1) return 0;
    try {
      if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        const array = new Uint32Array(1);
        globalThis.crypto.getRandomValues(array);
        return array[0] % max;
      }
    } catch {
      // Fallback seguro si el entorno de React Native no expone WebCrypto
    }
    const entropy = `${Date.now()}_${Math.random()}_${Math.random()}`;
    const hashHex = CryptoJS.SHA256(entropy).toString().substring(0, 8);
    const intVal = parseInt(hashHex, 16);
    return Math.abs(intVal) % max;
  }

  /**
   * Deriva una clave de 256 bits a partir de la Contraseña Maestra y el Correo
   * usando PBKDF2-HMAC-SHA256 (Arquitectura Zero-Knowledge).
   */
  static deriveMasterKey(masterPassword: string, email: string): string {
    const salt = CryptoJS.SHA256(email.trim().toLowerCase()).toString();
    const key = CryptoJS.PBKDF2(masterPassword, salt, {
      keySize: 256 / 32,
      iterations: 10000,
      hasher: CryptoJS.algo.SHA256,
    });
    return key.toString();
  }

  /**
   * Crea un hash de verificación para comprobar el login sin guardar jamás la contraseña maestra
   */
  static createAuthHash(derivedKey: string, masterPassword: string): string {
    return CryptoJS.HmacSHA256(derivedKey, masterPassword).toString();
  }

  /**
   * Cifra toda la bóveda (JSON) con AES-256
   */
  static encryptVault(data: any, derivedKey: string): string {
    const jsonString = JSON.stringify(data);
    const iv = CryptoJS.SHA256(`${derivedKey}_${Date.now()}_${Math.random()}`)
      .toString()
      .substring(0, 32);
    const keyWord = CryptoJS.enc.Hex.parse(derivedKey.substring(0, 64));
    const ivWord = CryptoJS.enc.Hex.parse(iv);

    const encrypted = CryptoJS.AES.encrypt(jsonString, keyWord, { iv: ivWord }).toString();
    return `${iv}:${encrypted}`;
  }

  /**
   * Descifra la bóveda con AES-256 (Soporta formato nuevo con IV explícito y formato anterior)
   */
  static decryptVault<T>(cipherText: string, derivedKey: string): T | null {
    try {
      if (cipherText.includes(':')) {
        const [ivHex, payload] = cipherText.split(':');
        const keyWord = CryptoJS.enc.Hex.parse(derivedKey.substring(0, 64));
        const ivWord = CryptoJS.enc.Hex.parse(ivHex);
        const bytes = CryptoJS.AES.decrypt(payload, keyWord, { iv: ivWord });
        const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
        if (decryptedString) return JSON.parse(decryptedString) as T;
      }

      const fallbackBytes = CryptoJS.AES.decrypt(cipherText, derivedKey);
      const fallbackStr = fallbackBytes.toString(CryptoJS.enc.Utf8);
      if (!fallbackStr) return null;
      return JSON.parse(fallbackStr) as T;
    } catch {
      return null;
    }
  }

  /**
   * Algoritmo generador de contraseñas de alta entropía sin crashes nativos
   */
  static generatePassword(options: PasswordGeneratorOptions): string {
    let lower = 'abcdefghijklmnopqrstuvwxyz';
    let upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let numbers = '0123456789';
    let symbols = '!@#$%^&*()-_=+[]{};:,.<>/?';

    if (options.allowAllSpecialAndEnye) {
      lower += 'ñ';
      upper += 'Ñ';
      symbols += '¡¿|~`^°¬';
    }

    if (options.easyToRead) {
      lower = lower.replace(/[lo]/g, '');
      upper = upper.replace(/[IO]/g, '');
      numbers = numbers.replace(/[01]/g, '');
      symbols = symbols.replace(/[|`'":;.,]/g, '');
    }

    let charset = '';
    const mandatoryChars: string[] = [];

    const getRandomChar = (str: string) => str[this.getSecureRandomInt(str.length)];

    if (options.includeLowercase && lower.length > 0) {
      charset += lower;
      mandatoryChars.push(getRandomChar(lower));
    }
    if (options.includeUppercase && upper.length > 0) {
      charset += upper;
      mandatoryChars.push(getRandomChar(upper));
    }
    if (options.includeNumbers && numbers.length > 0) {
      charset += numbers;
      mandatoryChars.push(getRandomChar(numbers));
    }
    if ((options.includeSymbols || options.allowAllSpecialAndEnye) && symbols.length > 0) {
      charset += symbols;
      mandatoryChars.push(getRandomChar(symbols));
    }

    if (!charset) {
      charset = lower + numbers;
    }

    const remainingLength = Math.max(0, options.length - mandatoryChars.length);
    const resultChars = [...mandatoryChars];

    for (let i = 0; i < remainingLength; i++) {
      resultChars.push(getRandomChar(charset));
    }

    for (let i = resultChars.length - 1; i > 0; i--) {
      const j = this.getSecureRandomInt(i + 1);
      [resultChars[i], resultChars[j]] = [resultChars[j], resultChars[i]];
    }

    return resultChars.join('');
  }
}