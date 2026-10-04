import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCoupon, normalizeCouponCode, type CouponRow } from '../../src/domain/coupon';
import { computeQuote, QuoteError, type QuoteInput, type QuoteProduct } from '../../src/domain/pricing';
import { applyAdjustment, adjustedGrandTotal, AdjustError } from '../../src/domain/adjustment';
import { resolvePermissions, grantablePermissions } from '../../src/domain/permissions';
import { onJobFailure } from '../../src/domain/jobs-backoff';
import { buildSlots } from '../../src/domain/slots';
import { addRating, sanitizeComment } from '../../src/domain/ratings';
import { decideReferral, type ReferralFacts } from '../../src/domain/referral';

const now = new Date('2026-09-11T10:00:00+05:30');
const baseCoupon: CouponRow = {
  id: 1, code: 'NAYA50', discount_type: 'FLAT', discount_value: '50.00', max_discount: null, min_order_value: '199.00',
  applies_to: 'ALL', usage_limit: 100, used_count: 3, per_user_limit: 1, first_order_only: 1, is_active: 1,
  starts_at: '2026-01-01 00:00:00', expires_at: '2026-12-31 23:59:59',
};
const ctx = { itemsTotal: 30000, orderType: 'DELIVERY' as const, isFirstOrder: true, userUsageCount: 0, now };

test('coupon 1: valid FLAT → 50', () => {
  const r = evaluateCoupon(baseCoupon, ctx);
  assert.ok(r.ok && r.discount === 5000);
});
test('coupon 2: unknown code', () => assert.equal(evaluateCoupon(null, ctx).ok, false));
test('coupon 3: inactive', () => assert.equal(evaluateCoupon({ ...baseCoupon, is_active: 0 }, ctx).ok, false));
test('coupon 4: expired / not started', () => {
  assert.equal(evaluateCoupon({ ...baseCoupon, expires_at: '2026-09-01 00:00:00' }, ctx).ok, false);
  assert.equal(evaluateCoupon({ ...baseCoupon, starts_at: '2026-10-01 00:00:00' }, ctx).ok, false);
});
test('coupon 5: min order', () => {
  const r = evaluateCoupon(baseCoupon, { ...ctx, itemsTotal: 15000 });
  assert.ok(!r.ok && r.reason.includes('₹199'));
});
test('coupon 6: usage limit exhausted', () => assert.equal(evaluateCoupon({ ...baseCoupon, used_count: 100 }, ctx).ok, false));
test('coupon 7: first order only / per-user limit', () => {
  assert.equal(evaluateCoupon(baseCoupon, { ...ctx, isFirstOrder: false }).ok, false);
  assert.equal(evaluateCoupon(baseCoupon, { ...ctx, userUsageCount: 1 }).ok, false);
});
test('coupon 8: PERCENT capped by max_discount, never above items total, applies_to', () => {
  const pct: CouponRow = { ...baseCoupon, code: 'SABZI10', discount_type: 'PERCENT', discount_value: '10', max_discount: '40.00', first_order_only: 0, min_order_value: '0' };
  const r = evaluateCoupon(pct, { ...ctx, itemsTotal: 100000 });
  assert.ok(r.ok && r.discount === 4000);
  const small = evaluateCoupon({ ...baseCoupon, discount_value: '500.00', min_order_value: '0' }, { ...ctx, itemsTotal: 12000 });
  assert.ok(small.ok && small.discount === 12000);
  assert.equal(evaluateCoupon({ ...pct, applies_to: 'SERVICE' }, ctx).ok, false);
  assert.equal(normalizeCouponCode('  naya50 '), 'NAYA50');
});

const potato: QuoteProduct = { id: 12, name: 'Aloo', name_hi: 'आलू', item_type: 'PRODUCT', price: '25.00', stock_qty: 48, is_available: 1, max_qty_per_order: 20, prescription_required: 0, visiting_charge: '0', vertical_enabled: true };
const quote = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  lines: [{ productId: 12, quantity: 4 }], products: new Map([[12, potato]]), orderType: 'DELIVERY',
  minOrder: 9900, deliveryFee: 2000, freeDeliveryAbove: 49900, discount: 0, walletBalance: 1000, useWallet: false,
  paymentMethod: 'COD', trust: { phoneVerified: true, deliveredCount: 0, trustOrdersNeeded: 1, codUnverifiedLimit: 30000 }, ...over,
});

