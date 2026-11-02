// src/services/IconAIService.ts

interface BrandPrediction {
  domain: string;
  brandColor: string;
  iconUrl: string;
  suggestedFolderId?: string;
}

const KNOWN_BRANDS: Record<string, { domain: string; color: string; folder: string }> = {
  discord: { domain: 'discord.com', color: '#5865F2', folder: 'games' },
  steam: { domain: 'steampowered.com', color: '#171A21', folder: 'games' },
  epic: { domain: 'epicgames.com', color: '#313131', folder: 'games' },
  riot: { domain: 'riotgames.com', color: '#D32936', folder: 'games' },
  playstation: { domain: 'playstation.com', color: '#00439C', folder: 'games' },
  xbox: { domain: 'xbox.com', color: '#107C10', folder: 'games' },
  roblox: { domain: 'roblox.com', color: '#E2231A', folder: 'games' },
  instagram: { domain: 'instagram.com', color: '#E1306C', folder: 'social' },
  facebook: { domain: 'facebook.com', color: '#1877F2', folder: 'social' },
  twitter: { domain: 'x.com', color: '#0F1419', folder: 'social' },
  tiktok: { domain: 'tiktok.com', color: '#FE2C55', folder: 'social' },
  reddit: { domain: 'reddit.com', color: '#FF4500', folder: 'social' },
  github: { domain: 'github.com', color: '#334155', folder: 'school' },
  google: { domain: 'google.com', color: '#4285F4', folder: 'school' },
  microsoft: { domain: 'microsoft.com', color: '#00A4EF', folder: 'school' },
  canvas: { domain: 'instructure.com', color: '#E63946', folder: 'school' },
  coursera: { domain: 'coursera.org', color: '#0056D2', folder: 'school' },
  bbva: { domain: 'bbva.mx', color: '#004481', folder: 'finance' },
  santander: { domain: 'santander.com.mx', color: '#EC0000', folder: 'finance' },
  nu: { domain: 'nu.com.mx', color: '#820AD1', folder: 'finance' },
  paypal: { domain: 'paypal.com', color: '#003087', folder: 'finance' },
  mercadopago: { domain: 'mercadopago.com.mx', color: '#009EE3', folder: 'finance' },
  netflix: { domain: 'netflix.com', color: '#E50914', folder: 'social' },
  spotify: { domain: 'spotify.com', color: '#1DB954', folder: 'social' },
};

export class IconAIService {
  static predictBrand(name: string, url?: string): BrandPrediction {
    const cleanName = name.trim().toLowerCase();
    const cleanUrl = (url || '').trim().toLowerCase();

    // 1. Buscar coincidencia en el diccionario inteligente de marcas
    for (const [key, data] of Object.entries(KNOWN_BRANDS)) {
      if (cleanName.includes(key) || cleanUrl.includes(key)) {
        return {
          domain: data.domain,
          brandColor: data.color,
          iconUrl: `https://www.google.com/s2/favicons?domain=${data.domain}&sz=128`,
          suggestedFolderId: data.folder,
        };
      }
    }

    // 2. Si hay URL ingresada, extraer el dominio automáticamente
    if (cleanUrl) {
      try {
        const formattedUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
        const parsed = new URL(formattedUrl);
        const domain = parsed.hostname.replace(/^www\./, '');
        return {
          domain,
          brandColor: this.stringToColor(domain),
          iconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        };
      } catch {
        // Continúa al paso 3 si la URL aún se está escribiendo
      }
    }

    // 3. Inferir dominio a partir del nombre de la app
    const guessedDomain = cleanName ? `${cleanName.replace(/[^a-z0-9]/g, '')}.com` : 'example.com';
    return {
      domain: guessedDomain,
      brandColor: this.stringToColor(cleanName || 'GSoftPass'),
      iconUrl: `https://www.google.com/s2/favicons?domain=${guessedDomain}&sz=128`,
    };
  }

  private static stringToColor(str: string): string {
    const palette = ['#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#3B82F6'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  }
}