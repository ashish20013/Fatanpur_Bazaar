import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { Permission } from '@fb/shared-types';
import { colors, layout } from '../theme/tokens';
import { hi } from '../i18n/hi';
import { useAuth } from '../store/auth';
import { EmptyState } from '../components/EmptyState';

import DashboardScreen from '../screens/staff/Dashboard';
import OrdersScreen from '../screens/staff/Orders';
import DeliveryBoardScreen from '../screens/staff/DeliveryBoard';
import ReportsScreen from '../screens/staff/Reports';

export type StaffTabParamList = {
  Dashboard: undefined;
  Orders: undefined;
  DeliveryBoard: undefined;
  Reports: undefined;
};

const Tab = createBottomTabNavigator<StaffTabParamList>();

function icon(emoji: string) {
  return ({ focused }: { focused: boolean }): React.JSX.Element => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
}

/**
 * Every tab here mirrors a server-side permission check — the UI only HIDES what a
 * SUPERVISOR lacks (§10: "sirf jo permissions me hai — UI permission se render ho");
 * the API is the real gate regardless of what this file decides to show.
 */
const TABS: { name: keyof StaffTabParamList; component: React.ComponentType; title: string; icon: string; needs: Permission }[] = [
  { name: 'Dashboard', component: DashboardScreen, title: hi.nav.dashboard, icon: '📊', needs: 'reports.view' },
  { name: 'Orders', component: OrdersScreen, title: hi.nav.orders, icon: '📦', needs: 'orders.view_all' },
  { name: 'DeliveryBoard', component: DeliveryBoardScreen, title: hi.nav.deliveryBoard, icon: '🏍️', needs: 'delivery.track' },
  { name: 'Reports', component: ReportsScreen, title: hi.nav.reports, icon: '📈', needs: 'reports.view' },
];

/** Everything ADMIN/SUPERVISOR can reach from the phone. Mounted only for those two roles. */
export function StaffNavigator(): React.JSX.Element {
  const { user } = useAuth();
  const perms = new Set(user?.permissions ?? []);
  const visible = user?.role === 'ADMIN' ? TABS : TABS.filter((tconf) => perms.has(tconf.needs));

  if (visible.length === 0) {
    return <EmptyState icon="🔒" title={hi.staff.noPermission} />;
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink,
        tabBarActiveTintColor: colors.g700,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { height: layout.bottomNavH + 8, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {visible.map((tconf) => (
        <Tab.Screen key={tconf.name} name={tconf.name} component={tconf.component} options={{ title: tconf.title, tabBarIcon: icon(tconf.icon) }} />
      ))}
    </Tab.Navigator>
  );
}
