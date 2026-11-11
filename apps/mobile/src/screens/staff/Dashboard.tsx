import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ORDER_STATUS_LABEL_EN, type OrderStatus } from '@fb/shared-types';
import { api, ApiError, errText } from '../../services/api';
import { Money } from '../../components/Money';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { useScrollBottomPad } from '../../navigation/useScrollPad';
import { en } from '../../i18n/en';

interface VillageRow {
  id: number;
  name: string;
  nameHi: string | null;
  orders30d?: number;
  distanceKm?: string;
}
interface RequestGroup {
  villageGuess: string;
  requests: number;
}
interface DashboardData {
  today: { orders: number; gmv: string };
  openOrders: Record<string, number>;
  lowStock: number;
  payments: Record<string, number>;
  prescriptionsPending: number;
  last7Days: { date: string; orders: number; gmv: string }[];
  villages: { top: VillageRow[]; zeroActive: VillageRow[]; mostRequestedInactive: RequestGroup[] };
}

/** @admin/dashboard — permission-gated by the 'reports.view' tab entry in StaffStack.tsx. */
export default function StaffDashboardScreen(): React.JSX.Element {
  const bottomPad = useScrollBottomPad();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<DashboardData>('/admin/dashboard'));
    } catch (e) {
      setError(errText(e, true));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = (): void => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

  if (error && !data) return <Text style={styles.error}>{error}</Text>;
  if (!data) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad }}>
        <Skeleton height={160} radius={radius.md} />
      </ScrollView>
    );
  }

  const openTotal = Object.values(data.openOrders).reduce((s, n) => s + n, 0);
  const openByStatus = Object.entries(data.openOrders)
    .map(([st, n]) => `${ORDER_STATUS_LABEL_EN[st as OrderStatus] ?? st}: ${n}`)
    .join(' · ');
  const pendingPayments = (data.payments.AWAITING_VERIFICATION ?? 0) + (data.payments.REFUND_PENDING ?? 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.g700]} />}>
      <View style={styles.kpiGrid}>
        <Kpi label={en.staff.todayOrders} value={<Text style={styles.kpiNum}>{data.today.orders}</Text>} />
        <Kpi label={en.staff.todaySales} value={<Money value={data.today.gmv} size={t.lg} />} />
        {/* The website calls this "Orders" and lists the open ones by status underneath — an
            order waiting to be packed is not a delivery in progress, and the shopkeeper acts on
            the difference. */}
        <Kpi label={en.staff.openOrders} value={<Text style={styles.kpiNum}>{openTotal}</Text>} hint={openByStatus} />
        <Kpi label={en.staff.lowStock} value={<Text style={[styles.kpiNum, data.lowStock > 0 && styles.warnNum]}>{data.lowStock}</Text>} />
        <Kpi label={en.staff.pendingPayments} value={<Text style={[styles.kpiNum, pendingPayments > 0 && styles.warnNum]}>{pendingPayments}</Text>} />
        <Kpi label={en.prescriptions.title} value={<Text style={[styles.kpiNum, data.prescriptionsPending > 0 && styles.warnNum]}>{data.prescriptionsPending}</Text>} />
        <Kpi
          label={en.staff.areaRequests}
          value={<Text style={[styles.kpiNum, data.villages.mostRequestedInactive.length > 0 && styles.warnNum]}>{data.villages.mostRequestedInactive.length}</Text>}
        />
        <Kpi label={en.staff.villages} value={<Text style={styles.kpiNum}>{data.villages.top.length}</Text>} />
      </View>

      <Text style={styles.section}>{en.staff.last7Days}</Text>
      <View style={styles.card}>
        {data.last7Days.map((d) => (
          <View key={d.date} style={styles.rowBetween}>
            <Text style={styles.rowLabel}>{d.date}</Text>
            <Text style={styles.rowLabel}>{en.staff.ordersN(d.orders)}</Text>
            <Money value={d.gmv} size={t.sm} />
          </View>
        ))}
      </View>

      <Text style={styles.section}>{en.staff.topVillages}</Text>
      <View style={styles.card}>
        {data.villages.top.map((v) => (
          <View key={v.id} style={styles.rowBetween}>
            <Text style={styles.rowLabel}>{v.nameHi || v.name}</Text>
            <Text style={styles.rowLabel}>{en.staff.ordersN(v.orders30d ?? 0)}</Text>
          </View>
        ))}
      </View>

      {data.villages.mostRequestedInactive.length > 0 ? (
        <View>
          <Text style={styles.section}>{en.staff.topRequests}</Text>
          <View style={styles.card}>
            {data.villages.mostRequestedInactive.map((g, i) => (
              <View key={`${g.villageGuess}-${i}`} style={styles.rowBetween}>
                <Text style={styles.rowLabel}>{g.villageGuess}</Text>
                <Text style={styles.rowLabel}>{en.staff.requestsN(g.requests)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }): React.JSX.Element {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      {value}
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  error: { color: colors.danger, textAlign: 'center', margin: space[6] },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  kpiCard: { width: '47%', backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  kpiLabel: { fontSize: t.xs, color: colors.ink3, marginBottom: space[1] },
  kpiNum: { fontSize: t.xl, fontWeight: '700', color: colors.ink },
  kpiHint: { fontSize: 11, color: colors.ink3, marginTop: 2 },
  warnNum: { color: colors.warn },
  section: { fontSize: t.base, fontWeight: '700', color: colors.ink, marginTop: space[6], marginBottom: space[2] },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[3], gap: space[2] },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
  rowLabel: { fontSize: t.sm, color: colors.ink2 },
});
