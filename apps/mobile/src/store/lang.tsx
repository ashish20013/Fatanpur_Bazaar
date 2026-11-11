import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getLang, setLangPref } from '../services/storage';
import { formatUnit, unitInEnglish } from '../utils/format';
import { site, type SiteDict } from '../i18n/site';
import { siteEn } from '../i18n/siteEn';
import { hi } from '../i18n/hi';
import { appEn, type AppDict } from '../i18n/appEn';

export type Lang = 'hi' | 'en';

/** Hindi first — §19, and the website's own `DEFAULT_LANG`. */
export const DEFAULT_LANG: Lang = 'hi';

export function isLang(v: string | null | undefined): v is Lang {
  return v === 'hi' || v === 'en';
}

/**
 * The language as a plain module value, kept in step with the provider below.
 *
 * ⚠️ This exists for the code that is NOT a React component and so cannot use a hook —
 * `services/api.ts`, which has to turn an error code into a sentence the customer can read.
 * Components must use `useSite()` / `useT()`; reading this from a component would render the
 * old language until something else happened to re-render it.
 */
let current: Lang = DEFAULT_LANG;
export function currentLang(): Lang {
  return current;
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** False until the stored preference has been read — the splash waits on this. */
  ready: boolean;
}

const Ctx = createContext<LangState>({ lang: DEFAULT_LANG, setLang: () => undefined, ready: true });

/**
 * One tap switches Hindi ⇄ English, everywhere, and it is remembered.
 *
 * The website does this with a cookie and a server re-render (`LangToggle` → `savePrefs` →
 * `router.refresh()`); an app has no server render to redo, so the chosen dictionary is state at
 * the top of the tree and every screen reads it through a hook. That is the whole reason the
 * switch "did not work" before: the screens imported the Hindi dictionary as a module constant,
 * so nothing they displayed could ever change.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void getLang().then((stored) => {
      if (!live) return;
      if (isLang(stored)) {
        current = stored;
        setLangState(stored);
      }
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const setLang = useCallback((l: Lang): void => {
    current = l;
    setLangState(l);
    void setLangPref(l); // best effort — the switch has already happened on screen
  }, []);

  const value = useMemo<LangState>(() => ({ lang, setLang, ready }), [lang, setLang, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangState {
  return useContext(Ctx);
}

/** The website's dictionary in the chosen language (the strings fatanpurbazaar.com shows). */
export function useSite(): SiteDict {
  return useContext(Ctx).lang === 'en' ? siteEn : site;
}

/** The app-only dictionary in the chosen language (screens the website has no page for). */
export function useT(): AppDict {
  return useContext(Ctx).lang === 'en' ? appEn : hi;
}

/**
 * The staff and rider side is English regardless of this switch — the website does the same
 * (`staffLang()` always returns 'en'). The owner asked for the panel in English, and a rider's
 * screen must not change wording under them because a family member flipped the shop to Hindi.
 */
export function staffDict(): AppDict {
  return appEn;
}

/**
 * Picks a product's, category's or village's own name in the reader's language.
 *
 * The chrome is not the only thing on the screen that has two languages: every product and
 * category in the catalogue carries both `name` and `nameHi`, and the website shows
 * `lang === 'hi' ? (nameHi ?? name) : name` (apps/web/src/components/product.tsx). Without this
 * the switch left a page of Devanagari item names under an English header, which is exactly the
 * half-translated screen it is supposed to avoid.
 *
 * Hindi falls back to the English name when a row has no Devanagari one; English never falls
 * back to Devanagari, because `name` is always present.
 */
export function useName(): (name: string, nameHi?: string | null) => string {
  const { lang } = useLang();
  return useCallback((name: string, nameHi?: string | null): string => (lang === 'hi' ? (nameHi ?? name) : name), [lang]);
}

/**
 * A pack size — "1 किलो" / "1 kg" — in the reader's language.
 *
 * The API sends the label already written out in Hindi, so English needs the one word mapped
 * back (see `unitInEnglish`). Going through a hook keeps that decision in one place instead of
 * every card doing its own thing with it.
 */
export function useUnitLabel(): (unitValue: string | number | null | undefined, unit: string | null | undefined) => string {
  const { lang } = useLang();
  return useCallback(
    (unitValue: string | number | null | undefined, unit: string | null | undefined): string => {
      const label = formatUnit(unitValue, unit);
      return lang === 'en' ? unitInEnglish(label) : label;
    },
    [lang],
  );
}
