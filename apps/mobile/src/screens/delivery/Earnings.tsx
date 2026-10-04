import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { DeliveryStackParamList, DeliveryTabParamList } from '../../navigation/DeliveryStack';
import { api, ApiError } from '../../services/api';
import { Money } from '../../components/Money';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

type Props = CompositeScreenProps<BottomTabScreenProps<DeliveryTabParamList, 'Earnings'>, NativeStackScreenProps<DeliveryStackParamList>>;

interface EarningsSummary {
  walletBalance: string;
  codInHand: string;
  totalDeliveries: number;
  rating: string;
  today: { deliveries: number; earning: string };
}
interface WalletTxn {
  id: number;
  type: 'CREDIT' | 'DEBIT';
  source: string;
  amount: string;
  createdAt: string;
}

export default function DeliveryEarningsScreen(_props: Props): React.JSX.Element {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [items, setItems] = useState<WalletTxn[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, w] = await Promise.all([api.get<EarningsSummary>('/delivery/earnings'), api.get<{ items: WalletTxn[] }>('/users/me/wallet')]);
      setSummary(s);
      setItems(w.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !summary) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <View style={styles.screen}>
      <View style={styles.summaryCard}>
        {summary === null ? (
          <ListRowSkeleton />
        ) : (
          <View style={styles.kpiGrid}>
            <Kpi label={hi.wallet.balance} value={<Money value={summary.walletBalance} size={t.xl} />} />
            <Kpi label={hi.delivery.todayEarning} value={<Money value={summary.today.earning} size={t.lg} />} />
            <Kpi label={hi.delivery.codInHand} value={<Money value={summary.codInHand} size={t.lg} color={colors.warn} />} />
            <Kpi label={hi.delivery.totalDeliveries} value={<Text style={styles.kpiNum}>{summary.totalDeliveries}</Text>} />
          </View>
        )}
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
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.source}>{hi.wallet.sourceLabel[item.source] ?? item.source}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
              </View>
              <Money value={item.amount} size={t.md} color={item.type === 'CREDIT' ? colors.g700 : colors.danger} />
            </View>
          )}
        />
      )}
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      {value}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  summaryCard: { margin: space[4] },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  kpiCard: { width: '47%', backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  kpiLabel: { fontSize: t.xs, color: colors.ink3, marginBottom: space[1] },
  kpiNum: { fontSize: t.xl, fontWeight: '700', color: colors.ink },
  historyTitle: { fontSize: t.base, fontWeight: '700', color: colors.ink, marginHorizontal: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  source: { fontSize: t.base, fontWeight: '600', color: colors.ink },
  date: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
});
