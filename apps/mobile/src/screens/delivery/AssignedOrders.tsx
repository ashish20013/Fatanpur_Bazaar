import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { AssignmentView } from '@fb/shared-types';
import type { DeliveryStackParamList, DeliveryTabParamList } from '../../navigation/DeliveryStack';
import { api, ApiError } from '../../services/api';
import { onSocketEvent } from '../../services/socket';
import { Money } from '../../components/Money';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

type Props = CompositeScreenProps<BottomTabScreenProps<DeliveryTabParamList, 'Assigned'>, NativeStackScreenProps<DeliveryStackParamList>>;

const STATUS_LABEL_HI: Record<AssignmentView['status'], string> = {
  OFFERED: 'नया — स्वीकार करें',
  ACCEPTED: 'स्वीकार किया',
  REJECTED: 'मना किया',
  PICKED_UP: 'सामान उठाया',
  DELIVERED: 'डिलीवर हुआ',
  FAILED: 'नहीं हो पाया',
  CANCELLED: 'रद्द',
};

export default function AssignedOrdersScreen({ navigation }: Props): React.JSX.Element {
  const [rows, setRows] = useState<AssignmentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api.get<AssignmentView[]>('/delivery/assignments'));
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => void load());
    return unsub;
  }, [navigation, load]);

  useEffect(() => {
    const unsubs = [onSocketEvent('delivery.assigned', () => void load()), onSocketEvent('delivery.started', () => void load()), onSocketEvent('delivery.completed', () => void load())];
    return () => unsubs.forEach((u) => u());
  }, [load]);

  if (error && rows === null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (rows === null) return <FlatList data={[1, 2, 3]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} />;
  if (rows.length === 0) return <EmptyState icon="📦" title={hi.delivery.noAssignments} />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(a) => String(a.id)}
      contentContainerStyle={{ padding: space[4], gap: space[3] }}
      onRefresh={() => void load()}
      refreshing={false}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => navigation.navigate('OrderDetail', { assignmentId: item.id })}>
          <View style={styles.row}>
            <Text style={styles.orderNo}>{hi.orders.orderNo(item.orderNumber)}</Text>
            <Text style={[styles.statusTag, item.status === 'OFFERED' && styles.statusNew]}>{STATUS_LABEL_HI[item.status]}</Text>
          </View>
          <Text style={styles.village}>{item.customer.village || item.customer.line1}</Text>
          <View style={styles.row}>
            <Text style={styles.itemsCount}>{item.items.length} सामान</Text>
            {Number(item.collectAmount) > 0 ? <Money value={item.collectAmount} size={t.md} /> : <Text style={styles.prepaid}>{hi.delivery.prepaidBadge}</Text>}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[3], gap: space[1] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNo: { fontSize: t.base, fontWeight: '700', color: colors.ink },
  statusTag: { fontSize: t.xs, fontWeight: '600', color: colors.ink2 },
  statusNew: { color: colors.a700 },
  village: { fontSize: t.sm, color: colors.ink2 },
  itemsCount: { fontSize: t.xs, color: colors.ink3 },
  prepaid: { fontSize: t.xs, color: colors.g700, fontWeight: '600' },
});
