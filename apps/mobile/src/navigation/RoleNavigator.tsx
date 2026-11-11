import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../store/auth';
import { CustomerNavigator } from './CustomerTabs';
import { DeliveryNavigator } from './DeliveryStack';
import { StaffNavigator } from './StaffStack';
import { getStaffMode, setStaffMode, type StaffMode } from '../services/storage';
import { Icon } from '../components/Icon';
import { colors, font, radius, space, type as t } from '../theme/tokens';
import { useSite } from '../store/lang';

/**
 * Role comes ONLY from `/auth/me` (never cached client state) — RootNavigator mounts this
 * component after that call succeeds, so `user` here is always fresh.
 *
 * A staff member is also a customer: the shopkeeper orders his own groceries with the same
 * account. So after logging in they are asked once which side they want, exactly as the website
 * asks at login (`site.auth.choose` / `goPanel` / `goShop`).
 *
 * ⚠️ The answer is REMEMBERED. It used to live in component state, so every single launch
 * started on this screen — two taps before the owner could look at today's orders, fifty times
 * a day. The website asks once and then keeps you in your panel; so does this.
 *
 * Switching sides is in the Menu (staff) and on the account tab (customer), where the website
 * puts it — "ऊपर प्रोफ़ाइल आइकन से कभी भी बदल सकते हैं" — not under a button floating over the shop.
 */
interface AppMode {
  /** null for a plain customer — there is nothing to switch to. */
  mode: StaffMode | null;
  /** Swap sides, or pass null to be asked again. */
  switchTo: (m: StaffMode | null) => void;
  /** True when this account has a staff side at all. */
  canSwitch: boolean;
}

const AppModeContext = createContext<AppMode>({ mode: null, switchTo: () => {}, canSwitch: false });

/** Lets the Menu (staff) and the account tab (customer) offer "open my panel" / "shop as a customer". */
export function useAppMode(): AppMode {
  return useContext(AppModeContext);
}

export function RoleNavigator(): React.JSX.Element | null {
  const site = useSite();
  const { user } = useAuth();
  const [mode, setMode] = useState<StaffMode | null>(null);
  const [restored, setRestored] = useState(false);

  const isStaff = Boolean(user) && user?.role !== 'CUSTOMER';

  useEffect(() => {
    if (!isStaff) {
      setRestored(true);
      return;
    }
    let live = true;
    void getStaffMode().then((m) => {
      if (!live) return;
      setMode(m);
      setRestored(true);
    });
    return () => {
      live = false;
    };
  }, [isStaff]);

  const choose = useCallback((m: StaffMode | null): void => {
    setMode(m);
    void setStaffMode(m);
  }, []);

  const appMode = useMemo<AppMode>(() => ({ mode, switchTo: choose, canSwitch: isStaff }), [mode, choose, isStaff]);

  // Signed out: the shop, not a login wall (§A8.4). It is the SAME component as the one a
  // signed-in customer gets, in the same place, so logging in does not tear the navigator down.
  if (!user) return <CustomerNavigator />;

  // A plain customer has nothing to choose.
  if (user.role === 'CUSTOMER') return <CustomerNavigator />;

  // Wait for the remembered answer rather than flashing the choice screen for a moment.
  if (!restored) return null;

  if (mode === 'customer' || mode === 'staff') {
    return (
      <AppModeContext.Provider value={appMode}>
        {mode === 'customer' ? <CustomerNavigator /> : user.role === 'DELIVERY_BOY' ? <DeliveryNavigator /> : <StaffNavigator />}
      </AppModeContext.Provider>
    );
  }

  const staffHint = user.role === 'DELIVERY_BOY' ? site.auth.goPanelStaff : site.auth.goPanelHint;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.greeting}>{site.auth.welcomeBack(user.name || user.phone)}</Text>
        <Text style={styles.title}>{site.auth.choose}</Text>

        <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={() => choose('staff')}>
          <View style={styles.iconCircle}>
            <Icon name={user.role === 'DELIVERY_BOY' ? 'motorbike' : 'layout-dashboard'} size={22} color={colors.au200} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{site.auth.goPanel}</Text>
            <Text style={styles.cardHelp}>{staffHint}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.ink3} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={() => choose('customer')}>
          <View style={[styles.iconCircle, styles.iconCircleShop]}>
            <Icon name="shopping-bag" size={22} color={colors.em800} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{site.auth.goShop}</Text>
            <Text style={styles.cardHelp}>{site.auth.goShopHint}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.ink3} />
        </Pressable>

        <Text style={styles.foot}>{site.auth.switchAnytime}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: space[5], gap: space[3] },
  greeting: { fontSize: t.body, color: colors.ink2, textAlign: 'center' },
  title: { fontFamily: font.display, fontSize: t.xxl, color: colors.ink, textAlign: 'center', marginBottom: space[2] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[4],
  },
  cardPressed: { backgroundColor: colors.paper2 },
  iconCircle: { height: 46, width: 46, borderRadius: radius.full, backgroundColor: colors.em700, alignItems: 'center', justifyContent: 'center' },
  iconCircleShop: { backgroundColor: colors.au200 },
  cardTitle: { fontSize: t.body, fontFamily: font.bodySemi, color: colors.ink },
  cardHelp: { fontSize: t.base, color: colors.ink3, marginTop: 2 },
  foot: { fontSize: t.sm, color: colors.ink3, textAlign: 'center', marginTop: space[2] },
});
