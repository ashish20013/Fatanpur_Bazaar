import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errText } from '../services/api';
import { useAlerts, type Escalation, type IncomingOrder } from '../store/alerts';
import { navigationRef } from '../navigation/ref';
import { Icon } from './Icon';
import { colors, font, radius, shadow2, space, type as t } from '../theme/tokens';

/**
 * The three order alerts, mounted once over the whole app.
 *
 * They are in one file because they are one decision — what the shop shows when an order lands —
 * and because only one of them is ever on screen for a given person: a delivery partner gets the
 * ringing card, an admin or supervisor gets the quiet banner and, when nobody takes the order,
 * the escalation. The split is enforced in the store, not here.
 */

function money(amount?: string): string {
  const n = Number(amount ?? 0);
  return Number.isFinite(n) ? `₹${n % 1 === 0 ? n : n.toFixed(2)}` : '₹0';
}

function timeOfDay(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Seconds left before the offer expires, or null when it never does. */
function useCountdown(expiresAt?: string): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) {
      setLeft(null);
      return;
    }
    const tick = (): void => setLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left;
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element | null {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * The delivery partner's card. Stays until it is answered or it expires — never dismissed by a
 * tap outside, and with no close button, because an order silently swiped away is an order the
 * shop thinks is still being considered.
 */
function IncomingCard({ order }: { order: IncomingOrder }): React.JSX.Element {
  const { accept, reject } = useAlerts();
  const insets = useSafeAreaInsets();
  const left = useCountdown(order.expiresAt);
  const [busy, setBusy] = useState<'' | 'accept' | 'reject'>('');
  const [error, setError] = useState<string | null>(null);

  const act = async (which: 'accept' | 'reject'): Promise<void> => {
    if (busy) return;
    setBusy(which);
    setError(null);
    try {
      if (which === 'accept') {
        // No navigation: the rider's own dashboard is already listening and the assignment
        // lands on it. Pushing a route from here would mean knowing which tree he is in.
        await accept(order.orderNumber);
      } else {
        await reject(order.orderNumber);
      }
    } catch (e) {
      // The card is already gone (the ringing stopped the moment he pressed), so the refusal is
      // shown as a line he can read rather than by putting the card back and ringing again.
      setError(errText(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space[4] }]}>
          <View style={styles.headRow}>
            <View style={styles.pulse}>
              <Icon name="scooter" size={22} color={colors.em900} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headTitle}>नया ऑर्डर आया!</Text>
              <Text style={styles.headSub}>{order.orderNumber}</Text>
            </View>
            {left !== null ? (
              <View style={[styles.timer, left <= 15 && styles.timerLow]}>
                <Text style={[styles.timerText, left <= 15 && styles.timerTextLow]}>{left}s</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>{order.paymentMethod === 'COD' ? 'नकद लेना है' : 'भुगतान हो चुका'}</Text>
            <Text style={styles.amount}>{money(order.amount)}</Text>
          </View>

          <ScrollView style={{ maxHeight: 260 }}>
            <Row label="ग्राहक" value={order.customer ?? ''} />
            <Row label="पता" value={order.address ?? ''} />
            <Row label="गाँव" value={order.village ?? ''} />
            <Row label="सामान" value={order.items ? `${order.items} सामान` : ''} />
            <Row label="ऑर्डर का समय" value={timeOfDay(order.placedAt)} />
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.rejectBtn, busy === 'reject' && styles.btnBusy]}
              onPress={() => void act('reject')}
              disabled={Boolean(busy)}
              accessibilityRole="button"
            >
              <Text style={styles.rejectText}>मना करें</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.acceptBtn, busy === 'accept' && styles.btnBusy]}
              onPress={() => void act('accept')}
              disabled={Boolean(busy)}
              accessibilityRole="button"
            >
              <Text style={styles.acceptText}>स्वीकार करें</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The watcher's banner: what happened, and nothing to do about it.
 *
 * ⚠️ No accept and no reject here, by design — an owner who can take an order out of the pool
 * from his own phone has taken it away from every rider without becoming one himself.
 */
