import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme/tokens';

/**
 * Skeleton loaders, never spinners, for content areas (§9) — a spinner tells the user
 * something is happening; a skeleton tells them WHERE the content will land, which matters
 * more on 3G where a screen can sit half-loaded for a couple of seconds.
 */
export function Skeleton({ width = '100%', height = 16, radius: r = radius.sm, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: object }): React.JSX.Element {
  const opacity = useRef(new Animated.Value(0.5)).current;
  const [still, setStill] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setStill(on);
    });
    return () => {
      live = false;
    };
  }, []);
  /*
   * The pulse is an animation like any other, so "reduce motion" turns it off and leaves a
   * plain grey block — which still does the skeleton's real job of showing where the content
   * will land. ⚠️ It also matters that this loop can be stopped at all: `Animated.loop` with
   * the native driver keeps running on the UI thread even for a tab that is off screen, so a
   * screen left half-loaded in the background pulses for as long as the app is open.
   */
  useEffect(() => {
    if (still) {
      opacity.setValue(0.75);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, still]);
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.line, opacity }, style]} />;
}

export function ProductCardSkeleton(): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Skeleton width="100%" height={120} radius={radius.md} />
      <View style={{ marginTop: 8, gap: 6 }}>
        <Skeleton width="80%" height={14} />
        <Skeleton width="50%" height={12} />
        <Skeleton width="40%" height={18} />
      </View>
    </View>
  );
}

export function ListRowSkeleton(): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Skeleton width={56} height={56} radius={radius.md} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, padding: 8 },
  row: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' },
});
