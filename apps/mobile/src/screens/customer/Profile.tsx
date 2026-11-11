import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { OrderSummary } from '@fb/shared-types';
import type { CustomerStackParamList, CustomerTabParamList } from '../../navigation/CustomerTabs';
import { useAuth } from '../../store/auth';
import { useAppMode } from '../../navigation/RoleNavigator';
import { api, ApiError } from '../../services/api';
import { syncLang } from '../../services/langSync';
import { AddressForm, type AddressFormValue } from '../../components/AddressForm';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Money } from '../../components/Money';
import { StatusBadge } from '../../components/StatusBadge';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, font, radius, space, type as t } from '../../theme/tokens';
import { useLang, useSite } from '../../store/lang';
import { CONFIG } from '../../config';
import { APP_VERSION } from '../../constants';

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

/**
 * मेरा खाता — the app's half of the website's `/mera` plus its account tab row
 * (apps/web/src/app/(app)/mera/page.tsx and the `customerTabs` in that area's layout):
 * wallet balance and referral code as two cards, the last few orders, then the account pages.
 *
 * ⚠️ A GUEST gets a different screen, and that matters. The website answers /mera with a redirect
 * to /login, but the app lets anyone browse (the shop is the first thing a new user should see),
 * so this tab is where a guest arrives. It used to show them the full account page: four links
 * that every one answered 401, an empty address book, and a "लॉगआउट" button for an account they
 * did not have. Now they get the invitation the website's /login page gives them.
 */
