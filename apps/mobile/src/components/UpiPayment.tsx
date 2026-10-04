import React, { useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { UpiDetails } from '@fb/shared-types';
import { CONFIG } from '../config';
import { accessTokenValue, api, ApiError } from '../services/api';
import { Money } from './Money';
import { Button } from './Button';
import { Input } from './Input';
import { colors, radius, space, type as t } from '../theme/tokens';
import { hi } from '../i18n/hi';

/**
 * A17 UPI flow: intent button (opens whichever payment app is installed) + QR fallback for
 * desktop-like viewing, then a plain UTR claim — the shop never sees anything until an
 * ADMIN verifies it against the HDFC statement (payments.verify permission).
 */
export function UpiPayment({ orderNumber, upi, onClaimed }: { orderNumber: string; upi: UpiDetails; onClaimed: () => void }): React.JSX.Element {
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  const qrUri = `${CONFIG.apiUrl}/payments/upi-qr/${encodeURIComponent(orderNumber)}.png`;
  const utrValid = /^[A-Za-z0-9]{10,22}$/.test(utr.trim());

  const claim = async (): Promise<void> => {
    if (!utrValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/payments/upi/claim', { orderNumber, utr: utr.trim() });
      setClaimed(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: space[4] }}>
      <Text style={styles.title}>{hi.checkout.upiScreenTitle}</Text>
      <Text style={styles.amountLabel}>{hi.checkout.upiAmount}</Text>
      <Money value={upi.amount} size={t.xxxl} />

      <View style={{ height: space[4] }} />
      <Button label={hi.checkout.upiPay} onPress={() => void Linking.openURL(upi.intentUrl)} />

      <View style={styles.qrWrap}>
        <Text style={styles.qrLabel}>{hi.checkout.upiOrScan}</Text>
        <Image source={{ uri: qrUri, headers: { Authorization: `Bearer ${accessTokenValue() ?? ''}` } }} style={styles.qr} resizeMode="contain" />
        <Text style={styles.vpa}>{upi.vpa}</Text>
      </View>

      {claimed ? (
        <View style={styles.claimedBox}>
          <Text style={styles.claimedText}>✅ {hi.checkout.utrClaimed}</Text>
          <View style={{ height: space[3] }} />
          <Button label={hi.orders.track} onPress={onClaimed} />
        </View>
      ) : (
        <View style={styles.claimBox}>
          <Text style={styles.utrLabel}>{hi.checkout.utrLabel}</Text>
          <Input value={utr} onChangeText={(v) => setUtr(v.replace(/[^A-Za-z0-9]/g, '').slice(0, 22))} placeholder={hi.checkout.utrPlaceholder} maxLength={22} error={error ?? undefined} />
          <Text style={styles.utrHelp}>{hi.checkout.utrHelp}</Text>
          <Button label={hi.checkout.utrSubmit} onPress={() => void claim()} loading={submitting} disabled={!utrValid} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  title: { fontSize: t.lg, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  amountLabel: { fontSize: t.sm, color: colors.ink3, textAlign: 'center', marginTop: space[4] },
  qrWrap: { alignItems: 'center', marginTop: space[6], backgroundColor: colors.card, borderRadius: radius.md, padding: space[4] },
  qrLabel: { fontSize: t.sm, color: colors.ink2, marginBottom: space[2] },
  qr: { width: 200, height: 200, backgroundColor: colors.surface },
  vpa: { marginTop: space[2], fontSize: t.base, fontWeight: '700', color: colors.ink },
  claimBox: { marginTop: space[6], gap: space[2] },
  utrLabel: { fontSize: t.base, fontWeight: '600', color: colors.ink },
  utrHelp: { fontSize: t.xs, color: colors.ink3, marginTop: -space[2], marginBottom: space[2] },
  claimedBox: { marginTop: space[6], alignItems: 'center' },
  claimedText: { color: colors.g700, fontWeight: '700', fontSize: t.md },
});
