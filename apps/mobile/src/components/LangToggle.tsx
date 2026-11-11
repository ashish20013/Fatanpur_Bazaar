import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLang, type Lang } from '../store/lang';
import { syncLang } from '../services/langSync';
import { colors, font, radius, type as t } from '../theme/tokens';

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'hi', label: 'हिं' },
  { lang: 'en', label: 'EN' },
];

/**
 * The website's two-segment pill (apps/web/src/components/header/LangToggle.tsx), in the same
 * place: the search row, immediately to its right.
 *
 * One tap, no menu, no confirmation — and it is remembered on the device, the way the site
 * remembers it in a cookie for a year. The chosen side is gold on the emerald band so it reads
 * at a glance which language you are in; the other side stays quiet.
 *
 * Why a pill with both labels showing, rather than a single "EN" button that toggles: a person
 * who cannot read the current language cannot read a button that says what it will switch TO.
 * Both scripts are on screen, so either reader can find their own.
 */
export function LangToggle({ tone = 'dark' }: { tone?: 'dark' | 'light' }): React.JSX.Element {
  const { lang, setLang } = useLang();
  const dark = tone === 'dark';
  return (
    <View
      style={[styles.wrap, dark ? styles.wrapDark : styles.wrapLight]}
      accessibilityRole="radiogroup"
      // Named in both languages so the label itself is never the unreadable part.
      accessibilityLabel="भाषा / Language"
    >
      {OPTIONS.map((o) => {
        const on = o.lang === lang;
        return (
          <Pressable
            key={o.lang}
            onPress={() => {
              setLang(o.lang);
              syncLang(o.lang); // so the same choice is there on the website next time
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.lang === 'hi' ? 'हिंदी' : 'English'}
            style={[styles.seg, on && (dark ? styles.segOnDark : styles.segOnLight)]}
            hitSlop={4}
          >
            <Text style={[styles.label, on ? (dark ? styles.labelOnDark : styles.labelOnLight) : dark ? styles.labelOffDark : styles.labelOffLight]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', height: 44, padding: 3, borderRadius: radius.full, borderWidth: 1 },
  wrapDark: { borderColor: 'rgba(226,197,120,0.5)', backgroundColor: 'rgba(18,48,34,0.45)' },
  wrapLight: { borderColor: colors.line2, backgroundColor: colors.card },
  // 38px of width keeps the two labels the same size whichever script is in them, so the pill
  // does not jump as it is tapped.
  seg: { minWidth: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, paddingHorizontal: 8 },
  segOnDark: { backgroundColor: colors.au300 },
  segOnLight: { backgroundColor: colors.em700 },
  label: { fontFamily: font.bodySemi, fontSize: t.base },
  labelOnDark: { color: colors.em900 },
  labelOnLight: { color: colors.white },
  labelOffDark: { color: colors.au100 },
  labelOffLight: { color: colors.ink2 },
});