function InfoBanner(): React.JSX.Element | null {
  const { info, dismissInfo } = useAlerts();
  const insets = useSafeAreaInsets();
  if (!info) return null;
  return (
    <View style={[styles.bannerWrap, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
      {/* Tapping it just puts it away: an admin's tree and a supervisor's are different
          navigators, and guessing a route name from here is how you get a silent no-op. */}
      <Pressable style={styles.banner} onPress={dismissInfo} accessibilityRole="button">
        <View style={styles.bannerIcon}>
          <Icon name="receipt" size={18} color={colors.em900} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            नया ऑर्डर · {info.orderNumber}
          </Text>
          <Text style={styles.bannerBody} numberOfLines={2}>
            {[info.customer, money(info.amount), info.village, info.status].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable onPress={dismissInfo} hitSlop={10} accessibilityRole="button" accessibilityLabel="बंद करें">
          <Icon name="x" size={18} color={colors.au200} />
        </Pressable>
      </Pressable>
    </View>
  );
}

/** An order nobody has taken, with the two things a supervisor can actually do about it. */
function EscalationCard({ e }: { e: Escalation }): React.JSX.Element {
  const { dismissEscalation } = useAlerts();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(e.arrangingBy ? `${e.arrangingBy} इंतज़ाम कर रहे हैं` : null);
  const [error, setError] = useState<string | null>(null);

  const arrange = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ arrangingBy: string }>(`/admin/alerts/unassigned/${e.orderNumber}/arrange`, {});
      // ⚠️ The card does NOT close: the order is still unassigned, and the one place it is
      // visible must keep showing it until a real delivery partner is on it.
      setNote(`${r.arrangingBy} इंतज़ाम कर रहे हैं — ऑर्डर अभी किसी को नहीं दिया गया`);
    } catch (err) {
      setError(errText(err, true));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={dismissEscalation}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space[4] }]}>
          <View style={styles.headRow}>
            <View style={[styles.pulse, styles.pulseWarn]}>
              <Icon name="alert-triangle" size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headTitle}>किसी डिलीवरी बॉय को नहीं दिया गया</Text>
              <Text style={styles.headSub}>{e.orderNumber}</Text>
            </View>
            <Pressable onPress={dismissEscalation} hitSlop={10} accessibilityRole="button" accessibilityLabel="बंद करें">
              <Icon name="x" size={20} color={colors.ink3} />
            </Pressable>
          </View>

          <Text style={styles.warnLine}>THIS ORDER HAS NOT BEEN ASSIGNED TO ANY DELIVERY BOY YET.</Text>

          <ScrollView style={{ maxHeight: 240 }}>
            <Row label="ग्राहक" value={e.customer ?? ''} />
            <Row label="पता" value={e.address ?? ''} />
            <Row label="रकम" value={money(e.amount)} />
            <Row label="स्थिति" value={e.status ?? ''} />
            <Row label="कितनी देर से" value={e.placedAt ? `${Math.max(1, Math.round((Date.now() - new Date(e.placedAt).getTime()) / 60000))} मिनट` : ''} />
            <Row label="कारण" value={e.cause ?? ''} />
          </ScrollView>

          {note ? <Text style={styles.note}>{note}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.rejectBtn, busy && styles.btnBusy]}
              onPress={() => void arrange()}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.rejectText}>मैं इंतज़ाम करूँगा</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.acceptBtn]}
              onPress={() => {
                dismissEscalation();
                // The delivery board is where riders are picked, and it is the staff tree's own
                // route — reachable only when this phone is signed in as staff, which is the
                // only tree this card is ever shown in.
                if (navigationRef.isReady()) navigationRef.navigate('DeliveryBoard' as never);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.acceptText}>डिलीवरी बॉय चुनें</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Mounted once, above the navigator. */
export function OrderAlerts(): React.JSX.Element | null {
  const { incoming, escalation } = useAlerts();
  // One at a time, loudest first: a rider's ringing card outranks everything, and an escalation
  // outranks the quiet banner because somebody is waiting for their shopping.
  if (incoming) return <IncomingCard order={incoming} />;
  if (escalation) return <EscalationCard e={escalation} />;
  return <InfoBanner />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,20,14,0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space[4],
    paddingTop: space[4],
    gap: space[3],
    ...shadow2,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  pulse: { height: 44, width: 44, borderRadius: radius.full, backgroundColor: colors.au300, alignItems: 'center', justifyContent: 'center' },
  pulseWarn: { backgroundColor: colors.danger },
  headTitle: { fontFamily: font.display, fontSize: t.lg, color: colors.ink },
  headSub: { fontSize: t.base, color: colors.ink3, marginTop: 1 },
  timer: { minWidth: 46, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.em50, alignItems: 'center' },
  timerLow: { backgroundColor: '#fdecea' },
  timerText: { fontFamily: font.bodySemi, fontSize: t.body, color: colors.em700 },
  timerTextLow: { color: colors.danger },
  amountBox: { backgroundColor: colors.em50, borderRadius: radius.md, padding: space[3], alignItems: 'center' },
  amountLabel: { fontSize: t.base, color: colors.ink2 },
  amount: { fontFamily: font.display, fontSize: 30, color: colors.em800, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowLabel: { width: 96, fontSize: t.base, color: colors.ink3 },
  rowValue: { flex: 1, minWidth: 0, fontSize: t.body, color: colors.ink, fontFamily: font.bodySemi },
  warnLine: { fontSize: t.base, fontFamily: font.bodySemi, color: colors.danger, lineHeight: 19 },
  note: { fontSize: t.base, color: colors.em700, fontFamily: font.bodySemi },
  error: { fontSize: t.base, color: colors.danger },
  actions: { flexDirection: 'row', gap: space[3], marginTop: space[1] },
  btn: { flex: 1, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnBusy: { opacity: 0.6 },
  rejectBtn: { backgroundColor: colors.paper2, borderWidth: 1, borderColor: colors.line2 },
  rejectText: { fontFamily: font.bodySemi, fontSize: t.body, color: colors.ink2 },
  acceptBtn: { backgroundColor: colors.em700 },
  acceptText: { fontFamily: font.bodySemi, fontSize: t.body, color: colors.white },
  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space[3], zIndex: 50 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.em800,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(226,197,120,0.45)',
    padding: space[3],
    ...shadow2,
  },
  bannerIcon: { height: 34, width: 34, borderRadius: radius.full, backgroundColor: colors.au300, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { color: colors.white, fontFamily: font.bodySemi, fontSize: t.body },
  bannerBody: { color: colors.au200, fontSize: t.base, marginTop: 1 },
});
