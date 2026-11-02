// src/services/NotebookOCRService.ts
import { IconAIService } from './IconAIService';

export interface ScannedAccountResult {
  name: string;
  url?: string;
  username: string;
  masterEmail?: string;
  password: string;
  notes?: string;
  brandColor: string;
  iconUrl: string;
  suggestedFolderId?: string;
}

export class NotebookOCRService {
  /**
   * Analiza texto crudo proveniente de una libreta (OCR) y extrae una o varias cuentas.
   * Soporta formatos libres escritos a mano como:
   * "Netflix | jiajcobaq110@gmail.com | MiClave123#"
   * o bloques de líneas (App, Usuario, Contraseña).
   */
  static parseNotebookText(rawText: string, defaultMasterEmail: string): ScannedAccountResult[] {
    const blocks = rawText
      .split(/\n\s*\n|---+|===+/)
      .map((b) => b.trim())
      .filter(Boolean);

    const results: ScannedAccountResult[] = [];

    for (const block of blocks) {
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      let name = '';
      let url = '';
      let username = '';
      let password = '';
      let notes = '';

      // Caso 1: Formato en una sola línea separada por "|" o "-" o ":"
      if (lines.length === 1 && (lines[0].includes('|') || lines[0].includes('-'))) {
        const parts = lines[0].split(/[|\-]/).map((p) => p.trim());
        if (parts.length >= 3) {
          name = parts[0];
          username = parts[1];
          password = parts[2];
          notes = parts.slice(3).join(' ');
        }
      } else {
        // Caso 2: Múltiples líneas en la libreta
        for (const line of lines) {
          const lower = line.toLowerCase();

          if (lower.startsWith('app:') || lower.startsWith('cuenta:') || lower.startsWith('sitio:')) {
            name = line.split(':').slice(1).join(':').trim();
          } else if (lower.startsWith('url:') || lower.startsWith('web:') || lower.includes('http') || lower.includes('.com')) {
            const cleaned = line.replace(/^(url|web)\s*:\s*/i, '').trim();
            if (cleaned.includes('@')) {
              username = cleaned;
            } else {
              url = cleaned;
              if (!name) {
                name = cleaned.replace(/^https?:\/\/(www\.)?/, '').split('.')[0];
              }
            }
          } else if (
            lower.startsWith('user:') ||
            lower.startsWith('usuario:') ||
            lower.startsWith('correo:') ||
            lower.startsWith('email:') ||
            line.includes('@')
          ) {
            username = line.replace(/^(user|usuario|correo|email)\s*:\s*/i, '').trim();
          } else if (
            lower.startsWith('pass:') ||
            lower.startsWith('password:') ||
            lower.startsWith('contraseña:') ||
            lower.startsWith('clave:')
          ) {
            password = line.replace(/^(pass|password|contraseña|clave)\s*:\s*/i, '').trim();
          } else if (!name) {
            name = line;
          } else if (!username) {
            username = line;
          } else if (!password) {
            password = line;
          } else {
            notes += (notes ? '\n' : '') + line;
          }
        }
      }

      if (name || username || password) {
        const finalName = name || 'Cuenta Escaneada';
        const brand = IconAIService.predictBrand(finalName, url);
        const detectedEmail =
          username.includes('@') ? username.toLowerCase() : defaultMasterEmail;

        results.push({
          name: finalName.charAt(0).toUpperCase() + finalName.slice(1),
          url: url || `https://${brand.domain}`,
          username: username || defaultMasterEmail,
          masterEmail: detectedEmail,
          password: password || '',
          notes: notes || 'Escaneada desde libreta física',
          brandColor: brand.brandColor,
          iconUrl: brand.iconUrl,
          suggestedFolderId: brand.suggestedFolderId,
        });
      }
    }

    return results;
  }
}