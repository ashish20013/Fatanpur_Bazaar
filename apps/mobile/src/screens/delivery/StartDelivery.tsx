import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AssignmentView } from '@fb/shared-types';
import type { DeliveryStackParamList } from '../../navigation/DeliveryStack';
import { api, ApiError } from '../../services/api';
import { LocationTracker } from '../../services/location';
import { Button } from '../../components/Button';
import { colors, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

/** OUT_FOR_DELIVERY transition (A18) — the location watch is already running since ACCEPTED. */
export default function StartDeliveryScreen({ route, navigation }: NativeStackScreenProps<DeliveryStackParamList, 'StartDelivery'>): React.JSX.Element {
  const { assignmentId } = route.params;
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (): Promise<void> => {
    setStarting(true);
    setError(null);
    try {
      const all = await api.get<AssignmentView[]>('/delivery/assignments');
      const a = all.find((x) => x.id === assignmentId);
      await api.post(`/delivery/assignments/${assignmentId}/start`, {});
      await LocationTracker.start(assignmentId);
      navigation.replace('LiveLocation', { assignmentId, orderNumber: a?.orderNumber ?? '' });
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.icon}>🏍️</Text>
      <Text style={styles.help}>सामान उठ चुका है — डिलीवरी शुरू करें ताकि ग्राहक आपकी लाइव लोकेशन देख सके</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ height: space[6] }} />
      <Button label={hi.delivery.startDelivery} onPress={() => void start()} loading={starting} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: space[6] },
  icon: { fontSize: 48, marginBottom: space[4] },
  help: { fontSize: t.base, color: colors.ink2, textAlign: 'center' },
  error: { color: colors.danger, fontSize: t.sm, marginTop: space[3], textAlign: 'center' },
});