test('quote: server price × qty + delivery fee', () => {
  const q = computeQuote(quote());
  assert.equal(q.itemsTotal, 10000);
  assert.equal(q.deliveryFee, 2000);
  assert.equal(q.grandTotal, 12000);
});
test('quote: free delivery above threshold; wallet capped at payable', () => {
  const q = computeQuote(quote({ lines: [{ productId: 12, quantity: 20 }], useWallet: true, walletBalance: 999999 }));
  assert.equal(q.deliveryFee, 0);
  assert.equal(q.walletUsed, 50000);
  assert.equal(q.grandTotal, 0);
});
test('quote: min order 422 / stock 422 / qty limit 422 / unavailable / vertical off', () => {
  assert.throws(() => computeQuote(quote({ lines: [{ productId: 12, quantity: 3 }] })), (e: QuoteError) => e.code === 'MIN_ORDER_NOT_MET');
  assert.throws(() => computeQuote(quote({ products: new Map([[12, { ...potato, stock_qty: 2 }]]) })), (e: QuoteError) => e.code === 'STOCK_INSUFFICIENT' && e.params.n === 2);
  assert.throws(() => computeQuote(quote({ lines: [{ productId: 12, quantity: 21 }] })), (e: QuoteError) => e.code === 'QTY_LIMIT');
  assert.throws(() => computeQuote(quote({ products: new Map([[12, { ...potato, is_available: 0 }]]) })), (e: QuoteError) => e.code === 'PRODUCT_UNAVAILABLE');
  assert.throws(() => computeQuote(quote({ products: new Map([[12, { ...potato, vertical_enabled: false }]]) })), (e: QuoteError) => e.code === 'PRODUCT_UNAVAILABLE');
});
test('quote: COD trust gate for unverified first order, lifted after a delivered order (ORD-09)', () => {
  const big = { lines: [{ productId: 12, quantity: 16 }] }; // ₹400
  const unverified = { phoneVerified: false, deliveredCount: 0, trustOrdersNeeded: 1, codUnverifiedLimit: 30000 };
  assert.throws(() => computeQuote(quote({ ...big, trust: unverified })), (e: QuoteError) => e.code === 'COD_LIMIT_EXCEEDED');
  assert.doesNotThrow(() => computeQuote(quote({ ...big, trust: { ...unverified, deliveredCount: 1 } })));
  assert.doesNotThrow(() => computeQuote(quote({ ...big, trust: unverified, paymentMethod: 'UPI' })));
});
test('quote: SERVICE → no delivery fee, visiting charge applies, no min order', () => {
  const svc: QuoteProduct = { ...potato, id: 90, item_type: 'SERVICE', price: '0.00', stock_qty: 0, visiting_charge: '99.00' };
  const q = computeQuote(quote({ orderType: 'SERVICE', lines: [{ productId: 90, quantity: 1 }], products: new Map([[90, svc]]) }));
  assert.equal(q.deliveryFee, 0);
  assert.equal(q.visitingCharge, 9900);
  assert.equal(q.grandTotal, 9900);
});
test('quote: rx flag', () => {
  const med = { ...potato, prescription_required: 1 };
  assert.equal(computeQuote(quote({ products: new Map([[12, med]]) })).needsPrescription, true);
});

test('adjustment: weighed item 1 kg → ₹22.50 (900 g), tomato removed → restock 1 (ORD-12)', () => {
  const lines = [
    { itemId: 1, quantity: 1, unitPrice: 2500, lineTotal: 2500, isWeighted: true, alreadyRemoved: false, currentFinalQty: null, currentFinalLineTotal: null },
    { itemId: 2, quantity: 2, unitPrice: 4000, lineTotal: 8000, isWeighted: false, alreadyRemoved: false, currentFinalQty: null, currentFinalLineTotal: null },
    { itemId: 3, quantity: 1, unitPrice: 3000, lineTotal: 3000, isWeighted: false, alreadyRemoved: false, currentFinalQty: null, currentFinalLineTotal: null },
  ];
  const r = applyAdjustment(lines, [{ itemId: 1, finalLineTotal: 2250 }, { itemId: 2, finalQuantity: 1 }, { itemId: 3, remove: true }]);
  assert.equal(r.newItemsTotal, 2250 + 4000);
  assert.equal(r.lines.find((l) => l.itemId === 1)?.returnedQty, 0);
  assert.equal(r.lines.find((l) => l.itemId === 2)?.returnedQty, 1);
  assert.equal(r.lines.find((l) => l.itemId === 3)?.returnedQty, 1);
  // delivery fee never increases: stays ₹20 even though the total fell below free-delivery
  assert.equal(adjustedGrandTotal({ newItemsTotal: r.newItemsTotal, deliveryFee: '20.00', visitingCharge: '0', discountAfter: 0, walletUsed: '0' }), 8250);
});
test('adjustment: increase refused (ORD-13); amount override only for weighed & never higher; all removed → cancel', () => {
  const l = { itemId: 1, quantity: 1, unitPrice: 2500, lineTotal: 2500, isWeighted: false, alreadyRemoved: false, currentFinalQty: null, currentFinalLineTotal: null };
  assert.throws(() => applyAdjustment([l], [{ itemId: 1, finalQuantity: 2 }]), AdjustError);
  assert.throws(() => applyAdjustment([l], [{ itemId: 1, finalLineTotal: 2000 }]), AdjustError);
  assert.throws(() => applyAdjustment([{ ...l, isWeighted: true }], [{ itemId: 1, finalLineTotal: 2600 }]), AdjustError);
  assert.equal(applyAdjustment([l], [{ itemId: 1, remove: true }]).allRemoved, true);
});

