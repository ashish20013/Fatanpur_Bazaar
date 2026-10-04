import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { excessPaise, heldPaise, receivedPaise } from '../../src/domain/payment-money';
import { adjustedSettlement, couponDiscountOn } from '../../src/domain/adjustment';

/**
 * Money given back. Every case here is a way the shop either kept a customer's rupees or paid
 * him twice, found by reading the code and fixed. They are written as the scenario, in rupees, so
 * the next person can see what each one protects.
 */
const P = (rupees: number): number => Math.round(rupees * 100);

describe('refunds come from what was RECEIVED, not from what is owed', () => {
  it('⚠️ ₹500 paid, adjusted to ₹400 (₹100 back), then cancelled → the remaining ₹400 comes back, not ₹300', () => {
    // After the adjustment: owed 400, refunded 100. The old formula was owed − refunded = 300.
    const pay = { amount: '500.00', amount_received: '500.00', refund_amount: '100.00' };
    assert.equal(heldPaise(pay), P(400));
  });

  it('⚠️ ₹500 paid, adjusted hard to ₹200 (₹300 back), then cancelled → ₹200 comes back, not nothing', () => {
    // The old formula: 200 − 300 = −100 → "paid > 0" failed → nothing refunded, order left PAID.
    const pay = { amount: '500.00', amount_received: '500.00', refund_amount: '300.00' };
    assert.equal(heldPaise(pay), P(200));
  });

  it('rows paid before the column existed fall back to `amount` — which is what was paid', () => {
    assert.equal(receivedPaise({ amount: '500.00', amount_received: null, refund_amount: '0.00' }), P(500));
    assert.equal(heldPaise({ amount: '500.00', amount_received: null, refund_amount: '100.00' }), P(400));
  });

  it('never negative, even if the books were wrong', () => {
    assert.equal(heldPaise({ amount: '100.00', amount_received: '100.00', refund_amount: '150.00' }), 0);
  });

  it('⚠️ UPI verified after the order shrank: ₹300 sent, ₹250 owed → ₹50 back', () => {
    // The normal path: small UPI orders confirm on claim, and confirmed orders are the ones weighed.
    assert.equal(excessPaise({ amount: '300.00', amount_received: '300.00', refund_amount: '0.00' }, P(250)), P(50));
  });

  it('no excess when he paid exactly what he owes, or less', () => {
    assert.equal(excessPaise({ amount: '250.00', amount_received: '250.00', refund_amount: '0.00' }, P(250)), 0);
    assert.equal(excessPaise({ amount: '200.00', amount_received: '200.00', refund_amount: '0.00' }, P(250)), 0);
  });

  it('a second adjustment only gives back what the first did not', () => {
    // ₹500 paid → adjusted to ₹400 (₹100 back) → adjusted again to ₹350: ₹50 more, not ₹150.
    assert.equal(excessPaise({ amount: '500.00', amount_received: '500.00', refund_amount: '100.00' }, P(350)), P(50));
  });
});

describe('adjustment gives back wallet money the smaller order no longer needs', () => {
  it('⚠️ ₹100 from the wallet on a ₹130 order weighed down to ₹50 → ₹50 back to the wallet', () => {
    // Items 120 + fee 10 = 130; wallet 100; COD 30. Items cut to 40 → payable 50.
    const r = adjustedSettlement({ newItemsTotal: P(40), deliveryFee: '10.00', visitingCharge: '0.00', discountAfter: 0, walletUsed: '100.00' });
    assert.equal(r.grand, 0, 'nothing more to collect at the door');
    assert.equal(r.walletBack, P(50), 'the wallet gets back what it over-covered');
    assert.equal(r.walletUsedAfter, P(50), 'and the order now records only ₹50 of wallet — so a cancel refunds ₹50, not ₹100 again');
  });

  it('a wallet-only order that shrinks gives the whole difference back', () => {
    const r = adjustedSettlement({ newItemsTotal: P(60), deliveryFee: '0.00', visitingCharge: '0.00', discountAfter: 0, walletUsed: '100.00' });
    assert.equal(r.walletBack, P(40));
    assert.equal(r.grand, 0);
  });

  it('when the wallet covered only part, nothing comes back — the cash due just shrinks', () => {
    const r = adjustedSettlement({ newItemsTotal: P(200), deliveryFee: '20.00', visitingCharge: '0.00', discountAfter: 0, walletUsed: '50.00' });
    assert.equal(r.walletBack, 0);
    assert.equal(r.grand, P(170));
    assert.equal(r.walletUsedAfter, P(50));
  });
});

describe('a coupon is re-worked on the new total with the original rule', () => {
  const pct = { discount_type: 'PERCENT' as const, discount_value: '10.00', max_discount: '40.00', min_order_value: '200.00' };
  const flat = { discount_type: 'FLAT' as const, discount_value: '50.00', max_discount: null, min_order_value: '199.00' };

  it('⚠️ 10% (max ₹40) on ₹400 is ₹40; weighed down to ₹260 it becomes ₹26, not a kept ₹40', () => {
    assert.equal(couponDiscountOn(P(400), pct), P(40));
    assert.equal(couponDiscountOn(P(260), pct), P(26));
  });

  it('below the minimum it is zero', () => {
    assert.equal(couponDiscountOn(P(150), pct), 0);
    assert.equal(couponDiscountOn(P(198), flat), 0);
  });

  it('a flat coupon stays flat, and never exceeds the items', () => {
    assert.equal(couponDiscountOn(P(300), flat), P(50));
    assert.equal(couponDiscountOn(P(300), { ...flat, discount_value: '500.00', min_order_value: '0.00' }), P(300));
  });
});
