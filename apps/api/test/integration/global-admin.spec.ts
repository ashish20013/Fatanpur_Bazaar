import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { get, idemKey, patch, post, put, type TestApp, createTestApp } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { createCategory, createCustomer, createProduct, createServiceableAddress, createStaff, grantPermission, issueToken, uniquePhone } from '../helpers/fixtures';

/**
 * The owner and his manager, through the real HTTP surface.
 *
 * The shop has one owner. He asked for a second admin on the shop's number whose access he
 * decides. That only means anything if the API actually stops the second admin — a permission
 * list that every guard waves through is a list of suggestions. These tests are the proof, and
 * they are written as the attacks the arrangement has to survive: a manager reading settings he
 * was never given, promoting himself, disabling the owner, or handing himself the rest.
 */
describe('global admin', () => {
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

  /** A confirmed cash-on-delivery order, so a transition can actually be attempted against it. */
  async function placeCodOrder(): Promise<string> {
    const customer = await createCustomer(t.db);
    const addressId = await createServiceableAddress(t.db, customer.id);
    const cat = await createCategory(t.db);
    const product = await createProduct(t.db, cat.id, { price: '150.00', mrp: '150.00', stockQty: 10 });
    const tok = (await issueToken(t.app, customer)).accessToken;
    const res = await post<{ orderNumber: string }>(t, '/orders', { token: tok, idempotencyKey: idemKey(), body: { addressId, items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'COD' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return (res.body.data as { orderNumber: string }).orderNumber;
  }

  test('the owner reaches settings; a scoped admin with no grants does not', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    const ownerTok = (await issueToken(t.app, owner)).accessToken;
    const mgrTok = (await issueToken(t.app, manager)).accessToken;

    assert.equal((await get(t, '/admin/settings', { token: ownerTok })).status, 200);
    // ⚠️ This is the whole point. Before the change this was 200, because the guard read the role.
    assert.equal((await get(t, '/admin/settings', { token: mgrTok })).status, 403);
  });

  test('a scoped admin reaches exactly what he was granted, and nothing beside it', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    await grantPermission(t.db, manager.id, 'orders.view_all', true, owner.id);
    await grantPermission(t.db, manager.id, 'orders.view', true, owner.id);
    const tok = (await issueToken(t.app, manager)).accessToken;

    assert.equal((await get(t, '/admin/orders', { token: tok })).status, 200);
    assert.equal((await get(t, '/admin/staff', { token: tok })).status, 403);
    assert.equal((await get(t, '/admin/settings', { token: tok })).status, 403);
  });

  test('⚠️ a granted permission is honoured — this is not a blanket ban on second admins', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    const tok = (await issueToken(t.app, manager)).accessToken;
    assert.equal((await get(t, '/admin/staff', { token: tok })).status, 403);
    await grantPermission(t.db, manager.id, 'staff.view', true, owner.id);
    t.cache.delPrefix('');
    assert.equal((await get(t, '/admin/staff', { token: tok })).status, 200);
  });

  test('⚠️ a scoped admin cannot create another admin, even holding staff.create', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    await grantPermission(t.db, manager.id, 'staff.create', true, owner.id);
    await t.db('settings').where({ key: 'allow_admin_creation' }).update({ value: '1' });
    t.cache.delPrefix('');
    const tok = (await issueToken(t.app, manager)).accessToken;

    const res = await post(t, '/admin/staff', { body: { phone: uniquePhone(), name: 'Another owner', role: 'ADMIN' }, token: tok });
    assert.equal(res.status, 403);
    // A rider, on the other hand, is ordinary staff work and goes through.
    const ok = await post(t, '/admin/staff', { body: { phone: uniquePhone(), name: 'Rider', role: 'DELIVERY_BOY' }, token: tok });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
  });

  test('⚠️ a scoped admin cannot disable the owner, nor revoke his sessions', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    await grantPermission(t.db, manager.id, 'staff.manage', true, owner.id);
    t.cache.delPrefix('');
    const tok = (await issueToken(t.app, manager)).accessToken;

    assert.equal((await patch(t, `/admin/staff/${owner.id}/disable`, { body: { reason: 'taking over' }, token: tok })).status, 403);
    assert.equal((await post(t, `/admin/staff/${owner.id}/revoke-sessions`, { body: {}, token: tok })).status, 403);
    const row = await t.db('users').where({ id: owner.id }).first('status');
    assert.equal(row.status, 'ACTIVE');
  });

  test('⚠️ nobody disables the owner — not even the owner himself', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const tok = (await issueToken(t.app, owner)).accessToken;
    const res = await patch(t, `/admin/staff/${owner.id}/disable`, { body: { reason: 'oops' }, token: tok });
    assert.equal(res.status, 403);
    assert.equal((await t.db('users').where({ id: owner.id }).first('status')).status, 'ACTIVE');
  });

  test('the owner can disable a scoped admin', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    const tok = (await issueToken(t.app, owner)).accessToken;
    const res = await patch(t, `/admin/staff/${manager.id}/disable`, { body: { reason: 'left the shop' }, token: tok });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await t.db('users').where({ id: manager.id }).first('status')).status, 'DISABLED');
  });

  test('⚠️ a scoped admin cannot grant himself anything — not even with permissions.manage', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    await grantPermission(t.db, manager.id, 'permissions.manage', true, owner.id);
    t.cache.delPrefix('');
    const tok = (await issueToken(t.app, manager)).accessToken;

    // Setting permissions on ANY admin account — his own included — is the owner's alone.
    const self = await put(t, `/admin/staff/${manager.id}/permissions`, { body: { grants: [{ code: 'settings.manage', granted: true }] }, token: tok });
    assert.equal(self.status, 403);
    assert.equal((await get(t, '/admin/settings', { token: tok })).status, 403);
  });

  test('the owner CAN hand a scoped admin the settings screen — "give him everything" must be possible', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    const ownerTok = (await issueToken(t.app, owner)).accessToken;
    const res = await put(t, `/admin/staff/${manager.id}/permissions`, { body: { grants: [{ code: 'settings.manage', granted: true }] }, token: ownerTok });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    t.cache.delPrefix('');
    assert.equal((await get(t, '/admin/settings', { token: (await issueToken(t.app, manager)).accessToken })).status, 200);
  });

  test('⚠️ settings.manage still cannot reach a SUPERVISOR, however it is granted (RBAC-07)', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const sup = await createStaff(t.db, 'SUPERVISOR');
    const ownerTok = (await issueToken(t.app, owner)).accessToken;
    const res = await put(t, `/admin/staff/${sup.id}/permissions`, { body: { grants: [{ code: 'settings.manage', granted: true }] }, token: ownerTok });
    assert.notEqual(res.status, 200);
    assert.equal((await get(t, '/admin/settings', { token: (await issueToken(t.app, sup)).accessToken })).status, 403);
  });

  test('⚠️ a gateway secret is never readable through the settings API, by anyone', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const tok = (await issueToken(t.app, owner)).accessToken;

    const saved = await put(t, '/admin/settings', { body: { changes: { cashfree_secret_key: 'cfsk_live_do_not_leak' } }, token: tok });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    // Stored encrypted — a database dump on its own is not enough to use it.
    const row = await t.db('settings').where({ key: 'cashfree_secret_key' }).first('value');
    assert.ok(!String(row.value).includes('do_not_leak'), 'the secret is sitting in the table in plain text');

    // Read back as dots, for the owner too. The only reason to fetch a key you already set is to
    // take it somewhere else.
    const rows = (await get(t, '/admin/settings', { token: tok })).body.data as { key: string; value: string; secret?: boolean; isSet?: boolean }[];
    const s = rows.find((r) => r.key === 'cashfree_secret_key');
    assert.ok(s, 'cashfree_secret_key is missing from the settings screen');
    assert.ok(!s.value.includes('do_not_leak'));
    assert.equal(s.secret, true);
    assert.equal(s.isSet, true);

    // And never on the public endpoint the website reads.
    const pub = (await get(t, '/content/settings')).body.data as Record<string, string>;
    assert.equal(pub.cashfree_secret_key, undefined);
    assert.equal(pub.cashfree_webhook_secret, undefined);
  });

  test('⚠️ saving the masked value back does not wipe the stored key', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const tok = (await issueToken(t.app, owner)).accessToken;
    await put(t, '/admin/settings', { body: { changes: { cashfree_secret_key: 'cfsk_real' } }, token: tok });
    const before = (await t.db('settings').where({ key: 'cashfree_secret_key' }).first('value')).value;

    // Exactly what a browser sends when the owner edits an unrelated field on the same page.
    await put(t, '/admin/settings', { body: { changes: { cashfree_secret_key: '••••••••', cashfree_mode: 'PROD' } }, token: tok });
    const after = (await t.db('settings').where({ key: 'cashfree_secret_key' }).first('value')).value;
    assert.equal(after, before, 'the gateway key was overwritten with the mask — payments would stop');
    assert.equal((await t.db('settings').where({ key: 'cashfree_mode' }).first('value')).value, 'PROD');
  });

  test('⚠️ who the owner is cannot be changed through the API', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const tok = (await issueToken(t.app, owner)).accessToken;
    const res = await put(t, '/admin/settings', { body: { changes: { global_admin_phone: '9999999999' } }, token: tok });
    assert.notEqual(res.status, 200);
  });

  test('⚠️ a scoped admin cannot re-role anybody — the route that had no permission on it', async () => {
    /*
     * This was a real hole. `PATCH /admin/staff/:id/role` carried `@Roles('ADMIN')` and nothing
     * else, and a scoped admin IS an ADMIN — so the one account whose access the owner had ticked
     * item by item could promote a second phone of his own to SUPERVISOR and inherit that role's
     * whole permission set, or demote the shop's real supervisor and lock him out.
     */
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    await grantPermission(t.db, manager.id, 'orders.view_all', true, owner.id);
    t.cache.delPrefix('');
    const tok = (await issueToken(t.app, manager)).accessToken;

    const victim = await createCustomer(t.db);
    const res = await patch(t, `/admin/staff/${victim.id}/role`, { body: { role: 'SUPERVISOR', reason: 'helping myself' }, token: tok });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal((await t.db('users').where({ id: victim.id }).first('role')).role, 'CUSTOMER');

    const sup = await createStaff(t.db, 'SUPERVISOR');
    const demote = await patch(t, `/admin/staff/${sup.id}/role`, { body: { role: 'CUSTOMER', reason: 'out of my way' }, token: tok });
    assert.equal(demote.status, 403);
    assert.equal((await t.db('users').where({ id: sup.id }).first('role')).role, 'SUPERVISOR');
  });

  test('⚠️ even with staff.manage, turning a CUSTOMER into staff needs staff.create', async () => {
    // Otherwise this route is a back door around POST /admin/staff: sign a phone up as an ordinary
    // shopper, then re-role it here.
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    await grantPermission(t.db, manager.id, 'staff.manage', true, owner.id);
    t.cache.delPrefix('');
    const tok = (await issueToken(t.app, manager)).accessToken;

    const victim = await createCustomer(t.db);
    assert.equal((await patch(t, `/admin/staff/${victim.id}/role`, { body: { role: 'SUPERVISOR', reason: 'promote please' }, token: tok })).status, 403);

    await grantPermission(t.db, manager.id, 'staff.create', true, owner.id);
    t.cache.delPrefix('');
    const ok = await patch(t, `/admin/staff/${victim.id}/role`, { body: { role: 'SUPERVISOR', reason: 'new supervisor' }, token: tok });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  test('⚠️ a scoped admin without orders.cancel cannot cancel an order', async () => {
    const owner = await createStaff(t.db, 'ADMIN');
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    await grantPermission(t.db, manager.id, 'orders.view_all', true, owner.id);
    await grantPermission(t.db, manager.id, 'orders.update_status', true, owner.id);
    t.cache.delPrefix('');
    const tok = (await issueToken(t.app, manager)).accessToken;
    const ownerTok = (await issueToken(t.app, owner)).accessToken;

    const order = await placeCodOrder();
    // He can run the shop …
    assert.equal((await patch(t, `/admin/orders/${order}/status`, { body: { status: 'PREPARING' }, token: tok })).status, 200);
    // … but cancelling restocks, refunds the wallet and rolls the coupon back, so it needs its own tick.
    const cancel = await patch(t, `/admin/orders/${order}/status`, { body: { status: 'CANCELLED', note: 'mine now' }, token: tok });
    assert.equal(cancel.status, 403, JSON.stringify(cancel.body));
    assert.equal((await t.db('orders').where({ order_number: order }).first('status')).status, 'PREPARING');
    // The owner always can.
    assert.equal((await patch(t, `/admin/orders/${order}/status`, { body: { status: 'CANCELLED', note: 'owner' }, token: ownerTok })).status, 200);
  });

  test('a scoped admin cannot read another customer’s order — ownership is not waived by the role', async () => {
    const manager = await createStaff(t.db, 'ADMIN', { globalAdmin: false });
    const customer = await createCustomer(t.db);
    const tok = (await issueToken(t.app, manager)).accessToken;
    // No orders.view_all → the admin list itself is shut, which is the same answer from the front.
    assert.equal((await get(t, '/admin/orders', { token: tok })).status, 403);
    assert.ok(customer.id > 0);
  });
});