export default function ProfileScreen({ navigation }: Props): React.JSX.Element {
  const site = useSite();
  const { lang, setLang } = useLang();
  const { user, logout } = useAuth();
  const { switchTo, canSwitch } = useAppMode();
  const isGuest = !user;
  /*
   * ⚠️ The live user, for `load` to read when it RUNS rather than when it was created.
   *
   * Tab screens are frozen while they are not the one on screen, so the account tab that a
   * guest opened keeps its signed-out render until it is looked at again. Its focus listener
   * therefore fires a `load` that was built while there was no account — which returned
   * straight away, left the skeletons up, and made a long-standing customer's account look
   * brand new. Reading the ref means the function always sees who is signed in now.
   */
  const userRef = useRef(user);
  userRef.current = user;

  const [addresses, setAddresses] = useState<AddressRow[] | null>(null);
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [mode, setMode] = useState<{ kind: 'view' } | { kind: 'form'; editing?: AddressRow }>({ kind: 'view' });
  const [error, setError] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  /*
   * ⚠️ Each piece is fetched on its own, and a failure in one never blanks the others.
   *
   * These four used to go out in a single `Promise.all` with a shared try/catch. One rejected
   * call — and right after a login one of them does, before the new session has settled — left
   * `addresses`, `orders` and `balance` all null, so a customer who had been shopping here for
   * months opened their account and saw no address and no orders. That is precisely the
   * "existing customer ko naya customer samajh raha hai" complaint: the data was on the server
   * the whole time (the second visit showed it), the screen had simply thrown it away.
   *
   * It also re-runs every time the tab is opened, the way the website re-renders the page on
   * each visit — so anything that did fail is right again a moment later.
   */
  const load = useCallback(async () => {
    // Nothing here is readable without an account, so a guest must not even ask (every call
    // would 401 and the screen would fill with errors it cannot do anything about).
    if (!userRef.current) return;
    setError(null);
    const fail = (e: unknown): void => setError(e instanceof ApiError ? e.messageHi : site.common.error);

    // The account's own preference wins on first load: somebody who reads the website in
    // English should not have to switch the app over by hand as well.
    void api
      .get<{ language?: 'hi' | 'en' }>('/users/me')
      .then((profile) => {
        if (profile.language && profile.language !== lang) setLang(profile.language);
      })
      .catch(() => undefined); // a preference we could not read is not worth an error on screen

    void api
      .get<AddressRow[]>('/users/me/addresses')
      .then(setAddresses)
      .catch(fail);

    void api
      .paged<OrderSummary>('/orders', { perPage: 5 })
      .then((page) => setOrders(page.items))
      .catch(fail);

    void api
      .get<{ balance: string }>('/users/me/wallet')
      .then((w) => setBalance(w.balance))
      .catch(() => setBalance('0.00'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    // Re-read on every visit to the tab, and the moment an account appears (logging in while
    // this tab sat in the background is the common case). This screen is the one that has to
    // be right: it is where a customer checks that the shop still knows who they are.
    return navigation.addListener('focus', () => void load());
  }, [load, navigation, user?.id]);

  const changeLanguage = (next: 'hi' | 'en'): void => {
    setLang(next); // the whole app re-renders in the new language, not just this row
    syncLang(next);
  };

  const deleteAddress = (id: number): void => {
    Alert.alert(site.address.deleteConfirm, undefined, [
      { text: site.common.cancel, style: 'cancel' },
      {
        text: site.common.yes,
        style: 'destructive',
        onPress: () => {
          api
            .delete(`/users/me/addresses/${id}`)
            .then(load)
            .catch((e) => setError(e instanceof ApiError ? e.messageHi : site.common.error));
        },
      },
    ]);
  };

  const doLogout = (): void => {
    Alert.alert(site.menu.logout, site.account.logoutConfirm, [
      { text: site.common.cancel, style: 'cancel' },
      { text: site.menu.logout, style: 'destructive', onPress: () => void logout() },
    ]);
  };

  /*
   * Closing the account for good — required by Google Play for any app with sign-up, and the
   * customer's right regardless.
   *
   * ⚠️ Two steps on purpose. The server is asked FIRST what this person would actually lose, and
   * that is read out before anything is destroyed. Many of these customers are ordering online for
   * the first time; a destructive button that acts on the first tap would take wallet money or
   * cancel a van already on its way, and they would only find out afterwards. The server refuses
   * in those two cases anyway — this just means they are told why instead of seeing an error.
   */
  const doDeleteAccount = (): void => {
    void (async () => {
      setBusyDelete(true);
      try {
        const p = await api.get<{
          canDelete: boolean;
          blockedReason: string | null;
          walletBalance: string;
          orders: number;
          addresses: number;
        }>('/users/me/delete-preview');

        if (!p.canDelete) {
          Alert.alert(site.account.deleteTitle, p.blockedReason ?? site.common.error, [{ text: site.common.close }]);
          return;
        }

        const lines = [
          site.account.deleteWhatGoes,
          `• ${site.account.deleteItemProfile}`,
          `• ${site.account.deleteItemAddresses} (${p.addresses})`,
          `• ${site.account.deleteItemLogins}`,
          '',
          p.orders > 0 ? site.account.deleteOrdersKept.replace('{n}', String(p.orders)) : '',
          site.account.deleteFinal,
        ]
          .filter(Boolean)
          .join('\n');

        Alert.alert(site.account.deleteConfirmTitle, lines, [
          { text: site.common.cancel, style: 'cancel' },
          {
            text: site.account.deleteYes,
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await api.post('/users/me/delete', {});
                  // The server has already revoked every session; logging out locally just clears
                  // this phone's copy of the tokens and takes them back to the login screen.
                  await logout();
                } catch (e) {
                  setError(e instanceof ApiError ? e.messageHi : site.common.error);
                }
              })();
            },
          },
        ]);
      } catch (e) {
        setError(e instanceof ApiError ? e.messageHi : site.common.error);
      } finally {
        setBusyDelete(false);
      }
    })();
  };

  const languageRow = (
    <>
      <Text style={styles.section}>{site.account.language}</Text>
      <View style={styles.langRow}>
        {(['hi', 'en'] as const).map((l) => (
          <Pressable key={l} style={[styles.langChip, lang === l && styles.langChipActive]} onPress={() => changeLanguage(l)}>
            <Text style={[styles.langText, lang === l && styles.langTextActive]}>{l === 'hi' ? site.lang.hi : site.lang.en}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  const support = (
    <>
      <Text style={styles.section}>{site.menu.support}</Text>
      <View style={styles.supportCard}>
        <Icon name="headset" size={20} color={colors.au600} />
        <Text style={styles.supportText}>{CONFIG.supportPhone}</Text>
      </View>
    </>
  );

  if (isGuest) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
        <View style={styles.card}>
          <Text style={styles.name}>{site.menu.guest}</Text>
          <Text style={styles.phone}>{site.menu.guestHint}</Text>
          <Text style={styles.lead}>{site.auth.lead}</Text>
          <View style={{ height: space[3] }} />
          <Button label={site.menu.login} onPress={() => navigation.navigate('Phone')} />
        </View>

        <View style={styles.perks}>
          {[site.auth.perk1, site.auth.perk2, site.auth.perk3].map((p) => (
            <View key={p} style={styles.perk}>
              <Icon name="circle-check" size={17} color={colors.em600} />
              <Text style={styles.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        {languageRow}
        {support}
        <Text style={styles.version}>{site.account.version} {APP_VERSION}</Text>
      </ScrollView>
    );
  }

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>{site.account.title}</Text>

      {/* The website's two cards, in the website's order: balance then referral code. */}
      <View style={styles.statRow}>
        <Pressable style={styles.stat} onPress={() => navigation.navigate('Wallet')}>
          <Text style={styles.statLabel}>{site.account.balance}</Text>
          {balance === null ? <Text style={styles.statValue}>—</Text> : <Money value={balance} size={t.lg} />}
        </Pressable>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{site.account.referralCode}</Text>
          <Text selectable style={styles.statCode}>
            {user.referralCode ?? '—'}
          </Text>
        </View>
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.section}>{site.order.myOrders}</Text>
        <Pressable onPress={() => navigation.navigate('Orders')}>
          <Text style={styles.link}>{site.common.more}</Text>
        </Pressable>
      </View>
      {orders === null ? (
        <ListRowSkeleton />
      ) : orders.length === 0 ? (
        <Text style={styles.empty}>{site.order.none}</Text>
      ) : (
        <View style={{ gap: space[2] }}>
          {orders.map((o) => (
            <Pressable key={o.orderNumber} style={styles.orderRow} onPress={() => navigation.navigate('OrderTracking', { orderNumber: o.orderNumber })}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.orderNo}>{o.orderNumber}</Text>
                <Text style={styles.orderDate}>{new Date(o.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <StatusBadge status={o.status} />
                <Money value={o.payable} size={t.base} />
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.rowBetween}>
        <Text style={styles.section}>{site.account.addresses}</Text>
        <Pressable onPress={() => setMode({ kind: 'form' })}>
          <Text style={styles.link}>{site.address.addNew}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {addresses === null ? (
        <ListRowSkeleton />
      ) : addresses.length === 0 ? (
        <Text style={styles.empty}>{site.address.empty}</Text>
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
                {!item.isServiceable ? <Text style={styles.addrBadge}>{site.address.outOfArea}</Text> : null}
              </Pressable>
              <Pressable onPress={() => deleteAddress(item.id)} hitSlop={8}>
                <Icon name="trash" size={18} color={colors.danger} />
              </Pressable>
            </View>
          )}
        />
      )}

      <View style={{ height: space[4] }} />
      {[
        { label: site.account.wallet, route: 'Wallet' as const, icon: 'wallet' },
        { label: site.account.prescriptions, route: 'Prescriptions' as const, icon: 'file-text' },
        { label: site.account.notifications, route: 'Notifications' as const, icon: 'bell' },
      ].map((l) => (
        <Pressable key={l.route} style={styles.linkRow} onPress={() => navigation.navigate(l.route)}>
          <Icon name={l.icon} size={18} color={colors.em700} />
          <Text style={styles.linkRowText}>{l.label}</Text>
          <Icon name="chevron-right" size={16} color={colors.ink3} />
        </Pressable>
      ))}

      {/* A staff member shopping on their own account gets back to their panel from here —
          the website says exactly this: "ऊपर प्रोफ़ाइल आइकन से कभी भी बदल सकते हैं". */}
      {canSwitch ? (
        <Pressable style={styles.linkRow} onPress={() => switchTo('staff')}>
          <Icon name="layout-dashboard" size={18} color={colors.em700} />
          <Text style={styles.linkRowText}>{site.auth.goPanelStaff}</Text>
          <Icon name="chevron-right" size={16} color={colors.ink3} />
        </Pressable>
      ) : null}

      {languageRow}
      {support}

      <View style={{ height: space[6] }} />
      <Button label={site.menu.logout} onPress={doLogout} variant="danger" />

      {/*
        Account deletion sits below logout, as plain text rather than a second red button —
        it must be findable (Play requires it, and people have the right to it) without sitting
        next to "logout" looking like the same kind of action.
      */}
      <Pressable style={styles.deleteRow} onPress={doDeleteAccount} disabled={busyDelete} hitSlop={8}>
        <Text style={styles.deleteText}>{busyDelete ? site.common.loading : site.account.deleteTitle}</Text>
      </Pressable>
      <Text style={styles.deleteHint}>{site.account.deleteHint}</Text>

      <Text style={styles.version}>{site.account.version} {APP_VERSION}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { padding: space[4], paddingBottom: space[10] },
  h1: { fontFamily: font.display, fontSize: t.xxl, color: colors.ink, marginBottom: space[3] },
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space[4] },
  name: { fontFamily: font.display, fontSize: t.xxl, color: colors.ink },
  phone: { fontSize: t.body, color: colors.ink2, marginTop: 2 },
  lead: { fontSize: t.base, color: colors.ink3, marginTop: space[2], lineHeight: 22 },
  perks: { gap: space[2], marginTop: space[3] },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  perkText: { flex: 1, fontSize: t.base, color: colors.ink2 },
  statRow: { flexDirection: 'row', gap: space[3] },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space[3] },
  statLabel: { fontSize: t.sm, color: colors.ink3 },
  statValue: { fontSize: t.lg, fontFamily: font.bodySemi, color: colors.ink },
  statCode: { fontSize: t.lg, fontFamily: font.bodySemi, color: colors.ink, letterSpacing: 2, marginTop: 2 },
  section: { fontSize: t.body, fontFamily: font.bodySemi, color: colors.ink, marginTop: space[5], marginBottom: space[2] },
  rowBetween: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  link: { color: colors.em700, fontFamily: font.bodySemi, fontSize: t.base },
  empty: { color: colors.ink3, fontSize: t.base, paddingVertical: space[2] },
  errorText: { color: colors.danger, fontSize: t.base, marginBottom: space[2] },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[3],
  },
  orderNo: { fontSize: t.body, fontFamily: font.bodySemi, color: colors.ink },
  orderDate: { fontSize: t.sm, color: colors.ink3, marginTop: 2 },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[3],
  },
  addrName: { fontSize: t.body, fontFamily: font.bodySemi, color: colors.ink },
  addrLine: { fontSize: t.base, color: colors.ink3, marginTop: 2 },
  addrBadge: { fontSize: t.xs, color: colors.danger, marginTop: 4 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    height: 52,
    paddingHorizontal: space[3],
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: space[2],
  },
  linkRowText: { flex: 1, fontSize: t.body, color: colors.ink },
  langRow: { flexDirection: 'row', gap: space[2] },
  langChip: {
    height: 44,
    paddingHorizontal: space[4],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  langChipActive: { backgroundColor: colors.em700, borderColor: colors.em700 },
  langText: { fontSize: t.body, color: colors.ink2 },
  langTextActive: { color: colors.white, fontFamily: font.bodySemi },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[3],
  },
  supportText: { fontSize: t.body, color: colors.ink },
  version: { fontSize: t.xs, color: colors.ink3, textAlign: 'center', marginTop: space[4] },
  // 48px of height so it is a real tap target on a cheap phone, but visually quiet.
  deleteRow: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: space[5] },
  deleteText: { fontSize: t.sm, color: colors.danger, textDecorationLine: 'underline' },
  deleteHint: { fontSize: t.xs, color: colors.ink3, textAlign: 'center', marginTop: 2 },
});
