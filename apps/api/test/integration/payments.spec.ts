import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { patch, post, type TestApp, createTestApp, idemKey, toReadyForPickup } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { createCategory, createCustomer, createProduct, createServiceableAddress, createStaff, issueToken } from '../helpers/fixtures';

interface PlaceResult {
  orderNumber: string;
  status: string;
  grandTotal: string;
}

describe('payments', () => {
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

  async function customerWithOrder(paymentMethod: 'COD' | 'UPI', price = '100.00') {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const cat = await createCategory(t.db);
    const p = await createProduct(t.db, cat.id, { price, mrp: price, stockQty: 10 });
    const placed = await post<PlaceResult>(t, '/orders', {
      token: accessToken,
      idempotencyKey: idemKey(),
      body: { addressId, items: [{ productId: p.id, quantity: 1 }], paymentMethod },
    });
    assert.equal(placed.status, 201, JSON.stringify(placed.body.error));
    return { customer, accessToken, orderNumber: placed.body.data?.orderNumber as string };
  }

  test('PAY: a UPI claim moves the payment to AWAITING_VERIFICATION (never straight to PAID)', async () => {
    const { accessToken, orderNumber } = await customerWithOrder('UPI');
    const res = await post(t, '/payments/upi/claim', { token: accessToken, body: { orderNumber, utr: 'UTR1234567890' } });
    assert.equal(res.status, 200);
    const pay = await t.db('payments as p').join('orders as o', 'o.id', 'p.order_id').where('o.order_number', orderNumber).first('p.status', 'p.upi_utr');
    assert.equal(pay.status, 'AWAITING_VERIFICATION');
    assert.equal(pay.upi_utr, 'UTR1234567890');
  });

  test('PAY: a client-sent paid:true / status is stripped — the claim can never force PAID', async () => {
    const { accessToken, orderNumber } = await customerWithOrder('UPI');
    const res = await post(t, '/payments/upi/claim', { token: accessToken, body: { orderNumber, utr: 'UTR9988776655', paid: true, status: 'PAID' } });
    assert.equal(res.status, 200);
    const pay = await t.db('payments as p').join('orders as o', 'o.id', 'p.order_id').where('o.order_number', orderNumber).first('p.status');
    assert.equal(pay.status, 'AWAITING_VERIFICATION'); // never PAID from client input alone
  });

  test('PAY: the same UTR claimed on a second order is rejected with 409 DUPLICATE_UTR', async () => {
    const first = await customerWithOrder('UPI');
    const second = await customerWithOrder('UPI');
    const claim1 = await post(t, '/payments/upi/claim', { token: first.accessToken, body: { orderNumber: first.orderNumber, utr: 'DUPLICATEUTR01' } });
    assert.equal(claim1.status, 200);
    const claim2 = await post(t, '/payments/upi/claim', { token: second.accessToken, body: { orderNumber: second.orderNumber, utr: 'DUPLICATEUTR01' } });
    assert.equal(claim2.status, 409);
    assert.equal(claim2.body.error?.code, 'DUPLICATE_UTR');
  });

  test('PAY: SUPERVISOR without payments.verify is refused with 403', async () => {
    const { accessToken, orderNumber } = await customerWithOrder('UPI');
    await post(t, '/payments/upi/claim', { token: accessToken, body: { orderNumber, utr: 'SUPERVISORNO1' } });
    const supervisor = await createStaff(t.db, 'SUPERVISOR');
    const { accessToken: supervisorToken } = await issueToken(t.app, supervisor);
    const pay = await t.db('payments as p').join('orders as o', 'o.id', 'p.order_id').where('o.order_number', orderNumber).first('p.id');
    const res = await post(t, `/payments/${pay.id}/verify`, { token: supervisorToken });
    assert.equal(res.status, 403);
  });

  test('PAY: a non-COD order cannot be PICKED_UP before its payment is verified', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const rider = await createStaff(t.db, 'DELIVERY_BOY');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const { accessToken: riderToken } = await issueToken(t.app, rider);
    // Kept under settings.upi_auto_accept_limit (₹500) so the claim auto-confirms the order —
    // but payment_status stays AWAITING_VERIFICATION until an admin verifies it (GATE-PAY-PICKUP).
    const { accessToken, orderNumber } = await customerWithOrder('UPI', '100.00');
    const claimed = await post(t, '/payments/upi/claim', { token: accessToken, body: { orderNumber, utr: 'PICKUPGATE001' } });
    assert.equal(claimed.status, 200);
    const confirmed = await t.db('orders').where({ order_number: orderNumber }).first('status', 'payment_status');
    assert.equal(confirmed.status, 'CONFIRMED');
    assert.equal(confirmed.payment_status, 'AWAITING_VERIFICATION');

    await toReadyForPickup(t, adminToken, orderNumber);
    const assign = await post(t, `/admin/orders/${orderNumber}/assign`, { token: adminToken, body: { riderId: rider.id } });
    assert.equal(assign.status, 201);
    const a = await t.db('delivery_assignments').where({ rider_id: rider.id }).first('id');
    await post(t, `/delivery/assignments/${a.id}/accept`, { token: riderToken });
    const pickup = await post(t, `/delivery/assignments/${a.id}/pickup`, { token: riderToken });
    assert.equal(pickup.status, 409);
    assert.equal(pickup.body.error?.code, 'PAYMENT_NOT_VERIFIED');
  });

  test('PAY: cancelling an order whose UPI payment is AWAITING_VERIFICATION parks it in REFUND_PENDING (money was really sent)', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const { accessToken, orderNumber } = await customerWithOrder('UPI', '100.00');
    await post(t, '/payments/upi/claim', { token: accessToken, body: { orderNumber, utr: 'REFUNDPEND001' } });

    const cancelled = await patch(t, `/admin/orders/${orderNumber}/status`, { token: adminToken, body: { status: 'CANCELLED', note: 'ग्राहक का अनुरोध' } });
    assert.equal(cancelled.status, 200);
    const row = await t.db('orders as o').join('payments as p', 'p.order_id', 'o.id').where('o.order_number', orderNumber).first('o.payment_status', 'p.status as payStatus');
    assert.equal(row.payment_status, 'REFUND_PENDING');
    assert.equal(row.payStatus, 'REFUND_PENDING');
  });

  test('PAY: the gateway webhook rejects a bad HMAC signature with 400 and never touches the order', async () => {
    const customer = await createCustomer(t.db);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const [orderId] = await t.db('orders').insert(gatewayOrderRow(customer.id, addressId, 'GW-WEBHOOK-001'));
    await t.db('payments').insert({ order_id: orderId, method: 'GATEWAY', status: 'PENDING', amount: '120.00' });

    const payload = { id: 'evt_bad_sig', event: 'payment.captured', payload: { payment: { entity: { id: 'pay_bad_sig', amount: 12000, notes: { order_number: 'GW-WEBHOOK-001' } } } } };
    const res = await post(t, '/webhooks/payment/razorpay', { body: payload, headers: { 'x-razorpay-signature': 'not-the-real-signature' } });
    assert.equal(res.status, 400);
    const order = await t.db('orders').where({ id: orderId }).first('status', 'payment_status');
    assert.equal(order.status, 'PENDING_PAYMENT');
    assert.equal(order.payment_status, 'PENDING');
  });

  test('PAY: the gateway webhook is idempotent — a captured event replayed twice only ever processes once', async () => {
    const customer = await createCustomer(t.db);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const orderNo = `GW-${randomUUID().slice(0, 8).toUpperCase()}`;
    const [orderId] = await t.db('orders').insert(gatewayOrderRow(customer.id, addressId, orderNo));
    await t.db('payments').insert({ order_id: orderId, method: 'GATEWAY', status: 'PENDING', amount: '120.00' });

    const payload = { id: 'evt_captured_once', event: 'payment.captured', payload: { payment: { entity: { id: 'pay_captured_once', amount: 12000, notes: { order_number: orderNo } } } } };
    const body = JSON.stringify(payload);
    const secret = process.env.GATEWAY_WEBHOOK_SECRET as string;
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    const first = await post(t, '/webhooks/payment/razorpay', { body: payload, headers: { 'x-razorpay-signature': signature } });
    assert.equal(first.status, 200);
    const afterFirst = await t.db('orders').where({ id: orderId }).first('status', 'payment_status');
    assert.equal(afterFirst.status, 'CONFIRMED');
    assert.equal(afterFirst.payment_status, 'PAID');

    const second = await post(t, '/webhooks/payment/razorpay', { body: payload, headers: { 'x-razorpay-signature': signature } });
    assert.equal(second.status, 200); // gateways retry on anything but 200 — always acknowledge

    const events = await t.db('webhook_events').where({ provider: 'razorpay', event_id: 'evt_captured_once' });
    assert.equal(events.length, 1, 'the duplicate event must not be processed or logged twice');
  });
});

/** A GATEWAY-method order/payment pair, inserted directly — gateway_enabled stays OFF in the
 * test baseline (as in production, A17), so this path can only be exercised by seeding the row
 * the webhook is meant to react to, not by placing an order through the API. */
function gatewayOrderRow(customerId: number, addressId: number, orderNumber: string): Record<string, unknown> {
  return {
    order_number: orderNumber,
    customer_id: customerId,
    address_id: addressId,
    order_type: 'DELIVERY',
    status: 'PENDING_PAYMENT',
    items_total: '100.00',
    delivery_fee: '20.00',
    visiting_charge: '0.00',
    discount: '0.00',
    wallet_used: '0.00',
    grand_total: '120.00',
    payment_method: 'GATEWAY',
    payment_status: 'PENDING',
    ship_name: 'Test Receiver',
    ship_phone: '919999999999',
    ship_line1: 'Ward 4',
    requires_prescription: 0,
  };
}
