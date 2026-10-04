import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ORDER_TRANSITIONS, ORDER_STATUS_LABEL_HI, type OrderDetail, type OrderStatus, type OrderSummary } from '@fb/shared-types';
import type { StaffTabParamList } from '../../navigation/StaffStack';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../store/auth';
import { StatusBadge } from '../../components/StatusBadge';
import { OrderTimeline } from '../../components/OrderTimeline';
import { Money } from '../../components/Money';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

type Filter = 'ALL' | 'ACTIVE' | 'DONE';
const ACTIVE_STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'SCHEDULED', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'IN_PROGRESS'];
const DONE_STATUSES: OrderStatus[] = ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'DELIVERY_FAILED', 'RETURNED'];

/** GET/PATCH /admin/orders — a leaf order opens inline (same "swap the body" pattern as
 * customer/Categories.tsx) rather than a stack route, since StaffNavigator has no stack. */
export default function StaffOrdersScreen(_props: BottomTabScreenProps<StaffTabParamList, 'Orders'>): React.JSX.Element {
  const { user } = useAuth();
  const perms = new Set(user?.permissions ?? []);
  const canChangeStatus = user?.role === 'ADMIN' || perms.has('orders.update_status');
  const canCancel = user?.role === 'ADMIN' || perms.has('orders.cancel');

  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [note, setNote] = useState('');
  const [busyStatus, setBusyStatus] = useState<OrderStatus | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const statusParam = filter === 'ACTIVE' ? ACTIVE_STATUSES.join(',') : filter === 'DONE' ? DONE_STATUSES.join(',') : undefined;
      const r = await api.paged<OrderSummary>('/admin/orders', { status: statusParam, q: q.trim() || undefined, page: 1 });
      setOrders(r.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, [filter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const openOrder = async (no: string): Promise<void> => {
    try {
      setSelected(await api.get<OrderDetail>(`/admin/orders/${no}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  };

  const changeStatus = async (status: OrderStatus): Promise<void> => {
    if (!selected) return;
    setBusyStatus(status);
    try {
      await api.patch(`/admin/orders/${selected.orderNumber}/status`, { status, note: note.trim() || undefined });
      setNote('');
      await openOrder(selected.orderNumber);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setBusyStatus(null);
    }
  };

  if (selected) {
    const nextStatuses = ORDER_TRANSITIONS[selected.orderType][selected.status];
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
        <Pressable onPress={() => setSelected(null)}>
          <Text style={styles.back}>← {hi.staff.ordersTitle}</Text>
        </Pressable>
        <Text style={styles.orderNo}>{hi.orders.orderNo(selected.orderNumber)}</Text>
        <Text style={styles.shipInfo}>
          {selected.ship.name} · {selected.ship.phone}
        </Text>
        <Text style={styles.shipInfo}>{selected.ship.line1}</Text>
        <View style={{ height: space[3] }} />
        <View style={styles.card}>
          <OrderTimeline orderType={selected.orderType} currentStatus={selected.status} history={selected.timeline} />
        </View>
        <View style={styles.card}>
          {selected.items.map((it) => (
            <View key={it.id} style={styles.rowBetween}>
              <Text style={styles.itemName} numberOfLines={1}>
                {it.nameHi || it.name} × {it.finalQuantity ?? it.quantity}
              </Text>
              <Money value={it.finalLineTotal ?? it.lineTotal} size={t.sm} />
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <Text style={styles.grandLabel}>{hi.checkout.grandTotal}</Text>
            <Money value={selected.finalGrandTotal ?? selected.grandTotal} size={t.lg} />
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {(canChangeStatus || canCancel) && nextStatuses.length > 0 ? (
          <View style={styles.card}>
            <Input label={hi.orders.adjustmentNote} value={note} onChangeText={setNote} placeholder={hi.orders.cancelReason} />
            <View style={styles.actionWrap}>
              {nextStatuses
                .filter((s) => (s === 'CANCELLED' || s === 'REJECTED' ? canCancel : canChangeStatus))
                .map((s) => (
                  <Button
                    key={s}
                    label={ORDER_STATUS_LABEL_HI[s]}
                    onPress={() => void changeStatus(s)}
                    loading={busyStatus === s}
                    variant={s === 'CANCELLED' || s === 'REJECTED' ? 'danger' : 'secondary'}
                    size="sm"
                    fullWidth={false}
                    style={{ marginRight: space[2], marginBottom: space[2] }}
                  />
                ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.filterRow}>
        {(['ACTIVE', 'DONE', 'ALL'] as Filter[]).map((f) => (
          <Pressable key={f} style={[styles.chip, filter === f && styles.chipActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f === 'ACTIVE' ? hi.staff.filterActive : f === 'DONE' ? hi.staff.filterDone : hi.staff.filterAll}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ paddingHorizontal: space[4] }}>
        <Input value={q} onChangeText={setQ} placeholder={hi.staff.searchPlaceholder} />
      </View>

      {error && orders === null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : orders === null ? (
        <FlatList data={[1, 2, 3]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} />
      ) : orders.length === 0 ? (
        <EmptyState icon="📦" title={hi.orders.empty} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.orderNumber}
          contentContainerStyle={{ padding: space[4], gap: space[2] }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => void openOrder(item.orderNumber)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderNoSm}>{hi.orders.orderNo(item.orderNumber)}</Text>
                <Text style={styles.meta}>
                  {item.village ?? ''} · {new Date(item.placedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <StatusBadge status={item.status} />
              <Money value={item.payable} size={t.sm} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  filterRow: { flexDirection: 'row', gap: space[2], padding: space[4], paddingBottom: space[2] },
  chip: { paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.g700, borderColor: colors.g700 },
  chipText: { fontSize: t.sm, color: colors.ink2, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  orderNoSm: { fontSize: t.sm, fontWeight: '700', color: colors.ink },
  meta: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  back: { color: colors.g700, fontWeight: '600', marginBottom: space[3] },
  orderNo: { fontSize: t.lg, fontWeight: '700', color: colors.ink },
  shipInfo: { fontSize: t.sm, color: colors.ink2, marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[4], marginTop: space[3], gap: space[2] },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
  itemName: { flex: 1, fontSize: t.sm, color: colors.ink2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space[1] },
  grandLabel: { fontSize: t.base, fontWeight: '700', color: colors.ink },
  errorText: { color: colors.danger, fontSize: t.sm, marginTop: space[3] },
  actionWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space[2] },
});
