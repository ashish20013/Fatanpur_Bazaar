import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, layout } from '../theme/tokens';
import { hi } from '../i18n/hi';

import DashboardScreen from '../screens/delivery/Dashboard';
import AssignedOrdersScreen from '../screens/delivery/AssignedOrders';
import OrderDetailScreen from '../screens/delivery/OrderDetail';
import NavigateScreen from '../screens/delivery/Navigate';
import StartDeliveryScreen from '../screens/delivery/StartDelivery';
import LiveLocationScreen from '../screens/delivery/LiveLocation';
import CompleteDeliveryScreen from '../screens/delivery/CompleteDelivery';
import HistoryScreen from '../screens/delivery/History';
import EarningsScreen from '../screens/delivery/Earnings';

export type DeliveryStackParamList = {
  Tabs: undefined;
  OrderDetail: { assignmentId: number };
  Navigate: { lat: number | null; lng: number | null; address: string };
  StartDelivery: { assignmentId: number };
  LiveLocation: { assignmentId: number; orderNumber: string };
  CompleteDelivery: { assignmentId: number; orderNumber: string };
};
export type DeliveryTabParamList = {
  Dashboard: undefined;
  Assigned: undefined;
  History: undefined;
  Earnings: undefined;
};

const Tab = createBottomTabNavigator<DeliveryTabParamList>();
const Stack = createNativeStackNavigator<DeliveryStackParamList>();

function icon(emoji: string) {
  return ({ focused }: { focused: boolean }): React.JSX.Element => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
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
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: hi.nav.dashboard, tabBarIcon: icon('🏍️') }} />
      <Tab.Screen name="Assigned" component={AssignedOrdersScreen} options={{ title: hi.nav.assigned, tabBarIcon: icon('📦') }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: hi.nav.history, tabBarIcon: icon('🕒') }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} options={{ title: hi.nav.earnings, tabBarIcon: icon('💰') }} />
    </Tab.Navigator>
  );
}

/** Everything a DELIVERY_BOY can reach. Mounted only when role === DELIVERY_BOY. */
export function DeliveryNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.ink, headerTitleStyle: { fontSize: 16 } }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: hi.orders.viewDetail }} />
      <Stack.Screen name="Navigate" component={NavigateScreen} options={{ title: hi.delivery.navigate }} />
      <Stack.Screen name="StartDelivery" component={StartDeliveryScreen} options={{ title: hi.delivery.startDelivery }} />
      <Stack.Screen name="LiveLocation" component={LiveLocationScreen} options={{ title: hi.tracking.title }} />
      <Stack.Screen name="CompleteDelivery" component={CompleteDeliveryScreen} options={{ title: hi.delivery.complete }} />
    </Stack.Navigator>
  );
}
