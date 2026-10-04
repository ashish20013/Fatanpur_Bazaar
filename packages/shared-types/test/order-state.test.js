// Runs against the compiled dist (npm run build first). Uses node:test — no framework dependency.
const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../dist');

const ALL = Object.values(t.OrderStatus);

test('every allowed DELIVERY transition passes, every other pair fails', () => {
  const allowed = {
    PENDING_PAYMENT: ['CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
    CONFIRMED: ['ASSIGNED', 'PREPARING', 'REJECTED', 'CANCELLED'],
    PREPARING: ['ASSIGNED', 'READY_FOR_PICKUP', 'CANCELLED'],
    READY_FOR_PICKUP: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['PICKED_UP', 'READY_FOR_PICKUP', 'DELIVERY_FAILED', 'CANCELLED'],
    PICKED_UP: ['OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'],
    DELIVERED: ['RETURNED'],
  };
  let checked = 0;
  for (const from of ALL) for (const to of ALL) {
    const want = (allowed[from] || []).includes(to);
    assert.equal(t.canTransition('DELIVERY', from, to), want, `${from}→${to}`);
    checked++;
  }
  assert.equal(checked, 256);
});

test('SERVICE path: CONFIRMED→SCHEDULED→ASSIGNED→IN_PROGRESS→COMPLETED', () => {
  const path = ['CONFIRMED', 'SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];
  for (let i = 0; i < path.length - 1; i++) assert.ok(t.canTransition('SERVICE', path[i], path[i + 1]));
  assert.equal(t.canTransition('SERVICE', 'CONFIRMED', 'PREPARING'), false);
  assert.equal(t.canTransition('DELIVERY', 'CONFIRMED', 'SCHEDULED'), false);
});

test('terminal states have no exits except DELIVERED→RETURNED', () => {
  for (const s of t.TERMINAL_STATUSES) {
    const exits = t.ORDER_TRANSITIONS.DELIVERY[s].concat(t.ORDER_TRANSITIONS.SERVICE[s]);
    if (s === 'DELIVERED') assert.deepEqual(exits, ['RETURNED']);
    else assert.equal(exits.length, 0, s);
  }
});

test('DELIVERED→PREPARING is invalid (ORD-10)', () => {
  assert.equal(t.canTransition('DELIVERY', 'DELIVERED', 'PREPARING'), false);
});

test('customer may cancel only PENDING_PAYMENT / CONFIRMED', () => {
  const c = { kind: 'CUSTOMER', permissions: [] };
  assert.ok(t.actorMayTransition(c, 'CONFIRMED', 'CANCELLED').allowed);
  assert.ok(t.actorMayTransition(c, 'PENDING_PAYMENT', 'CANCELLED').allowed);
  assert.equal(t.actorMayTransition(c, 'PREPARING', 'CANCELLED').allowed, false);
  assert.equal(t.actorMayTransition(c, 'CONFIRMED', 'PREPARING').allowed, false);
});

test('rider may only set rider statuses', () => {
  const r = { kind: 'DELIVERY_BOY', permissions: ['orders.view'] };
  for (const s of ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'IN_PROGRESS', 'COMPLETED', 'DELIVERY_FAILED'])
    assert.ok(t.actorMayTransition(r, 'ASSIGNED', s).allowed, s);
  for (const s of ['CONFIRMED', 'CANCELLED', 'PREPARING', 'ASSIGNED', 'RETURNED'])
    assert.equal(t.actorMayTransition(r, 'ASSIGNED', s).allowed, false, s);
});

test('supervisor needs orders.update_status / orders.cancel; never RETURNED', () => {
  const sup = { kind: 'SUPERVISOR', permissions: new Set(['orders.update_status']) };
  assert.ok(t.actorMayTransition(sup, 'CONFIRMED', 'PREPARING').allowed);
  assert.equal(t.actorMayTransition(sup, 'CONFIRMED', 'CANCELLED').allowed, false);
  const sup2 = { kind: 'SUPERVISOR', permissions: new Set(['orders.update_status', 'orders.cancel']) };
  assert.ok(t.actorMayTransition(sup2, 'CONFIRMED', 'CANCELLED').allowed);
  assert.equal(t.actorMayTransition(sup2, 'DELIVERED', 'RETURNED').allowed, false);
  // Only the owner (global admin) or a scoped admin granted orders.cancel may take a delivered order back.
  assert.ok(t.actorMayTransition({ kind: 'ADMIN', isGlobalAdmin: true, permissions: [] }, 'DELIVERED', 'RETURNED').allowed);
  assert.ok(t.actorMayTransition({ kind: 'ADMIN', permissions: new Set(['orders.cancel']) }, 'DELIVERED', 'RETURNED').allowed);
  assert.equal(t.actorMayTransition({ kind: 'ADMIN', permissions: [] }, 'DELIVERED', 'RETURNED').allowed, false);
});

test('broadcast self-claim: CONFIRMED/PREPARING/READY → ASSIGNED all valid', () => {
  for (const from of ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']) assert.ok(t.canTransition('DELIVERY', from, 'ASSIGNED'), from);
  // claim is a SYSTEM action triggered by the rider — the rider role itself still cannot set ASSIGNED
  assert.equal(t.actorMayTransition({ kind: 'DELIVERY_BOY', permissions: [] }, 'CONFIRMED', 'ASSIGNED').allowed, false);
  assert.ok(t.actorMayTransition({ kind: 'SYSTEM', permissions: [] }, 'CONFIRMED', 'ASSIGNED').allowed);
});

test('isClaimableStatus matches CLAIMABLE_STATUSES', () => {
  for (const s of ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']) assert.ok(t.isClaimableStatus(s), s);
  for (const s of ['PENDING_PAYMENT', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED']) assert.equal(t.isClaimableStatus(s), false, s);
});

test('every status has Hindi + English label', () => {
  for (const s of ALL) {
    assert.ok(t.ORDER_STATUS_LABEL_HI[s], s);
    assert.ok(t.ORDER_STATUS_LABEL_EN[s], s);
  }
});
