import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { idemKey, patch, post, type TestApp, createTestApp } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { createCategory, createCustomer, createProduct, createServiceableAddress, createStaff, issueToken } from '../helpers/fixtures';

/**
 * Three corners of the money flow that the main suites walk past:
 *  - an order the wallet pays for in full, placed with "UPI" ticked,
 *  - a cancelled service booking (no stock, but it was counted as sold),
 *  - goods returned after a paid delivery.
 */
describe('money edges', () => {
  let t: TestApp;
  before(async () => {
    t = await createTestApp();
  });
  after(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDb(t.db, t.cache, process.env.DB_NAME as string);
  });

  test('a ₹0 order (wallet covers everything) placed as UPI is settled at once, not left waiting for a payment', async () => {
    const customer = await createCustomer(t.db);
    await t.db('wallets').where({ user_id: customer.id }).update({ balance: '1000.00' });
    const addressId = await createServiceableAddress(t.db, customer.id);
    const cat = await createCategory(t.db);
    const product = await createProduct(t.db, cat.id, { price: '150.00', mrp: '150.00', stockQty: 10 });
    const { accessToken } = await issueToken(t.app, customer);

    const res = await post<{ orderNumber: string; status: string; upi: unknown }>(t, '/orders', {
      token: accessToken,
      idempotencyKey: idemKey(),
      body: { addressId, items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'UPI', useWallet: true },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const no = res.body.data?.orderNumber as string;
    const order = await t.db('orders').where({ order_number: no }).first('id', 'status', 'payment_method', 'payment_status', 'grand_total');
    assert.equal(order.grand_total, '0.00');
    assert.equal(order.status, 'CONFIRMED', 'nothing to pay → no PENDING_PAYMENT for the auto-cancel to kill');
    assert.equal(order.payment_status, 'PAID');
    assert.equal(order.payment_method, 'WALLET');
    assert.equal(res.body.data?.upi, null, 'no UPI screen for ₹0');
    const pay = await t.db('payments').where({ order_id: order.id }).first('status', 'method');
    assert.deepEqual({ ...pay }, { status: 'PAID', method: 'WALLET' });
  });

  test('cancelling a service booking takes it back out of sold_count', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const cat = await createCategory(t.db, { itemType: 'SERVICE' });
    const svc = await createProduct(t.db, cat.id, { itemType: 'SERVICE', price: '0.00', visitingCharge: '100.00' });

    const placed = await post<{ orderNumber: string }>(t, '/orders', {
      token: accessToken,
      idempotencyKey: idemKey(),
      body: { addressId, items: [{ productId: svc.id, quantity: 1 }], paymentMethod: 'COD', orderType: 'SERVICE', slot: { date: '2027-01-15', start: '10:00' } },
    });
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    assert.equal((await t.db('products').where({ id: svc.id }).first('sold_count')).sold_count, 1);

    const admin = await createStaff(t.db, 'ADMIN');
    const { accessToken: adminTok } = await issueToken(t.app, admin);
    const no = placed.body.data?.orderNumber as string;
    const cancelled = await patch(t, `/admin/orders/${no}/status`, { token: adminTok, body: { status: 'CANCELLED', note: 'ग्राहक ने मना किया' } });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal((await t.db('products').where({ id: svc.id }).first('sold_count')).sold_count, 0);
  });

  test('goods returned after a paid delivery land in the refund queue — never paid out on their own', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const cat = await createCategory(t.db);
    const product = await createProduct(t.db, cat.id, { price: '300.00', mrp: '300.00', stockQty: 10 });
    const placed = await post<{ orderNumber: string }>(t, '/orders', { token: accessToken, idempotencyKey: idemKey(), body: { addressId, items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'COD' } });
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const no = placed.body.data?.orderNumber as string;
    const order = await t.db('orders').where({ order_number: no }).first('id', 'grand_total');
    // Delivered and paid in cash — the state the RETURNED transition starts from.
    await t.db('orders').where({ id: order.id }).update({ status: 'DELIVERED', payment_status: 'PAID', delivered_at: t.db.fn.now() });
    await t.db('payments').where({ order_id: order.id }).update({ status: 'PAID', amount_received: order.grand_total, paid_at: t.db.fn.now() });
    const walletBefore = (await t.db('wallets').where({ user_id: customer.id }).first('balance')).balance;

    const admin = await createStaff(t.db, 'ADMIN');
    const { accessToken: adminTok } = await issueToken(t.app, admin);
    const returned = await patch(t, `/admin/orders/${no}/status`, { token: adminTok, body: { status: 'RETURNED', note: 'सब्ज़ी खराब निकली' } });
    assert.equal(returned.status, 200, JSON.stringify(returned.body));

    const pay = await t.db('payments').where({ order_id: order.id }).first('id', 'status');
    assert.equal(pay.status, 'REFUND_PENDING');
    assert.equal((await t.db('orders').where({ id: order.id }).first('payment_status')).payment_status, 'REFUND_PENDING');
    assert.equal((await t.db('wallets').where({ user_id: customer.id }).first('balance')).balance, walletBefore, 'nothing credited until a person decides');

    // Half came back: the admin refunds ₹150 of the ₹(grand total) held; more than held is refused.
    const tooMuch = await post(t, `/payments/${pay.id}/refund`, { token: adminTok, body: { method: 'WALLET', amount: '99999.00' } });
    assert.equal(tooMuch.status, 422);
    const half = await post(t, `/payments/${pay.id}/refund`, { token: adminTok, body: { method: 'WALLET', amount: '150.00' } });
    assert.ok(half.status === 200 || half.status === 201, JSON.stringify(half.body));
    assert.equal((await t.db('wallets').where({ user_id: customer.id }).first('balance')).balance, (Number(walletBefore) + 150).toFixed(2));
  });
});
