import React from 'react';
import { Text, View } from 'react-native';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/tokens';
import { useTabBarStyle } from './useTabBarStyle';
import { useT } from '../store/lang';
import { useCart } from '../store/cart';
import { useAuth } from '../store/auth';
import { BagBar } from '../components/BagBar';

import HomeScreen from '../screens/customer/Home';
import CategoriesScreen from '../screens/customer/Categories';
import SearchScreen from '../screens/customer/Search';
import ProductScreen from '../screens/customer/Product';
import ServiceScreen from '../screens/customer/Service';
import CartScreen from '../screens/customer/Cart';
import CheckoutScreen from '../screens/customer/Checkout';
import OrdersScreen from '../screens/customer/Orders';
import OrderTrackingScreen from '../screens/customer/OrderTracking';
import WalletScreen from '../screens/customer/Wallet';
import PrescriptionsScreen from '../screens/customer/Prescriptions';
import ProfileScreen from '../screens/customer/Profile';
// FIX H2: Add Notifications screen
import NotificationsScreen from '../screens/customer/Notifications';
import SetupScreen from '../screens/customer/Setup';
import PhoneScreen from '../screens/auth/Phone';
import OtpScreen from '../screens/auth/Otp';

export type CustomerStackParamList = {
  /** Reached only when a guest tries to do something that needs an account. */
  Phone: undefined;
  Otp: { phone: string; purpose: 'LOGIN' | 'STAFF_LOGIN'; expiresIn: number; resendAfter: number };
  /** First OTP of a brand-new account: "where should we bring it?" (skippable). */
  Setup: undefined;
  Tabs: NavigatorScreenParams<CustomerTabParamList> | undefined;
  /** `slug` opens that category's products directly — the rail and every section head do this. */
  Categories: { slug?: string } | undefined;
  Search: undefined;
  Product: { slug: string };
  Service: { slug: string };
  Checkout: undefined;
  OrderTracking: { orderNumber: string };
  Wallet: undefined;
  Prescriptions: undefined;
  // FIX H2: Notifications route
  Notifications: undefined;
};
export type CustomerTabParamList = {
  Home: undefined;
  Cart: undefined;
  Orders: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<CustomerTabParamList>();
const Stack = createNativeStackNavigator<CustomerStackParamList>();

function icon(emoji: string) {
  return ({ focused }: { focused: boolean }): React.JSX.Element => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
}

function CartTabIcon({ focused }: { focused: boolean }): React.JSX.Element {
  const { itemCount } = useCart();
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>
      🛒{itemCount > 0 ? ` ${itemCount}` : ''}
    </Text>
  );
}

function Tabs(): React.JSX.Element {
  const hi = useT();
  const tabBarStyle = useTabBarStyle();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.g700,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: hi.nav.home, tabBarIcon: icon('🏠') }} />
      <Tab.Screen name="Cart" component={CartScreen} options={{ title: hi.nav.cart, tabBarIcon: CartTabIcon }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: hi.nav.orders, tabBarIcon: icon('📦') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: hi.nav.profile, tabBarIcon: icon('👤') }} />
    </Tab.Navigator>
  );
}

/** Everything a CUSTOMER can reach. Mounted only when role === CUSTOMER (see RoleNavigator). */
export function CustomerNavigator(): React.JSX.Element {
  const hi = useT();
  /*
   * A brand-new account opens on the address screen; everyone else opens on the shop.
   *
   * `initialRouteName` is read once, when the navigator mounts — and this navigator mounts fresh
   * immediately after login, because RootNavigator swaps the guest stack for RoleNavigator. That
   * is exactly the moment the decision has to be made, so this is the right place for it.
   */
  const { justRegistered } = useAuth();
  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        initialRouteName={justRegistered ? 'Setup' : 'Tabs'}
        screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.ink, headerTitleStyle: { fontSize: 16 } }}
      >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Setup" component={SetupScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Phone" component={PhoneScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Otp" component={OtpScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Categories" component={CategoriesScreen} options={{ title: hi.nav.categories }} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: hi.nav.search }} />
      <Stack.Screen name="Product" component={ProductScreen} options={{ title: '' }} />
      <Stack.Screen name="Service" component={ServiceScreen} options={{ title: '' }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: hi.checkout.title }} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} options={{ title: hi.tracking.title }} />
      <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: hi.wallet.title }} />
      <Stack.Screen name="Prescriptions" component={PrescriptionsScreen} options={{ title: hi.prescriptions.title }} />
      {/* FIX H2: Notifications screen added to stack */}
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: hi.notifications.title }} />
      </Stack.Navigator>

      {/* Mounted ONCE over the whole stack, like the website's shell does it — one bar that knows
          which screen is on top, not a copy pasted into every screen. */}
      <BagBar />
    </View>
  );
}
