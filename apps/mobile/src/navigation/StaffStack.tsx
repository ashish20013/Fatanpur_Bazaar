import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Permission } from '@fb/shared-types';
import { colors } from '../theme/tokens';
import { useTabBarStyle } from './useTabBarStyle';
import { useAuth } from '../store/auth';
import { Icon } from '../components/Icon';

import DashboardScreen from '../screens/staff/Dashboard';
import OrdersScreen from '../screens/staff/Orders';
import DeliveryBoardScreen from '../screens/staff/DeliveryBoard';
import ReportsScreen from '../screens/staff/Reports';
import MenuScreen from '../screens/staff/Menu';

import AdminPaymentsScreen from '../screens/staff/AdminPayments';
import AdminCustomersScreen from '../screens/staff/AdminCustomers';
import AdminProductsScreen from '../screens/staff/AdminProducts';
import AdminCategoriesScreen from '../screens/staff/AdminCategories';
import AdminInventoryScreen from '../screens/staff/AdminInventory';
import AdminVillagesScreen from '../screens/staff/AdminVillages';
import AdminServiceAreaScreen from '../screens/staff/AdminServiceArea';
import AdminAreaRequestsScreen from '../screens/staff/AdminAreaRequests';
import AdminCouponsScreen from '../screens/staff/AdminCoupons';
import AdminBannersScreen from '../screens/staff/AdminBanners';
import AdminContentScreen from '../screens/staff/AdminContent';
import AdminStaffScreen from '../screens/staff/AdminStaff';
import AdminRidersScreen from '../screens/staff/AdminRiders';
import AdminAuditScreen from '../screens/staff/AdminAudit';
import AdminSettingsScreen from '../screens/staff/AdminSettings';
import AdminAlertsScreen from '../screens/staff/AdminAlerts';

/**
 * The staff side of the app, shaped like the website's `(app)/layout.tsx`.
 *
 * The site draws a 19-link sidebar on a desktop and the same list in a drawer on a phone. A
 * phone has no room for nineteen tabs, so the three screens the shop lives in all day sit on
 * the tab bar and the rest are pushed from the Menu tab — the same links, the same groups, the
 * same order, the same English labels.
 *
 * ⚠️ Every route here is also gated on the API. Hiding a tab is a courtesy so a supervisor is
 * not walked into a 403; it is not the access control.
 */
export type StaffStackParamList = {
  StaffTabs: undefined;
  Reports: undefined;
  AdminPayments: undefined;
  AdminCustomers: undefined;
  AdminProducts: undefined;
  AdminCategories: undefined;
  AdminInventory: undefined;
  AdminVillages: undefined;
  AdminServiceArea: undefined;
  AdminAreaRequests: undefined;
  AdminCoupons: undefined;
  AdminBanners: undefined;
  AdminContent: undefined;
  AdminStaff: undefined;
  AdminRiders: undefined;
  AdminAudit: undefined;
  AdminSettings: undefined;
  AdminAlerts: undefined;
};

export type StaffTabParamList = {
  Dashboard: undefined;
  Orders: undefined;
  DeliveryBoard: undefined;
  Menu: undefined;
};

const Tab = createBottomTabNavigator<StaffTabParamList>();
const Stack = createNativeStackNavigator<StaffStackParamList>();

function tabIcon(name: string) {
  return ({ focused, color }: { focused: boolean; color: string }): React.JSX.Element => (
    <Icon name={name} size={22} color={color} stroke={focused ? 2 : 1.6} />
  );
}

/**
 * `needs` mirrors the website's own `perm` on each nav link, so the phone hides exactly what
 * the sidebar hides. Dashboard and Menu carry no permission — the site shows Dashboard to every
 * staff member, and Menu filters itself link by link.
 */
const TABS: { name: keyof StaffTabParamList; component: React.ComponentType; title: string; icon: string; needs?: Permission }[] = [
  { name: 'Dashboard', component: DashboardScreen, title: 'Dashboard', icon: 'layout-dashboard' },
  { name: 'Orders', component: OrdersScreen, title: 'Orders', icon: 'package', needs: 'orders.view_all' },
  { name: 'DeliveryBoard', component: DeliveryBoardScreen, title: 'Delivery', icon: 'truck-delivery', needs: 'delivery.assign' },
  { name: 'Menu', component: MenuScreen, title: 'Menu', icon: 'menu-2' },
];

function StaffTabs(): React.JSX.Element {
  const { user } = useAuth();
  const tabBarStyle = useTabBarStyle();
  const perms = new Set(user?.permissions ?? []);
  const visible = user?.role === 'ADMIN' ? TABS : TABS.filter((c) => !c.needs || perms.has(c.needs));

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.em700,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {visible.map((c) => (
        <Tab.Screen key={c.name} name={c.name} component={c.component} options={{ title: c.title, tabBarIcon: tabIcon(c.icon) }} />
      ))}
    </Tab.Navigator>
  );
}

/** The pushed pages, in the website's sidebar order. */
const PAGES: { name: keyof StaffStackParamList; component: React.ComponentType; title: string }[] = [
  { name: 'AdminPayments', component: AdminPaymentsScreen, title: 'Payments & finance' },
  { name: 'AdminCustomers', component: AdminCustomersScreen, title: 'Customers' },
  { name: 'AdminProducts', component: AdminProductsScreen, title: 'Products' },
  { name: 'AdminCategories', component: AdminCategoriesScreen, title: 'Categories' },
  { name: 'AdminInventory', component: AdminInventoryScreen, title: 'Inventory / stock' },
  { name: 'AdminVillages', component: AdminVillagesScreen, title: 'Villages' },
  { name: 'AdminServiceArea', component: AdminServiceAreaScreen, title: 'Delivery boundary' },
  { name: 'AdminAreaRequests', component: AdminAreaRequestsScreen, title: 'Area requests' },
  { name: 'AdminCoupons', component: AdminCouponsScreen, title: 'Coupons' },
  { name: 'AdminBanners', component: AdminBannersScreen, title: 'Banners' },
  { name: 'AdminContent', component: AdminContentScreen, title: 'Blog, pages & FAQ' },
  { name: 'AdminStaff', component: AdminStaffScreen, title: 'Staff & access' },
  { name: 'AdminRiders', component: AdminRidersScreen, title: 'Delivery partners' },
  { name: 'Reports', component: ReportsScreen, title: 'Reports & analytics' },
  { name: 'AdminAudit', component: AdminAuditScreen, title: 'Security / activity log' },
  { name: 'AdminSettings', component: AdminSettingsScreen, title: 'Settings' },
  { name: 'AdminAlerts', component: AdminAlertsScreen, title: 'Alerts & notifications' },
];

/** Everything ADMIN/SUPERVISOR can reach from the phone. Mounted only for those two roles. */
export function StaffNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontSize: 16 },
      }}
    >
      <Stack.Screen name="StaffTabs" component={StaffTabs} options={{ headerShown: false }} />
      {PAGES.map((p) => (
        <Stack.Screen key={p.name} name={p.name} component={p.component} options={{ title: p.title }} />
      ))}
    </Stack.Navigator>
  );
}
