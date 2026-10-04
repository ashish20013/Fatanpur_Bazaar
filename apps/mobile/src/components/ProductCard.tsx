import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ProductCard as ProductCardType } from '@fb/shared-types';
import { colors, radius, shadow1, space, type as t } from '../theme/tokens';
import { Money } from './Money';
import { Button } from './Button';
import { QtyStepper } from './QtyStepper';
import { hi } from '../i18n/hi';

/**
 * §9 product card spec: 1:1 image, discount ribbon, 2-line name, unit, price+strike-MRP,
 * supplier line, full-width action that becomes a qty stepper once it's in the cart.
 */
export function ProductCard({
  product,
  quantityInCart = 0,
  onPress,
  onAdd,
  onQtyChange,
}: {
  product: ProductCardType;
  quantityInCart?: number;
  onPress: () => void;
  onAdd: () => void;
  onQtyChange: (q: number) => void;
}): React.JSX.Element {
  const showRibbon = product.discountPercent > 0;
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.imageWrap}>
        {product.image ? (
          <Image source={{ uri: product.image.urlSm, width: product.image.width, height: product.image.height }} style={styles.image} resizeMode="cover" accessibilityLabel={product.image.alt} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
        {showRibbon ? (
          <View style={styles.ribbon}>
            <Text style={styles.ribbonText}>{product.discountPercent}% छूट</Text>
          </View>
        ) : null}
        {!product.inStock ? (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>{hi.product.outOfStock}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {product.nameHi || product.name}
      </Text>
      <Text style={styles.unit}>
        {product.unitValue} {product.unit}
      </Text>
      <View style={styles.priceRow}>
        <Money value={product.price} size={t.lg} />
        {Number(product.mrp) > Number(product.price) ? <Money value={product.mrp} size={t.sm} color={colors.ink3} strike /> : null}
      </View>
      {product.supplierName ? <Text style={styles.supplier}>{hi.product.supplierPrefix(product.supplierName)}</Text> : null}
      <View style={styles.action}>
        {!product.inStock ? (
          <Button label={hi.product.notifyMe} onPress={onAdd} variant="secondary" size="sm" />
        ) : quantityInCart > 0 ? (
          <QtyStepper quantity={quantityInCart} onChange={onQtyChange} />
        ) : (
          <Button label={hi.product.addToCart} onPress={onAdd} size="sm" />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: space[2], ...shadow1 },
  imageWrap: { aspectRatio: 1, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { backgroundColor: colors.g50 },
  ribbon: { position: 'absolute', top: 6, left: 6, backgroundColor: colors.a100, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  ribbonText: { fontSize: 10, fontWeight: '700', color: colors.a700 },
  outOfStockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(18,33,26,0.45)', alignItems: 'center', justifyContent: 'center' },
  outOfStockText: { color: colors.white, fontSize: t.xs, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: space[2], minHeight: 38 },
  unit: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space[2], marginTop: space[1] },
  supplier: { fontSize: 11, color: colors.ink3, marginTop: 2 },
  action: { marginTop: space[2] },
});
