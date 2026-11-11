import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, type AppStateStatus, Dimensions, Image, Pressable, StyleSheet, View } from 'react-native';
import type { HomeBanner } from '@fb/shared-types';
import { assetUrl } from '../config';
import { useSettings } from '../store/settings';
import { colors, radius, shadow1, space } from '../theme/tokens';
import { useSite } from '../store/lang';

/**
 * The advertising strip above the goods — the app's half of apps/web/src/components/BannerStrip.tsx,
 * with the same behaviour, because a customer who sees the website and then the app must not feel
 * they are using two different shops:
 *
 *  • It holds, then cross-FADES. Each banner stays for `home_banner_seconds` (five by default,
 *    clamped 2–30 on both sides) and the next one fades in over 500 ms. The website does not
 *    slide them sideways, so neither does this.
 *  • It stops when touched, and while the app is in the background.
 *  • It never moves the page: the slot reserves its exact 320×50 height before any picture lands.
 *  • A banner whose picture fails to load is dropped from the rotation rather than shown broken.
 *  • "Reduce motion" on the phone → the banners still take their turn, but they CUT instead of
 *    fading. ⚠️ A deliberate difference from the website, which stops rotating altogether: on
 *    Android these scales are also zeroed by some battery savers and by "remove animations" in
 *    developer options, and the shop's one paid strip going permanently still because of a
 *    setting the owner cannot see is a worse outcome than a missing fade. The request was asked
 *    for — no animation — and the content still rotates.
 *
 * ⚠️ The app used to render these as a hand-swiped horizontal list that never moved on its own —
 * so the owner's paid strip sat on one banner forever unless a customer happened to drag it.
 */

/** The strip's shape: 320 ÷ 50 — the same constant the upload rule enforces. */
const RATIO = 6.4;
const FADE_MS = 500;
/** The website's own max width for the slot on a phone. */
const MAX_W = 640;

export function BannerStrip({ banners, onPressBanner }: { banners: HomeBanner[]; onPressBanner?: (b: HomeBanner) => void }): React.JSX.Element | null {
  const site = useSite();
  const settings = useSettings();
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const [reduceMotion, setReduceMotion] = useState(false);

  // Read inside the timer so pausing does not tear the interval down and restart it, which would
  // hand whoever touched the strip a fresh full-length hold on the banner they are reading.
  const paused = useRef(false);
  const fade = useRef(new Animated.Value(1)).current;

  const markFailed = useCallback((id: number) => {
    setFailed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const live = banners.filter((b) => !failed.has(b.id));
  const n = live.length;
  const holdMs = Math.min(30, Math.max(2, settings.bannerSeconds)) * 1000;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      paused.current = next !== 'active';
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (n < 2) return;
    const id = setInterval(() => {
      if (paused.current) return;
      /*
       * Reduce motion means no fade, not a frozen strip: the banner still takes its turn, it
       * just cuts to it. ⚠️ Cutting is a plain swap, NOT a zero-length animation — a timing of
       * duration 0 still hands work to the animation driver on every tick, which keeps the UI
       * thread awake for a strip that is not even moving.
       */
      if (reduceMotion) {
        setIndex((x) => (x + 1) % n);
        fade.setValue(1);
        return;
      }
      // Fade the current one out, swap, fade the next one in — the website's cross-fade.
      Animated.timing(fade, { toValue: 0, duration: FADE_MS / 2, useNativeDriver: true }).start(() => {
        setIndex((x) => (x + 1) % n);
        Animated.timing(fade, { toValue: 1, duration: FADE_MS / 2, useNativeDriver: true }).start();
      });
    }, holdMs);
    return () => clearInterval(id);
  }, [n, holdMs, reduceMotion, fade]);

  // Keep the index inside the list when a banner drops out mid-rotation.
  useEffect(() => {
    if (n > 0 && index >= n) setIndex(0);
  }, [n, index]);

  // The owner has to switch the strip on, and there has to be something in it. With neither there
  // is no empty band where an advert would have been — exactly as on the website.
  if (!settings.bannerEnabled || n === 0) return null;

  const current = live[Math.min(index, n - 1)];
  const src = assetUrl(current.imageUrlSm ?? current.imageUrl);
  const width = Math.min(MAX_W, Dimensions.get('window').width - space[4] * 2);

  const picture = (
    <Animated.View style={{ opacity: fade, width: '100%', height: '100%' }}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={current.title}
          onError={() => markFailed(current.id)}
        />
      ) : null}
    </Animated.View>
  );

  return (
    <View style={styles.wrap}>
      <View
        accessibilityRole="none"
        accessibilityLabel={site.home.offersStrip}
        style={[styles.slot, { width, height: Math.round(width / RATIO) }]}
      >
        {current.linkUrl && onPressBanner ? (
          <Pressable
            style={styles.fill}
            onPress={() => onPressBanner(current)}
            onPressIn={() => {
              paused.current = true;
            }}
            onPressOut={() => {
              paused.current = false;
            }}
          >
            {picture}
          </Pressable>
        ) : (
          picture
        )}

        {n > 1 ? (
          <View style={styles.dots}>
            {live.map((b, i) => (
              /* Buttons, not decoration — someone who wants the banner they just missed can tap
                 back to it, the same as on the website. */
              <Pressable
                key={b.id}
                accessibilityRole="button"
                accessibilityLabel={site.home.offerN(i + 1, n)}
                hitSlop={8}
                onPress={() => {
                  paused.current = false;
                  setIndex(i);
                  fade.setValue(1);
                }}
                style={[styles.dot, i === index && styles.dotOn]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: space[1] },
  slot: {
    overflow: 'hidden',
    borderRadius: radius.sm,
    backgroundColor: colors.paper2,
    ...shadow1,
  },
  fill: { width: '100%', height: '100%' },
  image: { width: '100%', height: '100%' },
  dots: { position: 'absolute', left: 0, right: 0, bottom: 4, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 6, width: 6, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { backgroundColor: colors.white },
});
