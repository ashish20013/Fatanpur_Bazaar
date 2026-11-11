import { Text, TextInput } from 'react-native';
import { colors, font, type as t } from './tokens';

type Defaultable = { defaultProps?: { style?: unknown; allowFontScaling?: boolean } };

/**
 * React Native gives every <Text> the system font unless each one asks otherwise. The site is
 * set in Mukta throughout, so rather than repeat `fontFamily` in a hundred StyleSheets — where
 * one miss shows up as a stray Roboto line — we set the default once, here, at startup.
 *
 * Headings that want the display face (Marcellus + Tiro, "FB Display" on the site) opt in with
 * `fontFamily: font.display`; a local style always wins over this default.
 *
 * `allowFontScaling` is left ON: a 50-year-old shopper who has raised their system font size
 * means it, and every layout here is written to grow with it.
 */
export function applyGlobalFont(): void {
  const base = { fontFamily: font.body, color: colors.ink, fontSize: t.body };
  for (const C of [Text, TextInput] as unknown as Defaultable[]) {
    C.defaultProps = C.defaultProps ?? {};
    C.defaultProps.style = [base, C.defaultProps.style].filter(Boolean);
  }
}
