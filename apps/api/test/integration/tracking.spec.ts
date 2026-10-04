import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { post, type TestApp, createTestApp, idemKey, toReadyForPickup } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { createCategory, createCustomer, createProduct, createServiceableAddress, createStaff, issueToken, STORE_CENTER } from '../helpers/fixtures';

interface PlaceResult {
  orderNumber: string;
}

/** Connects and waits for either 'connect' or 'connect_error' — never hangs past the timeout. */
function connect(baseUrl: string, token?: string, timeoutMs = 4000): Promise<{ socket: Socket; connected: boolean; error?: Error }> {
  return new Promise((resolve) => {
    const socket = io(baseUrl, { path: '/socket', transports: ['websocket'], forceNew: true, reconnection: false, auth: token ? { token } : {}, timeout: timeoutMs });
    const timer = setTimeout(() => resolve({ socket, connected: false }), timeoutMs);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve({ socket, connected: true });
    });
    socket.on('connect_error', (err: Error) => {
      clearTimeout(timer);
      resolve({ socket, connected: false, error: err });
    });
  });
}

/** Collects every occurrence of `event` for `windowMs`, then resolves with what arrived. */
function collect<T = unknown>(socket: Socket, event: string, windowMs = 800): Promise<T[]> {
  const out: T[] = [];
  return new Promise((resolve) => {
    socket.on(event, (p: T) => out.push(p));
    setTimeout(() => resolve(out), windowMs);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('tracking', () => {
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

  /** Places a COD order, assigns + accepts a rider, and returns everything a location test needs. */
  async function assignedOrder() {
    const admin = await createStaff(t.db, 'ADMIN');
    const rider = await createStaff(t.db, 'DELIVERY_BOY');
    const customer = await createCustomer(t.db);
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const { accessToken: riderToken } = await issueToken(t.app, rider);
    const { accessToken: customerToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const cat = await createCategory(t.db);
    const p = await createProduct(t.db, cat.id, { price: '100.00', mrp: '100.00', stockQty: 10 });
    const placed = await post<PlaceResult>(t, '/orders', { token: customerToken, idempotencyKey: idemKey(), body: { addressId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'COD' } });
    assert.equal(placed.status, 201);
    const orderNumber = placed.body.data?.orderNumber as string;
    await toReadyForPickup(t, adminToken, orderNumber);
    const assign = await post(t, `/admin/orders/${orderNumber}/assign`, { token: adminToken, body: { riderId: rider.id } });
    assert.equal(assign.status, 201);
    const assignment = await t.db('delivery_assignments').where({ rider_id: rider.id }).first('id');
    const accept = await post(t, `/delivery/assignments/${assignment.id}/accept`, { token: riderToken });
    assert.equal(accept.status, 200);
    return { rider, customer, riderToken, customerToken, orderNumber, assignmentId: assignment.id as number };
  }

  test('TRK: connecting without a token is refused', async () => {
    const r = await connect(t.baseUrl);
    assert.equal(r.connected, false);
    r.socket.close();
  });

  test('TRK: a location ping for another rider\'s assignment is rejected and never reaches the order room', async () => {
    const owned = await assignedOrder();
    const strangerRider = await createStaff(t.db, 'DELIVERY_BOY');
    const { accessToken: strangerToken } = await issueToken(t.app, strangerRider);

    const customerConn = await connect(t.baseUrl, owned.customerToken);
    assert.equal(customerConn.connected, true);
    const strangerConn = await connect(t.baseUrl, strangerToken);
    assert.equal(strangerConn.connected, true);

    const heard = collect(customerConn.socket, 'delivery.location.updated', 800);
    strangerConn.socket.emit('delivery.location', { assignmentId: owned.assignmentId, lat: STORE_CENTER.lat, lng: STORE_CENTER.lng, ts: Date.now() });
    assert.equal((await heard).length, 0, 'a foreign rider must never be able to move another rider\'s order marker');

    const audited = await t.db('audit_logs').where({ action: 'socket.rejected_location' }).orderBy('id', 'desc').first();
    assert.ok(audited, 'the rejected attempt must be audited');

    customerConn.socket.close();
    strangerConn.socket.close();
  });

  test('TRK: only the customer on THAT order receives its location updates — no cross-order leakage', async () => {
    const owned = await assignedOrder();
    const otherCustomer = await createCustomer(t.db);
    const { accessToken: otherToken } = await issueToken(t.app, otherCustomer);

    const mineConn = await connect(t.baseUrl, owned.customerToken);
    const otherConn = await connect(t.baseUrl, otherToken);
    const riderConn = await connect(t.baseUrl, owned.riderToken);
    assert.ok(mineConn.connected && otherConn.connected && riderConn.connected);

    const mineHeard = collect(mineConn.socket, 'delivery.location.updated', 800);
    const otherHeard = collect(otherConn.socket, 'delivery.location.updated', 800);
    riderConn.socket.emit('delivery.location', { assignmentId: owned.assignmentId, lat: STORE_CENTER.lat, lng: STORE_CENTER.lng, ts: Date.now() });

    assert.equal((await mineHeard).length, 1, 'the order\'s own customer must see the ping');
    assert.equal((await otherHeard).length, 0, 'an unrelated customer must never see it');

    mineConn.socket.close();
    otherConn.socket.close();
    riderConn.socket.close();
  });

  test('TRK: two pings with the same client timestamp are deduped — only the first is broadcast', async () => {
    const owned = await assignedOrder();
    const customerConn = await connect(t.baseUrl, owned.customerToken);
    const riderConn = await connect(t.baseUrl, owned.riderToken);
    assert.ok(customerConn.connected && riderConn.connected);

    const heard = collect(customerConn.socket, 'delivery.location.updated', 900);
    const ts = Date.now();
    const ping = { assignmentId: owned.assignmentId, lat: STORE_CENTER.lat, lng: STORE_CENTER.lng, ts };
    riderConn.socket.emit('delivery.location', ping);
    riderConn.socket.emit('delivery.location', ping); // identical ts → must be dropped as a duplicate

    assert.equal((await heard).length, 1);

    customerConn.socket.close();
    riderConn.socket.close();
  });

  test('TRK: a first ping is always persisted to delivery_locations; a near-identical one inside the 60s window is broadcast but not persisted', async () => {
    const owned = await assignedOrder();
    const customerConn = await connect(t.baseUrl, owned.customerToken);
    const riderConn = await connect(t.baseUrl, owned.riderToken);
    assert.ok(customerConn.connected && riderConn.connected);

    const firstHeard = collect(customerConn.socket, 'delivery.location.updated', 500);
    riderConn.socket.emit('delivery.location', { assignmentId: owned.assignmentId, lat: STORE_CENTER.lat, lng: STORE_CENTER.lng, ts: Date.now() });
    assert.equal((await firstHeard).length, 1);
    await sleep(300); // let the fire-and-forget INSERT land
    const afterFirst = await t.db('delivery_locations').where({ assignment_id: owned.assignmentId }).count({ n: '*' }).first();
    assert.equal(Number(afterFirst?.n), 1, 'the very first ping for a fresh assignment always persists (forcePersist)');

    // Wait past the 10s per-ping throttle so the second ping is even evaluated, but stay well
    // inside the 60s persist interval and don't move — it must broadcast without persisting again.
    await sleep(10_500);
    const secondHeard = collect(customerConn.socket, 'delivery.location.updated', 500);
    riderConn.socket.emit('delivery.location', { assignmentId: owned.assignmentId, lat: STORE_CENTER.lat, lng: STORE_CENTER.lng, ts: Date.now() });
    assert.equal((await secondHeard).length, 1, 'still broadcast — "live" is never blocked by the persistence threshold');
    await sleep(300);
    const afterSecond = await t.db('delivery_locations').where({ assignment_id: owned.assignmentId }).count({ n: '*' }).first();
    assert.equal(Number(afterSecond?.n), 1, 'no new row — under 100 m and under 60 s since the last persisted point');

    customerConn.socket.close();
    riderConn.socket.close();
  });

  test('TRK: connecting joins the customer to their active order and delivers a tracking.snapshot', async () => {
    const owned = await assignedOrder();
    const customerConn = await connect(t.baseUrl, owned.customerToken);
    assert.equal(customerConn.connected, true);
    const snaps = await collect<{ orderNumber: string }>(customerConn.socket, 'tracking.snapshot', 600);
    assert.ok(snaps.some((s) => s.orderNumber === owned.orderNumber));
    customerConn.socket.close();
  });

  test('TRK: a customer whose order has NO rider yet can connect — snapshot has no position, API stays up', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const cat = await createCategory(t.db);
    const p = await createProduct(t.db, cat.id, { price: '100.00', mrp: '100.00', stockQty: 5 });
    const placed = await post<PlaceResult>(t, '/orders', { token: accessToken, idempotencyKey: idemKey(), body: { addressId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'COD' } });
    assert.equal(placed.status, 201);
    const conn = await connect(t.baseUrl, accessToken);
    assert.equal(conn.connected, true);
    const snaps = await collect<{ orderNumber: string; lat: number | null; rider: unknown }>(conn.socket, 'tracking.snapshot', 600);
    const mine = snaps.find((s) => s.orderNumber === placed.body.data?.orderNumber);
    assert.ok(mine);
    assert.equal(mine?.lat, null);
    assert.equal(mine?.rider, null);
    conn.socket.close();
    const health = await fetch(`${t.baseUrl}/v1/health`);
    assert.equal(health.status, 200);
  });

  test('TRK: delivering the order ends its tracking session', async () => {
    const owned = await assignedOrder();
    const before = await t.db('tracking_sessions').where({ assignment_id: owned.assignmentId }).first('is_live');
    assert.equal(before.is_live, 1);
    const pickup = await post(t, `/delivery/assignments/${owned.assignmentId}/pickup`, { token: owned.riderToken });
    assert.equal(pickup.status, 200);
    const a = await t.db('delivery_assignments').where({ id: owned.assignmentId }).first('delivery_otp');
    const complete = await post(t, `/delivery/assignments/${owned.assignmentId}/complete`, { token: owned.riderToken, body: { otp: a.delivery_otp } });
    assert.equal(complete.status, 200);
    const after1 = await t.db('tracking_sessions').where({ assignment_id: owned.assignmentId }).first('is_live', 'end_reason');
    assert.equal(after1.is_live, 0);
    assert.equal(after1.end_reason, 'DELIVERED');
  });
});
