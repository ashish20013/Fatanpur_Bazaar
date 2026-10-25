import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onForegroundMessage } from '../services/fcm';
import { useAuth } from '../store/auth';
import { colors, radius, shadow2, space, type as t } from '../theme/tokens';

interface BannerItem {
  id: number;
  title: string;
  body: string;
  linkUrl?: string;
}

let nextId = 0;

/**
 * Global in-app notification banner that slides down from the top when a push
 * arrives while the app is in the foreground.
 *
 * - CUSTOMER: subtle vibration + banner
 * - DELIVERY_BOY / ADMIN / SUPERVISOR: strong vibration pattern + banner
 *   (the "ringing alert" the owner asked for on new-order events)
 *
 * Auto-dismisses after 5 seconds, or tap to dismiss immediately.
 */
export function NotificationBanner(): React.JSX.Element | null {
  const { status, user } = useAuth();
  const [item, setItem] = useState<BannerItem | null>(null);
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(slideAnim, { toValue: -120, duration: 200, useNativeDriver: true }).start(() => {
      setItem(null);
    });
  }, [slideAnim]);

  const show = useCallback(
    (banner: BannerItem) => {
      setItem(banner);
      slideAnim.setValue(-120);
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(dismiss, 5000);
    },
    [slideAnim, dismiss],
  );

  useEffect(() => {
    if (status !== 'authenticated') return;

    const unsub = onForegroundMessage((title, body, linkUrl) => {
      const role = user?.role;
      // Staff and delivery roles get a strong vibration pattern (ringing alert)
      if (role === 'ADMIN' || role === 'SUPERVISOR' || role === 'DELIVERY_BOY') {
        Vibration.vibrate([0, 400, 200, 400, 200, 400]);
      } else {
        // Customer gets a gentle single buzz
        Vibration.vibrate(200);
      }

      show({ id: ++nextId, title, body, linkUrl });
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status, user?.role, show]);

  if (!item) return null;

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY: slideAnim }], paddingTop: insets.top + 4 }]}>
      <Pressable style={styles.banner} onPress={dismiss}>
        <View style={styles.indicator} />
        <View style={styles.textArea}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
        </View>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: space[3],
    paddingBottom: space[2],
    backgroundColor: 'transparent',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space[3],
    ...shadow2,
    borderLeftWidth: 4,
    borderLeftColor: colors.g700,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.g500,
    marginRight: space[2],
  },
  textArea: {
    flex: 1,
    marginRight: space[2],
  },
  title: {
    fontSize: t.base,
    fontWeight: '700',
    color: colors.ink,
  },
  body: {
    fontSize: t.sm,
    color: colors.ink2,
    marginTop: 2,
    lineHeight: 18,
  },
  close: {
    fontSize: t.md,
    color: colors.ink3,
    padding: space[2],
  },
});
