import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { assetUrl } from '../config';
import { colors, font, radius, space, type as t } from '../theme/tokens';
import { toneFor } from '../theme/tones';
import { ColourArt, Icon } from './Icon';

/**
 * Heading of a category block — medallion + display-serif name + "सब देखें".
 * apps/web/src/components/SectionHead.tsx.
 *
 * The medallion repeats whatever the rail showed, so a customer who scrolls down recognises the
 * block by the picture they just tapped rather than having to re-read the heading.
 */
export function SectionHead({
  slug,
  icon,
  image,
  title,
  sub,
  more,
  onPressMore,
}: {
  slug: string;
  icon?: string | null;
  image?: string | null;
  title: string;
  sub?: string;
  more?: string;
  onPressMore?: () => void;
}): React.JSX.Element {
  const tone = toneFor(slug);
  const photo = assetUrl(image);
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={[styles.medallion, photo ? null : { backgroundColor: tone.bg }]}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
          ) : (
            <ColourArt name={`cat-${slug}`} fallback={icon ?? 'basket'} size={20} color={tone.fg} />
          )}
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {sub ? (
            <Text style={styles.sub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
      {more && onPressMore ? (
        <Pressable style={styles.more} onPress={onPressMore}>
          <Text style={styles.moreText}>{more}</Text>
          <Icon name="chevron-right" size={14} color={colors.em800} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The gold rule with a diamond that separates one category from the next. */
export function Breaker(): React.JSX.Element {
  return (
    <View style={styles.breaker}>
      <View style={styles.rule} />
      {/* <View style={styles.diamond} /> */}
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space[2],
    marginBottom: 2,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  medallion: {
    height: 28,
    width: 28,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.au300,
  },
  photo: { height: '100%', width: '100%' },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.display, fontSize: t.body, color: colors.ink, lineHeight: 20 },
  sub: { fontSize: t.sm, color: colors.ink3, lineHeight: 16 },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.card,
  },
  moreText: { fontFamily: font.bodySemi, fontSize: t.sm, color: colors.em800 },
  breaker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space[4],
    marginVertical: 5,
  },
  rule: { flex: 1, height: 1, backgroundColor: colors.au300 },
  diamond: { height: 7, width: 7, backgroundColor: colors.au500, transform: [{ rotate: '45deg' }] },
});
