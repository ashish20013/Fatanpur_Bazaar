import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError, errText } from '../../services/api';
import { useAuth } from '../../store/auth';
import { Money } from '../../components/Money';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { useScrollBottomPad } from '../../navigation/useScrollPad';
import { en } from '../../i18n/en';

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
export default function DeliveryBoardScreen(): React.JSX.Element {
  const bottomPad = useScrollBottomPad();
  const { user } = useAuth();
  const canAssign = user?.role === 'ADMIN' || (user?.permissions ?? []).includes('delivery.assign');
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [settling, setSettling] = useState<number | null>(null);
  const [settlingFor, setSettlingFor] = useState<number | null>(null);
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setBoard(await api.get<Board>('/admin/delivery/board'));
    } catch (e) {
      setError(errText(e, true));
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
      Alert.alert(en.common.somethingWrong, errText(e, true));
    } finally {
      setAssigning(false);
    }
  };

  /**
   * Taking the day's cash off a rider — the same POST /admin/cod/settle the website's delivery
   * board does. The site asks for the amount in a browser prompt; Android has no prompt, so the
   * row opens an amount field instead.
   *
   * ⚠️ This reduces `cod_in_hand` and writes a cod_settlements row. It must never touch the
   * rider's wallet, because that money was never credited there (A17).
   */
  const settle = async (r: RiderRow): Promise<void> => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    if (n > Number(r.codInHand)) {
      Alert.alert(en.staff.settleCod, en.staff.codTooMuch(r.codInHand));
      return;
    }
    setSettling(r.id);
    try {
      await api.post('/admin/cod/settle', { riderId: r.id, amount: n.toFixed(2) });
      setSettlingFor(null);
      setAmount('');
      await load();
    } catch (e) {
      Alert.alert(en.common.somethingWrong, errText(e, true));
    } finally {
      setSettling(null);
    }
  };

  if (!board) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad }}>
        <Skeleton height={160} radius={radius.md} />
      </ScrollView>
    );
  }

  const onDutyRiders = board.riders.filter((r) => Number(r.onDuty) === 1);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.g700]} />}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Text style={styles.section}>{en.staff.riders}</Text>
      <View style={styles.card}>
        {board.riders.map((r) => (
          <View key={r.id} style={{ gap: space[2] }}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.riderName}>{r.name}</Text>
                <Text style={styles.riderMeta}>
                  {Number(r.onDuty) === 1 ? `🟢 ${en.staff.onDutyLabel}` : `⚪ ${en.delivery.offDuty}`} · {en.staff.activeN(r.activeJobs)}
                </Text>
              </View>
              {/* Over ₹3,000 in a rider's pocket is the alert the owner wants to see (A17). */}
              {Number(r.codInHand) > 0 ? <Money value={r.codInHand} size={t.sm} color={Number(r.codInHand) > 3000 ? colors.danger : colors.warn} /> : null}
              {canAssign && Number(r.codInHand) > 0 ? (
                <Pressable style={styles.codBtn} onPress={() => { setSettlingFor(settlingFor === r.id ? null : r.id); setAmount(r.codInHand); }}>
                  <Text style={styles.codBtnText}>{en.staff.settleCod}</Text>
                </Pressable>
              ) : null}
            </View>
            {settlingFor === r.id ? (
              <View style={styles.rowBetween}>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder={r.codInHand}
                  placeholderTextColor={colors.ink3}
                  style={styles.codInput}
                />
                <Pressable style={[styles.assignBtn, settling === r.id && { opacity: 0.6 }]} disabled={settling === r.id} onPress={() => void settle(r)}>
                  <Text style={styles.assignBtnText}>{en.common.save}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <Text style={styles.section}>{en.staff.readyOrders}</Text>
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
                  <Text style={styles.assignBtnText}>{en.staff.assignPick}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {assigningOrder ? (
        <View style={styles.card}>
          <Text style={styles.riderName}>{en.staff.whoWillTake(en.orders.orderNo(assigningOrder))}</Text>
          {onDutyRiders.length === 0 ? (
            <Text style={styles.empty}>{en.staff.noRiderOnDuty}</Text>
          ) : (
            onDutyRiders.map((r) => (
              <Pressable key={r.id} style={styles.riderPickRow} onPress={() => void assign(r.id)} disabled={assigning}>
                <Text style={styles.riderPickText}>{r.name}</Text>
              </Pressable>
            ))
          )}
          <Pressable onPress={() => setAssigningOrder(null)}>
            <Text style={styles.cancelLink}>{en.common.cancel}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.section}>{en.staff.activeDeliveries}</Text>
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
              <Text style={[styles.liveTag, Number(a.isLive) === 1 ? styles.liveOn : styles.liveOff]}>{Number(a.isLive) === 1 ? en.tracking.live : en.tracking.stale}</Text>
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
  codBtn: { borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingHorizontal: space[2], paddingVertical: space[1] },
  codBtnText: { color: colors.em800, fontWeight: '600', fontSize: t.xs },
  codInput: { flex: 1, height: 44, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, backgroundColor: colors.card, paddingHorizontal: space[3], fontSize: t.body, color: colors.ink },
  liveTag: { fontSize: t.xs, fontWeight: '600', paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.sm },
  liveOn: { color: colors.g700, backgroundColor: colors.g100 },
  liveOff: { color: colors.ink3, backgroundColor: colors.surface },
});
