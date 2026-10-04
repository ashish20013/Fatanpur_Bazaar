import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api, ApiError, type Paged } from '../../services/api';
import { Money } from '../../components/Money';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

interface WalletTxn {
  id: number;
  type: 'CREDIT' | 'DEBIT';
  source: string;
  amount: string;
  balanceAfter: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export default function WalletScreen(_props: NativeStackScreenProps<CustomerStackParamList, 'Wallet'>): React.JSX.Element {
  const [balance, setBalance] = useState<string | null>(null);
  const [items, setItems] = useState<WalletTxn[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get<{ balance: string; items: WalletTxn[]; page: number; perPage: number; total: number }>('/users/me/wallet');
      setBalance(r.balance);
      setItems(r.items);
      setHasMore(r.items.length < r.total);
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
      const r = await api.get<{ balance: string; items: WalletTxn[]; page: number; perPage: number; total: number }>(`/users/me/wallet?page=${next}`);
      const loadedSoFar = (items?.length ?? 0) + r.items.length;
      setItems((prev) => [...(prev ?? []), ...r.items]);
      setHasMore(loadedSoFar < r.total);
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  };

  if (error && items === null) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <View style={styles.screen}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{hi.wallet.balance}</Text>
        {balance === null ? <ListRowSkeleton /> : <Money value={balance} size={t.display} />}
      </View>
      <Text style={styles.historyTitle}>{hi.wallet.history}</Text>
      {items === null ? (
        <FlatList data={[1, 2, 3]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} />
      ) : items.length === 0 ? (
        <EmptyState icon="👛" title={hi.wallet.empty} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ padding: space[4], gap: space[2] }}
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.source}>{hi.wallet.sourceLabel[item.source] ?? item.source}</Text>
                {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <Money value={item.amount} size={t.md} color={item.type === 'CREDIT' ? colors.g700 : colors.danger} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  balanceCard: { margin: space[4], backgroundColor: colors.g700, borderRadius: radius.lg, padding: space[5], alignItems: 'center' },
  balanceLabel: { color: colors.white, fontSize: t.sm, opacity: 0.85, marginBottom: space[1] },
  historyTitle: { fontSize: t.base, fontWeight: '700', color: colors.ink, marginHorizontal: space[4] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  source: { fontSize: t.base, fontWeight: '600', color: colors.ink },
  note: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  date: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
});
