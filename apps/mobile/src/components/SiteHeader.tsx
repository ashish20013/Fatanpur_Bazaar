import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, space, type as t } from '../theme/tokens';
import { useSite } from '../store/lang';
import { Icon } from './Icon';
import { LangToggle } from './LangToggle';

/**
 * The site's header, as it is on a phone (apps/web/src/components/Header.tsx):
 *
 *   [ wordmark ]   [ 🛵 … में डिलीवरी / 📍 अपना पता चुनें ▾ ]   [ 🛍 n ] [ 👤 ]
 *   [ 🔍 जो सामान खरीदना है, यहाँ खोजें                                  ]
 *
 * The emerald band and the gold wordmark are the logo's own colours. The band is the first
 * thing a customer sees, so it says the two things that decide whether they can order at all:
 * where we are delivering, and how long it takes.
 */
export function SiteHeader({
  addressLabel,
  deliveryWindow,
  cartCount,
  onPressAddress,
  onPressSearch,
  onPressBag,
  onPressProfile,
}: {
  addressLabel: string | null;
  deliveryWindow: string;
  cartCount: number;
  onPressAddress: () => void;
  onPressSearch: () => void;
  onPressBag: () => void;
  onPressProfile: () => void;
}): React.JSX.Element {
  const site = useSite();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.band, { paddingTop: insets.top + space[1] }]}>
      <View style={styles.row}>
        <Text style={styles.wordmark} numberOfLines={1}>
          {site.brand.name}
        </Text>

        <Pressable style={styles.address} onPress={onPressAddress} accessibilityRole="button">
          <View style={styles.addressTop}>
            <Icon name="scooter" size={14} color={colors.au300} />
            <Text style={styles.addressWindow} numberOfLines={1}>
              {site.header.deliveryIn(deliveryWindow)}
            </Text>
          </View>
          <View style={styles.addressBottom}>
            <Icon name="map-pin" size={16} color={colors.au300} />
            <Text style={styles.addressLabel} numberOfLines={1}>
              {addressLabel ?? site.header.chooseAddress}
            </Text>
            <Icon name="chevron-down" size={16} color={colors.au300} />
          </View>
        </Pressable>

        <Pressable style={styles.circle} onPress={onPressBag} accessibilityLabel={site.header.bag} accessibilityRole="button">
          <Icon name="shopping-bag" size={20} color={colors.au200} />
          {cartCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable style={styles.circle} onPress={onPressProfile} accessibilityLabel={site.nav.myAccount} accessibilityRole="button">
          <Icon name="user-circle" size={20} color={colors.au200} />
        </Pressable>
      </View>

      {/* Search and the language pill share a row, exactly as on the site's header: a shopper
          who opened the app in the wrong language finds the switch where they are already
          looking, instead of hunting through the account tab for it. */}
      <View style={styles.searchRow}>
        <Pressable style={styles.search} onPress={onPressSearch} accessibilityRole="search">
          <Icon name="search" size={18} color={colors.ink3} />
          <Text style={styles.searchText} numberOfLines={1}>
            {site.header.searchPlaceholder}
          </Text>
        </Pressable>
        <LangToggle />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.band, paddingHorizontal: space[3], paddingBottom: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  wordmark: { fontFamily: font.display, fontSize: 20, color: colors.au200, letterSpacing: 0.2 },
  address: { flex: 1, minWidth: 0, paddingHorizontal: space[1], paddingVertical: 2 },
  addressTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressWindow: { fontFamily: font.bodySemi, fontSize: t.xs, color: colors.au300 },
  addressBottom: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressLabel: { flex: 1, fontFamily: font.bodySemi, fontSize: 15, color: '#fffaf0' },
  circle: {
    height: 40,
    width: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(226,197,120,0.6)',
    backgroundColor: 'rgba(18,48,34,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    backgroundColor: colors.au400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: font.bodySemi, fontSize: 11, color: colors.em900, lineHeight: 13 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[2] },
  search: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.card,
  },
  searchText: { flex: 1, fontSize: t.body, color: colors.ink3 },
});
