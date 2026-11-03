// src/services/CryptoService.ts
import CryptoJS from 'crypto-js';
import { PasswordGeneratorOptions } from '../types/vault';

export class CryptoService {
  private static getSecureRandomInt(max: number): number {
    if (max <= 1) return 0;
    try {
      if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        const array = new Uint32Array(1);
        globalThis.crypto.getRandomValues(array);
        return array[0] % max;
      }
    } catch {}
    const entropy = `${Date.now()}_${Math.random()}_${Math.random()}`;
    const hashHex = CryptoJS.SHA256(entropy).toString().substring(0, 8);
    const intVal = parseInt(hashHex, 16);
    return Math.abs(intVal) % max;
  }

  static deriveMasterKey(masterPassword: string, email: string): string {
    const salt = CryptoJS.SHA256(email.trim().toLowerCase()).toString();
    const key = CryptoJS.PBKDF2(masterPassword, salt, {
      keySize: 256 / 32,
      iterations: 10000,
      hasher: CryptoJS.algo.SHA256,
    });
    return key.toString();
  }

  static createAuthHash(derivedKey: string, masterPassword: string): string {
    return CryptoJS.HmacSHA256(derivedKey, masterPassword).toString();
  }

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
   * 2FA (TOTP RFC 6238): Genera una semilla Base32 de 16 caracteres para Google/MS Authenticator
   */
  static generateTOTPSecret(): string {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 16; i++) {
      secret += base32Chars[this.getSecureRandomInt(32)];
    }
    return secret;
  }

  private static base32ToHex(base32: string): string {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    let hex = '';
    const clean = base32.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');

    for (let i = 0; i < clean.length; i++) {
      const val = base32Chars.indexOf(clean.charAt(i));
      bits += val.toString(2).padStart(5, '0');
    }
    for (let i = 0; i + 4 <= bits.length; i += 4) {
      const chunk = bits.substring(i, i + 4);
      hex += parseInt(chunk, 2).toString(16);
    }
    return hex;
  }

  /**
   * Calcula el código TOTP de 6 dígitos para una ventana de tiempo de 30s
   */
  static generateTOTPCode(secretBase32: string, timeOffsetSteps = 0): string {
    try {
      const epoch = Math.floor(Date.now() / 1000);
      const timeStep = Math.floor(epoch / 30) + timeOffsetSteps;
      const timeHex = timeStep.toString(16).padStart(16, '0');
      const keyHex = this.base32ToHex(secretBase32);

      const hmac = CryptoJS.HmacSHA1(
        CryptoJS.enc.Hex.parse(timeHex),
        CryptoJS.enc.Hex.parse(keyHex)
      ).toString(CryptoJS.enc.Hex);

      const offset = parseInt(hmac.substring(hmac.length - 1), 16) * 2;
      const binary =
        parseInt(hmac.substring(offset, offset + 8), 16) & 0x7fffffff;
      const otp = (binary % 1000000).toString().padStart(6, '0');
      return otp;
    } catch {
      return '000000';
    }
  }

  /**
   * Verifica si el código 2FA ingresado por el usuario es válido (con margen de ±30 seg)
   */
  static verifyTOTPCode(secretBase32: string, userCode: string): boolean {
    const cleanCode = userCode.trim();
    if (cleanCode.length !== 6) return false;
    return (
      cleanCode === this.generateTOTPCode(secretBase32, -1) ||
      cleanCode === this.generateTOTPCode(secretBase32, 0) ||
      cleanCode === this.generateTOTPCode(secretBase32, 1)
    );
  }

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

    if (!charset) charset = lower + numbers;

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