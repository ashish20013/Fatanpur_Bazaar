import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, errText } from '../../services/api';
import { Money } from '../../components/Money';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/EmptyState';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { useScrollBottomPad } from '../../navigation/useScrollPad';
import { en } from '../../i18n/en';

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
/**
 * ⚠️ The server's own names, read off admin.service.ts `salesReport`:
 *   • the list of searches that found nothing is `zeroSearch`. This screen called it
 *     `zeroResultSearches`, so it was undefined and `.length` crashed the whole Reports tab —
 *     the shopkeeper's reports page simply showed "कुछ गड़बड़ हो गई".
 *   • `byDay` is the analytics_daily table as it is, so those columns are snake_case
 *     (`stat_date`, `orders_placed`). @fb/shared-types calls that field `orders`, which does
 *     not match what the query returns; the column name is what is trusted here.
 *
 * Every list is also defaulted below, because one missing array must never take down a screen
 * the owner reads every morning.
 */
interface SalesReport {
  byDay?: DailyRow[];
  topProducts?: TopProduct[];
  byPayment?: ByPayment[];
  zeroSearch?: ZeroSearch[];
}



/** GET /admin/reports/sales — default range (last 30 days) matches the server's own default. */
export default function StaffReportsScreen(): React.JSX.Element {
  const bottomPad = useScrollBottomPad();
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await api.get<SalesReport>('/admin/reports/sales'));
    } catch (e) {
      setError(errText(e, true));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !report) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!report) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad }}>
        <Skeleton height={160} radius={radius.md} />
      </ScrollView>
    );
  }

  const byDay = report.byDay ?? [];
  const topProducts = report.topProducts ?? [];
  const byPayment = report.byPayment ?? [];
  const zeroSearch = report.zeroSearch ?? [];
  const nothingYet = byDay.length === 0 && topProducts.length === 0 && byPayment.length === 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad }}>
      {nothingYet ? <Text style={styles.empty}>{en.staff.noRows}</Text> : null}
      <Text style={styles.section}>{en.staff.last7Days.replace('7', '30')}</Text>
      <View style={styles.card}>
        {byDay.map((d) => (
          <View key={d.stat_date} style={styles.rowBetween}>
            <Text style={styles.rowLabel}>{d.stat_date}</Text>
            <Text style={styles.rowLabel}>{en.staff.ordersN(d.orders_placed)}</Text>
            <Money value={d.gmv} size={t.sm} />
          </View>
        ))}
      </View>

      <Text style={styles.section}>{en.staff.topProducts}</Text>
      <View style={styles.card}>
        {topProducts.map((p) => (
          <View key={p.productId} style={styles.rowBetween}>
            <Text style={styles.itemName} numberOfLines={1}>
              {p.nameHi || p.name}
            </Text>
            <Text style={styles.rowLabel}>{p.qty}</Text>
            <Money value={p.revenue} size={t.sm} />
          </View>
        ))}
      </View>

      <Text style={styles.section}>{en.staff.byPayment}</Text>
      <View style={styles.card}>
        {byPayment.map((p) => (
          <View key={p.method} style={styles.rowBetween}>
            <Text style={styles.rowLabel}>{en.staff.paymentLabel[p.method] ?? p.method}</Text>
            <Text style={styles.rowLabel}>{en.staff.ordersN(p.orders)}</Text>
            <Money value={p.amount} size={t.sm} />
          </View>
        ))}
      </View>

      {zeroSearch.length > 0 ? (
        <View>
          <Text style={styles.section}>{en.staff.zeroSearches}</Text>
          <View style={styles.card}>
            {zeroSearch.map((s, i) => (
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
  empty: { fontSize: t.base, color: colors.ink3, textAlign: 'center', paddingVertical: space[4] },
  itemName: { flex: 1, fontSize: t.sm, color: colors.ink2 },
});
