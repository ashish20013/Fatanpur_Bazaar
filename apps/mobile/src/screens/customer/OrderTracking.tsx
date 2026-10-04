import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OrderDetail, TrackingSnapshot } from '@fb/shared-types';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api, ApiError } from '../../services/api';
import { onSocketEvent } from '../../services/socket';
import { useCart } from '../../store/cart';
import { OrderTimeline } from '../../components/OrderTimeline';
import { UpiPayment } from '../../components/UpiPayment';
import { Money } from '../../components/Money';
import { Button } from '../../components/Button';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/EmptyState';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

const STALE_MS = 90_000;

export default function OrderTrackingScreen({ route, navigation }: NativeStackScreenProps<CustomerStackParamList, 'OrderTracking'>): React.JSX.Element {
  const { orderNumber } = route.params;
  const { refresh: refreshCart } = useCart();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [tracking, setTracking] = useState<TrackingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSent, setReviewSent] = useState(false);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    try {
      const [o, trk] = await Promise.all([
        api.get<OrderDetail>(`/orders/${orderNumber}`),
        api.get<TrackingSnapshot>(`/orders/${orderNumber}/track`).catch(() => null),
      ]);
      if (!mounted.current) return;
      setOrder(o);
      setTracking(trk);
      navigation.setOptions({ title: hi.orders.orderNo(orderNumber) });
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, [orderNumber, navigation]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  // A "last updated N min ago" label must recompute even if no new event ever arrives.
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const unsubs = [
      onSocketEvent('delivery.location.updated', (e) => {
        if (e.orderNumber !== orderNumber) return;
        setTracking((prev) => (prev ? { ...prev, lat: e.lat, lng: e.lng, lastPingAt: e.at, isStale: e.isStale, isLive: true } : prev));
      }),
      onSocketEvent('tracking.snapshot', (s) => {
        if (s.orderNumber !== orderNumber) return;
        setTracking(s);
      }),
      onSocketEvent('order.status.updated', (e) => e.orderNumber === orderNumber && void reload()),
      onSocketEvent('delivery.assigned', (e) => e.orderNumber === orderNumber && void reload()),
      onSocketEvent('delivery.completed', (e) => e.orderNumber === orderNumber && void reload()),
      onSocketEvent('order.cancelled', (e) => e.orderNumber === orderNumber && void reload()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [orderNumber, reload]);

  if (error && !order) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!order) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
        <Skeleton height={140} radius={radius.md} />
        <View style={{ height: space[4] }} />
        <Skeleton height={200} radius={radius.md} />
      </ScrollView>
    );
  }

  const lastPingMs = tracking?.lastPingAt ? new Date(tracking.lastPingAt).getTime() : null;
  const isStale = Boolean(tracking?.isStale) || (lastPingMs !== null && now - lastPingMs > STALE_MS);
  const minutesAgo = lastPingMs !== null ? Math.max(0, Math.floor((now - lastPingMs) / 60_000)) : null;
  const hasRider = Boolean(tracking?.rider);

  const cancel = (): void => {
    Alert.alert(hi.orders.cancel, hi.orders.cancelConfirm, [
      { text: hi.common.cancel, style: 'cancel' },
      {
        text: hi.common.confirm,
        style: 'destructive',
        onPress: () => {
          setCancelling(true);
          api
            .post(`/orders/${orderNumber}/cancel`, {})
            .then(() => reload())
            .catch((e) => setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong))
            .finally(() => setCancelling(false));
        },
      },
    ]);
  };

  const reorder = async (): Promise<void> => {
    setReordering(true);
    try {
      await api.post(`/orders/${orderNumber}/reorder`, {});
      await refreshCart();
      Alert.alert(hi.orders.reorder, 'सामान कार्ट में जोड़ दिया गया', [{ text: hi.common.ok, onPress: () => navigation.navigate('Tabs') }]);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setReordering(false);
    }
  };

  const submitReview = async (): Promise<void> => {
    if (rating < 1) return;
    try {
      await api.post(`/orders/${orderNumber}/review`, { targetType: 'ORDER', rating, comment: reviewComment.trim() || undefined });
      setReviewSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
      {order.paymentMethod === 'UPI' && order.upi && order.paymentStatus === 'PENDING' ? (
        <View style={styles.upiCard}>
          <UpiPayment orderNumber={orderNumber} upi={order.upi} onClaimed={() => void reload()} />
        </View>
      ) : null}
      {order.paymentStatus === 'AWAITING_VERIFICATION' ? <Text style={styles.awaiting}>⏳ भुगतान की जाँच हो रही है</Text> : null}

      {order.deliveryOtp ? (
        <View style={styles.otpCard}>
          <Text style={styles.otpLabel}>{hi.orders.yourOtp}</Text>
          <Text style={styles.otpValue}>{order.deliveryOtp}</Text>
          <Text style={styles.otpHelp}>{hi.orders.yourOtpHelp}</Text>
        </View>
      ) : null}

      {hasRider ? (
        <View style={styles.riderCard}>
          <View style={[styles.dot, isStale ? styles.dotStale : styles.dotLive]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.riderName}>{tracking?.rider?.name || hi.tracking.rider}</Text>
            <Text style={styles.riderStatus}>
              {isStale ? (minutesAgo !== null ? hi.tracking.lastUpdated(minutesAgo) : hi.tracking.stale) : hi.tracking.live}
            </Text>
          </View>
          <Pressable style={styles.callBtn} onPress={() => tracking?.rider && void Linking.openURL(`tel:${tracking.rider.phone}`)}>
            <Text style={styles.callText}>📞 {hi.tracking.call}</Text>
          </Pressable>
        </View>
      ) : order.status !== 'DELIVERED' && order.status !== 'COMPLETED' && !['CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'DELIVERY_FAILED', 'RETURNED'].includes(order.status) ? (
        <Text style={styles.waiting}>{hi.tracking.waitingForAssignment}</Text>
      ) : null}

      <View style={styles.timelineCard}>
        <OrderTimeline orderType={order.orderType} currentStatus={order.status} history={order.timeline} />
      </View>

      <View style={styles.billCard}>
        <Text style={styles.billTitle}>{hi.orders.billTitle}</Text>
        {order.items.map((it) => (
          <View key={it.id} style={styles.billRow}>
            <Text style={[styles.billItemName, it.isRemoved && styles.billItemRemoved]} numberOfLines={1}>
              {it.nameHi || it.name} × {it.finalQuantity ?? it.quantity}
            </Text>
            <Money value={it.finalLineTotal ?? it.lineTotal} size={t.sm} />
          </View>
        ))}
        {order.adjustmentNote ? <Text style={styles.adjustNote}>ℹ️ {order.adjustmentNote}</Text> : null}
        <View style={styles.divider} />
        <View style={styles.billRow}>
          <Text style={styles.grandLabel}>{hi.checkout.grandTotal}</Text>
          <Money value={order.finalGrandTotal ?? order.grandTotal} size={t.lg} />
        </View>
      </View>

      {order.canCancel ? <Button label={hi.orders.cancel} onPress={cancel} variant="danger" loading={cancelling} /> : null}
      <View style={{ height: space[2] }} />
      <Button label={hi.orders.reorder} onPress={() => void reorder()} variant="secondary" loading={reordering} />

      {order.canReview ? (
        <View style={styles.reviewCard}>
          <Text style={styles.billTitle}>{hi.orders.review}</Text>
          {reviewSent ? (
            <Text style={styles.thanks}>धन्यवाद!</Text>
          ) : (
            <View>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                    <Text style={styles.star}>{n <= rating ? '★' : '☆'}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={styles.commentInput} value={reviewComment} onChangeText={setReviewComment} placeholder="कुछ लिखें (वैकल्पिक)" placeholderTextColor={colors.ink3} multiline maxLength={1000} />
              <Button label={hi.common.save} onPress={() => void submitReview()} disabled={rating < 1} size="sm" fullWidth={false} />
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  upiCard: { marginBottom: space[4], borderRadius: radius.md, overflow: 'hidden' },
  awaiting: { color: colors.warn, fontWeight: '600', marginBottom: space[3] },
  otpCard: { backgroundColor: colors.g100, borderRadius: radius.md, padding: space[4], alignItems: 'center', marginBottom: space[4] },
  otpLabel: { fontSize: t.sm, color: colors.g700, fontWeight: '600' },
  otpValue: { fontSize: 40, fontWeight: '700', color: colors.g700, letterSpacing: 8, marginVertical: space[1] },
  otpHelp: { fontSize: t.xs, color: colors.ink2, textAlign: 'center' },
  riderCard: { flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: colors.card, borderRadius: radius.md, padding: space[3], marginBottom: space[4] },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotLive: { backgroundColor: colors.g500 },
  dotStale: { backgroundColor: colors.ink3 },
  riderName: { fontSize: t.base, fontWeight: '700', color: colors.ink },
  riderStatus: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  callBtn: { paddingVertical: space[2], paddingHorizontal: space[3], backgroundColor: colors.g50, borderRadius: radius.sm },
  callText: { color: colors.g700, fontWeight: '600', fontSize: t.sm },
  waiting: { color: colors.ink3, fontSize: t.sm, marginBottom: space[4] },
  timelineCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[4], marginBottom: space[4] },
  billCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[4], marginBottom: space[4], gap: space[2] },
  billTitle: { fontSize: t.base, fontWeight: '700', color: colors.ink, marginBottom: space[2] },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
  billItemName: { flex: 1, fontSize: t.sm, color: colors.ink2 },
  billItemRemoved: { textDecorationLine: 'line-through', color: colors.ink3 },
  adjustNote: { fontSize: t.xs, color: colors.warn, marginTop: space[1] },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space[1] },
  grandLabel: { fontSize: t.base, fontWeight: '700', color: colors.ink },
  reviewCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[4], marginTop: space[4] },
  starsRow: { flexDirection: 'row', gap: space[2], marginBottom: space[3] },
  star: { fontSize: 32, color: colors.a600 },
  commentInput: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space[3], minHeight: 72, textAlignVertical: 'top', marginBottom: space[3], color: colors.ink },
  thanks: { color: colors.g700, fontWeight: '600' },
});
