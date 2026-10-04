import { max, mulQty, percentOf, roundRupee, toPaise, type Paise } from '../common/utils/money';

/**
 * A16 order adjustment (weighing / out-of-stock) — pure totals.
 * schema.sql stores quantities as INT, so "1 kg → 900 g" is expressed as finalQuantity = 1 with a
 * lower `finalLineTotal` — allowed only for is_weighted items and never above unit_price × qty.
 * Delivery fee NEVER increases even if the new total drops below free_delivery_above
 * (deliberately in the customer's favour). Coupon is re-validated by the caller and passed in
 * as `discountAfter` (0 when the new total no longer qualifies).
 */
export interface AdjustLine {
  itemId: number;
  quantity: number; // ordered
  unitPrice: Paise;
  lineTotal: Paise;
  isWeighted: boolean;
  alreadyRemoved: boolean;
  currentFinalQty: number | null;
  currentFinalLineTotal: Paise | null;
}
export interface AdjustChange {
  itemId: number;
  finalQuantity?: number;
  finalLineTotal?: Paise;
  remove?: boolean;
}
export class AdjustError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}
export interface AdjustResult {
  lines: { itemId: number; finalQuantity: number; finalLineTotal: Paise; removed: boolean; returnedQty: number }[];
  allRemoved: boolean;
  newItemsTotal: Paise;
}

function currentTotal(l: AdjustLine): Paise {
  if (l.alreadyRemoved) return 0;
  if (l.currentFinalLineTotal !== null) return l.currentFinalLineTotal;
  return l.currentFinalQty !== null ? mulQty(l.unitPrice, l.currentFinalQty) : l.lineTotal;
}

export function applyAdjustment(lines: readonly AdjustLine[], changes: readonly AdjustChange[]): AdjustResult {
  const byId = new Map(changes.map((c) => [c.itemId, c]));
  for (const c of changes) if (!lines.some((l) => l.itemId === c.itemId)) throw new AdjustError('यह आइटम इस ऑर्डर में नहीं है');
  const out: AdjustResult['lines'] = [];
  let newItemsTotal: Paise = 0;
  let remaining = 0;
  for (const l of lines) {
    const prevQty = l.alreadyRemoved ? 0 : l.currentFinalQty ?? l.quantity;
    const c = byId.get(l.itemId);
    if (!c) {
      if (!l.alreadyRemoved) {
        remaining++;
        newItemsTotal += currentTotal(l);
      }
      continue;
    }
    const finalQuantity = c.remove ? 0 : c.finalQuantity ?? prevQty;
    if (!Number.isInteger(finalQuantity) || finalQuantity < 0) throw new AdjustError('मात्रा गलत है');
    if (finalQuantity > l.quantity) throw new AdjustError('मात्रा बढ़ा नहीं सकते — नया ऑर्डर करवाएं');
    const removed = c.remove === true || finalQuantity === 0;
    const cap = mulQty(l.unitPrice, finalQuantity);
    let finalLineTotal = removed ? 0 : cap;
    if (!removed && c.finalLineTotal !== undefined) {
      if (!l.isWeighted) throw new AdjustError('रकम सिर्फ तौल वाले सामान पर बदल सकते हैं');
      if (c.finalLineTotal < 0 || c.finalLineTotal > cap) throw new AdjustError('नई रकम पहले से ज़्यादा नहीं हो सकती');
      finalLineTotal = c.finalLineTotal;
    }
    const returnedQty = Math.max(0, prevQty - finalQuantity);
    out.push({ itemId: l.itemId, finalQuantity, finalLineTotal, removed, returnedQty });
    if (!removed) {
      remaining++;
      newItemsTotal += finalLineTotal;
    }
  }
  return { lines: out, allRemoved: remaining === 0, newItemsTotal };
}

export function adjustedGrandTotal(o: { newItemsTotal: Paise; deliveryFee: string; visitingCharge: string; discountAfter: Paise; walletUsed: string }): Paise {
  return adjustedSettlement(o).grand;
}

/**
 * The new bill after an order shrinks, split into what is still owed and what wallet money comes
 * back.
 *
 * `grand` alone used to be the whole answer — `max(0, payable − walletUsed)` — and the `max(0, …)`
 * quietly swallowed the case where the wallet had covered MORE than the smaller order now costs.
 * A customer who paid ₹100 from his wallet for a ₹130 order that was weighed down to ₹50 was
 * charged the full ₹100 for ₹50 of goods; on a wallet-only order the whole difference vanished.
 * `walletBack` is that excess: it goes back into his wallet, and `walletUsed` drops by the same
 * amount so a later cancellation does not refund it a second time.
 */
export function adjustedSettlement(o: { newItemsTotal: Paise; deliveryFee: string; visitingCharge: string; discountAfter: Paise; walletUsed: string }): { grand: Paise; walletBack: Paise; walletUsedAfter: Paise } {
  const payable = max(0, o.newItemsTotal + toPaise(o.deliveryFee) + toPaise(o.visitingCharge) - o.discountAfter);
  const walletUsed = toPaise(o.walletUsed);
  const walletUsedAfter = Math.min(walletUsed, payable);
  return { grand: payable - walletUsedAfter, walletBack: walletUsed - walletUsedAfter, walletUsedAfter };
}

/**
 * A coupon's discount on a new items total — the same arithmetic as placement (A13): FLAT is the
 * face value, PERCENT is a share capped at max_discount, and neither may exceed the items total.
 * The adjustment used to keep the ORIGINAL rupee discount whenever the order still cleared the
 * minimum, so 10% of ₹400 (₹40) stayed ₹40 on an order weighed down to ₹260, where it should be ₹26.
 */
export function couponDiscountOn(itemsTotal: Paise, c: { discount_type: 'FLAT' | 'PERCENT'; discount_value: string; max_discount: string | null; min_order_value: string }): Paise {
  if (itemsTotal < toPaise(c.min_order_value)) return 0;
  // The same helpers placement uses (domain/coupon.ts), so an adjusted order is discounted by
  // exactly the rule the customer was quoted — integer paise throughout, no floats.
  let d = c.discount_type === 'FLAT' ? toPaise(c.discount_value) : percentOf(itemsTotal, c.discount_value);
  if (c.discount_type === 'PERCENT' && c.max_discount !== null) d = Math.min(d, toPaise(c.max_discount));
  return roundRupee(Math.max(0, Math.min(d, itemsTotal)));
}
