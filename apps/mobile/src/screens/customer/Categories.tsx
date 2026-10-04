import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CategoryNode, ProductCard as ProductCardType } from '@fb/shared-types';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api, ApiError, type Paged } from '../../services/api';
import { useCart } from '../../store/cart';
import { ProductCard } from '../../components/ProductCard';
import { ProductCardSkeleton, ListRowSkeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

/**
 * Doubles as the category tree browser AND the product grid for a chosen leaf category —
 * there is no separate "product list" screen in §10, so drilling into a leaf swaps this
 * screen's body from a tree list to a paginated product grid instead of pushing a new route.
 */
export default function CategoriesScreen({ navigation }: NativeStackScreenProps<CustomerStackParamList, 'Categories'>): React.JSX.Element {
  const { cart, addItem, setQty } = useCart();
  const [tree, setTree] = useState<CategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<CategoryNode[]>([]);
  const [leaf, setLeaf] = useState<CategoryNode | null>(null);
  const [products, setProducts] = useState<ProductCardType[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    api
      .get<CategoryNode[]>('/catalog/categories')
      .then(setTree)
      .catch((e) => setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong));
  }, []);

  const currentLevel = leaf ? [] : path.length ? path[path.length - 1].children : (tree ?? []);

  const openLeaf = useCallback(async (node: CategoryNode) => {
    setLeaf(node);
    setProducts(null);
    setPage(1);
    try {
      const r: Paged<ProductCardType> = await api.paged<ProductCardType>('/catalog/products', { category: node.slug, type: node.itemType, page: 1 });
      setProducts(r.items);
      setHasMore(r.meta.hasMore);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  const loadMore = async (): Promise<void> => {
    if (!leaf || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r = await api.paged<ProductCardType>('/catalog/products', { category: leaf.slug, type: leaf.itemType, page: next });
      setProducts((prev) => [...(prev ?? []), ...r.items]);
      setHasMore(r.meta.hasMore);
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  };

  const onNode = (node: CategoryNode): void => {
    if (node.children.length > 0) setPath((p) => [...p, node]);
    else void openLeaf(node);
  };

  const goBack = (): void => {
    if (leaf) {
      setLeaf(null);
      setProducts(null);
      return;
    }
    setPath((p) => p.slice(0, -1));
  };

  const quantityFor = (productId: number): number => cart?.items.find((i) => i.productId === productId)?.quantity ?? 0;

  if (error && !tree) return <ErrorState message={error} onRetry={() => navigation.replace('Categories')} />;

  return (
    <View style={styles.screen}>
      {(path.length > 0 || leaf) && (
        <Pressable style={styles.backRow} onPress={goBack}>
          <Text style={styles.backText}>← {leaf ? leaf.nameHi || leaf.name : path[path.length - 1]?.nameHi || path[path.length - 1]?.name}</Text>
        </Pressable>
      )}

      {leaf ? (
        products === null ? (
          <FlatList
            data={[1, 2, 3, 4]}
            numColumns={2}
            keyExtractor={(i) => String(i)}
            renderItem={() => <ProductCardSkeleton />}
            contentContainerStyle={styles.grid}
          />
        ) : products.length === 0 ? (
          <EmptyState icon="🗂️" title={hi.categories.empty} />
        ) : (
          <FlatList
            data={products}
            numColumns={2}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={{ gap: space[3] }}
            onEndReachedThreshold={0.4}
            onEndReached={() => void loadMore()}
            renderItem={({ item }) => (
              <View style={{ flex: 1, marginBottom: space[3] }}>
                <ProductCard
                  product={item}
                  quantityInCart={quantityFor(item.id)}
                  onPress={() => navigation.navigate(item.itemType === 'SERVICE' ? 'Service' : 'Product', { slug: item.slug })}
                  onAdd={() => void addItem(item.id, 1)}
                  onQtyChange={(q) => {
                    const it = cart?.items.find((i) => i.productId === item.id);
                    if (it) void setQty(it.id, q);
                  }}
                />
              </View>
            )}
          />
        )
      ) : tree === null ? (
        <FlatList data={[1, 2, 3, 4, 5]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} />
      ) : currentLevel.length === 0 ? (
        <EmptyState icon="🗂️" title={hi.categories.empty} />
      ) : (
        <FlatList
          data={currentLevel}
          keyExtractor={(c) => String(c.id)}
          getItemLayout={(_d, i) => ({ length: 64, offset: 64 * i, index: i })}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onNode(item)}>
              {item.image ? <Image source={{ uri: item.image }} style={styles.rowImage} /> : <View style={[styles.rowImage, styles.rowImagePlaceholder]} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.nameHi || item.name}</Text>
                <Text style={styles.rowCount}>{item.productCount} सामान</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  backRow: { paddingHorizontal: space[4], paddingVertical: space[3], backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.line },
  backText: { fontSize: t.base, fontWeight: '600', color: colors.g700 },
  row: { flexDirection: 'row', alignItems: 'center', height: 64, paddingHorizontal: space[4], gap: space[3], backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.surface },
  rowImage: { width: 40, height: 40, borderRadius: radius.sm },
  rowImagePlaceholder: { backgroundColor: colors.g50 },
  rowName: { fontSize: t.base, fontWeight: '600', color: colors.ink },
  rowCount: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  chevron: { fontSize: t.xl, color: colors.ink3 },
  grid: { padding: space[4], gap: space[3] },
});
