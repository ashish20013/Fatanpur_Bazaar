// Guards drift between shared-types and the real schema.sql (single source of truth).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const t = require('../dist');

const MIG = join(__dirname, '../../../apps/api/src/database/migrations');
const sql = readFileSync(join(MIG, '001_init.sql'), 'utf8');
// Later migrations are additive (INSERT IGNORE) — permissions/role seeds are the union of all files.
const allSql = readdirSync(MIG).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort().map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n');

function enumOf(table, column) {
  const block = sql.slice(sql.indexOf(`CREATE TABLE ${table} (`));
  const m = new RegExp(`\\n\\s*${column}\\s+ENUM\\(([^)]*)\\)`).exec(block);
  assert.ok(m, `${table}.${column} enum not found`);
  return m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
}

test('57 tables and 54 foreign keys in schema.sql', () => {
  assert.equal((sql.match(/^CREATE TABLE /gm) || []).length, 57);
  assert.equal((sql.match(/CONSTRAINT \w+ FOREIGN KEY/g) || []).length, 54);
});
test('permission seed (all migrations) == shared ALL_PERMISSIONS (35)', () => {
  const codes = new Set();
  for (const m of allSql.matchAll(/INSERT (?:IGNORE )?INTO permissions[^;]*;/g)) {
    for (const c of m[0].matchAll(/\('([a-z_]+\.[a-z_]+)'/g)) codes.add(c[1]);
  }
  assert.deepEqual([...codes].sort(), [...t.ALL_PERMISSIONS].sort());
  assert.equal(t.ALL_PERMISSIONS.length, 35);
});
test('SUPERVISOR / DELIVERY_BOY role seed == shared defaults', () => {
  const rp = [...allSql.matchAll(/\('(SUPERVISOR|DELIVERY_BOY)',\s*'([a-z_.]+)'\)/g)];
  const sup = rp.filter((m) => m[1] === 'SUPERVISOR').map((m) => m[2]).sort();
  const rider = rp.filter((m) => m[1] === 'DELIVERY_BOY').map((m) => m[2]);
  assert.deepEqual(sup, [...t.ROLE_DEFAULT_PERMISSIONS.SUPERVISOR].sort());
  assert.deepEqual(rider, [...t.ROLE_DEFAULT_PERMISSIONS.DELIVERY_BOY]);
});
test('enums match DB', () => {
  assert.deepEqual(enumOf('users', 'role').sort(), [...t.ALL_ROLES].sort());
  assert.deepEqual(enumOf('users', 'status').sort(), Object.values(t.UserStatus).sort());
  assert.deepEqual(enumOf('orders', 'status').sort(), Object.values(t.OrderStatus).sort());
  assert.deepEqual(enumOf('orders', 'payment_status').sort(), Object.values(t.PaymentStatus).sort());
  assert.deepEqual(enumOf('orders', 'payment_method').sort(), Object.values(t.PaymentMethod).sort());
  assert.deepEqual(enumOf('delivery_assignments', 'status').sort(), Object.values(t.AssignmentStatus).sort());
  assert.deepEqual(enumOf('wallet_transactions', 'source').sort(), [...t.WALLET_SOURCES].sort());
  assert.deepEqual(enumOf('village_aliases', 'alias_type').sort(), Object.values(t.AliasType).sort());
  assert.deepEqual(enumOf('coupons', 'applies_to').sort(), Object.values(t.CouponAppliesTo).sort());
});
test('vertical kill-switch settings exist with the exact key casing', () => {
  for (const v of t.ALL_VERTICALS) assert.ok(sql.includes(`('${t.VERTICAL_SETTING_KEY[v]}'`), v);
});
test('categories.vertical enum == CATEGORY_VERTICALS (six licence-gated + OTHER)', () => {
  assert.deepEqual(enumOf('categories', 'vertical').sort(), [...t.CATEGORY_VERTICALS].sort());
});
