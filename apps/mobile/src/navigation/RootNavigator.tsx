import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../store/auth';
import { RoleNavigator } from './RoleNavigator';
import { colors, space, type as t } from '../theme/tokens';
import { hi } from '../i18n/hi';

import PhoneScreen from '../screens/auth/Phone';
import OtpScreen from '../screens/auth/Otp';

export type AuthStackParamList = {
  Phone: undefined;
  Otp: { phone: string; purpose: 'LOGIN' | 'STAFF_LOGIN'; expiresIn: number; resendAfter: number };
};
const Stack = createNativeStackNavigator<AuthStackParamList>();

function AuthStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Phone" component={PhoneScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
    </Stack.Navigator>
  );
}

function Splash(): React.JSX.Element {
  return (
    <View style={styles.splash}>
      <Text style={styles.brand}>{hi.auth.title}</Text>
      <ActivityIndicator color={colors.g700} style={{ marginTop: space[4] }} />
    </View>
  );
}

/**
 * auth state → Auth stack | RoleNavigator (§10). Role is re-verified against the server on
 * every cold start (store/auth.tsx calls /auth/me before flipping to 'authenticated') — this
 * component only reacts to that status, it never makes the decision itself.
 */
export function RootNavigator(): React.JSX.Element {
  const { status } = useAuth();
  return (
    <NavigationContainer>
      {status === 'loading' ? <Splash /> : status === 'authenticated' ? <RoleNavigator /> : <AuthStack />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  brand: { fontSize: t.xxl, fontWeight: '700', color: colors.g700 },
});
