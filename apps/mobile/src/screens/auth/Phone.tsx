import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../store/auth';
import { errText } from '../../services/api';
import { useSettings } from '../../store/settings';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { colors, font, radius, space, type as t } from '../../theme/tokens';
import { useSite } from '../../store/lang';

const PHONE_RE = /^[6-9]\d{9}$/;

/**
 * A2 — phone → OTP. The same screen serves a brand-new customer, a returning one, and staff.
 *
 * ⚠️ This used to open with "फतनपुर बाज़ार / सामान घर बैठे मंगाएं" and a bare number box, which
 * tells a first-time user nothing about what is about to happen. The website's login page answers
 * the three questions they actually have — do I need a password, where will the code come from,
 * and what do I get — so this screen now says the same things, in the same words
 * (apps/web/src/components/LoginForm.tsx and (auth)/login/page.tsx).
 */
export default function PhoneScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Phone'>): React.JSX.Element {
  const site = useSite();
  const { sendOtp } = useAuth();
  const settings = useSettings();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const digits = phone.replace(/\D/g, '');

  const submit = async (): Promise<void> => {
    if (!PHONE_RE.test(digits)) {
      setError(site.addr2.phoneWrong);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await sendOtp(digits, 'LOGIN');
      navigation.navigate('Otp', { phone: digits, purpose: 'LOGIN', expiresIn: res.expiresIn, resendAfter: res.resendAfter });
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  };

  const perks = [
    { icon: 'scooter', text: site.auth.perk1 },
    { icon: 'cash-banknote', text: site.auth.perk2 },
    { icon: 'phone', text: site.auth.perk3 },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{site.auth.login}</Text>
          {/* The line the website leads with: no password, and where the code will arrive. */}
          <Text style={styles.lead}>{site.auth.lead}</Text>

          <Text style={styles.label}>{site.auth.phone}</Text>
          {/* +91 is shown as a fixed prefix, as on the website — the box takes ten digits only,
              so nobody types a country code and gets told their number is wrong. */}
          <View style={[styles.field, error ? styles.fieldErr : null]}>
            <View style={styles.prefix}>
              <Text style={styles.prefixText}>+91</Text>
            </View>
            <TextInput
              value={phone}
              onChangeText={(v) => {
                setPhone(v.replace(/[^\d]/g, '').slice(0, 10));
                setError(null);
              }}
              placeholder="98765 43210"
              placeholderTextColor={colors.ink3}
              keyboardType="number-pad"
              maxLength={10}
              autoFocus
              style={styles.input}
            />
          </View>
          <Text style={styles.hint}>{site.auth.phoneHint}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={{ height: space[4] }} />
          <Button label={site.auth.sendOtp} onPress={() => void submit()} loading={loading} disabled={digits.length !== 10} />

          <View style={styles.perks}>
            {perks.map((p) => (
              <View key={p.icon} style={styles.perk}>
                <Icon name={p.icon} size={18} color={colors.au600} />
                <Text style={styles.perkText}>{p.text}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.terms}>{site.auth.terms}</Text>

          {settings.supportPhone ? (
            <Pressable style={styles.help} onPress={() => void Linking.openURL(`tel:+91${settings.supportPhone}`)}>
              <Icon name="headset" size={16} color={colors.em700} />
              <Text style={styles.helpText}>{site.sorry.orCall(settings.supportPhone)}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space[5], paddingVertical: space[6] },
  title: { fontFamily: font.display, fontSize: t.xxxl, color: colors.ink },
  lead: { fontSize: t.body, color: colors.ink2, marginTop: space[1], marginBottom: space[5], lineHeight: 24 },
  label: { fontSize: t.body, fontFamily: font.bodySemi, color: colors.ink, marginBottom: space[2] },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  fieldErr: { borderColor: colors.danger },
  prefix: { height: '100%', justifyContent: 'center', paddingHorizontal: space[3], backgroundColor: colors.paper2, borderRightWidth: 1, borderRightColor: colors.line },
  prefixText: { fontFamily: font.bodySemi, fontSize: t.body, color: colors.ink2 },
  input: { flex: 1, height: '100%', paddingHorizontal: space[3], fontSize: t.lg, color: colors.ink, letterSpacing: 1 },
  hint: { fontSize: t.base, color: colors.ink3, marginTop: space[1] },
  error: { fontSize: t.base, color: colors.danger, marginTop: space[1] },
  perks: { marginTop: space[6], gap: space[2] },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  perkText: { flex: 1, fontSize: t.base, color: colors.ink2 },
  terms: { fontSize: t.sm, color: colors.ink3, marginTop: space[5] },
  help: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[4] },
  helpText: { fontSize: t.base, color: colors.em700, fontFamily: font.bodySemi },
});
