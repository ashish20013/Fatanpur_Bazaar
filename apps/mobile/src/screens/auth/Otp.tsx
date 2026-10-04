import React, { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../store/auth';
import { ApiError } from '../../services/api';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { colors, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

/** A3: OTP verify (+ implicit registration for a brand-new phone). Single input, paste-friendly. */
export default function OtpScreen({ route, navigation }: NativeStackScreenProps<AuthStackParamList, 'Otp'>): React.JSX.Element {
  const { phone, resendAfter } = route.params;
  const { verifyOtp, sendOtp } = useAuth();
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLeft, setResendLeft] = useState(resendAfter);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setResendLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const submit = async (): Promise<void> => {
    if (otp.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(phone, otp, name.trim() || undefined);
      // Success flips auth status → RootNavigator switches to RoleNavigator on its own.
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setLoading(false);
    }
  };

  const resend = async (): Promise<void> => {
    if (resendLeft > 0) return;
    setError(null);
    try {
      const res = await sendOtp(phone, 'LOGIN');
      setResendLeft(res.resendAfter);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>{hi.auth.otpTitle}</Text>
        <Text style={styles.subtitle}>{hi.auth.otpSubtitle(phone)}</Text>

        <Input
          value={otp}
          onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={6}
          error={error ?? undefined}
          autoFocus
        />
        <Text style={styles.help}>{hi.auth.otpHelp}</Text>

        <View style={{ height: space[4] }} />
        <Input label={hi.auth.nameLabel} value={name} onChangeText={setName} placeholder={hi.auth.namePlaceholder} maxLength={100} />

        <Button label={hi.auth.verify} onPress={() => void submit()} loading={loading} disabled={otp.length !== 6} />

        <View style={styles.resendRow}>
          {resendLeft > 0 ? (
            <Text style={styles.resendMuted}>{hi.auth.resendIn(resendLeft)}</Text>
          ) : (
            <Pressable onPress={() => void resend()}>
              <Text style={styles.resendActive}>{hi.auth.resend}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.changeNumber}>{hi.auth.changeNumber}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: space[6] },
  title: { fontSize: t.xxl, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: t.base, color: colors.ink2, textAlign: 'center', marginTop: space[2], marginBottom: space[6] },
  help: { fontSize: t.xs, color: colors.ink3, marginTop: -space[2], marginBottom: space[2] },
  resendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[4] },
  resendMuted: { color: colors.ink3, fontSize: t.sm },
  resendActive: { color: colors.g700, fontWeight: '600', fontSize: t.sm },
  changeNumber: { color: colors.ink2, fontSize: t.sm, textDecorationLine: 'underline' },
});
