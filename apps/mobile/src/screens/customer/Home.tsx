import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { HomeResponse, ProductCard, RootCategory, ServiceabilityResult, VillageOption } from '@fb/shared-types';
import type { CustomerStackParamList, CustomerTabParamList } from '../../navigation/CustomerTabs';
import { api, ApiError } from '../../services/api';
import { getLastVillage, setLastVillage } from '../../services/storage';
import { useCart } from '../../store/cart';
import { useBuy } from '../../hooks/useBuy';
import { SiteHeader } from '../../components/SiteHeader';
import { CategoryRail } from '../../components/CategoryRail';
import { BannerStrip } from '../../components/BannerStrip';
import { SectionHead, Breaker } from '../../components/SectionHead';
import { ProductTile } from '../../components/ProductTile';
import { ProductCardSkeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/EmptyState';
import { VillagePicker } from '../../components/VillagePicker';
import { Icon } from '../../components/Icon';
import { colors, font, radius, space, type as t } from '../../theme/tokens';
import { useName, useSite } from '../../store/lang';

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabParamList, 'Home'>, NativeStackScreenProps<CustomerStackParamList>>;

/** The site's home shows three products across on a phone — one row per category. */
const COLS = 3;
const GAP = 6;
/**
 * The website server-renders the first five category rows and lazy-loads the rest as the shopper
 * scrolls (`i > 4 ? 'fb-defer'` in apps/web/src/app/(public)/page.tsx). The app has to do the same
 * or it mounts twenty rows — sixty product tiles, each with its own vector art — before the first
 * screen appears. On a 2 GB Android 9 phone that is several seconds of white. A FlatList over the
 * sections gives the same five-then-the-rest behaviour, and unmounts rows scrolled far away.
 */
const EAGER_SECTIONS = 5;

/**
 * Home = the owner's wireframe, the same one the website renders:
 *   banner strip → EVERY category, one row each, in his order, separated by a gold breaker
 *   → "ऑर्डर कैसे करें" → the villages we deliver to.
 *
 * The categories come from `/catalog/home`'s `sections`, which the API has always returned and
 * the app simply never read — it was showing a "खास सामान" / "सबसे ज़्यादा मंगाया गया" pair that
 * exists nowhere on the site.
 */
export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const pick = useName();
  const site = useSite();
  const { cart, itemCount, refresh: refreshCart } = useCart();
  const { buy, setQuantity } = useBuy(() => navigation.navigate('Phone'));
  const [data, setData] = useState<HomeResponse | null>(null);
  const [villages, setVillages] = useState<VillageOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [village, setVillage] = useState<{ id: number; name: string; nameHi: string | null } | null>(null);
  const [area, setArea] = useState<ServiceabilityResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [home, lastVillage, vlist] = await Promise.all([
        api.get<HomeResponse>('/catalog/home'),
        getLastVillage(),
        /*
         * ⚠️ This endpoint answers with an OBJECT — `{ villages, pinnedIds, selectedId, … }` —
         * not a bare list (the village picker already reads it that way). Asking for an array
         * here meant `villages.length` was never greater than 0, so the "we deliver to these
         * villages" strip on the home screen simply never appeared, and the `.catch` made it
         * look like a quiet network hiccup rather than the wrong shape.
         */
        api.get<{ villages: VillageOption[] }>('/service-area/villages').catch(() => ({ villages: [] as VillageOption[] })),
      ]);
      setData(home);
      setVillages(vlist.villages ?? []);
      setVillage(lastVillage);
      if (lastVillage) {
        const r = await api.post<ServiceabilityResult>('/service-area/check', { villageId: lastVillage.id }).catch(() => null);
        setArea(r);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : site.common.error);
    }
  }, []);

  useEffect(() => {
    void load();
    void refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const onSelectVillage = async (v: VillageOption): Promise<void> => {
    setPickerOpen(false);
    const stored = { id: v.id, name: v.name, nameHi: v.nameHi };
    setVillage(stored);
    await setLastVillage(stored);
    const r = await api.post<ServiceabilityResult>('/service-area/check', { villageId: v.id }).catch(() => null);
    setArea(r);
  };

  const quantityFor = (productId: number): number => cart?.items.find((i) => i.productId === productId)?.quantity ?? 0;

  const openProduct = (p: ProductCard): void => {
    navigation.navigate(p.itemType === 'SERVICE' ? 'Service' : 'Product', { slug: p.slug });
  };
  const openCategory = (c: RootCategory): void => {
    navigation.navigate('Categories', { slug: c.slug });
  };

  const header = (
    <SiteHeader
      addressLabel={village ? pick(village.name, village.nameHi) : null}
      deliveryWindow={area?.etaMinutes ? `${area.etaMinutes} मिनट` : '30–60 मिनट'}
      cartCount={itemCount}
      onPressAddress={() => setPickerOpen(true)}
      onPressSearch={() => navigation.navigate('Search')}
      onPressBag={() => navigation.navigate('Tabs', { screen: 'Cart' })}
      onPressProfile={() => navigation.navigate('Tabs', { screen: 'Profile' })}
    />
  );

  if (error && !data) {
    return (
      <View style={styles.screen}>
        {header}
        <ErrorState message={error} onRetry={() => void load()} />
      </View>
    );
  }

  const listHeader = (
    <>
      <CategoryRail roots={data?.roots ?? []} onPress={openCategory} />

      {/* Auto-rotating, pause-on-touch, cross-fading — the website's own strip (BannerStrip.tsx). */}
      <BannerStrip
        banners={data?.banners ?? []}
        onPressBanner={(b) => {
          // The website's banners link to a vertical or category path, e.g. "/kirana".
          const slug = (b.linkUrl ?? '').replace(/^\/+/, '').split('/')[0];
          if (slug) navigation.navigate('Categories', { slug });
        }}
      />

      {data ? null : (
        <View style={styles.section}>
          <View style={styles.rowWrap}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.cell}>
                <ProductCardSkeleton />
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  );

  const listFooter = (
    <>
      <Breaker />

      {/* "ऑर्डर कैसे करें — 4 आसान कदम", for people ordering online for the first time. */}
      <View style={styles.section}>
        <Text style={styles.h2}>{site.sections.howTitle}</Text>
        <View style={styles.steps}>
          {[
            { icon: 'hand-click', text: site.sections.how1 },
            { icon: 'device-mobile', text: site.sections.how2 },
            { icon: 'map-pin', text: site.sections.how3 },
            { icon: 'clock-hour-4', text: site.sections.how4 },
          ].map((step, n) => (
            <View key={step.icon} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{n + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step.text}</Text>
              <Icon name={step.icon} size={22} color={colors.au600} />
            </View>
          ))}
        </View>
      </View>

      {/* The villages we serve — a clear answer to "do you come to my village?" */}
      {villages.length ? (
        <View style={[styles.section, { marginTop: space[6] }]}>
          <Text style={styles.h2}>{site.sections.areasTitle}</Text>
          <View style={styles.chips}>
            {villages.map((v) => (
              <View key={v.id} style={styles.chip}>
                <Icon name="map-pin" size={13} color={colors.au600} />
                <Text style={styles.chipText}>{pick(v.name, v.nameHi)}</Text>
                {v.distanceKm !== null ? <Text style={styles.chipKm}>· {v.distanceKm} किमी</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ height: space[8] }} />
    </>
  );

  return (
    <View style={styles.screen}>
      {header}
      <FlatList
        data={data?.sections ?? []}
        keyExtractor={(sec) => String(sec.category.id)}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        initialNumToRender={EAGER_SECTIONS}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            colors={[colors.em700]}
          />
        }
        renderItem={({ item: sec, index: i }) => (
          <View>
            {i > 0 ? <Breaker /> : <View style={{ height: space[2] }} />}
            <View style={styles.section}>
              <SectionHead
                slug={sec.category.slug}
                icon={sec.category.icon}
                image={sec.category.image}
                title={pick(sec.category.name, sec.category.nameHi)}
                sub={`${site.sections.aToZ} · ${sec.total}`}
                more={site.sections.seeAll(sec.total)}
                onPressMore={() => openCategory(sec.category)}
              />
              <Row
                items={sec.items}
                quantityFor={quantityFor}
                onOpen={openProduct}
                onAdd={(p) => void buy(p.id, 1)}
                onQty={(p, q) => {
                  const it = cart?.items.find((x) => x.productId === p.id);
                  return it ? setQuantity(it.id, q) : Promise.resolve();
                }}
              />
            </View>
          </View>
        )}
      />

      <VillagePicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(v) => void onSelectVillage(v)} onNotListed={() => setPickerOpen(false)} />
    </View>
  );
}

/** One category = exactly one row of products. The next row belongs to the NEXT category. */
function Row({
  items,
  quantityFor,
  onOpen,
  onAdd,
  onQty,
}: {
  items: ProductCard[];
  quantityFor: (id: number) => number;
  onOpen: (p: ProductCard) => void;
  onAdd: (p: ProductCard) => void;
  onQty: (p: ProductCard, q: number) => Promise<void> | void;
}): React.JSX.Element {
  return (
    <View style={styles.rowWrap}>
      {items.slice(0, COLS).map((p) => (
        <View key={p.id} style={styles.cell}>
          <ProductTile p={p} quantityInCart={quantityFor(p.id)} onPress={() => onOpen(p)} onAdd={() => onAdd(p)} onQtyChange={(q) => onQty(p, q)} />
        </View>
      ))}
      {/* Keep the last row aligned when a category has fewer than three items. */}
      {items.length < COLS
        ? Array.from({ length: COLS - items.length }, (_, i) => <View key={`pad-${i}`} style={styles.cell} />)
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  section: { paddingHorizontal: space[4] },
  rowWrap: { flexDirection: 'row', gap: GAP, marginTop: 4 },
  cell: { flex: 1, minWidth: 0 },
  h2: { fontFamily: font.display, fontSize: t.xl, color: colors.ink, marginBottom: space[3] },
  steps: { gap: space[2] },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[3],
  },
  stepNum: { height: 40, width: 40, borderRadius: radius.full, backgroundColor: colors.em700, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: colors.au200, fontFamily: font.bodySemi, fontSize: t.base },
  stepText: { flex: 1, fontSize: t.body, color: colors.ink, paddingTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.card,
  },
  chipText: { fontSize: t.body, color: colors.ink2 },
  chipKm: { fontSize: t.xs, color: colors.ink3 },
});
