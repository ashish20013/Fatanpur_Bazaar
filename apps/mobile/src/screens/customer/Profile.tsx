import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CustomerStackParamList, CustomerTabParamList } from '../../navigation/CustomerTabs';
import { useAuth } from '../../store/auth';
import { api, ApiError } from '../../services/api';
import { AddressForm, type AddressFormValue } from '../../components/AddressForm';
import { Button } from '../../components/Button';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';
import { CONFIG } from '../../config';

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabParamList, 'Profile'>, NativeStackScreenProps<CustomerStackParamList>>;

interface AddressRow {
  id: number;
  receiverName: string;
  phone: string;
  line1: string;
  landmark: string | null;
  villageId: number | null;
  villageName: string | null;
  villageNameHi: string | null;
  areaText: string | null;
  isDefault: boolean;
  isServiceable: boolean;
}

export default function ProfileScreen({ navigation }: Props): React.JSX.Element {
  const { user, logout } = useAuth();
  const [language, setLanguage] = useState<'hi' | 'en'>('hi');
  const [addresses, setAddresses] = useState<AddressRow[] | null>(null);
  const [mode, setMode] = useState<{ kind: 'view' } | { kind: 'form'; editing?: AddressRow }>({ kind: 'view' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [profile, rows] = await Promise.all([api.get<{ language?: 'hi' | 'en' }>('/users/me'), api.get<AddressRow[]>('/users/me/addresses')]);
      if (profile.language) setLanguage(profile.language);
      setAddresses(rows);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeLanguage = async (lang: 'hi' | 'en'): Promise<void> => {
    setLanguage(lang);
    try {
      await api.patch('/users/me', { language: lang });
    } catch {
      // a failed preference save is not worth interrupting the user over
    }
  };

  const deleteAddress = (id: number): void => {
    Alert.alert(hi.address.deleteConfirm, undefined, [
      { text: hi.common.cancel, style: 'cancel' },
      {
        text: hi.orders.cancel,
        style: 'destructive',
        onPress: () => {
          api
            .delete(`/users/me/addresses/${id}`)
            .then(load)
            .catch((e) => setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong));
        },
      },
    ]);
  };

  const doLogout = (): void => {
    Alert.alert(hi.profile.logout, hi.profile.logoutConfirm, [
      { text: hi.common.cancel, style: 'cancel' },
      { text: hi.profile.logout, style: 'destructive', onPress: () => void logout() },
    ]);
  };

  if (mode.kind === 'form') {
    const editing = mode.editing;
    const initial: Partial<AddressFormValue> | undefined = editing
      ? {
          id: editing.id,
          receiverName: editing.receiverName,
          phone: editing.phone.replace(/^91/, ''),
          line1: editing.line1,
          landmark: editing.landmark ?? '',
          villageId: editing.villageId,
          villageName: editing.villageNameHi || editing.villageName || '',
          areaText: editing.areaText ?? '',
        }
      : undefined;
    return (
      <AddressForm
        initial={initial}
        onCancel={() => setMode({ kind: 'view' })}
        onSaved={async () => {
          await load();
          setMode({ kind: 'view' });
        }}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name || hi.auth.title}</Text>
        <Text style={styles.phone}>{user?.phone}</Text>
        {user?.referralCode ? (
          <View style={styles.referralBox}>
            <Text style={styles.referralLabel}>{hi.profile.referral}</Text>
            <Text selectable style={styles.referralCode}>
              {user.referralCode}
            </Text>
            <Text style={styles.referralHelp}>{hi.profile.referralHelp}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.section}>{hi.profile.language}</Text>
      <View style={styles.langRow}>
        <Pressable style={[styles.langChip, language === 'hi' && styles.langChipActive]} onPress={() => void changeLanguage('hi')}>
          <Text style={[styles.langText, language === 'hi' && styles.langTextActive]}>{hi.profile.languageHi}</Text>
        </Pressable>
        <Pressable style={[styles.langChip, language === 'en' && styles.langChipActive]} onPress={() => void changeLanguage('en')}>
          <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>{hi.profile.languageEn}</Text>
        </Pressable>
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.section}>{hi.profile.myAddresses}</Text>
        <Pressable onPress={() => setMode({ kind: 'form' })}>
          <Text style={styles.link}>{hi.profile.addAddress}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {addresses === null ? (
        <ListRowSkeleton />
      ) : addresses.length === 0 ? (
        <Text style={styles.empty}>{hi.address.empty}</Text>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(a) => String(a.id)}
          scrollEnabled={false}
          contentContainerStyle={{ gap: space[2] }}
          renderItem={({ item }) => (
            <View style={styles.addrRow}>
              <Pressable style={{ flex: 1 }} onPress={() => setMode({ kind: 'form', editing: item })}>
                <Text style={styles.addrName}>
                  {item.receiverName} · {item.villageNameHi || item.villageName || '—'}
                </Text>
                <Text style={styles.addrLine} numberOfLines={1}>
                  {item.line1}
                </Text>
                {!item.isServiceable ? <Text style={styles.addrBadge}>{hi.address.outOfAreaBadge}</Text> : null}
              </Pressable>
              <Pressable onPress={() => deleteAddress(item.id)} hitSlop={8}>
                <Text style={styles.deleteText}>✕</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      <Text style={styles.section}>{hi.profile.myOrders}</Text>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Orders')}>
        <Text style={styles.linkRowText}>{hi.nav.orders}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Wallet')}>
        <Text style={styles.linkRowText}>{hi.profile.wallet}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Prescriptions')}>
        <Text style={styles.linkRowText}>{hi.profile.prescriptions}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Text style={styles.section}>{hi.profile.support}</Text>
      <Text style={styles.supportText}>📞 {CONFIG.supportPhone}</Text>

      <View style={{ height: space[6] }} />
      <Button label={hi.profile.logout} onPress={doLogout} variant="danger" />
      <Text style={styles.version}>{hi.profile.version} 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space[4] },
  name: { fontSize: t.xl, fontWeight: '700', color: colors.ink },
  phone: { fontSize: t.sm, color: colors.ink3, marginTop: 2 },
  referralBox: { marginTop: space[4], padding: space[3], backgroundColor: colors.g50, borderRadius: radius.sm },
  referralLabel: { fontSize: t.xs, color: colors.ink3 },
  referralCode: { fontSize: t.xl, fontWeight: '700', color: colors.g700, letterSpacing: 2, marginTop: 2 },
  referralHelp: { fontSize: t.xs, color: colors.ink2, marginTop: 4 },
  section: { fontSize: t.base, fontWeight: '700', color: colors.ink, marginTop: space[6], marginBottom: space[2] },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space[6] },
  link: { fontSize: t.sm, color: colors.g700, fontWeight: '600' },
  langRow: { flexDirection: 'row', gap: space[2] },
  langChip: { paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  langChipActive: { backgroundColor: colors.g700, borderColor: colors.g700 },
  langText: { color: colors.ink2, fontWeight: '600' },
  langTextActive: { color: colors.white },
  errorText: { color: colors.danger, fontSize: t.sm, marginBottom: space[2] },
  empty: { color: colors.ink3, fontSize: t.sm },
  addrRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  addrName: { fontSize: t.base, fontWeight: '600', color: colors.ink },
  addrLine: { fontSize: t.sm, color: colors.ink2, marginTop: 2 },
  addrBadge: { fontSize: t.xs, color: colors.danger, fontWeight: '600', marginTop: 4 },
  deleteText: { fontSize: t.lg, color: colors.danger, paddingHorizontal: space[2] },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: space[3], marginBottom: space[2] },
  linkRowText: { fontSize: t.base, color: colors.ink, fontWeight: '600' },
  chevron: { fontSize: t.xl, color: colors.ink3 },
  supportText: { fontSize: t.base, color: colors.ink2 },
  version: { textAlign: 'center', color: colors.ink3, fontSize: t.xs, marginTop: space[4] },
});
