const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../dist');

test('35 unique permission codes (34 + staff.manage_riders, migration 003)', () => {
  assert.equal(t.ALL_PERMISSIONS.length, 35);
  assert.equal(new Set(t.ALL_PERMISSIONS).size, 35);
});
test('SUPERVISOR 18 defaults (17 + staff.manage_riders), DELIVERY_BOY 1', () => {
  assert.equal(t.ROLE_DEFAULT_PERMISSIONS.SUPERVISOR.length, 18);
  assert.deepEqual([...t.ROLE_DEFAULT_PERMISSIONS.DELIVERY_BOY], ['orders.view']);
});
test('SUPERVISOR never gets staff.create / payments.verify / admin-only by default (SEC-02)', () => {
  for (const p of ['staff.create', 'staff.manage', 'payments.verify', 'permissions.manage', 'settings.manage'])
    assert.equal(t.ROLE_DEFAULT_PERMISSIONS.SUPERVISOR.includes(p), false, p);
});
test('defaults only reference catalogue codes', () => {
  for (const role of Object.keys(t.ROLE_DEFAULT_PERMISSIONS))
    for (const p of t.ROLE_DEFAULT_PERMISSIONS[role]) assert.ok(t.isPermission(p), p);
});
test('role homes', () => {
  assert.equal(t.ROLE_HOME.CUSTOMER, '/mera');
  assert.equal(t.ROLE_HOME.DELIVERY_BOY, '/delivery');
});
test('vertical slug round-trip', () => {
  for (const v of t.ALL_VERTICALS) assert.equal(t.verticalFromSlug(t.VERTICAL_SLUG[v]), v);
  assert.equal(t.verticalFromSlug('meat'), null);
});
test('error catalogue: formatMessage fills placeholders', () => {
  assert.equal(t.formatMessage(t.ERROR_CATALOG.OTP_INVALID.hi, { n: 2 }), 'OTP गलत है। 2 कोशिश बची हैं।');
});
test('a supervisor can hand a rider only harmless extras', () => {
  for (const p of t.RIDER_GRANTABLE_PERMISSIONS) {
    assert.ok(t.isPermission(p), p);
    assert.equal(t.ADMIN_ONLY_PERMISSIONS.includes(p), false, p);
    assert.equal(/^(staff|permissions|settings|payments)\./.test(p), false, p);
  }
});
test('every permission has an English label (staff panels are English-only)', () => {
  for (const p of t.PERMISSIONS) assert.ok(p.labelEn && /^[\x20-\x7E’]+$/.test(p.labelEn), p.code);
});
