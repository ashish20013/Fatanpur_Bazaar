import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, layout } from '../theme/tokens';
import { hi } from '../i18n/hi';
import { useCart } from '../store/cart';

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

export type CustomerStackParamList = {
  Tabs: undefined;
  Categories: undefined;
  Search: undefined;
  Product: { slug: string };
  Service: { slug: string };
  Checkout: undefined;
  OrderTracking: { orderNumber: string };
  Wallet: undefined;
  Prescriptions: undefined;
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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.g700,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { height: layout.bottomNavH + 8, paddingBottom: 8, paddingTop: 6 },
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
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.ink, headerTitleStyle: { fontSize: 16 } }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Categories" component={CategoriesScreen} options={{ title: hi.nav.categories }} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: hi.nav.search }} />
      <Stack.Screen name="Product" component={ProductScreen} options={{ title: '' }} />
      <Stack.Screen name="Service" component={ServiceScreen} options={{ title: '' }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: hi.checkout.title }} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} options={{ title: hi.tracking.title }} />
      <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: hi.wallet.title }} />
      <Stack.Screen name="Prescriptions" component={PrescriptionsScreen} options={{ title: hi.prescriptions.title }} />
    </Stack.Navigator>
  );
}
