import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CategoryNode, ProductCard as ProductCardType } from '@fb/shared-types';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api, ApiError, type Paged } from '../../services/api';
import { useCart } from '../../store/cart';
import { useBuy } from '../../hooks/useBuy';
import { ProductTile } from '../../components/ProductTile';
import { assetUrl } from '../../config';
import { ProductCardSkeleton, ListRowSkeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { useName, useT } from '../../store/lang';
import { useGridColumns } from '../../navigation/useGrid';

/**
 * Doubles as the category tree browser AND the product grid for a chosen leaf category —
 * there is no separate "product list" screen in §10, so drilling into a leaf swaps this
 * screen's body from a tree list to a paginated product grid instead of pushing a new route.
 */
export default function CategoriesScreen({ navigation, route }: NativeStackScreenProps<CustomerStackParamList, 'Categories'>): React.JSX.Element {
  const cols = useGridColumns();
  const pick = useName();
  const hi = useT();
  const { cart } = useCart();
  const { buy, setQuantity } = useBuy(() => navigation.navigate('Phone'));
  const [tree, setTree] = useState<CategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<CategoryNode[]>([]);
  const [leaf, setLeaf] = useState<CategoryNode | null>(null);
  const [products, setProducts] = useState<ProductCardType[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const wanted = route.params?.slug ?? null;

  useEffect(() => {
    api
      .get<CategoryNode[]>('/catalog/categories')
      .then(setTree)
      .catch((e) => setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong));
  }, []);

  /*
   * Arriving with a slug — from the rail, or from a section's "सब देखें" — must land on THAT
   * category's goods, the way /kirana does on the website. It used to drop everyone on the
   * list of all categories instead, so "सब देखें (67)" showed no किराना at all.
   */
  /*
   * ⚠️ `honoured` and not `leaf`: the guard used to be "already showing a category? then ignore
   * the slug", which is right while somebody is drilling down by hand but wrong when a NEW slug
   * arrives — from a link, or from tapping a notification while this screen is already open. The
   * second link was simply dropped and the customer stayed on the previous category.
   */
  const honoured = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted || !tree || honoured.current === wanted) return;
    honoured.current = wanted;
    const find = (nodes: CategoryNode[]): CategoryNode | null => {
      for (const n of nodes) {
        if (n.slug === wanted) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    const node = find(tree);
    if (node) void openLeaf(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, tree]);

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
          <Text style={styles.backText}>← {leaf ? pick(leaf.name, leaf.nameHi) : pick(path[path.length - 1]?.name ?? '', path[path.length - 1]?.nameHi)}</Text>
        </Pressable>
      )}

      {leaf ? (
        products === null ? (
          <FlatList
            key={`grid-skeleton-${cols}`}
            data={[1, 2, 3, 4]}
            numColumns={cols}
            keyExtractor={(i) => String(i)}
            renderItem={() => <ProductCardSkeleton />}
            contentContainerStyle={styles.grid}
          />
        ) : products.length === 0 ? (
          <EmptyState icon="🗂️" title={hi.categories.empty} />
        ) : (
          <FlatList
            key={`grid-products-${cols}`}
            data={products}
            numColumns={cols}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={{ gap: space[3] }}
            onEndReachedThreshold={0.4}
            onEndReached={() => void loadMore()}
            renderItem={({ item }) => (
              <View style={{ flex: 1, marginBottom: space[3] }}>
                <ProductTile
                  p={item}
                  quantityInCart={quantityFor(item.id)}
                  onPress={() => navigation.navigate(item.itemType === 'SERVICE' ? 'Service' : 'Product', { slug: item.slug })}
                  onAdd={() => void buy(item.id, 1)}
                  onQtyChange={(q) => {
                    const it = cart?.items.find((i) => i.productId === item.id);
                    return it ? setQuantity(it.id, q) : Promise.resolve();
                  }}
                />
              </View>
            )}
          />
        )
      ) : tree === null ? (
        <FlatList key="list-skeleton" data={[1, 2, 3, 4, 5]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} />
      ) : currentLevel.length === 0 ? (
        <EmptyState icon="🗂️" title={hi.categories.empty} />
      ) : (
        <FlatList
          key="list-tree"
          data={currentLevel}
          keyExtractor={(c) => String(c.id)}
          getItemLayout={(_d, i) => ({ length: 64, offset: 64 * i, index: i })}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onNode(item)}>
              {item.image ? <Image source={{ uri: assetUrl(item.image) }} style={styles.rowImage} /> : <View style={[styles.rowImage, styles.rowImagePlaceholder]} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{pick(item.name, item.nameHi)}</Text>
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
