import test from 'node:test';
import assert from 'node:assert/strict';
import { decrementUnsigned, decrementUnsignedSql } from '../../src/common/utils/unsigned';

test('decrementUnsigned uses col - LEAST(col, n) — never GREATEST(0, col - n)', () => {
  const sql = decrementUnsignedSql('products', 'sold_count', ['id']);
  assert.equal(sql, 'UPDATE `products` SET `sold_count` = `sold_count` - LEAST(`sold_count`, ?) WHERE `id` = ?');
  assert.equal(/GREATEST/.test(sql), false);
});
test('decrementUnsigned rejects unsafe identifiers', () => {
  assert.throws(() => decrementUnsignedSql('products; DROP TABLE x', 'sold_count', ['id']));
  assert.throws(() => decrementUnsignedSql('products', 'sold_count', ['id`=1 OR 1']));
});
test('decrementUnsigned binds amount then where values; no-op on 0; WHERE mandatory', async () => {
  const calls: { sql: string; b: unknown[] }[] = [];
  const fake = { raw: async (sql: string, b: unknown[]) => { calls.push({ sql, b }); } } as never;
  await decrementUnsigned(fake, 'coupons', 'used_count', 1, { id: 7 });
  assert.deepEqual(calls[0].b, [1, 7]);
  await decrementUnsigned(fake, 'coupons', 'used_count', 0, { id: 7 });
  assert.equal(calls.length, 1);
  await assert.rejects(() => decrementUnsigned(fake, 'coupons', 'used_count', 1, {}));
  await assert.rejects(() => decrementUnsigned(fake, 'coupons', 'used_count', -1, { id: 1 }));
});
