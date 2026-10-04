import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { OrderSummary } from '@fb/shared-types';
import type { CustomerStackParamList, CustomerTabParamList } from '../../navigation/CustomerTabs';
import { api, ApiError } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Money } from '../../components/Money';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabParamList, 'Orders'>, NativeStackScreenProps<CustomerStackParamList>>;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function OrdersScreen({ navigation }: Props): React.JSX.Element {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.paged<OrderSummary>('/orders', { page: 1 });
      setOrders(r.items);
      setHasMore(r.meta.hasMore);
      setPage(1);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => void load());
    return unsub;
  }, [navigation, load]);

  const loadMore = async (): Promise<void> => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r = await api.paged<OrderSummary>('/orders', { page: next });
      setOrders((prev) => [...(prev ?? []), ...r.items]);
      setHasMore(r.meta.hasMore);
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  };

  if (error && !orders) return <ErrorState message={error} onRetry={() => void load()} />;
  if (orders === null) {
    return <FlatList data={[1, 2, 3, 4]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} contentContainerStyle={{ paddingTop: space[2] }} />;
  }
  if (orders.length === 0) {
    return <EmptyState icon="📦" title={hi.orders.empty} help={hi.orders.emptyHelp} actionLabel={hi.cart.browse} onAction={() => navigation.navigate('Categories')} />;
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.orderNumber}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
      contentContainerStyle={{ padding: space[4], gap: space[3] }}
      onEndReachedThreshold={0.4}
      onEndReached={() => void loadMore()}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => navigation.navigate('OrderTracking', { orderNumber: item.orderNumber })}>
          <View style={styles.row}>
            <Text style={styles.orderNo}>{hi.orders.orderNo(item.orderNumber)}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.meta}>
            {fmtDate(item.placedAt)} · {hi.orders.itemCount(item.itemCount)}
            {item.village ? ` · ${item.village}` : ''}
          </Text>
          <View style={styles.row}>
            <Money value={item.payable} size={t.md} />
            <Text style={styles.chevron}>›</Text>
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
  meta: { fontSize: t.xs, color: colors.ink3 },
  chevron: { fontSize: t.xl, color: colors.ink3 },
});
