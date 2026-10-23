import React, { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';
import { colors, space, type as t } from '../theme/tokens';
import { hi } from '../i18n/hi';
import { CONFIG } from '../config';

/**
 * H4: Connectivity indicator — shows a red banner when the device has no internet.
 * Uses a lightweight HEAD ping to the API /health endpoint instead of an external
 * dependency. Checks on mount, on app resume, and every 30 seconds while foregrounded.
 */
export function NetworkBanner(): React.JSX.Element | null {
  const [offline, setOffline] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = async (): Promise<void> => {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${CONFIG.apiBaseUrl}/health`, {
        method: 'HEAD',
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      setOffline(!res.ok);
    } catch {
      setOffline(true);
    }
  };

  useEffect(() => {
    void check();
    timer.current = setInterval(() => void check(), 30_000);
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void check();
    });
    return () => {
      if (timer.current) clearInterval(timer.current);
      sub.remove();
    };
  }, []);

  if (!offline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{hi.common.noInternet}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.danger,
    paddingVertical: 6,
    paddingHorizontal: space[4],
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: t.xs,
    fontWeight: '600',
  },
});
