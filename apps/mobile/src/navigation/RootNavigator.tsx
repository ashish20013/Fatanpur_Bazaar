import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './ref';
import { linking } from './linking';
import { useAuth } from '../store/auth';
import { RoleNavigator } from './RoleNavigator';
import { colors, space, type as t } from '../theme/tokens';
import { useT } from '../store/lang';


export type AuthStackParamList = {
  Phone: undefined;
  Otp: { phone: string; purpose: 'LOGIN' | 'STAFF_LOGIN'; expiresIn: number; resendAfter: number };
};

function Splash(): React.JSX.Element {
  const hi = useT();
  return (
    <View style={styles.splash}>
      <Text style={styles.brand}>{hi.auth.title}</Text>
      <ActivityIndicator color={colors.g700} style={{ marginTop: space[4] }} />
    </View>
  );
}

/**
 * auth state → shop | RoleNavigator (§10). Role is re-verified against the server on every
 * cold start (store/auth.tsx calls /auth/me before flipping to 'authenticated') — this
 * component only reacts to that status, it never makes the decision itself.
 *
 * ⚠️ A signed-out visitor gets the SHOP, not a login wall. §A8.4: "browsing band MAT karo —
 * rok SIRF checkout pe", and the website behaves the same way. Opening on a login form was
 * asking villagers who have never ordered online to hand over a phone number before they had
 * seen a single potato; the auth screens now live inside the customer stack and are pushed at
 * the moment an account is actually needed.
 */
export function RootNavigator(): React.JSX.Element {
  const { status } = useAuth();
  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      {/*
        * ⚠️ ONE tree for guest and signed-in, deliberately.
        *
        * This used to swap <CustomerNavigator/> for <RoleNavigator/> the moment the login
        * succeeded. Two different component types in the same slot means React throws the
        * navigator away and mounts a new one — and NavigationContainer then hands the new
        * navigator back the state it was holding, which still had the OTP screen on top. So the
        * customer typed a correct OTP, the server created their session, and the app put them
        * back on the OTP form with the box cleared. That is the "OTP ke baad aage nahi badhta"
        * report, and no amount of care inside verifyOtp could fix it.
        *
        * RoleNavigator now covers the signed-out case too, so the customer stack stays mounted
        * across login and the OTP screen can simply reset the stack to the shop.
        */}
      {status === 'loading' ? <Splash /> : <RoleNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  brand: { fontSize: t.xxl, fontWeight: '700', color: colors.g700 },
});
