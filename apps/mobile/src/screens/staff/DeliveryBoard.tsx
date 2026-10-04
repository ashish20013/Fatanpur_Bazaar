import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StaffTabParamList } from '../../navigation/StaffStack';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../store/auth';
import { Money } from '../../components/Money';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

interface RiderRow {
  id: number;
  name: string;
  phone: string;
  onDuty: number;
  codInHand: string;
  deliveries: number;
  activeJobs: number;
}
interface ReadyOrder {
  orderNumber: string;
  status: string;
  village: string | null;
  total: string;
  placedAt: string;
  orderType: 'DELIVERY' | 'SERVICE';
}
interface ActiveJob {
  id: number;
  status: string;
  orderNumber: string;
  orderStatus: string;
  village: string | null;
  rider: string;
  lastPingAt: string | null;
  isLive: number;
}
interface Board {
  riders: RiderRow[];
  ready: ReadyOrder[];
  active: ActiveJob[];
}

/** GET /admin/delivery/board + POST /admin/orders/:no/assign — Phase 1 manual assignment (A18). */
export default function DeliveryBoardScreen(_props: BottomTabScreenProps<StaffTabParamList, 'DeliveryBoard'>): React.JSX.Element {
  const { user } = useAuth();
  const canAssign = user?.role === 'ADMIN' || (user?.permissions ?? []).includes('delivery.assign');
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBoard(await api.get<Board>('/admin/delivery/board'));
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 20_000);
    return () => clearInterval(iv);
  }, [load]);

  const onRefresh = (): void => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

  const assign = async (riderId: number): Promise<void> => {
    if (!assigningOrder) return;
    setAssigning(true);
    try {
      await api.post(`/admin/orders/${assigningOrder}/assign`, { riderId });
      setAssigningOrder(null);
      await load();
    } catch (e) {
      Alert.alert(hi.common.somethingWrong, e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setAssigning(false);
    }
  };

  if (!board) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
        <Skeleton height={160} radius={radius.md} />
      </ScrollView>
    );
  }

  const onDutyRiders = board.riders.filter((r) => Number(r.onDuty) === 1);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.g700]} />}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Text style={styles.section}>{hi.staff.riders}</Text>
      <View style={styles.card}>
        {board.riders.map((r) => (
          <View key={r.id} style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.riderName}>{r.name}</Text>
              <Text style={styles.riderMeta}>
                {Number(r.onDuty) === 1 ? `🟢 ${hi.staff.onDutyLabel}` : `⚪ ${hi.delivery.offDuty}`} · {r.activeJobs} चालू
              </Text>
            </View>
            {Number(r.codInHand) > 0 ? <Money value={r.codInHand} size={t.sm} color={colors.warn} /> : null}
          </View>
        ))}
      </View>

      <Text style={styles.section}>{hi.staff.readyOrders}</Text>
      {board.ready.length === 0 ? (
        <Text style={styles.empty}>—</Text>
      ) : (
        <View style={styles.card}>
          {board.ready.map((o) => (
            <View key={o.orderNumber} style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.riderName}>{o.orderNumber}</Text>
                <Text style={styles.riderMeta}>{o.village ?? ''}</Text>
              </View>
              <Money value={o.total} size={t.sm} />
              {canAssign ? (
                <Pressable style={styles.assignBtn} onPress={() => setAssigningOrder(o.orderNumber)}>
                  <Text style={styles.assignBtnText}>तय करें</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {assigningOrder ? (
        <View style={styles.card}>
          <Text style={styles.riderName}>{hi.orders.orderNo(assigningOrder)} — कौन ले जाएगा?</Text>
          {onDutyRiders.length === 0 ? (
            <Text style={styles.empty}>कोई डिलीवरी पार्टनर ड्यूटी पर नहीं है</Text>
          ) : (
            onDutyRiders.map((r) => (
              <Pressable key={r.id} style={styles.riderPickRow} onPress={() => void assign(r.id)} disabled={assigning}>
                <Text style={styles.riderPickText}>{r.name}</Text>
              </Pressable>
            ))
          )}
          <Pressable onPress={() => setAssigningOrder(null)}>
            <Text style={styles.cancelLink}>{hi.common.cancel}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.section}>{hi.staff.activeDeliveries}</Text>
      {board.active.length === 0 ? (
        <Text style={styles.empty}>—</Text>
      ) : (
        <View style={styles.card}>
          {board.active.map((a) => (
            <View key={a.id} style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.riderName}>{a.orderNumber}</Text>
                <Text style={styles.riderMeta}>
                  {a.rider} · {a.village ?? ''}
                </Text>
              </View>
              <Text style={[styles.liveTag, Number(a.isLive) === 1 ? styles.liveOn : styles.liveOff]}>{Number(a.isLive) === 1 ? hi.tracking.live : hi.tracking.stale}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  errorText: { color: colors.danger, fontSize: t.sm, marginBottom: space[3] },
  section: { fontSize: t.base, fontWeight: '700', color: colors.ink, marginTop: space[5], marginBottom: space[2] },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[3], gap: space[2] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  riderName: { fontSize: t.base, fontWeight: '600', color: colors.ink },
  riderMeta: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  empty: { color: colors.ink3, fontSize: t.sm },
  assignBtn: { backgroundColor: colors.g700, borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[1] },
  assignBtnText: { color: colors.white, fontWeight: '600', fontSize: t.xs },
  riderPickRow: { paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.surface },
  riderPickText: { fontSize: t.base, color: colors.ink, fontWeight: '600' },
  cancelLink: { color: colors.danger, fontWeight: '600', marginTop: space[2] },
  liveTag: { fontSize: t.xs, fontWeight: '600', paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.sm },
  liveOn: { color: colors.g700, backgroundColor: colors.g100 },
  liveOff: { color: colors.ink3, backgroundColor: colors.surface },
});
