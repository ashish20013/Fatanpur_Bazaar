import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errText } from '../services/api';
import { Icon } from './Icon';
import { colors, font, radius, space, type as t } from '../theme/tokens';

/**
 * The quantity stepper — the website's (apps/web/src/components/cart-buttons.tsx `QtyStepper`),
 * behaviour for behaviour.
 *
 * ⚠️ Three bugs lived in the old one, and together they are the "quantity does not increase"
 * report:
 *
 *  1. **It showed the server's number, not the customer's.** Every tap waited for a round trip
 *     before the digit moved. On a village 3G connection that is a second or more of a stepper
 *     that looks broken.
 *  2. **Fast taps were LOST.** The value came from props, so tapping + three times sent
 *     "quantity + 1" three times — all three computed from the same stale 1. Three taps, one
 *     item added. The totals then looked wrong because the quantity genuinely was wrong.
 *  3. **Errors vanished.** The caller did `void setQuantity(...)`; a refusal (the shop's
 *     `max_qty_per_order`, or stock running out) changed nothing on screen, so the stepper just
 *     sat there ignoring taps with no reason given.
 *
 * So: the digit moves at once, the buttons are disabled while the change is in flight (a tap is
 * ignored rather than mis-sent), a failure rolls the digit back and says why, and at 1 the minus
 * becomes a bin — the next tap takes the line out, exactly as on the website.
 */
export function QtyStepper({
  quantity,
  onChange,
  min = 0,
  max = 1000,
  /** Shown under the stepper when the server refuses the change. */
  onError,
}: {
  quantity: number;
  onChange: (q: number) => Promise<void> | void;
  min?: number;
  max?: number;
  onError?: (message: string) => void;
}): React.JSX.Element {
  const [qty, setQty] = useState(quantity);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const busyRef = useRef(false);

  // Follow the server's number whenever we are not mid-change — it is the truth between taps.
  useEffect(() => {
    if (!busyRef.current) setQty(quantity);
  }, [quantity]);

  const change = async (next: number): Promise<void> => {
    if (busyRef.current || next < min || next > max) return;
    const prev = qty;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    setQty(next);
    try {
      await onChange(next);
    } catch (e) {
      setQty(prev);
      const msg = errText(e);
      setErr(msg);
      onError?.(msg);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const atMax = qty >= max;
  return (
    <View>
      <View style={styles.wrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={qty <= 1 ? 'हटाएं' : 'कम करें'}
          disabled={busy}
          onPress={() => void change(qty - 1)}
          style={[styles.btn, busy && styles.btnOff]}
          hitSlop={8}
        >
          {qty <= 1 ? <Icon name="trash" size={16} color={colors.em700} /> : <Text style={styles.sign}>−</Text>}
        </Pressable>
        <Text style={styles.qty}>{qty}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="बढ़ाएं"
          disabled={busy || atMax}
          onPress={() => void change(qty + 1)}
          style={[styles.btn, (busy || atMax) && styles.btnOff]}
          hitSlop={8}
        >
          <Text style={styles.sign}>+</Text>
        </Pressable>
      </View>
      {err ? <Text style={styles.err}>{err}</Text> : null}
    </View>
  );
}

const SIZE = 32;
const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.em50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.em200 },
  btn: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  btnOff: { opacity: 0.5 },
  sign: { fontSize: t.lg, fontFamily: font.bodySemi, color: colors.em700 },
  qty: { minWidth: 28, textAlign: 'center', fontSize: t.md, fontFamily: font.bodySemi, color: colors.ink },
  err: { fontSize: t.xs, color: colors.danger, marginTop: 2, maxWidth: 140 },
});
