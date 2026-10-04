import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, type TestApp, createTestApp, idemKey } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { createCategory, createCustomer, createProduct, createServiceableAddress, createStaff, createVillage, issueToken } from '../helpers/fixtures';

/**
 * Broadcast model (Option A). An order drops into a shared pool the moment it is confirmed; any
 * on-duty rider takes it himself, no admin step. These tests pin the parts that matter: the pool
 * contents, the race when two riders tap together, and the guards (duty, order already taken).
 */
interface PlaceResult {
  orderNumber: string;
  status: string;
}
interface PoolRow {
  orderNumber: string;
  itemCount: number;
  collectAmount: string;
  paymentMethod: string;
}

describe('delivery pool (broadcast + self-claim)', () => {
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

  async function confirmedCodOrder(): Promise<{ orderNumber: string }> {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const village = await createVillage(t.db, { isActive: true, distanceKm: 2 });
    const addressId = await createServiceableAddress(t.db, customer.id, { villageId: village.id });
    const cat = await createCategory(t.db);
    const p = await createProduct(t.db, cat.id, { price: '100.00', mrp: '100.00', stockQty: 10 });
    const res = await post<PlaceResult>(t, '/orders', { token: accessToken, idempotencyKey: idemKey(), body: { addressId, items: [{ productId: p.id, quantity: 2 }], paymentMethod: 'COD' } });
    assert.equal(res.status, 201, JSON.stringify(res.body.error));
    assert.equal(res.body.data?.status, 'CONFIRMED');
    return { orderNumber: res.body.data!.orderNumber };
  }

  test('POOL: a confirmed COD order appears in the pool, then a rider claims it', async () => {
    const { orderNumber } = await confirmedCodOrder();
    const rider = await createStaff(t.db, 'DELIVERY_BOY', { isAvailable: true });
    const { accessToken } = await issueToken(t.app, rider);

    const pool = await get<PoolRow[]>(t, '/delivery/pool', { token: accessToken });
    assert.equal(pool.status, 200);
    const row = pool.body.data?.find((o) => o.orderNumber === orderNumber);
    assert.ok(row, 'order should be in the pool');
    assert.equal(row?.itemCount, 1);
    assert.equal(row?.collectAmount, '200.00'); // 2 × ₹100, COD
    assert.equal(row?.paymentMethod, 'COD');

    const claim = await post(t, `/delivery/claim/${orderNumber}`, { token: accessToken });
    assert.equal(claim.status, 200, JSON.stringify(claim.body.error));

    const order = await t.db('orders').where({ order_number: orderNumber }).first('status');
    assert.equal(order.status, 'ASSIGNED');
    const a = await t.db('delivery_assignments').where({ order_id: (await t.db('orders').where({ order_number: orderNumber }).first('id')).id });
    assert.equal(a.length, 1);
    assert.equal(a[0].status, 'ACCEPTED');
    assert.equal(a[0].rider_id, rider.id);
    assert.ok(/^\d{4}$/.test(a[0].delivery_otp), 'self-claim issues the 4-digit delivery code');

    // claimed → gone from the pool
    const after2 = await get<PoolRow[]>(t, '/delivery/pool', { token: accessToken });
    assert.ok(!after2.body.data?.some((o) => o.orderNumber === orderNumber), 'claimed order leaves the pool');
  });

  test('POOL: two riders claim the same order together → exactly one wins (race-safe)', async () => {
    const { orderNumber } = await confirmedCodOrder();
    const r1 = await createStaff(t.db, 'DELIVERY_BOY', { isAvailable: true });
    const r2 = await createStaff(t.db, 'DELIVERY_BOY', { isAvailable: true });
    const [t1, t2] = await Promise.all([issueToken(t.app, r1), issueToken(t.app, r2)]);

    const [a, b] = await Promise.all([
      post(t, `/delivery/claim/${orderNumber}`, { token: t1.accessToken }),
      post(t, `/delivery/claim/${orderNumber}`, { token: t2.accessToken }),
    ]);
    const wins = [a, b].filter((r) => r.status === 200).length;
    const conflicts = [a, b].filter((r) => r.status === 409).length;
    assert.equal(wins, 1, 'exactly one claim succeeds');
    assert.equal(conflicts, 1, 'the loser gets a clean 409');

    const active = await t.db('delivery_assignments')
      .join('orders', 'orders.id', 'delivery_assignments.order_id')
      .where('orders.order_number', orderNumber)
      .whereIn('delivery_assignments.status', ['OFFERED', 'ACCEPTED', 'PICKED_UP']);
    assert.equal(active.length, 1, 'only one active assignment ever exists');
  });

  test('POOL: an off-duty rider cannot claim', async () => {
    const { orderNumber } = await confirmedCodOrder();
    const rider = await createStaff(t.db, 'DELIVERY_BOY', { isAvailable: false });
    const { accessToken } = await issueToken(t.app, rider);
    const claim = await post(t, `/delivery/claim/${orderNumber}`, { token: accessToken });
    assert.notEqual(claim.status, 200);
    const order = await t.db('orders').where({ order_number: orderNumber }).first('status');
    assert.equal(order.status, 'CONFIRMED', 'order stays in the pool');
  });

  test('POOL: a claimed order cannot be claimed again (409 no-longer-available)', async () => {
    const { orderNumber } = await confirmedCodOrder();
    const r1 = await createStaff(t.db, 'DELIVERY_BOY', { isAvailable: true });
    const r2 = await createStaff(t.db, 'DELIVERY_BOY', { isAvailable: true });
    const t1 = await issueToken(t.app, r1);
    const t2 = await issueToken(t.app, r2);
    const first = await post(t, `/delivery/claim/${orderNumber}`, { token: t1.accessToken });
    assert.equal(first.status, 200);
    const second = await post(t, `/delivery/claim/${orderNumber}`, { token: t2.accessToken });
    assert.equal(second.status, 409);
  });

  test('POOL: admin manual assign still works and takes the order out of the pool', async () => {
    const { orderNumber } = await confirmedCodOrder();
    const admin = await createStaff(t.db, 'ADMIN', { globalAdmin: true });
    const rider = await createStaff(t.db, 'DELIVERY_BOY', { isAvailable: true });
    const adminTok = await issueToken(t.app, admin);
    const riderTok = await issueToken(t.app, rider);

    const assign = await post(t, `/admin/orders/${orderNumber}/assign`, { token: adminTok.accessToken, body: { riderId: rider.id } });
    assert.equal(assign.status, 201, JSON.stringify(assign.body.error));
    const order = await t.db('orders').where({ order_number: orderNumber }).first('status');
    assert.equal(order.status, 'ASSIGNED');

    const pool = await get<PoolRow[]>(t, '/delivery/pool', { token: riderTok.accessToken });
    assert.ok(!pool.body.data?.some((o) => o.orderNumber === orderNumber), 'assigned order is not claimable');
    const claim = await post(t, `/delivery/claim/${orderNumber}`, { token: riderTok.accessToken });
    assert.equal(claim.status, 409);
  });
});
