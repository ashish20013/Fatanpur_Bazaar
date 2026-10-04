import test from 'node:test';
import assert from 'node:assert/strict';
import { formatInr, fromPaise, mulQty, percentOf, roundRupee, toPaise } from '../../src/common/utils/money';

test('toPaise parses decimal strings exactly (no float error)', () => {
  assert.equal(toPaise('25.00'), 2500);
  assert.equal(toPaise('0.1') + toPaise('0.2'), 30);
  assert.equal(toPaise('19.99'), 1999);
  assert.equal(toPaise('7.5'), 750);
  assert.equal(toPaise(12.34), 1234);
  assert.equal(toPaise(null), 0);
  assert.throws(() => toPaise('12.345'));
  assert.throws(() => toPaise('abc'));
});
test('fromPaise formats with 2 decimals', () => {
  assert.equal(fromPaise(2500), '25.00');
  assert.equal(fromPaise(5), '0.05');
  assert.equal(fromPaise(-150), '-1.50');
});
test('mulQty handles weighed fractional quantities with half-up rounding', () => {
  assert.equal(mulQty(2500, 2), 5000);
  assert.equal(mulQty(2500, 0.9), 2250);
  assert.equal(mulQty(3333, 3), 9999);
  assert.equal(mulQty(1999, 0.333), 666); // 665.667 → 666
});
test('percentOf / roundRupee', () => {
  assert.equal(percentOf(50000, 10), 5000);
  assert.equal(percentOf(12345, '12.5'), 1543); // 1543.125
  assert.equal(roundRupee(1543), 1500);
  assert.equal(roundRupee(1550), 1600);
});
test('formatInr', () => {
  assert.equal(formatInr(24500), '₹245');
  assert.equal(formatInr(24550), '₹245.50');
});
