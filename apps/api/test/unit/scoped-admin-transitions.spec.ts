import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { actorMayTransition, type Permission } from '@fb/shared-types';

/**
 * Who may move an order, now that "ADMIN" no longer means "the owner".
 *
 * `orders.cancel` is marked dangerous and granted separately for a reason: cancelling an order
 * puts every line back into stock, credits the customer's wallet and rolls the coupon back. The
 * state machine used to wave through anybody whose role string was ADMIN, so withholding that
 * permission from a second admin decided nothing at all — the owner could untick it and the
 * manager could still cancel. These pin the fix shut from both ends.
 */
const perms = (...p: Permission[]): ReadonlySet<Permission> => new Set(p);

describe('order transitions: the owner bypasses, a scoped admin does not', () => {
  it('the owner moves an order anywhere, holding nothing', () => {
    for (const [from, to] of [
      ['CONFIRMED', 'CANCELLED'],
      ['CONFIRMED', 'REJECTED'],
      ['DELIVERED', 'RETURNED'],
      ['CONFIRMED', 'PREPARING'],
    ] as const) {
      assert.equal(actorMayTransition({ kind: 'ADMIN', permissions: perms(), isGlobalAdmin: true }, from, to).allowed, true, `${from}→${to}`);
    }
  });

  it('⚠️ a scoped admin with orders.update_status cannot cancel, reject or return', () => {
    const a = { kind: 'ADMIN' as const, permissions: perms('orders.update_status'), isGlobalAdmin: false };
    assert.equal(actorMayTransition(a, 'CONFIRMED', 'PREPARING').allowed, true, 'he can still run the shop');
    for (const to of ['CANCELLED', 'REJECTED', 'RETURNED'] as const) {
      const d = actorMayTransition(a, to === 'RETURNED' ? 'DELIVERED' : 'CONFIRMED', to);
      assert.equal(d.allowed, false, `he must not reach ${to}`);
      assert.equal(d.allowed === false && d.reason, 'PERMISSION');
    }
  });

  it('…and with orders.cancel he can', () => {
    const a = { kind: 'ADMIN' as const, permissions: perms('orders.cancel'), isGlobalAdmin: false };
    assert.equal(actorMayTransition(a, 'CONFIRMED', 'CANCELLED').allowed, true);
    assert.equal(actorMayTransition(a, 'DELIVERED', 'RETURNED').allowed, true);
  });

  it('a scoped admin holding nothing moves nothing', () => {
    const a = { kind: 'ADMIN' as const, permissions: perms(), isGlobalAdmin: false };
    assert.equal(actorMayTransition(a, 'CONFIRMED', 'PREPARING').allowed, false);
    assert.equal(actorMayTransition(a, 'CONFIRMED', 'CANCELLED').allowed, false);
  });

  it('⚠️ the flag is not read for any other role — a stale flag grants nothing', () => {
    assert.equal(actorMayTransition({ kind: 'SUPERVISOR', permissions: perms(), isGlobalAdmin: true }, 'CONFIRMED', 'CANCELLED').allowed, false);
    assert.equal(actorMayTransition({ kind: 'CUSTOMER', permissions: perms(), isGlobalAdmin: true }, 'PREPARING', 'CANCELLED').allowed, false);
  });

  it('omitting the flag entirely is treated as "not the owner"', () => {
    // Every call site passes it, but a future one that forgets must fail closed, not open.
    assert.equal(actorMayTransition({ kind: 'ADMIN', permissions: perms() }, 'CONFIRMED', 'CANCELLED').allowed, false);
  });

  it('the supervisor rules are unchanged', () => {
    const s = (...p: Permission[]) => ({ kind: 'SUPERVISOR' as const, permissions: perms(...p) });
    assert.equal(actorMayTransition(s('orders.update_status'), 'CONFIRMED', 'PREPARING').allowed, true);
    assert.equal(actorMayTransition(s('orders.update_status'), 'CONFIRMED', 'CANCELLED').allowed, false);
    assert.equal(actorMayTransition(s('orders.cancel'), 'CONFIRMED', 'CANCELLED').allowed, true);
    // A supervisor is still refused RETURNED whatever he holds.
    assert.equal(actorMayTransition(s('orders.cancel', 'orders.update_status'), 'DELIVERED', 'RETURNED').allowed, false);
  });

  it('the system actor is unaffected — cron and webhooks still work', () => {
    assert.equal(actorMayTransition({ kind: 'SYSTEM', permissions: perms() }, 'PENDING_PAYMENT', 'CANCELLED').allowed, true);
  });
});
