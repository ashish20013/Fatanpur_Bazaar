import React, { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SearchResponse, ProductCard as ProductCardType } from '@fb/shared-types';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api, ApiError } from '../../services/api';
import { useCart } from '../../store/cart';
import { useBuy } from '../../hooks/useBuy';
import { ProductTile } from '../../components/ProductTile';
import { ListRowSkeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { colors, space, type as t } from '../../theme/tokens';
import { useName, useT } from '../../store/lang';
import { useSite } from '../../store/lang';
import { useGridColumns } from '../../navigation/useGrid';

/** A10 client side: debounce, ≥2 chars, zero-result → "tell us" demand capture. */
export default function SearchScreen({ navigation }: NativeStackScreenProps<CustomerStackParamList, 'Search'>): React.JSX.Element {
  const cols = useGridColumns();
  const pick = useName();
  const hi = useT();
  const site = useSite();
  const { cart } = useCart();
  const { buy, setQuantity } = useBuy(() => navigation.navigate('Phone'));
  const [q, setQ] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestName, setRequestName] = useState('');
  const [requestPhone, setRequestPhone] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<SearchResponse>(`/catalog/search?q=${encodeURIComponent(query.trim())}`);
      setResult(r);
      setRequestSent(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setLoading(false);
    }
  }, []);

  const onChange = (v: string): void => {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(v), 300);
  };

  const submitRequest = async (): Promise<void> => {
    if (!requestName.trim() || !/^[6-9]\d{9}$/.test(requestPhone)) return;
    try {
      await api.post('/catalog/product-request', { query: q.trim(), name: requestName.trim(), phone: requestPhone });
      setRequestSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  };

  const quantityFor = (productId: number): number => cart?.items.find((i) => i.productId === productId)?.quantity ?? 0;

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <Input value={q} onChangeText={onChange} placeholder={site.search.placeholder} autoFocus />
      </View>

      {/*
       * Distinct keys per list below: all three sit in one element slot, and without them React
       * reuses a single FlatList and flips numColumns 1→n when results arrive, which React
       * Native rejects outright — the search screen died the moment anyone typed.
       */}
      {loading ? (
        <FlatList key="search-skeleton" data={[1, 2, 3]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} />
      ) : q.trim().length > 0 && q.trim().length < 2 ? (
        <EmptyState icon="🔍" title={hi.search.minChars} />
      ) : error ? (
        <EmptyState icon="⚠️" title={error} />
      ) : result && result.items.length === 0 ? (
        <FlatList
          key="search-empty"
          data={[]}
          keyExtractor={() => 'x'}
          renderItem={null}
          ListHeaderComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>{site.search.zero}</Text>
              {result.suggestions.length > 0 ? (
                <>
                  <Text style={styles.emptyHelp}>{site.search.zeroSuggest}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] }}>
                    {result.suggestions.map((p) => (
                      <Text key={p.id} style={styles.suggestionChip} onPress={() => navigation.navigate('Product', { slug: p.slug })}>
                        {pick(p.name, p.nameHi)}
                      </Text>
                    ))}
                  </View>
                </>
              ) : null}
              {requestSent ? (
                <Text style={styles.thanks}>धन्यवाद! हम जल्द यह सामान लाएंगे।</Text>
              ) : (
                <View style={styles.requestForm}>
                  <Text style={styles.requestTitle}>{site.search.tellUs}</Text>
                  <Input value={requestName} onChangeText={setRequestName} placeholder="आपका नाम" maxLength={120} />
                  <Input value={requestPhone} onChangeText={(v) => setRequestPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder={hi.auth.phonePlaceholder} keyboardType="number-pad" maxLength={10} />
                  <Button label={site.search.tellUs} onPress={() => void submitRequest()} size="sm" />
                </View>
              )}
            </View>
          }
        />
      ) : result ? (
        <FlatList
          key={`search-results-${cols}`}
          data={result.items}
          numColumns={cols}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: space[4], gap: space[3] }}
          columnWrapperStyle={{ gap: space[3] }}
          renderItem={({ item }: { item: ProductCardType }) => (
            <View style={{ flex: 1 }}>
              <ProductTile
                p={item}
                quantityInCart={quantityFor(item.id)}
                onPress={() => navigation.navigate(item.itemType === 'SERVICE' ? 'Service' : 'Product', { slug: item.slug })}
                onAdd={() => void buy(item.id, 1)}
                onQtyChange={(qty) => {
                  const it = cart?.items.find((i) => i.productId === item.id);
                  return it ? setQuantity(it.id, qty) : Promise.resolve();
                }}
              />
            </View>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  searchBar: { paddingHorizontal: space[4], paddingTop: space[3], backgroundColor: colors.card },
  emptyWrap: { padding: space[6] },
  emptyTitle: { fontSize: t.md, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  emptyHelp: { fontSize: t.sm, color: colors.ink3, textAlign: 'center', marginTop: space[2] },
  suggestionChip: { backgroundColor: colors.g100, color: colors.g700, paddingHorizontal: space[3], paddingVertical: space[1], borderRadius: 999, fontSize: t.sm },
  requestForm: { marginTop: space[6], gap: space[2] },
  requestTitle: { fontSize: t.base, fontWeight: '600', color: colors.ink },
  thanks: { marginTop: space[6], color: colors.g700, textAlign: 'center', fontWeight: '600' },
});
