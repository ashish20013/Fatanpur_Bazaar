import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADMIN_ONLY_PERMISSIONS, ALL_PERMISSIONS, SCOPED_ADMIN_DEFAULT_PERMISSIONS } from '@fb/shared-types';
import { resolvePermissions } from '../../src/domain/permissions';
import { isGlobalAdmin } from '../../src/common/types';

/**
 * The shop has one owner and, from today, a manager who is also an ADMIN.
 *
 * Every test here exists because the old rule — "ADMIN means everything" — would have made that
 * manager a second owner: able to change the UPI number money lands in, disable the owner, and
 * grant himself the rest. These pin the new rule shut from both ends: the owner still bypasses
 * everything, and a scoped admin holds exactly what he was given and not one code more.
 */
describe('global admin vs scoped admin', () => {
  it('the owner gets every permission, from no base and no grants at all', () => {
    const p = resolvePermissions('ADMIN', [], [], true);
    assert.equal(p.size, ALL_PERMISSIONS.length);
    for (const code of ALL_PERMISSIONS) assert.ok(p.has(code), `owner is missing ${code}`);
  });

  it('⚠️ a scoped admin with no grants holds NOTHING — the role is a door, not a key', () => {
    assert.equal(resolvePermissions('ADMIN', [], [], false).size, 0);
  });

  it('⚠️ role_permissions cannot leak in: even handed every code as a base, a scoped admin is judged on his grants', () => {
    /*
     * This is the exact shape of the accident this guards against. `role_permissions` is seeded
     * with ADMIN → every code, so anything that reads it for the ADMIN role hands the manager the
     * whole shop. IdentityService passes an empty base for that reason; if a future change ever
     * passes the table's rows instead, this test says what happens.
     */
    const withBase = resolvePermissions('ADMIN', [...ALL_PERMISSIONS], [{ permission_code: 'orders.view', granted: 0 }], false);
    assert.ok(!withBase.has('orders.view'), 'an explicit deny must win over any base');
  });

  it('a scoped admin holds exactly his granted list', () => {
    const grants = [
      { permission_code: 'orders.view', granted: 1 },
      { permission_code: 'orders.view_all', granted: 1 },
      { permission_code: 'inventory.manage', granted: 1 },
    ];
    const p = resolvePermissions('ADMIN', [], grants, false);
    assert.deepEqual([...p].sort(), ['inventory.manage', 'orders.view', 'orders.view_all']);
    assert.ok(!p.has('settings.manage'));
    assert.ok(!p.has('payments.refund'));
  });

  it('the owner may hand over settings.manage / permissions.manage — that is his call to make', () => {
    const p = resolvePermissions('ADMIN', [], ADMIN_ONLY_PERMISSIONS.map((c) => ({ permission_code: c, granted: 1 })), false);
    for (const c of ADMIN_ONLY_PERMISSIONS) assert.ok(p.has(c), `${c} must be grantable to a second ADMIN`);
  });

  it('⚠️ but a SUPERVISOR still cannot be given them, however the grant arrives (RBAC-07)', () => {
    const p = resolvePermissions('SUPERVISOR', ['orders.view'], ADMIN_ONLY_PERMISSIONS.map((c) => ({ permission_code: c, granted: 1 })), false);
    for (const c of ADMIN_ONLY_PERMISSIONS) assert.ok(!p.has(c), `${c} leaked to a supervisor`);
    assert.ok(p.has('orders.view'));
  });

  it('a deny beats a grant for a scoped admin, in either order', () => {
    const p = resolvePermissions(
      'ADMIN',
      [],
      [
        { permission_code: 'orders.cancel', granted: 1 },
        { permission_code: 'orders.cancel', granted: 0 },
      ],
      false,
    );
    assert.ok(!p.has('orders.cancel'));
  });

  it('⚠️ the flag alone is not enough — a downgraded owner keeps no bypass', () => {
    // A stale row (role changed, flag not cleared) must not act like an owner.
    assert.equal(isGlobalAdmin({ role: 'SUPERVISOR', isGlobalAdmin: true }), false);
    assert.equal(resolvePermissions('SUPERVISOR', [], [], true).size, 0);
    assert.equal(resolvePermissions('CUSTOMER', [], [], true).size, 0);
  });

  it('isGlobalAdmin is false for everything that is not an ADMIN carrying the flag', () => {
    assert.equal(isGlobalAdmin(null), false);
    assert.equal(isGlobalAdmin(undefined), false);
    assert.equal(isGlobalAdmin({ role: 'ADMIN' }), false);
    assert.equal(isGlobalAdmin({ role: 'ADMIN', isGlobalAdmin: false }), false);
    assert.equal(isGlobalAdmin({ role: 'CUSTOMER', isGlobalAdmin: true }), false);
    assert.equal(isGlobalAdmin({ role: 'ADMIN', isGlobalAdmin: true }), true);
  });

  it('a customer stays empty even if someone writes grants against his row', () => {
    assert.equal(resolvePermissions('CUSTOMER', ['orders.view'], [{ permission_code: 'settings.manage', granted: 1 }], false).size, 0);
  });

  it('the starter set for a second admin is real, day-to-day, and touches nothing dangerous', () => {
    assert.ok(SCOPED_ADMIN_DEFAULT_PERMISSIONS.length > 10, 'a starter set that small would read as a broken panel');
    for (const c of SCOPED_ADMIN_DEFAULT_PERMISSIONS) {
      assert.ok((ALL_PERMISSIONS as readonly string[]).includes(c), `${c} is not a real permission`);
    }
    for (const c of ['settings.manage', 'permissions.manage', 'staff.create', 'staff.manage', 'payments.verify', 'payments.refund'] as const) {
      assert.ok(!SCOPED_ADMIN_DEFAULT_PERMISSIONS.includes(c), `${c} must not be handed out by default — the owner ticks it himself`);
    }
  });
});
