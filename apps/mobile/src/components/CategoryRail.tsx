import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RootCategory } from '@fb/shared-types';
import { assetUrl, CONFIG } from '../config';
import { colors, font, radius, space, type as t } from '../theme/tokens';
import { toneFor } from '../theme/tones';
import { useName, useSite } from '../store/lang';
import { ColourArt, Icon } from './Icon';
import { Sheet } from './Sheet';

/** Pixels per second the rail travels on its own — the site's own figure. */
const DRIFT_PX_PER_S = 11;
const FRAME_MS = 33;
const MEDAL = 56;

/**
 * The rail under the header: round-cornered medallions (picture + name) that drift slowly
 * right → left on their own, and that you can also slide yourself at any moment.
 * apps/web/src/components/CategoryRail.tsx, same behaviour:
 *
 *  • the list is rendered twice while drifting; on passing the halfway mark we subtract half
 *    the width, which lands on identical content, so it loops without a visible jump;
 *  • a finger resting on it pauses it, so a tap lands on what you aimed at;
 *  • dragging it stops the drift for good — once someone steers, the rail stops steering itself;
 *  • with "reduce motion", with fewer than five categories, or on a category page, it never
 *    drifts and is simply a scrollable row.
 *
 * A category whose vertical the shopkeeper has not switched on yet (`upcoming`) is greyed with
 * a "जल्द" badge and opens a sheet instead of a dead category page.
 */
export function CategoryRail({
  roots,
  active,
  onPress,
}: {
  roots: RootCategory[];
  active?: string | null;
  onPress: (c: RootCategory) => void;
}): React.JSX.Element | null {
  const pick = useName();
  const site = useSite();
  const box = useRef<ScrollView>(null);
  const [drift, setDrift] = useState(false);
  const [soon, setSoon] = useState<RootCategory | null>(null);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  // Read inside the tick so pausing does not tear the loop down and restart it.
  const paused = useRef(false);
  const pos = useRef(0);
  const half = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!cancelled && !reduce && roots.length >= 5 && !active) setDrift(true);
    });
    return () => {
      cancelled = true;
    };
  }, [roots.length, active]);

  useEffect(() => {
    if (!drift) return;
    const id = setInterval(() => {
      if (paused.current || half.current <= 0) return;
      pos.current += (DRIFT_PX_PER_S * FRAME_MS) / 1000;
      if (pos.current >= half.current) pos.current -= half.current;
      box.current?.scrollTo({ x: pos.current, animated: false });
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [drift]);

  /** Once someone drags, the rail is theirs. Step back one half first so nothing jumps. */
  const handOver = useCallback(() => {
    if (!drift) return;
    if (half.current > 0 && pos.current >= half.current) pos.current -= half.current;
    setDrift(false);
  }, [drift]);

  const markFailed = useCallback((id: number) => {
    setFailed((prev) => new Set(prev).add(id));
  }, []);

  if (!roots.length) return null;
  const list = drift ? [...roots, ...roots] : roots;

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={box}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        scrollEventThrottle={16}
        onContentSizeChange={(w) => {
          half.current = drift ? w / 2 : 0;
        }}
        onTouchStart={() => {
          paused.current = true;
        }}
        onTouchEnd={() => {
          paused.current = false;
        }}
        onScrollBeginDrag={handOver}
        onMomentumScrollEnd={(e) => {
          pos.current = e.nativeEvent.contentOffset.x;
        }}
      >
        {list.map((c, i) => {
          const dup = i >= roots.length;
          const tone = toneFor(c.slug);
          const photo = failed.has(c.id) ? undefined : assetUrl(c.image);
          const isActive = active === c.slug;
          return (
            <Pressable
              key={`${c.id}${dup ? '-d' : ''}`}
              style={styles.item}
              accessibilityRole="button"
              accessibilityElementsHidden={dup}
              importantForAccessibility={dup ? 'no-hide-descendants' : 'yes'}
              onPress={() => (c.upcoming ? setSoon(c) : onPress(c))}
            >
              <View
                style={[
                  styles.medal,
                  { backgroundColor: tone.bg },
                  isActive ? styles.medalActive : styles.medalIdle,
                  c.upcoming && styles.medalSoon,
                ]}
              >
                {photo ? (
                  <Image
                    source={{ uri: photo }}
                    style={styles.photo}
                    resizeMode="cover"
                    onError={() => markFailed(c.id)}
                    accessibilityLabel={pick(c.name, c.nameHi)}
                  />
                ) : (
                  <ColourArt name={`cat-${c.slug}`} fallback={c.icon ?? 'basket'} size={36} color={tone.fg} />
                )}
                {c.upcoming ? (
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonText}>{site.rail.upcoming}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                {pick(c.name, c.nameHi)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Sheet open={Boolean(soon)} onClose={() => setSoon(null)} title={soon ? site.rail.upcomingTitle(pick(soon.name, soon.nameHi)) : ''}>
        <View style={{ gap: space[4], paddingBottom: space[2] }}>
          <Text style={styles.soonBody}>{site.rail.upcomingBody}</Text>
          <Pressable style={styles.callBtn} onPress={() => void Linking.openURL(`tel:+91${CONFIG.supportPhone}`)}>
            <Icon name="phone" size={18} color={colors.white} />
            <Text style={styles.callText}>+91 {CONFIG.supportPhone}</Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.paper2, borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { paddingHorizontal: space[3], gap: 4, paddingVertical: 4 },
  item: { width: MEDAL + 8, alignItems: 'center', gap: 2 },
  medal: {
    height: MEDAL,
    width: MEDAL,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  medalIdle: { borderWidth: 1, borderColor: 'rgba(236,213,152,0.7)' },
  medalActive: { borderWidth: 2, borderColor: colors.au500 },
  medalSoon: { opacity: 0.6 },
  photo: { height: '100%', width: '100%' },
  soonBadge: {
    position: 'absolute',
    bottom: 4,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: colors.au500,
  },
  soonText: { fontSize: 10, lineHeight: 16, fontFamily: font.bodySemi, color: colors.em900 },
  label: { width: MEDAL + 8, textAlign: 'center', fontSize: 10, lineHeight: 13, color: colors.ink2 },
  labelActive: { fontFamily: font.bodySemi, color: colors.em800 },
  soonBody: { fontSize: t.body, color: colors.ink2, lineHeight: 26 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.em700,
  },
  callText: { color: colors.white, fontFamily: font.bodySemi, fontSize: t.body },
});
