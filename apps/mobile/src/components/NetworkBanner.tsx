import React, { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';
import { colors, space, type as t } from '../theme/tokens';
import { useT } from '../store/lang';
import { CONFIG } from '../config';

/** A single lost packet is not "no internet" — two misses in a row are. */
const FAILS_BEFORE_SHOWING = 2;
/** 3G in a village is slow, not dead. Five seconds called a working connection offline. */
const PING_TIMEOUT_MS = 8000;
const CHECK_EVERY_MS = 30_000;
/** While the banner is up, look again sooner so it disappears as soon as the signal returns. */
const RECHECK_WHEN_OFFLINE_MS = 10_000;

/**
 * The red "no internet" strip.
 *
 * It pings the API's own /health, because that is the thing the app actually needs to reach —
 * a phone can be on wifi with no route out.
 *
 * ⚠️ Two mistakes this has already made, both of which told a working app it was offline:
 *   • pinging the bare origin instead of /v1/health, which is a 404 for everyone;
 *   • believing one failed request. On 3G a request drops now and then, and a red banner over a
 *     shop that is loading fine makes people close the app. So it takes two misses in a row to
 *     appear, and one success to go away.
 */
export function NetworkBanner(): React.JSX.Element | null {
  const hi = useT();
  const [offline, setOffline] = useState(false);
  const misses = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = async (): Promise<boolean> => {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      const res = await fetch(`${CONFIG.apiUrl}/health`, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(String(res.status));
      misses.current = 0;
      setOffline(false);
      return true;
    } catch {
      misses.current += 1;
      setOffline(misses.current >= FAILS_BEFORE_SHOWING);
      return false;
    }
  };

  useEffect(() => {
    let live = true;
    const loop = async (): Promise<void> => {
      const ok = await check();
      if (!live) return;
      timer.current = setTimeout(() => void loop(), ok ? CHECK_EVERY_MS : RECHECK_WHEN_OFFLINE_MS);
    };
    void loop();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void check();
    });
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
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
