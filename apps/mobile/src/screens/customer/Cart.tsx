import React, { useEffect } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CartItemView, CartWarningCode } from '@fb/shared-types';
import type { CustomerStackParamList, CustomerTabParamList } from '../../navigation/CustomerTabs';
import { useCart } from '../../store/cart';
import { Money } from '../../components/Money';
import { Button } from '../../components/Button';
import { QtyStepper } from '../../components/QtyStepper';
import { EmptyState } from '../../components/EmptyState';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabParamList, 'Cart'>, NativeStackScreenProps<CustomerStackParamList>>;

const WARNING_TEXT: Record<CartWarningCode, string> = {
  PRICE_CHANGED: hi.cart.priceChanged,
  STOCK_LOW: hi.cart.stockLow,
  UNAVAILABLE: hi.cart.unavailable,
  VERTICAL_OFF: hi.cart.verticalOff,
};

export default function CartScreen({ navigation }: Props): React.JSX.Element {
  const { cart, loading, refresh, setQty, removeItem } = useCart();

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => void refresh());
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  if (loading && !cart) {
    return (
      <FlatList data={[1, 2, 3]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} contentContainerStyle={{ paddingTop: space[2] }} />
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState icon="🛒" title={hi.cart.empty} help={hi.cart.emptyHelp} actionLabel={hi.cart.browse} onAction={() => navigation.navigate('Categories')} />
    );
  }

  const itemIssues = (item: CartItemView): string[] => item.issues.map((code) => WARNING_TEXT[code]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={cart.items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: space[4], gap: space[3] }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.image ? <Image source={{ uri: item.image }} style={styles.image} /> : <View style={[styles.image, styles.imagePlaceholder]} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>
                {item.nameHi || item.name}
              </Text>
              <Text style={styles.unit}>{item.unit}</Text>
              <Money value={item.lineTotal} size={t.md} />
              {itemIssues(item).map((msg) => (
                <Text key={msg} style={styles.issue}>
                  ⚠️ {msg}
                </Text>
              ))}
            </View>
            <View style={styles.actions}>
              <QtyStepper quantity={item.quantity} onChange={(q) => (q <= 0 ? void removeItem(item.id) : void setQty(item.id, q))} />
              <Pressable onPress={() => void removeItem(item.id)} hitSlop={8}>
                <Text style={styles.remove}>{hi.cart.remove}</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListHeaderComponent={
          cart.needsPrescription ? (
            <View style={styles.rxBanner}>
              <Text style={styles.rxText}>💊 {hi.cart.needsPrescription}</Text>
            </View>
          ) : null
        }
      />
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{hi.cart.itemsTotal}</Text>
          <Money value={cart.itemsTotal} size={t.lg} />
        </View>
        <Button label={hi.cart.checkout(cart.itemCount)} onPress={() => navigation.navigate('Checkout')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: space[3], backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  image: { width: 64, height: 64, borderRadius: radius.sm },
  imagePlaceholder: { backgroundColor: colors.g50 },
  name: { fontSize: t.base, fontWeight: '600', color: colors.ink },
  unit: { fontSize: t.xs, color: colors.ink3, marginTop: 2, marginBottom: 4 },
  issue: { fontSize: t.xs, color: colors.warn, marginTop: 2 },
  actions: { alignItems: 'flex-end', gap: space[2], justifyContent: 'space-between' },
  remove: { fontSize: t.xs, color: colors.danger, fontWeight: '600' },
  rxBanner: { backgroundColor: colors.a100, borderRadius: radius.md, padding: space[3], marginBottom: space[3] },
  rxText: { color: colors.a700, fontWeight: '600', fontSize: t.sm },
  footer: { padding: space[4], backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, gap: space[3] },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: t.base, color: colors.ink2, fontWeight: '600' },
});
