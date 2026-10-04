import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DeliveryStackParamList } from '../../navigation/DeliveryStack';
import { api, ApiError } from '../../services/api';
import { LocationTracker } from '../../services/location';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { colors, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

const MAX_ATTEMPTS = 3;

/** GATE-OTP (A15 §8) from the rider's side — the server is the real gate; this only shows what
 * it says, including the lockout after 3 wrong tries. */
export default function CompleteDeliveryScreen({ route, navigation }: NativeStackScreenProps<DeliveryStackParamList, 'CompleteDelivery'>): React.JSX.Element {
  const { assignmentId, orderNumber } = route.params;
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [locked, setLocked] = useState(false);

  const complete = async (): Promise<void> => {
    if (otp.length !== 4 || locked) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/delivery/assignments/${assignmentId}/complete`, { otp });
      await LocationTracker.stop();
      navigation.popToTop();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', 0, hi.common.somethingWrong);
      setError(err.messageHi);
      setOtp('');
      if (err.code === 'DELIVERY_OTP_LOCKED') {
        setLocked(true);
        setAttemptsLeft(0);
      } else {
        setAttemptsLeft((n) => Math.max(0, n - 1));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.icon}>✅</Text>
      <Text style={styles.title}>{hi.orders.orderNo(orderNumber)}</Text>
      <Text style={styles.ask}>{hi.delivery.otpAsk}</Text>
      <Input
        value={otp}
        onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 4))}
        placeholder={hi.delivery.otpPlaceholder}
        keyboardType="number-pad"
        maxLength={4}
        editable={!locked}
        error={error ?? undefined}
      />
      {!locked && attemptsLeft < MAX_ATTEMPTS ? <Text style={styles.attemptsLeft}>{attemptsLeft} कोशिश बची हैं</Text> : null}
      <View style={{ height: space[4] }} />
      <Button label={hi.delivery.complete} onPress={() => void complete()} loading={submitting} disabled={otp.length !== 4 || locked} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: space[6], justifyContent: 'center' },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: space[3] },
  title: { fontSize: t.lg, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: space[4] },
  ask: { fontSize: t.base, color: colors.ink2, textAlign: 'center', marginBottom: space[4] },
  attemptsLeft: { fontSize: t.xs, color: colors.warn, textAlign: 'center', marginTop: -space[2] },
});
