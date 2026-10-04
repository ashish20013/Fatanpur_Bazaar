import { hasDevanagari, transliterate } from '../../common/utils/translit';

/**
 * search_text = the one line that makes Hindi/Hinglish search work (A10):
 * "आलू aaloo aloo alu potato sabzi …" — name, Hindi, transliteration, brand, category, keywords, synonyms.
 */
export function buildSearchText(p: { name: string; nameHi?: string | null; brand?: string | null; keywords?: string | null; categoryNames: string[]; synonymHits: string[] }): string {
  const parts = [
    p.name.toLowerCase(),
    p.nameHi ?? '',
    p.nameHi && hasDevanagari(p.nameHi) ? transliterate(p.nameHi) : '',
    p.brand ?? '',
    ...p.categoryNames,
    p.keywords ?? '',
    ...p.synonymHits,
  ];
  const words = new Set(parts.join(' ').toLowerCase().split(/[\s,;/()]+/).filter((w) => w.length > 1));
  return [...words].join(' ').slice(0, 500);
}
