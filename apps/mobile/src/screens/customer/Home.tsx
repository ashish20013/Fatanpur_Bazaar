import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { HomeResponse, ProductCard as ProductCardType, ServiceabilityResult, VillageOption } from '@fb/shared-types';
import type { CustomerStackParamList, CustomerTabParamList } from '../../navigation/CustomerTabs';
import { api, ApiError } from '../../services/api';
import { getLastVillage, setLastVillage } from '../../services/storage';
import { useCart } from '../../store/cart';
import { ProductCard } from '../../components/ProductCard';
import { ProductCardSkeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/EmptyState';
import { VillagePicker } from '../../components/VillagePicker';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabParamList, 'Home'>, NativeStackScreenProps<CustomerStackParamList>>;

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { cart, addItem, setQty, refresh: refreshCart } = useCart();
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [village, setVillage] = useState<{ id: number; name: string; nameHi: string | null } | null>(null);
  const [area, setArea] = useState<ServiceabilityResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [home, lastVillage] = await Promise.all([api.get<HomeResponse>('/catalog/home'), getLastVillage()]);
      setData(home);
      setVillage(lastVillage);
      if (lastVillage) {
        const r = await api.post<ServiceabilityResult>('/service-area/check', { villageId: lastVillage.id });
        setArea(r);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  useEffect(() => {
    void load();
    void refreshCart(); // cart badge should reflect reality as soon as Home mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onSelectVillage = async (v: VillageOption): Promise<void> => {
    setPickerOpen(false);
    const stored = { id: v.id, name: v.name, nameHi: v.nameHi };
    setVillage(stored);
    await setLastVillage(stored);
    try {
      const r = await api.post<ServiceabilityResult>('/service-area/check', { villageId: v.id });
      setArea(r);
    } catch {
      setArea(null);
    }
  };

  const quantityFor = (productId: number): number => cart?.items.find((i) => i.productId === productId)?.quantity ?? 0;

  if (error && !data) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <View style={styles.screen}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} colors={[colors.g700]} />}>
        <Pressable style={styles.locationStrip} onPress={() => setPickerOpen(true)}>
          {village ? (
            area?.serviceable ? (
              <Text style={styles.locationOk}>{hi.home.inArea(village.nameHi || village.name, area.etaMinutes)}</Text>
            ) : area ? (
              <Text style={styles.locationBad}>{hi.home.outArea}</Text>
            ) : (
              <Text style={styles.locationText}>📍 {village.nameHi || village.name}</Text>
            )
          ) : (
            <Text style={styles.locationText}>📍 {hi.home.changeArea}</Text>
          )}
        </Pressable>

        {data?.banners.length ? (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={data.banners}
            keyExtractor={(b) => String(b.id)}
            contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3] }}
            renderItem={({ item }) => (
              <Image source={{ uri: item.imageUrlSm ?? item.imageUrl, width: item.width, height: item.height }} style={styles.banner} resizeMode="cover" />
            )}
          />
        ) : null}

        {data?.verticals.length ? (
          <View style={styles.chipsRow}>
            {data.verticals.map((v) => (
              <Pressable key={v.vertical} style={styles.chip} onPress={() => navigation.navigate('Categories')}>
                <Text style={styles.chipText}>{v.labelHi}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Section
          title={hi.home.featured}
          products={data?.featured}
          onPressAll={() => navigation.navigate('Categories')}
          quantityFor={quantityFor}
          onOpen={(p) => navigation.navigate('Product', { slug: p.slug })}
          onAdd={(p) => void addItem(p.id, 1)}
          onQtyChange={(p, q) => {
            const item = cart?.items.find((i) => i.productId === p.id);
            if (item) void setQty(item.id, q);
          }}
        />
        <Section
          title={hi.home.popular}
          products={data?.popular}
          onPressAll={() => navigation.navigate('Categories')}
          quantityFor={quantityFor}
          onOpen={(p) => navigation.navigate('Product', { slug: p.slug })}
          onAdd={(p) => void addItem(p.id, 1)}
          onQtyChange={(p, q) => {
            const item = cart?.items.find((i) => i.productId === p.id);
            if (item) void setQty(item.id, q);
          }}
        />
      </ScrollView>

      <VillagePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(v) => void onSelectVillage(v)}
        onNotListed={() => setPickerOpen(false)}
      />
    </View>
  );
}

function Section({
  title,
  products,
  onPressAll,
  onOpen,
  onAdd,
  onQtyChange,
  quantityFor,
}: {
  title: string;
  products?: ProductCardType[];
  onPressAll: () => void;
  onOpen: (p: ProductCardType) => void;
  onAdd: (p: ProductCardType) => void;
  onQtyChange: (p: ProductCardType, q: number) => void;
  quantityFor: (id: number) => number;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable onPress={onPressAll}>
          <Text style={styles.seeAll}>{hi.common.seeAll}</Text>
        </Pressable>
      </View>
      {products ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={products}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3] }}
          renderItem={({ item }) => (
            <View style={{ width: 150 }}>
              <ProductCard product={item} quantityInCart={quantityFor(item.id)} onPress={() => onOpen(item)} onAdd={() => onAdd(item)} onQtyChange={(q) => onQtyChange(item, q)} />
            </View>
          )}
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: space[3], paddingHorizontal: space[4] }}>
          <View style={{ width: 150 }}>
            <ProductCardSkeleton />
          </View>
          <View style={{ width: 150 }}>
            <ProductCardSkeleton />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  locationStrip: { backgroundColor: colors.g50, paddingHorizontal: space[4], paddingVertical: space[2] },
  locationText: { fontSize: t.sm, color: colors.ink2, fontWeight: '600' },
  locationOk: { fontSize: t.sm, color: colors.g700, fontWeight: '600' },
  locationBad: { fontSize: t.sm, color: colors.danger, fontWeight: '600' },
  banner: { borderRadius: radius.md, height: 120 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[3] },
  chip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.g200, borderRadius: radius.full, paddingHorizontal: space[4], paddingVertical: space[2] },
  chipText: { color: colors.g700, fontWeight: '600', fontSize: t.sm },
  section: { marginTop: space[2] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space[4], marginBottom: space[2] },
  sectionTitle: { fontSize: t.lg, fontWeight: '700', color: colors.ink },
  seeAll: { fontSize: t.sm, color: colors.g700, fontWeight: '600' },
});
