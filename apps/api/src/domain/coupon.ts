import { percentOf, roundRupee, toPaise, type Paise } from '../common/utils/money';

/** A13 — returns either a discount (paise) or a Hindi reason. Delivery fee is never discounted. */
export interface CouponRow {
  id: number;
  code: string;
  discount_type: 'FLAT' | 'PERCENT';
  discount_value: string;
  max_discount: string | null;
  min_order_value: string;
  applies_to: 'ALL' | 'PRODUCT' | 'SERVICE';
  usage_limit: number | null;
  used_count: number;
  per_user_limit: number;
  first_order_only: number | boolean;
  is_active: number | boolean;
  starts_at: Date | string | null;
  expires_at: Date | string | null;
}
export interface CouponContext {
  itemsTotal: Paise;
  orderType: 'DELIVERY' | 'SERVICE';
  isFirstOrder: boolean;
  userUsageCount: number;
  now: Date;
}
export type CouponResult = { ok: true; discount: Paise; coupon: CouponRow } | { ok: false; reason: string };

const asDate = (d: Date | string | null): Date | null => (d === null ? null : d instanceof Date ? d : new Date(d.replace(' ', 'T') + (d.includes('+') || d.endsWith('Z') ? '' : '+05:30')));

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export function evaluateCoupon(c: CouponRow | null | undefined, ctx: CouponContext): CouponResult {
  if (!c) return { ok: false, reason: 'कूपन कोड गलत है' };
  if (!Number(c.is_active)) return { ok: false, reason: 'यह कूपन अभी चालू नहीं है' };
  const starts = asDate(c.starts_at);
  const expires = asDate(c.expires_at);
  if (starts && ctx.now < starts) return { ok: false, reason: 'यह कूपन अभी शुरू नहीं हुआ' };
  if (expires && ctx.now > expires) return { ok: false, reason: 'कूपन की तारीख निकल गई' };
  const kind = ctx.orderType === 'SERVICE' ? 'SERVICE' : 'PRODUCT';
  if (c.applies_to !== 'ALL' && c.applies_to !== kind) return { ok: false, reason: 'यह कूपन इस पर नहीं चलेगा' };
  const minOrder = toPaise(c.min_order_value);
  if (ctx.itemsTotal < minOrder) return { ok: false, reason: `यह कूपन ₹${Math.round(minOrder / 100)} से ऊपर के ऑर्डर पर है` };
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) return { ok: false, reason: 'कूपन खत्म हो गया' };
  if (Number(c.first_order_only) && !ctx.isFirstOrder) return { ok: false, reason: 'यह कूपन सिर्फ पहले ऑर्डर पर है' };
  if (ctx.userUsageCount >= c.per_user_limit) return { ok: false, reason: 'आप यह कूपन पहले इस्तेमाल कर चुके हैं' };

  let discount: Paise;
  if (c.discount_type === 'FLAT') discount = toPaise(c.discount_value);
  else {
    discount = percentOf(ctx.itemsTotal, c.discount_value);
    if (c.max_discount !== null) discount = Math.min(discount, toPaise(c.max_discount));
  }
  discount = roundRupee(Math.min(discount, ctx.itemsTotal));
  return { ok: true, discount: Math.min(discount, ctx.itemsTotal), coupon: c };
}
