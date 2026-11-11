import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api } from '../../services/api';
import { useAuth } from '../../store/auth';
import { AddressForm } from '../../components/AddressForm';
import { colors, font, space, type as t } from '../../theme/tokens';
import { useSite } from '../../store/lang';

interface AddressRow {
  id: number;
}

/**
 * The one screen a brand-new customer sees after their first OTP: "where should we bring it?"
 *
 * ⚠️ It is shown by DATA, not by a flag. `justRegistered` only says the account was created on
 * this login; what actually decides is whether the person has an address on file. That matters
 * because the website and the app are one shop: somebody who signed up on fatanpurbazaar.com
 * months ago, with their name and address already saved, must NEVER be asked to type them again
 * when they open the app — they are not a new customer, whatever route they arrived by. So this
 * screen asks the server first and steps out of the way if an address comes back.
 *
 * It is also skippable. §A8.4's rule is that browsing is never gated; a first-time visitor who
 * wants to look at the shop before giving an address may do so, and checkout will ask again.
 */
export default function SetupScreen({ navigation }: NativeStackScreenProps<CustomerStackParamList, 'Setup'>): React.JSX.Element {
  const site = useSite();
  const { user, clearJustRegistered } = useAuth();
  const [checking, setChecking] = useState(true);

  const done = (): void => {
    clearJustRegistered();
    navigation.replace('Tabs');
  };

  useEffect(() => {
    let live = true;
    void api
      .get<AddressRow[]>('/users/me/addresses')
      .then((rows) => {
        if (!live) return;
        // Already a customer of this shop — straight to the goods.
        if (rows.length > 0) done();
        else setChecking(false);
      })
      .catch(() => {
        // Could not ask (bad network). Showing the form is the safe side: it saves to the server,
        // which refuses a duplicate anyway, and the person can skip it.
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.em700} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <Text style={styles.title}>{site.auth.newUser}</Text>
        <Text style={styles.sub}>{user?.name ? site.auth.welcomeBack(user.name) : site.addr2.step2}</Text>
        <Text style={styles.lead}>{site.addr2.villageHint}</Text>
        <Pressable onPress={done} hitSlop={8} style={styles.skip}>
          <Text style={styles.skipText}>{site.common.later}</Text>
        </Pressable>
      </View>
      <AddressForm onSaved={done} onCancel={done} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  head: { paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[2] },
  title: { fontFamily: font.display, fontSize: t.xxl, color: colors.ink },
  sub: { fontSize: t.body, color: colors.ink2, marginTop: 2 },
  lead: { fontSize: t.base, color: colors.ink3, marginTop: space[2] },
  skip: { alignSelf: 'flex-start', marginTop: space[3] },
  skipText: { color: colors.em700, fontFamily: font.bodySemi, fontSize: t.body },
});
