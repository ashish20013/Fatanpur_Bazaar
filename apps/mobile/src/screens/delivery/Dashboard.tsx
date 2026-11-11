import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, Vibration, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { AssignmentView, AvailableOrder } from '@fb/shared-types';
import type { DeliveryStackParamList, DeliveryTabParamList } from '../../navigation/DeliveryStack';
import { api, ApiError, errText } from '../../services/api';
import { LocationTracker } from '../../services/location';
import { onSocketEvent } from '../../services/socket';
import { Money } from '../../components/Money';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { useScrollBottomPad } from '../../navigation/useScrollPad';
import { useAppMode } from '../../navigation/RoleNavigator';
import { useAuth } from '../../store/auth';
import { Icon } from '../../components/Icon';
import { en } from '../../i18n/en';

type Props = CompositeScreenProps<BottomTabScreenProps<DeliveryTabParamList, 'Dashboard'>, NativeStackScreenProps<DeliveryStackParamList>>;

interface Earnings {
  walletBalance: string;
  codInHand: string;
  totalDeliveries: number;
  rating: string;
  onDuty: boolean;
  today: { deliveries: number; earning: string };
}

/**
 * Also owns the app-wide half of A19's lifecycle rule: whichever job is ACCEPTED/PICKED_UP
 * gets the location watch running, and only that one — checked here on mount/focus/interval
 * and on the socket events that change it, so a killed-and-relaunched app resumes correctly
 * even if the precise stop() call at the end of a delivery was ever missed.
 */
