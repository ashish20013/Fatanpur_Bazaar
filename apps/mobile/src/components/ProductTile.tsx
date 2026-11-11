import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ProductCard as Card } from '@fb/shared-types';
import { assetUrl } from '../config';
import { rupees } from '../utils/format';
import { colors, font, radius, shadow1, space, type as t } from '../theme/tokens';
import { toneFor } from '../theme/tones';
import { useName, useSite, useUnitLabel } from '../store/lang';
import { ColourArt } from './Icon';
import { QtyStepper } from './QtyStepper';

/**
 * The site's product card (apps/web/src/components/product.tsx `ProductTile`), to the letter:
 *
 *   ┌──────────────┐  4:3 picture, or a coloured label tile when there is no photograph
 *   │   picture    │
 *   ├──────────────┤
 *   │ नाम      ₹60 │  name wraps in its own column, price pinned hard right on the same baseline
 *   │ 250 ग्राम  …से │  unit left, supplier right
 *   │ [  खरीदें  ] │
 *   └──────────────┘
 *
 * ⚠️ No discount ribbon and no struck-through MRP. The owner took both off the site on purpose —
 * "the shop shows one honest price rather than a saving" — so they must not come back here.
 * The word "खरीदें" is spelled out on every card for the same reason: a bare "+" is a convention
 * you learn from other apps, and many of these customers are ordering online for the first time.
 */
export function ProductTile({
  p,
  quantityInCart = 0,
  onPress,
  onAdd,
  onQtyChange,
}: {
  p: Card;
  quantityInCart?: number;
  onPress: () => void;
  onAdd: () => void;
  onQtyChange: (q: number) => Promise<void> | void;
}): React.JSX.Element {
  const pick = useName();
  const unitOf = useUnitLabel();
  const site = useSite();
  const isService = p.itemType === 'SERVICE';
  const quote = isService && Number(p.price) === 0;
  const title = pick(p.name, p.nameHi);
  const sub = p.name.replace(/\s*\(.*\)\s*$/, '');
  const photo = assetUrl(p.image?.urlSm ?? p.image?.url ?? null);
  const tone = toneFor(p.family ?? null);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.visual}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} resizeMode="contain" accessibilityLabel={title} />
        ) : (
          // The site's label tile: the category's own colour behind its own drawing.
          <View style={[styles.tile, { backgroundColor: tone.bg }]}>
            <ColourArt name={p.icon ?? 'basket'} fallback="basket" size={40} color={tone.fg} />
            <Text style={[styles.tileName, { color: tone.fg }]} numberOfLines={2}>
              {title}
            </Text>
          </View>
        )}
        {!p.inStock ? (
          <View style={styles.outWrap}>
            <Text style={styles.outText}>{site.product.outOfStock}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={2}>
            {title}
          </Text>
          {quote ? (
            <Text style={styles.quote}>{site.buy.rateOnCall}</Text>
          ) : (
            <Text style={styles.price}>₹{rupees(p.price)}</Text>
          )}
        </View>

        {/*
          * Pack size on the left, who it comes from on the right.
          *
          * ⚠️ A SERVICE used to print its own English name here — the title again, one line
          * lower — which told the customer nothing and left no room for the thing that does
          * matter ("1 विज़िट"). It falls back to the English name only when a service carries no
          * unit at all. Both halves shrink; neither may push the other off the card, which is
          * what happened with a long supplier name next to a long pack size.
          */}
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {unitOf(p.unitValue, p.unit) || (isService ? sub || site.home.services : '')}
          </Text>
          {p.supplierName ? (
            <Text style={styles.supplier} numberOfLines={1}>
              {p.supplierName}
            </Text>
          ) : null}
        </View>

        {p.prescriptionRequired ? <Text style={styles.rx}>{site.product.rxRequired}</Text> : null}

        <View style={styles.action}>
          {isService ? (
            <Pressable style={styles.buy} onPress={onPress}>
              <Text style={styles.buyText}>{site.buy.book}</Text>
            </Pressable>
          ) : quantityInCart > 0 ? (
            <QtyStepper quantity={quantityInCart} onChange={onQtyChange} />
          ) : (
            <Pressable style={[styles.buy, !p.inStock && styles.buyOff]} disabled={!p.inStock} onPress={onAdd}>
              <Text style={styles.buyText}>{site.buy.buy}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow1,
  },
  // 16:10 rather than 4:3 — ~14 px shorter per card at a 3-up grid, and with `contain` the
  // product is shown whole either way, so nothing is lost by the box being less tall.
  // White, because `contain` letterboxes and the website letterboxes onto white.
  visual: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.white },
  photo: { height: '100%', width: '100%' },
  tile: { height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center', padding: 4, gap: 2 },
  tileName: { fontFamily: font.bodySemi, fontSize: 10, textAlign: 'center', lineHeight: 12 },
  outWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(22,38,28,0.72)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  outText: { color: colors.white, fontFamily: font.bodySemi, fontSize: 10 },
  body: { padding: 8, gap: 2, flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  /*
   * ⚠️ `lineHeight: 17` on 13px Devanagari clipped the matras above and below the line — the
   * shirorekha of a second line landed on the descender of the first. 1.45× leaves them room.
   * `minHeight` holds two lines' worth whether the name takes one line or two, so the price,
   * the pack size and the button sit on the same lines across a row of cards.
   */
  name: { flex: 1, minWidth: 0, fontFamily: font.bodySemi, fontSize: t.sm, color: colors.ink, lineHeight: 19, minHeight: 38 },
  // Never shrinks: the price is the one number that must always be readable in full.
  price: { flexShrink: 0, fontFamily: font.bodySemi, fontSize: 14, color: colors.ink },
  quote: { flexShrink: 0, fontFamily: font.bodySemi, fontSize: 11, color: colors.au800 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /*
   * The pack size never shrinks and the supplier takes whatever is left, ellipsised.
   *
   * ⚠️ It was the other way round — the supplier had `flex: 1` and the pack size was allowed to
   * shrink — so "मुलायम एक्स-रे (गौरा हॉस्पिटल के पास)" won the row and "1 विज़िट" was pushed onto
   * a line of its own. Capping the supplier by percentage was not enough either: the row still
   * broke whenever the name was long enough to hit the cap. Letting the short, fixed thing be
   * fixed and the variable thing flex is the only arrangement that cannot stack.
   */
  meta: { flexShrink: 0, fontSize: 11, color: colors.ink3 },
  supplier: { flex: 1, minWidth: 0, textAlign: 'right', fontSize: 11, color: colors.ink3 },
  rx: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.au100,
    color: colors.au800,
    fontSize: 10,
    fontFamily: font.bodySemi,
  },
  // `minHeight` is the stepper's own height: the row reserves it before anything is laid out,
  // so adding an item can never make the card's contents taller than the card.
  action: { marginTop: 'auto', paddingTop: 6, minHeight: 36, justifyContent: 'flex-end' },
  buy: {
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.em700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyOff: { backgroundColor: colors.line2 },
  buyText: { color: colors.white, fontFamily: font.bodySemi, fontSize: t.sm },
});
