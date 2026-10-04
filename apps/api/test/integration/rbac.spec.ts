import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { get, patch, post, put, type TestApp, createTestApp } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { createCustomer, createStaff, grantPermission, issueToken, uniquePhone } from '../helpers/fixtures';
import { IdentityService } from '../../src/modules/identity/identity.service';
import { StaffService } from '../../src/modules/staff/staff.service';
import type { AuthUser } from '../../src/common/types';
import type { AppError } from '../../src/common/errors';

/**
 * ROLE_PERMISSION_MATRIX.md §0 + A5/A6 — the four-layer enforcement (role, permission, ownership,
 * "DB is truth even for a warm token") tested end to end through the real HTTP surface.
 */
describe('rbac', () => {
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

  test('RBAC: CUSTOMER is blocked from GET /admin/staff', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const res = await get(t, '/admin/staff', { token: accessToken });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'FORBIDDEN');
  });

  test('RBAC: CUSTOMER is blocked from GET /admin/orders', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const res = await get(t, '/admin/orders', { token: accessToken });
    assert.equal(res.status, 403);
  });

  test('RBAC: CUSTOMER is blocked from GET /admin/settings', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const res = await get(t, '/admin/settings', { token: accessToken });
    assert.equal(res.status, 403);
  });

  test("RBAC: CUSTOMER fetching another customer's order gets 404 (never 403 — no existence leak)", async () => {
    const owner = await createCustomer(t.db);
    const stranger = await createCustomer(t.db);
    const [addressId] = await t.db('addresses').insert({ user_id: owner.id, receiver_name: 'Ram', phone: owner.phone, line1: 'Ward 4' });
    const [orderId] = await t.db('orders').insert({
      order_number: 'FB-20260101-0001',
      customer_id: owner.id,
      address_id: addressId,
      order_type: 'DELIVERY',
      status: 'CONFIRMED',
      items_total: '100.00',
      delivery_fee: '20.00',
      visiting_charge: '0.00',
      discount: '0.00',
      wallet_used: '0.00',
      grand_total: '120.00',
      payment_method: 'COD',
      payment_status: 'PENDING',
      ship_name: 'Ram',
      ship_phone: owner.phone,
      ship_line1: 'Ward 4',
      requires_prescription: 0,
    });
    assert.ok(orderId > 0);
    const { accessToken } = await issueToken(t.app, stranger);
    const res = await get(t, '/orders/FB-20260101-0001', { token: accessToken });
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'NOT_FOUND');
  });

  test('RBAC: DELIVERY_BOY is blocked from GET /admin/staff', async () => {
    const rider = await createStaff(t.db, 'DELIVERY_BOY');
    const { accessToken } = await issueToken(t.app, rider);
    const res = await get(t, '/admin/staff', { token: accessToken });
    assert.equal(res.status, 403);
  });

  test('RBAC: DELIVERY_BOY is blocked from GET /admin/orders', async () => {
    const rider = await createStaff(t.db, 'DELIVERY_BOY');
    const { accessToken } = await issueToken(t.app, rider);
    const res = await get(t, '/admin/orders', { token: accessToken });
    assert.equal(res.status, 403);
  });

  test("RBAC: DELIVERY_BOY is blocked from another rider's assignment (403, not 404 — RBAC-04)", async () => {
    const owner = await createStaff(t.db, 'DELIVERY_BOY');
    const stranger = await createStaff(t.db, 'DELIVERY_BOY');
    const customer = await createCustomer(t.db);
    const [addressId] = await t.db('addresses').insert({ user_id: customer.id, receiver_name: 'Ram', phone: customer.phone, line1: 'Ward 4' });
    const [orderId] = await t.db('orders').insert({
      order_number: 'FB-20260101-0002',
      customer_id: customer.id,
      address_id: addressId,
      order_type: 'DELIVERY',
      status: 'ASSIGNED',
      items_total: '100.00',
      delivery_fee: '20.00',
      visiting_charge: '0.00',
      discount: '0.00',
      wallet_used: '0.00',
      grand_total: '120.00',
      payment_method: 'COD',
      payment_status: 'PENDING',
      ship_name: 'Ram',
      ship_phone: '919999999999',
      ship_line1: 'Ward 4',
      requires_prescription: 0,
    });
    const [assignmentId] = await t.db('delivery_assignments').insert({ order_id: orderId, rider_id: owner.id, job_type: 'DELIVERY', status: 'OFFERED', earning: '20.00', delivery_otp: '1234' });
    const { accessToken } = await issueToken(t.app, stranger);
    const res = await post(t, `/delivery/assignments/${assignmentId}/accept`, { token: accessToken });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'FORBIDDEN');
  });

  test('RBAC: SUPERVISOR (default staff.manage_riders, no staff.create) cannot create a SUPERVISOR or ADMIN', async () => {
    const supervisor = await createStaff(t.db, 'SUPERVISOR');
    const { accessToken } = await issueToken(t.app, supervisor);
    for (const role of ['SUPERVISOR', 'ADMIN']) {
      const res = await post(t, '/admin/staff', { token: accessToken, body: { phone: uniquePhone(), name: 'Naya Staff', role } });
      assert.equal(res.status, 403, role);
      assert.equal(res.body.error?.code, 'FORBIDDEN');
    }
  });

  test('RBAC: SUPERVISOR can add a DELIVERY_BOY (owner rule) but only grant rider-safe permissions', async () => {
    const supervisor = await createStaff(t.db, 'SUPERVISOR');
    const { accessToken } = await issueToken(t.app, supervisor);
    const ok = await post<{ role: string }>(t, '/admin/staff', { token: accessToken, body: { phone: uniquePhone(), name: 'Naya Rider', role: 'DELIVERY_BOY' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data?.role, 'DELIVERY_BOY');
    const bad = await post(t, '/admin/staff', { token: accessToken, body: { phone: uniquePhone(), name: 'Rider 2', role: 'DELIVERY_BOY', permissions: ['orders.cancel'] } });
    assert.equal(bad.status, 403);
  });

  test('RBAC: a rider manager cannot wipe an ADMIN\'s deny on a rider, nor convert an existing customer', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const supervisor = await createStaff(t.db, 'SUPERVISOR');
    const rider = await createStaff(t.db, 'DELIVERY_BOY');
    await grantPermission(t.db, rider.id, 'orders.view', false, admin.id); // an admin-set DENY
    const { accessToken } = await issueToken(t.app, supervisor);
    const res = await put(t, `/admin/staff/${rider.id}/permissions`, { token: accessToken, body: { grants: [] } });
    assert.equal(res.status, 200);
    const deny = await t.db('user_permissions').where({ user_id: rider.id, permission_code: 'orders.view' }).first('granted');
    assert.equal(Number(deny?.granted), 0, 'the admin DENY row must survive a rider-manager update');

    const shopper = await createCustomer(t.db);
    const promote = await post(t, '/admin/staff', { token: accessToken, body: { phone: shopper.phone.slice(2), name: 'Shopper', role: 'DELIVERY_BOY' } });
    assert.equal(promote.status, 403);
    const still = await t.db('users').where({ id: shopper.id }).first('role');
    assert.equal(still.role, 'CUSTOMER');
  });

  test('RBAC: a SUPERVISOR whose staff.manage_riders was revoked cannot create anyone', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const supervisor = await createStaff(t.db, 'SUPERVISOR');
    await grantPermission(t.db, supervisor.id, 'staff.manage_riders', false, admin.id);
    t.app.get(IdentityService).invalidate(supervisor.id);
    const { accessToken } = await issueToken(t.app, supervisor);
    const res = await post(t, '/admin/staff', { token: accessToken, body: { phone: uniquePhone(), name: 'Naya Rider', role: 'DELIVERY_BOY' } });
    assert.equal(res.status, 403);
  });

  test('RBAC: SUPERVISOR can POST /admin/staff once granted staff.create', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const supervisor = await createStaff(t.db, 'SUPERVISOR');
    await grantPermission(t.db, supervisor.id, 'staff.create', true, admin.id);
    t.app.get(IdentityService).invalidate(supervisor.id); // direct DB grant — invalidate the 30s cache ourselves
    const { accessToken } = await issueToken(t.app, supervisor);
    const res = await post<{ id: number; role: string }>(t, '/admin/staff', { token: accessToken, body: { phone: uniquePhone(), name: 'Naya Rider', role: 'DELIVERY_BOY' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.data?.role, 'DELIVERY_BOY');
  });

  test('RBAC: SUPERVISOR is blocked from GET /admin/settings even with reports.view/other grants (role-gate, not just permission)', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const supervisor = await createStaff(t.db, 'SUPERVISOR');
    await grantPermission(t.db, supervisor.id, 'reports.view', true, admin.id);
    t.app.get(IdentityService).invalidate(supervisor.id);
    const { accessToken } = await issueToken(t.app, supervisor);
    const res = await get(t, '/admin/settings', { token: accessToken });
    assert.equal(res.status, 403);
  });

  test('RBAC: SUPERVISOR is blocked from PUT /admin/settings even with a forced settings.manage row (@Roles(ADMIN) wins over any permission)', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const supervisor = await createStaff(t.db, 'SUPERVISOR');
    // Force the ADMIN-only permission directly into the DB — StaffService.setPermissions would refuse
    // this via the API, but RolesGuard must independently stop it even if the row exists anyway.
    await grantPermission(t.db, supervisor.id, 'settings.manage', true, admin.id);
    t.app.get(IdentityService).invalidate(supervisor.id);
    const { accessToken } = await issueToken(t.app, supervisor);
    const res = await put(t, '/admin/settings', { token: accessToken, body: { changes: { support_phone: '9999999999' } } });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'FORBIDDEN');
  });

  test('RBAC: a tampered JWT signature is rejected with 401', async () => {
    const staff = await createStaff(t.db, 'SUPERVISOR');
    const { accessToken } = await issueToken(t.app, staff);
    const parts = accessToken.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}${parts[2].slice(0, 2)}`;
    const res = await get(t, '/auth/me', { token: tampered });
    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'UNAUTHENTICATED');
  });

  test('RBAC: a signature-valid token for a non-existent user id is rejected with 401', async () => {
    const staff = await createStaff(t.db, 'SUPERVISOR');
    const { accessToken } = await issueToken(t.app, staff);
    await t.db('users').where({ id: staff.id }).delete();
    const res = await get(t, '/auth/me', { token: accessToken });
    assert.equal(res.status, 401);
  });

  test('RBAC: disabling a staff member invalidates an already cache-warmed token immediately (no 30s wait)', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const rider = await createStaff(t.db, 'DELIVERY_BOY');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const { accessToken: riderToken } = await issueToken(t.app, rider);
    // Warm the identity cache for this rider's token.
    const warm = await get(t, '/auth/me', { token: riderToken });
    assert.equal(warm.status, 200);
    const disabled = await patch(t, `/admin/staff/${rider.id}/disable`, { token: adminToken, body: { reason: 'test disable' } });
    assert.equal(disabled.status, 200);
    // Same still-unexpired access token, very next request — must be blocked right away.
    const after1 = await get(t, '/auth/me', { token: riderToken });
    assert.equal(after1.status, 403);
    assert.equal(after1.body.error?.code, 'ACCOUNT_DISABLED');
  });

  test('RBAC: a role downgrade invalidates already cache-warmed admin-route access immediately', async () => {
    const admin = await createStaff(t.db, 'ADMIN');
    const supervisor = await createStaff(t.db, 'SUPERVISOR');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    const { accessToken: supervisorToken } = await issueToken(t.app, supervisor);
    const warm = await get(t, '/admin/staff', { token: supervisorToken }); // staff.view is a SUPERVISOR default
    assert.equal(warm.status, 200);
    const changed = await patch(t, `/admin/staff/${supervisor.id}/role`, { token: adminToken, body: { role: 'CUSTOMER', reason: 'test downgrade' } });
    assert.equal(changed.status, 200);
    const after1 = await get(t, '/admin/staff', { token: supervisorToken });
    // A7 says a role change also revokes every session, so the guard now rejects this token on the
    // session check (401) before it ever gets to the role check (403). Either answer is a refusal;
    // what this test guards is that the old token cannot reach an admin route any more.
    assert.ok(after1.status === 401 || after1.status === 403, `downgraded token must lose admin access at once, got ${after1.status}`);
  });

  test('RBAC: the last ACTIVE admin cannot be disabled', async () => {
    /*
     * The owner is now protected outright rather than by counting rows: his account cannot be
     * disabled at all, by anyone, himself included. So the refusal arrives as FORBIDDEN before the
     * last-admin count is ever reached. The guarantee the shop cares about is unchanged and
     * stronger — the door cannot be locked from the inside — so this asserts the outcome, and the
     * row-counting rule is exercised below on an admin who is not the owner.
     */
    const owner = await createStaff(t.db, 'ADMIN');
    const { accessToken } = await issueToken(t.app, owner);
    const res = await patch(t, `/admin/staff/${owner.id}/disable`, { token: accessToken, body: { reason: 'trying to lock everyone out' } });
    assert.equal(res.status, 403);
    assert.equal((await t.db('users').where({ id: owner.id }).first('status')).status, 'ACTIVE');
  });

  test('RBAC: the last ACTIVE admin cannot be disabled — the row-count rule, on a scoped admin', async () => {
    // Only one ADMIN row in the database, and it is not the owner's, so the count is what refuses.
    const onlyAdmin = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    const staffService = t.app.get(StaffService);
    const actor: AuthUser = { id: onlyAdmin.id + 999_000, role: 'ADMIN', status: 'ACTIVE', name: 'Owner elsewhere', phone: '910000000001', permissions: new Set(), isGlobalAdmin: true };
    await assert.rejects(
      () => staffService.disable(onlyAdmin.id, 'last one out', actor, '127.0.0.1'),
      (e: AppError) => e.code === 'CONFLICT',
    );
    assert.equal((await t.db('users').where({ id: onlyAdmin.id }).first('status')).status, 'ACTIVE');
  });

  test('RBAC: the last ACTIVE admin cannot be demoted', async () => {
    // The /admin/staff/:id/role route is @Roles('ADMIN'), and StaffService.changeRole forbids
    // self-change — so the ONLY way to reach a genuine "last admin" scenario is a single ADMIN row
    // in the DB, acted on by a caller who is not that same row. Any *real* second ADMIN account
    // would itself count as "another active admin" and the change would rightly be allowed — so
    // this rule can only be exercised by calling the service directly with a synthetic actor,
    // exactly the way A7's assertNotLastAdmin is specified (it only ever looks at DB rows).
    // Not the owner: his account is refused outright (FORBIDDEN) and would never reach the count.
    const admin = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    const staffService = t.app.get(StaffService);
    const actor: AuthUser = { id: admin.id + 999_000, role: 'ADMIN', status: 'ACTIVE', name: 'Other Admin', phone: '910000000000', permissions: new Set(), isGlobalAdmin: true };
    await assert.rejects(
      () => staffService.changeRole(admin.id, 'SUPERVISOR', 'demote the only admin', actor, '127.0.0.1'),
      (e: AppError) => e.code === 'CONFLICT',
    );
    const row = await t.db('users').where({ id: admin.id }).first('role');
    assert.equal(row.role, 'ADMIN');
  });
});
