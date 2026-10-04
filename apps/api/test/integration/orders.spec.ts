import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { patch, post, type TestApp, createTestApp, idemKey, toReadyForPickup } from '../helpers/app';
import { resetDb } from '../helpers/db';
import {
  createCategory,
  createCoupon,
  createCustomer,
  createOutOfAreaAddress,
  createProduct,
  createServiceableAddress,
  createStaff,
  createVillage,
  insertPrescription,
  issueToken,
} from '../helpers/fixtures';

/** Shared shape returned by POST /orders. */
interface PlaceResult {
  orderNumber: string;
  status: string;
  grandTotal: string;
}

describe('orders', () => {
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

  /** One category + one product (default price ₹150, stock 10) ready to order. */
  async function product(overrides: Parameters<typeof createProduct>[2] = {}) {
    const cat = await createCategory(t.db);
    return createProduct(t.db, cat.id, { price: '150.00', mrp: '150.00', stockQty: 10, ...overrides });
  }

  async function placeCod(token: string, addressId: number, productId: number, quantity = 1, extra: Record<string, unknown> = {}) {
    return post<PlaceResult>(t, '/orders', {
      token,
      idempotencyKey: idemKey(),
      body: { addressId, items: [{ productId, quantity }], paymentMethod: 'COD', ...extra },
    });
  }

  test('ORD: a COD order end-to-end — stock decremented, item snapshot, payment row', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    // The shop currently charges no delivery fee, so this test sets its own on the village it
    // creates (a village fee outranks the zone, A8.8). The arithmetic is what is under test here,
    // not the owner's price list — tying the two together is what broke this test when he dropped
    // the fee to zero.
    const village = await createVillage(t.db, { isActive: true, distanceKm: 2, deliveryFee: '20.00' });
    const addressId = await createServiceableAddress(t.db, customer.id, { villageId: village.id });
    const p = await product({ price: '100.00', mrp: '100.00', stockQty: 10 });

    const res = await placeCod(accessToken, addressId, p.id, 2);
    assert.equal(res.status, 201);
    assert.equal(res.body.data?.status, 'CONFIRMED'); // COD goes straight to CONFIRMED (A14 step 10)
    assert.equal(res.body.data?.grandTotal, '220.00'); // 2*100 + 20 delivery fee (seeded zone)

    const order = await t.db('orders').where({ order_number: res.body.data?.orderNumber }).first();
    assert.equal(order.customer_id, customer.id);
    assert.equal(order.payment_method, 'COD');
    assert.equal(order.payment_status, 'PENDING'); // COD is only PAID at delivery (A15 §12)

    const items = await t.db('order_items').where({ order_id: order.id });
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 2);
    assert.equal(items[0].product_name, p.name); // snapshot, not a live join

    const pay = await t.db('payments').where({ order_id: order.id }).first();
    assert.equal(pay.method, 'COD');
    assert.equal(pay.status, 'PENDING');
    assert.equal(pay.amount, '220.00');

    const row = await t.db('products').where({ id: p.id }).first('stock_qty', 'sold_count');
    assert.equal(row.stock_qty, 8);
    assert.equal(row.sold_count, 2);
  });

  test('ORD: idempotency — the same X-Idempotency-Key twice creates exactly one order', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const p = await product();
    const key = idemKey();
    const body = { addressId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'COD' as const };

    const first = await post<PlaceResult>(t, '/orders', { token: accessToken, idempotencyKey: key, body });
    assert.equal(first.status, 201);
    const second = await post<PlaceResult>(t, '/orders', { token: accessToken, idempotencyKey: key, body });
    assert.equal(second.status, 201);
    assert.equal(second.body.data?.orderNumber, first.body.data?.orderNumber);

    const [{ n }] = await t.db('orders').where({ customer_id: customer.id }).count({ n: '*' });
    assert.equal(Number(n), 1);
  });

  test('ORD: CONCURRENT — stock=1, two different customers order at once → exactly one succeeds', async () => {
    const p = await product({ stockQty: 1 });
    const buyers = await Promise.all([createCustomer(t.db), createCustomer(t.db)]);
    const addresses = await Promise.all(buyers.map((b) => createServiceableAddress(t.db, b.id)));
    const tokens = await Promise.all(buyers.map((b) => issueToken(t.app, b)));

    const results = await Promise.all(tokens.map((tok, i) => placeCod(tok.accessToken, addresses[i], p.id, 1)));
    const ok = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status === 422);
    assert.equal(ok.length, 1, 'exactly one of the two concurrent orders must succeed');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].body.error?.code, 'STOCK_INSUFFICIENT');

    const row = await t.db('products').where({ id: p.id }).first('stock_qty');
    assert.equal(row.stock_qty, 0);
  });

  test('ORD: CONCURRENT — stock=10, ten different customers order at once → all ten succeed, stock hits 0', async () => {
    const p = await product({ stockQty: 10 });
    const buyers = await Promise.all(Array.from({ length: 10 }, () => createCustomer(t.db)));
    const addresses = await Promise.all(buyers.map((b) => createServiceableAddress(t.db, b.id)));
    const tokens = await Promise.all(buyers.map((b) => issueToken(t.app, b)));

    const results = await Promise.all(tokens.map((tok, i) => placeCod(tok.accessToken, addresses[i], p.id, 1)));
    assert.equal(
      results.filter((r) => r.status === 201).length,
      10,
      'no oversell — every one of the 10 orders against 10 units of stock must succeed',
    );
    const row = await t.db('products').where({ id: p.id }).first('stock_qty', 'sold_count');
    assert.equal(row.stock_qty, 0);
    assert.equal(row.sold_count, 10);

    // Ten orders placed in the same second must also carry ten different order numbers. Reading
    // MAX(order_number) used to hand the same one to several of them and the losers died on the
    // unique key, so the number now comes from an atomic per-day counter.
    const numbers = results.map((r) => r.body?.data?.orderNumber).filter(Boolean);
    assert.equal(new Set(numbers).size, 10, `order numbers must all differ, got ${numbers.join(', ')}`);
  });

  test('ORD: cancelling a confirmed order restores stock, refunds the wallet, and rolls back the coupon', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const feeVillage = await createVillage(t.db, { isActive: true, distanceKm: 2, deliveryFee: '20.00' });
    const addressId = await createServiceableAddress(t.db, customer.id, { villageId: feeVillage.id });
    const p = await product({ price: '200.00', mrp: '200.00', stockQty: 10 });
    await t.db('wallets').where({ user_id: customer.id }).update({ balance: '50.00' });
    const coupon = await createCoupon(t.db, { discountType: 'FLAT', discountValue: '30.00', minOrderValue: '0.00' });

    const placed = await post<PlaceResult>(t, '/orders', {
      token: accessToken,
      idempotencyKey: idemKey(),
      body: { addressId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'COD', couponCode: coupon.code, useWallet: true },
    });
    assert.equal(placed.status, 201);
    const orderNo = placed.body.data?.orderNumber as string;
    // 200 items + 20 delivery − 30 coupon = 190, wallet covers 50 of it → grandTotal 140
    assert.equal(placed.body.data?.grandTotal, '140.00');

    const afterPlace = await t.db('wallets').where({ user_id: customer.id }).first('balance');
    assert.equal(afterPlace.balance, '0.00');
    const stockAfterPlace = await t.db('products').where({ id: p.id }).first('stock_qty');
    assert.equal(stockAfterPlace.stock_qty, 9);

    const cancelled = await post(t, `/orders/${orderNo}/cancel`, { token: accessToken, body: { reason: 'मन बदल गया' } });
    assert.equal(cancelled.status, 200);

    const stockAfterCancel = await t.db('products').where({ id: p.id }).first('stock_qty', 'sold_count');
    assert.equal(stockAfterCancel.stock_qty, 10);
    assert.equal(stockAfterCancel.sold_count, 0);
    const walletAfterCancel = await t.db('wallets').where({ user_id: customer.id }).first('balance');
    assert.equal(walletAfterCancel.balance, '50.00');
    const couponRow = await t.db('coupons').where({ id: coupon.id }).first('used_count');
    assert.equal(couponRow.used_count, 0);
    const usageRow = await t.db('coupon_usages').where({ coupon_id: coupon.id });
    assert.equal(usageRow.length, 0);
  });

  test('ORD: an address outside the 6 km zone is rejected with 422 on BOTH /orders/quote and POST /orders', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createOutOfAreaAddress(t.db, customer.id);
    const p = await product();

    const quote = await post(t, '/orders/quote', { token: accessToken, body: { addressId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'COD' } });
    assert.equal(quote.status, 422);
    assert.equal(quote.body.error?.code, 'OUT_OF_SERVICE_AREA');

    const placed = await placeCod(accessToken, addressId, p.id, 1);
    assert.equal(placed.status, 422);
    assert.equal(placed.body.error?.code, 'OUT_OF_SERVICE_AREA');
  });

  test('ORD: an order below the zone minimum is rejected with 422 MIN_ORDER_NOT_MET', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    // The shop has no minimum order any more, so the test sets one of its own: the gate still has
    // to work for a shopkeeper who turns it back on in Settings.
    const minVillage = await createVillage(t.db, { isActive: true, distanceKm: 2, minOrder: '99.00' });
    const addressId = await createServiceableAddress(t.db, customer.id, { villageId: minVillage.id });
    const p = await product({ price: '30.00', mrp: '30.00' });
    const res = await placeCod(accessToken, addressId, p.id, 1);
    assert.equal(res.status, 422);
    assert.equal(res.body.error?.code, 'MIN_ORDER_NOT_MET');
  });

  test('ORD: first-order COD limit blocks a large unverified order, then lifts after one DELIVERED order', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const rider = await createStaff(t.db, 'DELIVERY_BOY');
    const customer = await createCustomer(t.db, { phoneVerified: false });
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const { accessToken: riderToken } = await issueToken(t.app, rider);
    const { accessToken: customerToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const cheap = await product({ price: '150.00', mrp: '150.00' }); // under the ₹500 default limit
    const pricey = await product({ price: '600.00', mrp: '600.00' }); // over it

    const blocked = await placeCod(customerToken, addressId, pricey.id, 1);
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.error?.code, 'COD_LIMIT_EXCEEDED');

    // Take one small order all the way to DELIVERED so the customer becomes "trusted".
    const first = await placeCod(customerToken, addressId, cheap.id, 1);
    assert.equal(first.status, 201);
    const orderNo = first.body.data?.orderNumber as string;
    await toReadyForPickup(t, adminToken, orderNo);
    const assign = await post(t, `/admin/orders/${orderNo}/assign`, { token: adminToken, body: { riderId: rider.id } });
    assert.equal(assign.status, 201);
    const assignmentRow = await t.db('delivery_assignments').where({ order_id: (await t.db('orders').where({ order_number: orderNo }).first('id')).id }).first('id', 'delivery_otp');
    const accept = await post(t, `/delivery/assignments/${assignmentRow.id}/accept`, { token: riderToken });
    assert.equal(accept.status, 200);
    const pickup = await post(t, `/delivery/assignments/${assignmentRow.id}/pickup`, { token: riderToken });
    assert.equal(pickup.status, 200);
    const complete = await post(t, `/delivery/assignments/${assignmentRow.id}/complete`, { token: riderToken, body: { otp: assignmentRow.delivery_otp } });
    assert.equal(complete.status, 200);
    const delivered = await t.db('orders').where({ order_number: orderNo }).first('status', 'payment_status');
    assert.equal(delivered.status, 'DELIVERED');
    assert.equal(delivered.payment_status, 'PAID'); // COD → PAID only at delivery (A15 §12)

    // Now the same customer can place the ₹600 order — deliveredCount(1) >= trust_orders_needed(1).
    const allowedNow = await placeCod(customerToken, addressId, pricey.id, 1);
    assert.equal(allowedNow.status, 201);
  });

  test('ORD: an invalid state transition is rejected with 409', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const p = await product();
    const placed = await placeCod(accessToken, addressId, p.id, 1);
    const orderNo = placed.body.data?.orderNumber as string; // status CONFIRMED
    // CONFIRMED → OUT_FOR_DELIVERY skips every intermediate step — not in DELIVERY_FLOW.
    const res = await patch(t, `/admin/orders/${orderNo}/status`, { token: adminToken, body: { status: 'OUT_FOR_DELIVERY' } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, 'INVALID_STATE_TRANSITION');
  });

  test('ORD: a rider rejecting an assignment sends the order back to the pool, and it can be reassigned', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const riderA = await createStaff(t.db, 'DELIVERY_BOY');
    const riderB = await createStaff(t.db, 'DELIVERY_BOY');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const { accessToken: riderAToken } = await issueToken(t.app, riderA);
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const p = await product();
    const placed = await placeCod(accessToken, addressId, p.id, 1);
    const orderNo = placed.body.data?.orderNumber as string;

    await toReadyForPickup(t, adminToken, orderNo);
    const assign1 = await post(t, `/admin/orders/${orderNo}/assign`, { token: adminToken, body: { riderId: riderA.id } });
    assert.equal(assign1.status, 201);
    const a1 = await t.db('delivery_assignments').where({ rider_id: riderA.id }).first('id');
    const rejected = await post(t, `/delivery/assignments/${a1.id}/reject`, { token: riderAToken, body: { reason: 'गाड़ी खराब हो गई' } });
    assert.equal(rejected.status, 200);

    const backInPool = await t.db('orders').where({ order_number: orderNo }).first('status');
    assert.equal(backInPool.status, 'READY_FOR_PICKUP');

    const reassign = await post(t, `/admin/orders/${orderNo}/reassign`, { token: adminToken, body: { riderId: riderB.id } });
    assert.equal(reassign.status, 201);
    const a2 = await t.db('delivery_assignments').where({ rider_id: riderB.id }).first('status');
    assert.equal(a2.status, 'OFFERED');
  });

  test('ORD: adjustment — reducing a quantity restocks the difference and lowers the total', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const adjVillage = await createVillage(t.db, { isActive: true, distanceKm: 2, deliveryFee: '20.00' });
    const addressId = await createServiceableAddress(t.db, customer.id, { villageId: adjVillage.id });
    const p = await product({ price: '100.00', mrp: '100.00', stockQty: 10 });
    const placed = await placeCod(accessToken, addressId, p.id, 2);
    const orderNo = placed.body.data?.orderNumber as string; // 2*100 + 20 delivery = 220
    assert.equal(placed.body.data?.grandTotal, '220.00');
    const item = await t.db('order_items').where({ order_id: (await t.db('orders').where({ order_number: orderNo }).first('id')).id }).first('id');

    const adjusted = await post(t, `/admin/orders/${orderNo}/adjust`, { token: adminToken, body: { items: [{ itemId: item.id, finalQuantity: 1, note: 'सामान कम था' }] } });
    assert.equal(adjusted.status, 201);
    // Delivery fee is frozen at what was charged when ordered (₹20) — never recomputed upward (A16).
    assert.equal((adjusted.body.data as { finalGrandTotal: string }).finalGrandTotal, '120.00'); // 1*100 + 20

    const row = await t.db('products').where({ id: p.id }).first('stock_qty');
    assert.equal(row.stock_qty, 9); // 10 − 2 ordered + 1 returned
  });

  test('ORD: adjustment — increasing a quantity beyond what was ordered is rejected', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const p = await product({ stockQty: 10 });
    const placed = await placeCod(accessToken, addressId, p.id, 2);
    const orderNo = placed.body.data?.orderNumber as string;
    const item = await t.db('order_items').where({ order_id: (await t.db('orders').where({ order_number: orderNo }).first('id')).id }).first('id');

    const res = await post(t, `/admin/orders/${orderNo}/adjust`, { token: adminToken, body: { items: [{ itemId: item.id, finalQuantity: 5 }] } });
    assert.equal(res.status, 422);
    assert.equal(res.body.error?.code, 'BUSINESS_RULE');
  });

  test('ORD: a prescription-gated order cannot be CONFIRMED without approval, and rejection cancels + refunds + restocks', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const p = await product({ prescriptionRequired: true, stockQty: 10 });
    const rx = await insertPrescription(t.app, customer.id, 'PENDING_REVIEW');

    const placed = await post<PlaceResult>(t, '/orders', {
      token: accessToken,
      idempotencyKey: idemKey(),
      body: { addressId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'COD', prescriptionId: rx.id },
    });
    assert.equal(placed.status, 201);
    const orderNo = placed.body.data?.orderNumber as string;
    const order = await t.db('orders').where({ order_number: orderNo }).first('status', 'prescription_status');
    assert.equal(order.status, 'PENDING_PAYMENT'); // COD held back — rx still pending review
    assert.equal(order.prescription_status, 'PENDING_REVIEW');

    const confirmAttempt = await patch(t, `/admin/orders/${orderNo}/status`, { token: adminToken, body: { status: 'CONFIRMED' } });
    assert.equal(confirmAttempt.status, 409);
    assert.equal(confirmAttempt.body.error?.code, 'PRESCRIPTION_PENDING');

    const reviewed = await post(t, `/prescriptions/${rx.id}/review`, { token: adminToken, body: { decision: 'REJECTED', note: 'लिखावट साफ़ नहीं' } });
    assert.equal(reviewed.status, 200);

    const after1 = await t.db('orders').where({ order_number: orderNo }).first('status');
    assert.equal(after1.status, 'CANCELLED');
    const stock = await t.db('products').where({ id: p.id }).first('stock_qty');
    assert.equal(stock.stock_qty, 10); // restocked
  });

  test('ORD: a SERVICE booking runs slot → assign → start → complete (real completion OTP) → COMPLETED', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const tech = await createStaff(t.db, 'DELIVERY_BOY');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const { accessToken: techToken } = await issueToken(t.app, tech);
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const cat = await createCategory(t.db, { itemType: 'SERVICE' });
    const svc = await createProduct(t.db, cat.id, { itemType: 'SERVICE', price: '0.00', visitingCharge: '100.00' });

    const placed = await post<PlaceResult>(t, '/orders', {
      token: accessToken,
      idempotencyKey: idemKey(),
      body: { addressId, items: [{ productId: svc.id, quantity: 1 }], paymentMethod: 'COD', orderType: 'SERVICE', slot: { date: '2027-01-15', start: '10:00' } },
    });
    assert.equal(placed.status, 201);
    const orderNo = placed.body.data?.orderNumber as string;
    const scheduled = await t.db('orders').where({ order_number: orderNo }).first('status', 'order_type');
    assert.equal(scheduled.order_type, 'SERVICE');
    assert.equal(scheduled.status, 'SCHEDULED');

    const assign = await post(t, `/admin/orders/${orderNo}/assign`, { token: adminToken, body: { riderId: tech.id } });
    assert.equal(assign.status, 201);
    const booking = await t.db('service_bookings as b').join('orders as o', 'o.id', 'b.order_id').where('o.order_number', orderNo).first('b.id', 'b.completion_otp');
    const assignment = await t.db('delivery_assignments').where({ rider_id: tech.id }).first('id');
    // See FINDINGS-tests.md: the technician must accept via the generic delivery endpoint first —
    // ServicesService.start() calls changeStatus() before it flips the assignment to ACCEPTED, and
    // DeliveryService's state-machine hook refuses any DELIVERY_BOY transition on a still-OFFERED
    // assignment, so skipping this call makes start() 403 on a freshly assigned booking.
    const accepted = await post(t, `/delivery/assignments/${assignment.id}/accept`, { token: techToken });
    assert.equal(accepted.status, 200);

    const started = await post(t, `/services/bookings/${booking.id}/start`, { token: techToken });
    assert.equal(started.status, 200);
    const inProgress = await t.db('orders').where({ order_number: orderNo }).first('status');
    assert.equal(inProgress.status, 'IN_PROGRESS');

    const completed = await post(t, `/delivery/assignments/${assignment.id}/complete`, { token: techToken, body: { otp: booking.completion_otp } });
    assert.equal(completed.status, 200);
    const done = await t.db('orders').where({ order_number: orderNo }).first('status');
    assert.equal(done.status, 'COMPLETED');
  });
});
