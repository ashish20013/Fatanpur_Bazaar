import { hi, type Dict } from './hi';
import { en } from './en';

export type Lang = 'hi' | 'en';
export const LANG_COOKIE = 'fb_lang';
export const DEFAULT_LANG: Lang = 'hi';

const DICTS: Record<Lang, Dict> = { hi, en };

export function dict(lang: Lang): Dict {
  return DICTS[lang] ?? hi;
}

export function isLang(v: string | undefined | null): v is Lang {
  return v === 'hi' || v === 'en';
}

export type { Dict };
export { hi, en };