test('permissions: the GLOBAL admin gets all 35 (incl. staff.manage_riders); override grant/revoke; admin-only never leaks (RBAC-07)', () => {
  // ⚠️ The blanket ADMIN bypass now belongs to the owner alone. A second admin is a manager whose
  // access the owner ticks item by item, so the role on its own carries nothing — see
  // test/unit/global-admin.spec.ts for that side of the rule.
  assert.equal(resolvePermissions('ADMIN', [], [], true).size, 35);
  assert.equal(resolvePermissions('ADMIN', [], []).size, 0);
  const base = ['orders.view', 'orders.view_all', 'reports.view'];
  const p = resolvePermissions('SUPERVISOR', base, [
    { permission_code: 'staff.create', granted: 1 },
    { permission_code: 'reports.view', granted: 0 },
    { permission_code: 'settings.manage', granted: 1 },
  ]);
  assert.ok(p.has('staff.create'));
  assert.equal(p.has('reports.view'), false);
  assert.equal(p.has('settings.manage'), false);
  assert.equal(resolvePermissions('CUSTOMER', ['orders.view'], []).size, 0);
});
test('permissions: actor can only grant what it holds', () => {
  const actor = new Set(['orders.view', 'staff.create'] as const);
  const r = grantablePermissions(actor as never, ['orders.view', 'payments.verify', 'permissions.manage']);
  assert.deepEqual(r.ok, ['orders.view']);
  assert.deepEqual(r.denied, ['payments.verify', 'permissions.manage']);
});

test('JOB: failure releases the lock and backs off 2^n minutes; max attempts → failed', () => {
  const a = onJobFailure(0, 5);
  assert.deepEqual(a.release, { locked_at: null, locked_by: null });
  assert.equal(a.retryAfterMinutes, 2);
  assert.equal(onJobFailure(3, 5).retryAfterMinutes, 16);
  const last = onJobFailure(4, 5);
  assert.equal(last.failed, true);
  assert.equal(last.retryAfterMinutes, null);
});

test('service slots: past slots hidden today, full slots disabled', () => {
  const s = buildSlots({ open: '09:00', close: '19:00', slotMinutes: 120, technicians: 2, bookedByStart: { '13:00': 2 }, isToday: true, nowMinutes: 10 * 60 });
  assert.deepEqual(s.map((x) => x.start), ['11:00', '13:00', '15:00', '17:00']);
  assert.equal(s.find((x) => x.start === '13:00')?.available, false);
  assert.ok(s.find((x) => x.start === '13:00')?.labelHi.includes('भरा हुआ'));
});

test('ratings: incremental avg + comment sanitise/flag', () => {
  assert.deepEqual(addRating(4.3, 12, 5), { avg: 4.35, count: 13 });
  assert.deepEqual(sanitizeComment('<b>बढ़िया</b> सब्ज़ी'), { comment: 'बढ़िया सब्ज़ी', flagged: false });
  assert.equal(sanitizeComment('sasta yahan: https://x.in').flagged, true);
});

const refFacts: ReferralFacts = {
  referral: { referrer_id: 5, referred_id: 9, reward_issued_at: null, signup_ip: '1.1.1.1' },
  customerId: 9, deliveredCount: 1, paymentStatus: 'PAID', payable: '250.00', minOrder: '199.00',
  phoneVerified: true, referrerSignupIp: '2.2.2.2', sameAddress: false, rewardsToday: 0, dailyCap: 10,
};
test('referral: rewards only a genuine first paid order', () => {
  assert.equal(decideReferral(refFacts).action, 'REWARD');
  assert.equal(decideReferral({ ...refFacts, deliveredCount: 2 }).action, 'SKIP');
  assert.equal(decideReferral({ ...refFacts, paymentStatus: 'PENDING' }).action, 'SKIP');
  assert.equal(decideReferral({ ...refFacts, payable: '150.00' }).action, 'SKIP');
  assert.equal(decideReferral({ ...refFacts, phoneVerified: false }).action, 'SKIP');
  assert.equal(decideReferral({ ...refFacts, referrerSignupIp: '1.1.1.1' }).action, 'FLAG');
  assert.equal(decideReferral({ ...refFacts, rewardsToday: 10 }).action, 'FLAG');
  assert.equal(decideReferral({ ...refFacts, referral: { ...refFacts.referral!, reward_issued_at: '2026-01-01' } }).action, 'SKIP');
});
