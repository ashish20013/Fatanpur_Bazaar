import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AssignmentView } from '@fb/shared-types';
import type { DeliveryStackParamList } from '../../navigation/DeliveryStack';
import { api, ApiError } from '../../services/api';
import { LocationTracker } from '../../services/location';
import { Money } from '../../components/Money';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/EmptyState';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

/** Rider's action hub for one job — every state transition of A18 happens from here. */
export default function DeliveryOrderDetailScreen({ route, navigation }: NativeStackScreenProps<DeliveryStackParamList, 'OrderDetail'>): React.JSX.Element {
  const { assignmentId } = route.params;
  const [assignment, setAssignment] = useState<AssignmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [showFail, setShowFail] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await api.get<AssignmentView[]>('/delivery/assignments');
      const found = all.find((a) => a.id === assignmentId) ?? null;
      setAssignment(found);
      if (found) navigation.setOptions({ title: hi.orders.orderNo(found.orderNumber) });
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, [assignmentId, navigation]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.post(`/delivery/assignments/${assignmentId}/accept`, {});
      await LocationTracker.start(assignmentId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  };

  const reject = async (): Promise<void> => {
    if (rejectReason.trim().length < 3) return;
    setBusy(true);
    try {
      await api.post(`/delivery/assignments/${assignmentId}/reject`, { reason: rejectReason.trim() });
      await LocationTracker.stop();
      navigation.goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  };

  const pickup = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.post(`/delivery/assignments/${assignmentId}/pickup`, {});
      await LocationTracker.start(assignmentId); // still active — keep the same watch running
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  };

  const fail = async (): Promise<void> => {
    if (failReason.trim().length < 3 || !assignment) return;
    setBusy(true);
    try {
      await api.post(`/delivery/assignments/${assignmentId}/fail`, { reason: failReason.trim() });
      await LocationTracker.stop();
      navigation.goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  };

  if (error && !assignment) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!assignment) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
        <Skeleton height={200} radius={radius.md} />
      </ScrollView>
    );
  }
  const a = assignment;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{hi.delivery.customerInfo}</Text>
        <Text style={styles.customerName}>{a.customer.name}</Text>
        <Text style={styles.customerLine}>{a.customer.line1}</Text>
        {a.customer.landmark ? <Text style={styles.customerLine}>{a.customer.landmark}</Text> : null}
        {a.customer.village ? <Text style={styles.customerLine}>{a.customer.village}</Text> : null}
        <Button label={hi.delivery.callCustomer} onPress={() => void Linking.openURL(`tel:${a.customer.phone}`)} variant="secondary" size="sm" fullWidth={false} style={{ marginTop: space[2] }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>सामान</Text>
        {a.items.map((it, i) => (
          <Text key={`${it.name}-${i}`} style={styles.itemLine}>
            {it.quantity} {it.unit} · {it.name}
          </Text>
        ))}
        <View style={styles.divider} />
        {Number(a.collectAmount) > 0 ? (
          <Text style={styles.collectAmount}>{hi.delivery.collectAmount(a.collectAmount)}</Text>
        ) : (
          <Text style={styles.prepaid}>{hi.delivery.prepaidBadge}</Text>
        )}
        <Text style={styles.earning}>
          {hi.delivery.earningsTitle}: <Money value={a.earning} size={t.base} />
        </Text>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {a.status === 'OFFERED' ? (
        showReject ? (
          <View style={styles.card}>
            <Input label={hi.delivery.rejectReason} value={rejectReason} onChangeText={setRejectReason} placeholder={hi.delivery.rejectReason} multiline />
            <Button label={hi.delivery.reject} onPress={() => void reject()} variant="danger" loading={busy} disabled={rejectReason.trim().length < 3} />
            <View style={{ height: space[2] }} />
            <Button label={hi.common.cancel} onPress={() => setShowReject(false)} variant="ghost" />
          </View>
        ) : (
          <View>
            <Button label={hi.delivery.accept} onPress={() => void accept()} loading={busy} />
            <View style={{ height: space[2] }} />
            <Button label={hi.delivery.reject} onPress={() => setShowReject(true)} variant="danger" />
          </View>
        )
      ) : null}

      {a.status === 'ACCEPTED' ? (
        <View>
          <Button label={hi.delivery.navigate} onPress={() => navigation.navigate('Navigate', { lat: a.customer.lat, lng: a.customer.lng, address: a.customer.line1 })} variant="secondary" />
          <View style={{ height: space[2] }} />
          <Button label={hi.delivery.pickup} onPress={() => void pickup()} loading={busy} />
        </View>
      ) : null}

      {a.status === 'PICKED_UP' && a.orderStatus === 'PICKED_UP' ? (
        <View>
          <Button label={hi.delivery.navigate} onPress={() => navigation.navigate('Navigate', { lat: a.customer.lat, lng: a.customer.lng, address: a.customer.line1 })} variant="secondary" />
          <View style={{ height: space[2] }} />
          <Button label={hi.delivery.startDelivery} onPress={() => navigation.navigate('StartDelivery', { assignmentId })} />
        </View>
      ) : null}

      {a.status === 'PICKED_UP' && a.orderStatus === 'OUT_FOR_DELIVERY' ? (
        <View>
          <Button label={hi.tracking.title} onPress={() => navigation.navigate('LiveLocation', { assignmentId, orderNumber: a.orderNumber })} variant="secondary" />
          <View style={{ height: space[2] }} />
          <Button label={hi.delivery.complete} onPress={() => navigation.navigate('CompleteDelivery', { assignmentId, orderNumber: a.orderNumber })} />
        </View>
      ) : null}

      {['ACCEPTED', 'PICKED_UP'].includes(a.status) ? (
        showFail ? (
          <View style={styles.card}>
            <Input label={hi.delivery.failReason} value={failReason} onChangeText={setFailReason} placeholder={hi.delivery.failReason} multiline />
            <Button label={hi.delivery.fail} onPress={() => void fail()} variant="danger" loading={busy} disabled={failReason.trim().length < 3} />
            <View style={{ height: space[2] }} />
            <Button label={hi.common.cancel} onPress={() => setShowFail(false)} variant="ghost" />
          </View>
        ) : (
          <Button label={hi.delivery.fail} onPress={() => Alert.alert(hi.delivery.fail, hi.orders.cancelConfirm, [{ text: hi.common.cancel, style: 'cancel' }, { text: hi.common.confirm, onPress: () => setShowFail(true) }])} variant="ghost" />
        )
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[4], marginBottom: space[4] },
  sectionTitle: { fontSize: t.sm, fontWeight: '700', color: colors.ink2, marginBottom: space[2] },
  customerName: { fontSize: t.lg, fontWeight: '700', color: colors.ink },
  customerLine: { fontSize: t.sm, color: colors.ink2, marginTop: 2 },
  itemLine: { fontSize: t.sm, color: colors.ink2, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space[2] },
  collectAmount: { fontSize: t.md, fontWeight: '700', color: colors.warn },
  prepaid: { fontSize: t.md, fontWeight: '700', color: colors.g700 },
  earning: { fontSize: t.sm, color: colors.ink2, marginTop: space[1] },
  errorText: { color: colors.danger, fontSize: t.sm, marginBottom: space[3] },
});
