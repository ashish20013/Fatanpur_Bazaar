import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StaffTabParamList } from '../../navigation/StaffStack';
import { api, ApiError } from '../../services/api';
import { Money } from '../../components/Money';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/EmptyState';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

interface DailyRow {
  stat_date: string;
  orders_placed: number;
  gmv: string;
}
interface TopProduct {
  productId: number;
  nameHi: string | null;
  name: string;
  qty: string;
  revenue: string;
}
interface ByPayment {
  method: string;
  orders: number;
  amount: string;
}
interface ZeroSearch {
  query: string;
  times: number;
}
interface SalesReport {
  byDay: DailyRow[];
  topProducts: TopProduct[];
  byPayment: ByPayment[];
  zeroResultSearches: ZeroSearch[];
}

const PAYMENT_LABEL: Record<string, string> = { COD: 'कैश ऑन डिलीवरी', UPI: 'UPI', GATEWAY: 'गेटवे', WALLET: 'वॉलेट' };

/** GET /admin/reports/sales — default range (last 30 days) matches the server's own default. */
export default function StaffReportsScreen(_props: BottomTabScreenProps<StaffTabParamList, 'Reports'>): React.JSX.Element {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await api.get<SalesReport>('/admin/reports/sales'));
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !report) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!report) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
        <Skeleton height={160} radius={radius.md} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
      <Text style={styles.section}>{hi.staff.last7Days.replace('7', '30')}</Text>
      <View style={styles.card}>
        {report.byDay.map((d) => (
          <View key={d.stat_date} style={styles.rowBetween}>
            <Text style={styles.rowLabel}>{d.stat_date}</Text>
            <Text style={styles.rowLabel}>{d.orders_placed} ऑर्डर</Text>
            <Money value={d.gmv} size={t.sm} />
          </View>
        ))}
      </View>

      <Text style={styles.section}>{hi.staff.topProducts}</Text>
      <View style={styles.card}>
        {report.topProducts.map((p) => (
          <View key={p.productId} style={styles.rowBetween}>
            <Text style={styles.itemName} numberOfLines={1}>
              {p.nameHi || p.name}
            </Text>
            <Text style={styles.rowLabel}>{p.qty}</Text>
            <Money value={p.revenue} size={t.sm} />
          </View>
        ))}
      </View>

      <Text style={styles.section}>{hi.staff.byPayment}</Text>
      <View style={styles.card}>
        {report.byPayment.map((p) => (
          <View key={p.method} style={styles.rowBetween}>
            <Text style={styles.rowLabel}>{PAYMENT_LABEL[p.method] ?? p.method}</Text>
            <Text style={styles.rowLabel}>{p.orders} ऑर्डर</Text>
            <Money value={p.amount} size={t.sm} />
          </View>
        ))}
      </View>

      {report.zeroResultSearches.length > 0 ? (
        <View>
          <Text style={styles.section}>{hi.staff.zeroSearches}</Text>
          <View style={styles.card}>
            {report.zeroResultSearches.map((s, i) => (
              <View key={`${s.query}-${i}`} style={styles.rowBetween}>
                <Text style={styles.itemName}>{s.query}</Text>
                <Text style={styles.rowLabel}>{s.times}×</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  section: { fontSize: t.base, fontWeight: '700', color: colors.ink, marginTop: space[5], marginBottom: space[2] },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[3], gap: space[2] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  rowLabel: { fontSize: t.sm, color: colors.ink2 },
  itemName: { flex: 1, fontSize: t.sm, color: colors.ink2 },
});
