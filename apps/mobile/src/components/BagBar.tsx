import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { navigationRef } from '../navigation/ref';
import { useCart } from '../store/cart';
import { assetUrl } from '../config';
import { useScrollBottomPad } from '../navigation/useScrollPad';
import { Icon } from './Icon';
import { Money } from './Money';
import { QtyStepper } from './QtyStepper';
import { Sheet } from './Sheet';
import { colors, font, radius, shadow2, space, type as t } from '../theme/tokens';
import { useName, useSite } from '../store/lang';

/**
 * The "थैला" bar — the website's BagBar (apps/web/src/components/BagBar.tsx).
 *
 * The owner's brief, and the website's behaviour: the moment something is in the bag, a bar at
 * the bottom shows what is in it and how much, with one clear way forward. Tapping the left side
 * opens the bag to change quantities without leaving the shelf you were looking at.
 *
 * ⚠️ The app had nothing of the sort: after "खरीदें" the only sign anything had happened was a
 * small number on the cart tab, and the way to checkout was Cart tab → scroll → button. A
 * customer who had never ordered online had no idea they were half-way through.
 *
 * It hides itself on the screens where it would be in the way — the cart and checkout have their
 * own buttons, and it must never cover the login or the address form.
 */
const HIDE_ON = new Set(['Cart', 'Checkout', 'Phone', 'Otp', 'Setup']);
/** The website shows at most three faces, overlapping. */
const THUMBS = 3;

export function BagBar(): React.JSX.Element | null {
  const pick = useName();
  const site = useSite();
  const { cart, itemCount, setQty, removeItem } = useCart();
  const [open, setOpen] = useState(false);
  const bottom = useScrollBottomPad();

  /*
   * Which screen is actually on top.
   *
   * ⚠️ This bar is mounted once ABOVE the navigator (one bar, as on the website — not a copy in
   * every screen), which means it is not inside a navigator and the navigation hooks throw here.
   * It asks the container ref instead: `getCurrentRoute()` already returns the innermost active
   * route, so a tab inside the stack comes back as 'Cart' rather than 'Tabs'.
   */
  const [active, setActive] = useState('Home');
  useEffect(() => {
    const read = (): void => {
      if (navigationRef.isReady()) setActive(navigationRef.getCurrentRoute()?.name ?? 'Home');
    };
    read();
    return navigationRef.addListener('state', read);
  }, []);

  if (!cart || itemCount === 0 || HIDE_ON.has(active)) return null;

  const thumbs = cart.items.slice(0, THUMBS);

  return (
    <>
      {/* Sits just above the tab bar — `useScrollBottomPad` is the same measurement the scrolling
          screens use to keep their last row clear of it. */}
      <View style={[styles.wrap, { bottom: bottom - space[2] }]} pointerEvents="box-none">
        <View style={styles.bar}>
          <Pressable style={styles.left} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={site.bag.open}>
            <View style={styles.thumbs}>
              {thumbs.map((i, idx) => (
                <View key={i.id} style={[styles.thumb, idx > 0 && styles.thumbOverlap]}>
                  {i.image ? <Image source={{ uri: assetUrl(i.image) }} style={styles.thumbImg} resizeMode="cover" /> : <View style={styles.thumbImg} />}
                </View>
              ))}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.summary} numberOfLines={1}>
                {site.bag.summary(itemCount, `₹${cart.itemsTotal}`)}
              </Text>
              <View style={styles.stepsRow}>
                <Text style={styles.steps} numberOfLines={1}>
                  {site.bag.steps}
                </Text>
                <Icon name="chevron-up" size={13} color={colors.au200} />
              </View>
            </View>
          </Pressable>

          <Pressable style={styles.cta} onPress={() => navigationRef.navigate('Checkout')} accessibilityRole="button">
            <Text style={styles.ctaText}>{site.bag.proceed}</Text>
            <Icon name="arrow-right" size={17} color={colors.em900} />
          </Pressable>
        </View>
      </View>

      <Sheet open={open} onClose={() => setOpen(false)} title={site.bag.title}>
        <ScrollView style={{ maxHeight: 380 }}>
          {cart.items.map((i) => (
            <View key={i.id} style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {pick(i.name, i.nameHi)}
                </Text>
                <Money value={i.lineTotal} size={t.base} />
              </View>
              <QtyStepper
                quantity={i.quantity}
                max={i.maxQty}
                // Zero takes it out of the bag, the same as the website's stepper. The promise is
                // RETURNED so the stepper can roll its digit back if the server refuses.
                onChange={(q) => (q <= 0 ? removeItem(i.id) : setQty(i.id, q))}
              />
            </View>
          ))}
        </ScrollView>
        <Pressable
          style={styles.sheetCta}
          onPress={() => {
            setOpen(false);
            navigationRef.navigate('Checkout');
          }}
        >
          <Text style={styles.sheetCtaText}>{site.bag.proceed}</Text>
        </Pressable>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: space[3] },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.em800,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(203,169,84,0.4)',
    padding: space[2],
    paddingLeft: space[3],
    ...shadow2,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: space[3], flex: 1, minWidth: 0 },
  thumbs: { flexDirection: 'row' },
  thumb: { height: 40, width: 40, borderRadius: radius.full, overflow: 'hidden', borderWidth: 2, borderColor: colors.em800, backgroundColor: colors.em700 },
  thumbOverlap: { marginLeft: -12 },
  thumbImg: { height: '100%', width: '100%' },
  summary: { color: colors.white, fontFamily: font.bodySemi, fontSize: t.body },
  stepsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  steps: { color: colors.au200, fontSize: t.xs },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.au300,
  },
  ctaText: { color: colors.em900, fontFamily: font.bodySemi, fontSize: t.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.line },
  rowName: { fontSize: t.body, color: colors.ink, fontFamily: font.bodySemi },
  sheetCta: { height: 52, borderRadius: radius.md, backgroundColor: colors.em700, alignItems: 'center', justifyContent: 'center', marginTop: space[3] },
  sheetCtaText: { color: colors.white, fontFamily: font.bodySemi, fontSize: t.body },
});
