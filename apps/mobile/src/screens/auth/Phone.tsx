import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../store/auth';
import { ApiError } from '../../services/api';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { colors, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

const PHONE_RE = /^[6-9]\d{9}$/;

/** A2: phone → OTP. Same screen serves customers (new + returning) and staff (existing accounts). */
export default function PhoneScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Phone'>): React.JSX.Element {
  const { sendOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const digits = phone.replace(/\D/g, '');

  const submit = async (): Promise<void> => {
    if (!PHONE_RE.test(digits)) {
      setError(hi.auth.invalidPhone);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await sendOtp(digits, 'LOGIN');
      navigation.navigate('Otp', { phone: digits, purpose: 'LOGIN', expiresIn: res.expiresIn, resendAfter: res.resendAfter });
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.content}>
          <Text style={styles.brand}>{hi.auth.title}</Text>
          <Text style={styles.subtitle}>{hi.auth.subtitle}</Text>
          <View style={styles.form}>
            <Input
              label={hi.auth.phoneLabel}
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/[^\d]/g, '').slice(0, 10))}
              placeholder={hi.auth.phonePlaceholder}
              keyboardType="number-pad"
              maxLength={10}
              error={error ?? undefined}
              autoFocus
            />
            <Text style={styles.help}>{hi.auth.phoneHelp}</Text>
            <View style={{ height: space[4] }} />
            <Button label={hi.auth.sendOtp} onPress={() => void submit()} loading={loading} disabled={digits.length !== 10} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: space[6] },
  brand: { fontSize: t.display, fontWeight: '700', color: colors.g700, textAlign: 'center' },
  subtitle: { fontSize: t.md, color: colors.ink2, textAlign: 'center', marginTop: space[2], marginBottom: space[8] },
  form: {},
  help: { fontSize: t.xs, color: colors.ink3, marginTop: -space[2] },
});
