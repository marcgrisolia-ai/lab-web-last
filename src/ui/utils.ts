import type { Lang, TranslatedText } from '../models/types';

export function escapeHtml(str: string): string {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function tx(val: TranslatedText | string | undefined | null, lang: Lang): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val[lang] || val.en || val.es || val.ca || val.fr || '';
}
