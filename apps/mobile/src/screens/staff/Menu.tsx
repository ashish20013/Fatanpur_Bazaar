import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Permission } from '@fb/shared-types';
import type { StaffStackParamList } from '../../navigation/StaffStack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../store/auth';
import { useAppMode } from '../../navigation/RoleNavigator';
import { colors, font, radius, space, type as t } from '../../theme/tokens';
import { Icon } from '../../components/Icon';

/**
 * The staff sidebar, as a phone screen.
 *
 * The website shows these as a fixed sidebar on a desktop and "a top bar with a menu drawer"
 * on a phone (apps/web/src/components/admin/StaffNav.tsx). The app keeps the owner's bottom
 * tab bar for the three screens used all day — Dashboard, Orders, Delivery board — and puts
 * everything else here, in the website's own groups and in its own order, with the same
 * English labels and the same icons.
 *
 * ⚠️ Showing a link is not granting access. Every one of these endpoints is gated on the API;
 * this list only hides what a supervisor has no permission for so they are not sent into a 403.
 */
interface StaffLink {
  route: keyof StaffStackParamList;
  label: string;
  icon: string;
  group: string;
  /** Only ADMIN sees it (the website's `adminOnly`). */
  adminOnly?: boolean;
  /**
   * Hidden FROM admin — the website drops /supervisor/riders from an admin's sidebar because the
   * admin takes a rider's cash from the delivery board instead. The page still works for them.
   */
  hideForAdmin?: boolean;
  perm?: Permission;
}

const LINKS: StaffLink[] = [
  { route: 'AdminPayments', label: 'Payments & finance', icon: 'cash-banknote', group: 'Sales', adminOnly: true },
  { route: 'AdminCustomers', label: 'Customers', icon: 'users', group: 'Sales', perm: 'customers.view' },

  { route: 'AdminProducts', label: 'Products', icon: 'basket', group: 'Catalog', adminOnly: true },
  { route: 'AdminCategories', label: 'Categories', icon: 'category', group: 'Catalog', adminOnly: true },
  { route: 'AdminInventory', label: 'Inventory / stock', icon: 'box', group: 'Catalog', perm: 'inventory.manage' },

  { route: 'AdminVillages', label: 'Villages', icon: 'map-pin', group: 'Service area', perm: 'villages.manage' },
  { route: 'AdminServiceArea', label: 'Delivery boundary', icon: 'map-2', group: 'Service area', adminOnly: true },
  { route: 'AdminAreaRequests', label: 'Area requests', icon: 'flag', group: 'Service area', adminOnly: true },

  { route: 'AdminCoupons', label: 'Coupons', icon: 'ticket', group: 'Marketing', adminOnly: true },
  { route: 'AdminBanners', label: 'Banners', icon: 'speakerphone', group: 'Marketing', adminOnly: true },

  { route: 'AdminContent', label: 'Blog, pages & FAQ', icon: 'article', group: 'Content', adminOnly: true },

  { route: 'AdminStaff', label: 'Staff & access', icon: 'users-group', group: 'Team', adminOnly: true },
  { route: 'AdminRiders', label: 'Delivery partners', icon: 'motorbike', group: 'Team', perm: 'staff.manage_riders', hideForAdmin: true },

  { route: 'Reports', label: 'Reports & analytics', icon: 'chart-bar', group: 'System', perm: 'reports.view' },
  { route: 'AdminAudit', label: 'Security / activity log', icon: 'shield-check', group: 'System', adminOnly: true },
  { route: 'AdminSettings', label: 'Settings', icon: 'settings', group: 'System', adminOnly: true },
  { route: 'AdminAlerts', label: 'Alerts & notifications', icon: 'bell', group: 'System', adminOnly: true },
];

export default function StaffMenuScreen(): React.JSX.Element {
  const navigation = useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const { user, logout } = useAuth();
  const { switchTo } = useAppMode();
  const isAdmin = user?.role === 'ADMIN';
  const perms = new Set(user?.permissions ?? []);

  const visible = LINKS.filter((l) => (l.adminOnly ? isAdmin : isAdmin || !l.perm || perms.has(l.perm))).filter((l) => !(isAdmin && l.hideForAdmin));
  const groups = [...new Set(visible.map((l) => l.group))];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <View style={styles.who}>
        <Text style={styles.whoName}>{user?.name || user?.phone}</Text>
        <Text style={styles.whoRole}>{user?.role}</Text>
      </View>

      {groups.map((g) => (
        <View key={g} style={styles.group}>
          <Text style={styles.groupTitle}>{g.toUpperCase()}</Text>
          <View style={styles.list}>
            {visible
              .filter((l) => l.group === g)
              .map((l) => (
                <Pressable key={l.route} style={styles.item} onPress={() => navigation.navigate(l.route)}>
                  <Icon name={l.icon} size={18} color={colors.em700} />
                  <Text style={styles.itemLabel}>{l.label}</Text>
                  <Icon name="chevron-right" size={16} color={colors.ink3} />
                </Pressable>
              ))}
          </View>
        </View>
      ))}

      {/* The website's sidebar foot has a "Store" link beside Log out — the shopkeeper buys
          his own groceries with the same account. */}
      <Pressable style={styles.shop} onPress={() => switchTo('customer')}>
        <Icon name="building-store" size={16} color={colors.em700} />
        <Text style={styles.shopText}>Shop as a customer</Text>
      </Pressable>

      <Pressable style={styles.logout} onPress={() => void logout()}>
        <Icon name="logout" size={16} color={colors.danger} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { padding: space[4], paddingBottom: space[10], gap: space[5] },
  who: { gap: 2 },
  whoName: { fontFamily: font.display, fontSize: t.lg, color: colors.ink },
  whoRole: { fontSize: t.xs, color: colors.ink3, letterSpacing: 1 },
  group: { gap: 6 },
  groupTitle: { fontSize: 11, letterSpacing: 1.4, color: colors.au800, fontFamily: font.bodySemi },
  list: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    height: 50,
    paddingHorizontal: space[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  itemLabel: { flex: 1, fontSize: t.body, color: colors.ink },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    height: 46,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.card,
  },
  logoutText: { color: colors.danger, fontFamily: font.bodySemi, fontSize: t.base },
  shop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    height: 46,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.card,
  },
  shopText: { color: colors.em800, fontFamily: font.bodySemi, fontSize: t.base },
});
