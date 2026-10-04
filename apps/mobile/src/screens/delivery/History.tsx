import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { DeliveryStackParamList, DeliveryTabParamList } from '../../navigation/DeliveryStack';
import { api, ApiError, type Paged } from '../../services/api';
import { Money } from '../../components/Money';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

type Props = CompositeScreenProps<BottomTabScreenProps<DeliveryTabParamList, 'History'>, NativeStackScreenProps<DeliveryStackParamList>>;

interface HistoryRow {
  id: number;
  status: 'DELIVERED' | 'FAILED' | 'CANCELLED' | 'REJECTED';
  earning: string;
  codCollected: string;
  deliveredAt: string | null;
  orderNumber: string;
  village: string | null;
}

const STATUS_HI: Record<HistoryRow['status'], string> = { DELIVERED: 'डिलीवर हुआ', FAILED: 'नहीं हो पाया', CANCELLED: 'रद्द', REJECTED: 'मना किया' };

export default function DeliveryHistoryScreen(_props: Props): React.JSX.Element {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.paged<HistoryRow>('/delivery/history', { page: 1 });
      setRows(r.items);
      setHasMore(r.meta.hasMore);
      setPage(1);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async (): Promise<void> => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r: Paged<HistoryRow> = await api.paged<HistoryRow>('/delivery/history', { page: next });
      setRows((prev) => [...(prev ?? []), ...r.items]);
      setHasMore(r.meta.hasMore);
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  };

  if (error && rows === null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (rows === null) return <FlatList data={[1, 2, 3]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} />;
  if (rows.length === 0) return <EmptyState icon="🕒" title="अभी कोई इतिहास नहीं" />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => String(r.id)}
      contentContainerStyle={{ padding: space[4], gap: space[2] }}
      onEndReachedThreshold={0.4}
      onEndReached={() => void loadMore()}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderNo}>{hi.orders.orderNo(item.orderNumber)}</Text>
            <Text style={styles.meta}>
              {item.status === 'DELIVERED' ? STATUS_HI.DELIVERED : STATUS_HI[item.status]} · {item.village ?? ''}
            </Text>
            {item.deliveredAt ? <Text style={styles.date}>{new Date(item.deliveredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text> : null}
          </View>
          {item.status === 'DELIVERED' ? <Money value={item.earning} size={t.md} color={colors.g700} /> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  orderNo: { fontSize: t.base, fontWeight: '700', color: colors.ink },
  meta: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  date: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
});
