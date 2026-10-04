import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DeliveryStackParamList } from '../../navigation/DeliveryStack';
import { LocationTracker } from '../../services/location';
import { Button } from '../../components/Button';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

/** Rider-side mirror of A19: no map bundled (§9 keeps low-end devices light) — just proof that
 * sharing is active, so the rider knows the customer can see them. */
export default function LiveLocationScreen({ route, navigation }: NativeStackScreenProps<DeliveryStackParamList, 'LiveLocation'>): React.JSX.Element {
  const { assignmentId, orderNumber } = route.params;
  const [active, setActive] = useState(LocationTracker.isActive());
  const [lowBattery, setLowBattery] = useState(LocationTracker.isLowBattery());

  useEffect(() => {
    const unsub = LocationTracker.onBatteryStatus(setLowBattery);
    const iv = setInterval(() => setActive(LocationTracker.isActive()), 5000);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, []);

  return (
    <View style={styles.screen}>
      <View style={[styles.dot, active ? styles.dotLive : styles.dotOff]} />
      <Text style={styles.title}>{active ? 'लोकेशन शेयर हो रही है' : 'लोकेशन बंद है'}</Text>
      <Text style={styles.help}>{hi.orders.orderNo(orderNumber)} — ग्राहक आपकी लाइव लोकेशन देख सकता है</Text>
      {lowBattery ? <Text style={styles.battery}>🔋 {hi.delivery.batteryLow}</Text> : null}
      <View style={{ height: space[8] }} />
      <Button label={hi.delivery.complete} onPress={() => navigation.navigate('CompleteDelivery', { assignmentId, orderNumber })} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: space[6] },
  dot: { width: 20, height: 20, borderRadius: radius.full, marginBottom: space[4] },
  dotLive: { backgroundColor: colors.g500 },
  dotOff: { backgroundColor: colors.ink3 },
  title: { fontSize: t.lg, fontWeight: '700', color: colors.ink },
  help: { fontSize: t.sm, color: colors.ink3, textAlign: 'center', marginTop: space[2] },
  battery: { fontSize: t.sm, color: colors.warn, marginTop: space[4], fontWeight: '600' },
});