export default function DeliveryDashboardScreen({ navigation }: Props): React.JSX.Element {
  const { user, logout } = useAuth();
  const { switchTo, canSwitch } = useAppMode();
  const bottomPad = useScrollBottomPad();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [pool, setPool] = useState<AvailableOrder[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const syncing = useRef(false);

  const loadPool = useCallback(async () => {
    try {
      setPool(await api.get<AvailableOrder[]>('/delivery/pool'));
    } catch {
      // a failed pool poll is harmless — it refreshes again on the next tick/socket event
    }
  }, []);

  const claim = useCallback(
    async (orderNumber: string) => {
      setClaiming(orderNumber);
      setError(null);
      try {
        await api.post(`/delivery/claim/${orderNumber}`, {});
        await loadPool();
        navigation.navigate('Assigned');
      } catch (e) {
        setError(errText(e, true));
        await loadPool(); // someone else likely took it — show the fresh pool
      } finally {
        setClaiming(null);
      }
    },
    [loadPool, navigation],
  );

  const syncTracking = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const assignments = await api.get<AssignmentView[]>('/delivery/assignments');
      const active = assignments.find((a) => a.status === 'ACCEPTED' || a.status === 'PICKED_UP');
      if (active) await LocationTracker.start(active.id);
      else await LocationTracker.stop();
    } catch {
      // best-effort resync — a failed poll just tries again next time
    } finally {
      syncing.current = false;
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEarnings(await api.get<Earnings>('/delivery/earnings'));
    } catch (e) {
      setError(errText(e, true));
    }
  }, []);

  useEffect(() => {
    void load();
    void loadPool();
    void syncTracking();
    const iv = setInterval(() => {
      void syncTracking();
      void loadPool();
    }, 30_000);
    const unsub = navigation.addListener('focus', () => {
      void load();
      void loadPool();
      void syncTracking();
    });
    return () => {
      clearInterval(iv);
      unsub();
    };
  }, [navigation, load, loadPool, syncTracking]);

  useEffect(() => {
    const unsubs = [
      onSocketEvent('delivery.assigned', () => void syncTracking()),
      onSocketEvent('delivery.started', () => void syncTracking()),
      onSocketEvent('delivery.completed', () => void syncTracking()),
      onSocketEvent('order.cancelled', () => void syncTracking()),
      // Broadcast model: a new pool order buzzes the phone and refreshes the list the instant it lands.
      onSocketEvent('pool.order.new', () => {
        Vibration.vibrate([0, 300, 150, 300]);
        void loadPool();
      }),
      onSocketEvent('pool.order.gone', () => void loadPool()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [syncTracking, loadPool]);

  const toggleDuty = async (value: boolean): Promise<void> => {
    setToggling(true);
    try {
      await api.post('/delivery/duty', { available: value });
      setEarnings((prev) => (prev ? { ...prev, onDuty: value } : prev));
    } catch (e) {
      setError(errText(e, true));
    } finally {
      setToggling(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} colors={[colors.g700]} />}
    >
      <View style={styles.dutyCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dutyTitle}>{earnings?.onDuty ? en.delivery.onDuty : en.delivery.offDuty}</Text>
          <Text style={styles.dutyHelp}>{en.delivery.dutyHelp}</Text>
        </View>
        <Switch value={Boolean(earnings?.onDuty)} onValueChange={(v) => void toggleDuty(v)} disabled={toggling || !earnings} trackColor={{ true: colors.g500, false: colors.line }} />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* The broadcast pool. Shown only while on duty; the first rider to claim it gets the job. */}
      {earnings?.onDuty ? (
        <View style={styles.poolWrap}>
          <Text style={styles.sectionTitle}>
            {en.delivery.poolTitle}
            {pool.length ? `  (${pool.length})` : ''}
          </Text>
          {pool.length === 0 ? (
            <Text style={styles.poolEmpty}>{en.delivery.poolEmpty}</Text>
          ) : (
            pool.map((o) => {
              const waitMin = Math.floor(o.waitingSec / 60);
              return (
                <View key={o.orderNumber} style={styles.poolCard}>
                  <View style={styles.row}>
                    <Text style={styles.orderNo}>{o.orderNumber}</Text>
                    <Text style={styles.wait}>{en.delivery.waitMins(waitMin)}</Text>
                  </View>
                  <Text style={styles.village}>
                    {[o.village, o.distanceKm !== null ? en.delivery.kmAway(o.distanceKm) : null, en.delivery.itemsN(o.itemCount)].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={styles.row}>
                    {Number(o.collectAmount) > 0 ? <Money value={o.collectAmount} size={t.md} /> : <Text style={styles.prepaid}>{en.delivery.prepaidBadge}</Text>}
                    <Pressable style={[styles.claimBtn, claiming === o.orderNumber && styles.claimBtnBusy]} disabled={claiming === o.orderNumber} onPress={() => void claim(o.orderNumber)}>
                      <Text style={styles.claimText}>{en.delivery.claim}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}

      {earnings === null ? (
        <Skeleton height={140} radius={radius.md} />
      ) : (
        <View style={styles.kpiGrid}>
          <Kpi label={en.delivery.todayEarning} value={<Money value={earnings.today.earning} size={t.xl} />} />
          <Kpi label={en.delivery.todayDeliveries} value={<Text style={styles.kpiNum}>{earnings.today.deliveries}</Text>} />
          <Kpi label={en.delivery.codInHand} value={<Money value={earnings.codInHand} size={t.lg} color={colors.warn} />} />
          <Kpi label={en.delivery.rating} value={<Text style={styles.kpiNum}>⭐ {earnings.rating}</Text>} />
        </View>
      )}

      {/*
        Who is signed in, and the way out.

        ⚠️ A delivery partner had NO way to log out: the rider panel is four tabs and none of them
        carried an account screen, so a phone handed to the next rider stayed signed in as the
        last one — his earnings, his COD, his deliveries. The website's rider shell has both of
        these in its sidebar foot, so they belong here.
      */}
      <View style={styles.account}>
        <Text style={styles.who}>{user?.name || user?.phone}</Text>
        <Text style={styles.whoRole}>{user?.role}</Text>
        {canSwitch ? (
          <Pressable style={styles.accountBtn} onPress={() => switchTo('customer')}>
            <Icon name="building-store" size={16} color={colors.em700} />
            <Text style={styles.accountBtnText}>Shop as a customer</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.accountBtn} onPress={() => void logout()}>
          <Icon name="logout" size={16} color={colors.danger} />
          <Text style={[styles.accountBtnText, { color: colors.danger }]}>Log out</Text>
        </Pressable>
      </View>
    </ScrollView>
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
  dutyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: space[4], marginBottom: space[4] },
  dutyTitle: { fontSize: t.lg, fontWeight: '700', color: colors.ink },
  dutyHelp: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  errorText: { color: colors.danger, fontSize: t.sm, marginBottom: space[3] },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  kpiCard: { width: '47%', backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  kpiLabel: { fontSize: t.xs, color: colors.ink3, marginBottom: space[1] },
  kpiNum: { fontSize: t.xl, fontWeight: '700', color: colors.ink },
  account: { marginTop: space[6], gap: space[2] },
  who: { fontSize: t.md, fontWeight: '700', color: colors.ink },
  whoRole: { fontSize: t.xs, color: colors.ink3, letterSpacing: 1, marginTop: -4 },
  accountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.card,
  },
  accountBtnText: { color: colors.em800, fontWeight: '600', fontSize: t.base },
  poolWrap: { marginBottom: space[4], gap: space[2] },
  sectionTitle: { fontSize: t.lg, fontWeight: '700', color: colors.ink, marginBottom: space[1] },
  poolEmpty: { fontSize: t.sm, color: colors.ink3, backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  poolCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[3], gap: space[1], borderWidth: 1, borderColor: colors.a700 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNo: { fontSize: t.base, fontWeight: '700', color: colors.ink },
  wait: { fontSize: t.xs, color: colors.a700, fontWeight: '600' },
  village: { fontSize: t.sm, color: colors.ink2 },
  prepaid: { fontSize: t.xs, color: colors.g700, fontWeight: '600' },
  claimBtn: { backgroundColor: colors.g700, borderRadius: radius.sm, paddingVertical: space[2], paddingHorizontal: space[4] },
  claimBtnBusy: { opacity: 0.6 },
  claimText: { color: '#fff', fontWeight: '700', fontSize: t.sm },
});
