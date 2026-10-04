import React, { useEffect, useState } from 'react';
import { FlatList, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProductDetail } from '@fb/shared-types';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api, ApiError } from '../../services/api';
import { useCart } from '../../store/cart';
import { Money } from '../../components/Money';
import { Button } from '../../components/Button';
import { QtyStepper } from '../../components/QtyStepper';
import { Input } from '../../components/Input';
import { ProductCard } from '../../components/ProductCard';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/EmptyState';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

interface Review {
  id: number;
  rating: number;
  comment: string | null;
  customerName: string;
  createdAt: string;
}

export default function ProductScreen({ route, navigation }: NativeStackScreenProps<CustomerStackParamList, 'Product'>): React.JSX.Element {
  const { slug } = route.params;
  const { cart, addItem, setQty } = useCart();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifyPhone, setNotifyPhone] = useState('');
  const [notified, setNotified] = useState(false);

  useEffect(() => {
    setProduct(null);
    setError(null);
    api
      .get<ProductDetail>(`/catalog/products/${slug}`)
      .then((p) => {
        setProduct(p);
        navigation.setOptions({ title: p.nameHi || p.name });
        return api.get<Review[]>(`/catalog/products/${p.id}/reviews`);
      })
      .then(setReviews)
      .catch((e) => setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const cartItem = product ? cart?.items.find((i) => i.productId === product.id) : undefined;

  const notifyMe = async (): Promise<void> => {
    if (!product || !/^[6-9]\d{9}$/.test(notifyPhone)) return;
    try {
      await api.post(`/catalog/products/${product.id}/notify`, { phone: notifyPhone });
      setNotified(true);
    } catch {
      // stock alert is a courtesy feature — a failure here should never block browsing
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => navigation.replace('Product', { slug })} />;
  if (!product) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
        <Skeleton height={260} radius={radius.md} />
        <View style={{ height: space[4] }} />
        <Skeleton width="70%" height={20} />
        <View style={{ height: space[2] }} />
        <Skeleton width="40%" height={16} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView>
        <FlatList
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          data={product.images.length ? product.images : product.image ? [product.image] : []}
          keyExtractor={(img, i) => `${img.url}-${i}`}
          renderItem={({ item }) => <Image source={{ uri: item.url, width: item.width, height: item.height }} style={styles.image} resizeMode="cover" accessibilityLabel={item.alt} />}
          ListEmptyComponent={<View style={[styles.image, styles.imagePlaceholder]} />}
        />

        <View style={styles.body}>
          <Text style={styles.name}>{product.nameHi || product.name}</Text>
          <Text style={styles.unit}>
            {product.unitValue} {product.unit}
          </Text>
          {product.supplier ? <Text style={styles.supplier}>{hi.product.supplierPrefix(product.supplier.name)}</Text> : null}

          <View style={styles.priceRow}>
            <Money value={product.price} size={t.xxl} />
            {Number(product.mrp) > Number(product.price) ? <Money value={product.mrp} size={t.md} color={colors.ink3} strike /> : null}
            {product.discountPercent > 0 ? <Text style={styles.discountTag}>{product.discountPercent}% छूट</Text> : null}
          </View>

          {product.prescriptionRequired ? <Text style={styles.rxNote}>💊 {hi.product.prescriptionNeeded}</Text> : null}

          <View style={styles.actionRow}>
            {!product.inStock ? (
              notified ? (
                <Text style={styles.notifiedText}>✅ {hi.product.notified}</Text>
              ) : (
                <View style={{ flex: 1, gap: space[2] }}>
                  <Text style={styles.outOfStockLabel}>{hi.product.outOfStock}</Text>
                  <View style={styles.notifyRow}>
                    <View style={{ flex: 1 }}>
                      <Input value={notifyPhone} onChangeText={(v) => setNotifyPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder={hi.auth.phonePlaceholder} keyboardType="number-pad" maxLength={10} />
                    </View>
                    <Button label={hi.product.notifyMe} onPress={() => void notifyMe()} size="sm" fullWidth={false} />
                  </View>
                </View>
              )
            ) : cartItem ? (
              <QtyStepper quantity={cartItem.quantity} onChange={(q) => void setQty(cartItem.id, q)} />
            ) : (
              <Button label={hi.product.addToCart} onPress={() => void addItem(product.id, 1)} />
            )}
          </View>

          {product.description || product.descriptionHi ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{hi.product.description}</Text>
              <Text style={styles.description}>{product.descriptionHi || product.description}</Text>
            </View>
          ) : null}

          {product.related.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{hi.product.related}</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={product.related}
                keyExtractor={(p) => String(p.id)}
                contentContainerStyle={{ gap: space[3] }}
                renderItem={({ item }) => (
                  <View style={{ width: 140 }}>
                    <ProductCard product={item} onPress={() => navigation.push('Product', { slug: item.slug })} onAdd={() => void addItem(item.id, 1)} onQtyChange={() => undefined} />
                  </View>
                )}
              />
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{hi.product.reviews}</Text>
            {reviews === null ? (
              <Skeleton width="100%" height={48} />
            ) : reviews.length === 0 ? (
              <Text style={styles.noReviews}>{hi.product.noReviews}</Text>
            ) : (
              reviews.map((r) => (
                <View key={r.id} style={styles.reviewRow}>
                  <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                  <Text style={styles.reviewAuthor}>{r.customerName}</Text>
                  {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const IMG_W = 360;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  image: { width: IMG_W, height: IMG_W, backgroundColor: colors.card },
  imagePlaceholder: { backgroundColor: colors.g50 },
  body: { padding: space[4] },
  name: { fontSize: t.xl, fontWeight: '700', color: colors.ink },
  unit: { fontSize: t.sm, color: colors.ink3, marginTop: 2 },
  supplier: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space[3], marginTop: space[3] },
  discountTag: { fontSize: t.xs, color: colors.a700, fontWeight: '700', backgroundColor: colors.a100, paddingHorizontal: space[2], borderRadius: radius.sm },
  rxNote: { marginTop: space[2], fontSize: t.sm, color: colors.warn, fontWeight: '600' },
  actionRow: { marginTop: space[4] },
  outOfStockLabel: { color: colors.danger, fontWeight: '600' },
  notifyRow: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  notifiedText: { color: colors.g700, fontWeight: '600' },
  section: { marginTop: space[6] },
  sectionTitle: { fontSize: t.md, fontWeight: '700', color: colors.ink, marginBottom: space[2] },
  description: { fontSize: t.base, color: colors.ink2, lineHeight: 22 },
  noReviews: { fontSize: t.sm, color: colors.ink3 },
  reviewRow: { paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: colors.line },
  reviewStars: { color: colors.a600, fontSize: t.base },
  reviewAuthor: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  reviewComment: { fontSize: t.sm, color: colors.ink2, marginTop: 4 },
});
