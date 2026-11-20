// src/services/IconAIService.ts

export interface BrandMetadata {
  cleanDomain: string;
  iconUrl: string;
  brandColor: string;
  suggestedFolderId: string;
}

export class IconAIService {
  static predictBrandMetadata(name: string, url: string): BrandMetadata {
    const raw = (name + ' ' + url).toLowerCase();

    let cleanDomain = '';
    try {
      if (url.includes('http')) {
        const parsed = new URL(url);
        cleanDomain = parsed.hostname.replace('www.', '');
      } else if (url.includes('.')) {
        cleanDomain = url.trim().toLowerCase().replace('www.', '').split('/')[0];
      }
    } catch {
      cleanDomain = '';
    }

    if (!cleanDomain) {
      const words = name.trim().toLowerCase().split(/\s+/);
      if (words.length > 0 && words[0]) {
        cleanDomain = `${words[0].replace(/[^a-z0-9]/g, '')}.com`;
      } else {
        cleanDomain = 'example.com';
      }
    }

    let brandColor = '#6366F1'; // Color índigo por defecto
    let suggestedFolderId = 'social';

    if (raw.includes('twitch') || raw.includes('steam') || raw.includes('juego') || raw.includes('game') || raw.includes('xbox') || raw.includes('playstation')) {
      brandColor = '#9146FF'; // Morado Twitch
      suggestedFolderId = 'games';
    } else if (raw.includes('instagram') || raw.includes('facebook') || raw.includes('twitter') || raw.includes('x.com') || raw.includes('discord') || raw.includes('reddit')) {
      brandColor = '#06B6D4'; // Cyan
      suggestedFolderId = 'social';
    } else if (raw.includes('bbva') || raw.includes('banco') || raw.includes('paypal') || raw.includes('stripe') || raw.includes('visa') || raw.includes('mastercard') || raw.includes('nubank')) {
      brandColor = '#10B981'; // Verde financiero
      suggestedFolderId = 'finance';
    } else if (raw.includes('escuela') || raw.includes('classroom') || raw.includes('canvas') || raw.includes('university') || raw.includes('udemy') || raw.includes('coursera')) {
      brandColor = '#F59E0B'; // Amber
      suggestedFolderId = 'school';
    }

    // Usamos el servicio público de Clearbit / Google Favicons para obtener el icono real de la marca de forma limpia
    const iconUrl = `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=128`;

    return {
      cleanDomain,
      iconUrl,
      brandColor,
      suggestedFolderId,
    };
  }
}