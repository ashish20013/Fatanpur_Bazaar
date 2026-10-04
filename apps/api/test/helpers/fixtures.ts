import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Knex } from 'knex';
import type { INestApplication } from '@nestjs/common';
import type { Permission, Role } from '@fb/shared-types';
import { referralCode } from '../../src/common/utils/ids';
import { TokenService } from '../../src/modules/auth/token.service';
import { UsersService, type AddressInput } from '../../src/modules/users/users.service';
import { ENV, type Env } from '../../src/config/config.module';
import { KNEX } from '../../src/database/knex.provider';
import { PrescriptionsService } from '../../src/modules/prescriptions/prescriptions.service';
import { randomInt } from 'crypto';

let seq = randomInt(0, 500_000);
/** 10-digit, starts 6-9 (PHONE_RE) — deterministic + collision-free within one test process. */
export function uniquePhone(): string {
  seq += 1;
  return `9${String(600_000_000 + seq).padStart(9, '0')}`;
}
export function uniqueSlug(base: string): string {
  seq += 1;
  return `${base}-${seq}`;
}

export interface FixtureUser {
  id: number;
  phone: string;
  role: Role;
  name: string;
}

/** Direct-to-DB user creation (bypasses OTP — auth.spec.ts covers the OTP path itself). */
export async function createCustomer(db: Knex, overrides: Partial<{ name: string; phoneVerified: boolean; status: 'ACTIVE' | 'DISABLED' }> = {}): Promise<FixtureUser> {
  const phone = `91${uniquePhone()}`;
  const [id] = await db('users').insert({
    phone,
    name: overrides.name ?? 'Test Customer',
    role: 'CUSTOMER',
    status: overrides.status ?? 'ACTIVE',
    // Default verified: most order/payment tests are not exercising the COD-trust gate (A12 step 12),
    // which would otherwise 422 any unverified first order over ₹500 (settings.cod_unverified_limit).
    phone_verified: overrides.phoneVerified === false ? 0 : 1,
    referral_code: referralCode(10),
  });
  await db('wallets').insert({ user_id: id, balance: 0 });
  return { id, phone, role: 'CUSTOMER', name: overrides.name ?? 'Test Customer' };
}

/**
 * Staff creation direct-to-DB (staff.spec-equivalent flows go through POST /admin/staff instead).
 *
 * ⚠️ An ADMIN made here is the GLOBAL admin — the owner — unless `globalAdmin: false` is passed.
 * Every test written before the second-admin work meant "the owner" when it said ADMIN, and the
 * default keeps them saying exactly that. Pass `globalAdmin: false` to get a scoped admin: the
 * role opens the panel, and nothing inside it is his until a permission is granted.
 */
export async function createStaff(db: Knex, role: Extract<Role, 'ADMIN' | 'SUPERVISOR' | 'DELIVERY_BOY'>, overrides: Partial<{ name: string; isAvailable: boolean; status: 'ACTIVE' | 'DISABLED'; globalAdmin: boolean }> = {}): Promise<FixtureUser> {
  const phone = `91${uniquePhone()}`;
  const [id] = await db('users').insert({
    phone,
    name: overrides.name ?? `Test ${role}`,
    role,
    is_global_admin: role === 'ADMIN' && overrides.globalAdmin !== false ? 1 : 0,
    status: overrides.status ?? 'ACTIVE',
    phone_verified: 1,
    referral_code: referralCode(10),
  });
  await db('wallets').insert({ user_id: id, balance: 0 });
  await db('staff_profiles').insert({ user_id: id, employee_code: uniqueSlug('EMP').toUpperCase(), is_available: overrides.isAvailable === false ? 0 : 1, joined_on: db.raw('CURDATE()') });
  return { id, phone, role, name: overrides.name ?? `Test ${role}` };
}

/** Real signed JWT + refresh via the app's own TokenService — guards behave exactly as in prod. */
export async function issueToken(app: INestApplication, user: FixtureUser, platform: 'WEB' | 'ANDROID' | 'IOS' = 'WEB'): Promise<{ accessToken: string; refreshToken: string }> {
  const tokens = app.get(TokenService);
  const issued = await tokens.issue({ id: user.id, role: user.role }, { platform });
  return { accessToken: issued.accessToken, refreshToken: issued.refreshToken };
}

export async function grantPermission(db: Knex, userId: number, code: Permission, granted: boolean, grantedBy: number): Promise<void> {
  await db('user_permissions').where({ user_id: userId, permission_code: code }).delete();
  await db('user_permissions').insert({ user_id: userId, permission_code: code, granted: granted ? 1 : 0, granted_by: grantedBy });
}

export interface FixtureVillage {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

/** Store center is (25.7420, 81.9540) — the seeded 6 km RADIUS zone (service_zones id from 001_init). */
export const STORE_CENTER = { lat: 25.742, lng: 81.954 };

export async function createVillage(db: Knex, overrides: Partial<{ name: string; lat: number; lng: number; isActive: boolean; deliveryFee: string; minOrder: string; etaMinutes: number; distanceKm: number; isPopular: boolean; orderCount: number }> = {}): Promise<FixtureVillage> {
  const name = overrides.name ?? uniqueSlug('Gaon');
  const lat = overrides.lat ?? STORE_CENTER.lat;
  const lng = overrides.lng ?? STORE_CENTER.lng;
  const [id] = await db('villages').insert({
    name,
    name_hi: name,
    slug: uniqueSlug('gaon'),
    latitude: lat,
    longitude: lng,
    distance_km: overrides.distanceKm ?? 0,
    delivery_fee: overrides.deliveryFee ?? '0.00',
    min_order: overrides.minOrder ?? '0.00',
    eta_minutes: overrides.etaMinutes ?? 0,
    is_active: overrides.isActive === false ? 0 : 1,
    is_popular: overrides.isPopular ? 1 : 0,
    order_count: overrides.orderCount ?? 0,
  });
  return { id, name, lat, lng };
}

export async function createCategory(db: Knex, overrides: Partial<{ name: string; vertical: string; itemType: 'PRODUCT' | 'SERVICE' }> = {}): Promise<{ id: number; name: string }> {
  const name = overrides.name ?? uniqueSlug('Category');
  const [id] = await db('categories').insert({
    name,
    name_hi: name,
    slug: uniqueSlug('cat'),
    vertical: overrides.vertical ?? 'GROCERY',
    item_type: overrides.itemType ?? 'PRODUCT',
    is_active: 1,
  });
  return { id, name };
}

export interface FixtureProduct {
  id: number;
  name: string;
  price: string;
  slug: string;
}

export async function createProduct(db: Knex, categoryId: number, overrides: Partial<{ name: string; price: string; mrp: string; stockQty: number; isAvailable: boolean; itemType: 'PRODUCT' | 'SERVICE'; maxQtyPerOrder: number; prescriptionRequired: boolean; visitingCharge: string; isQuoteBased: boolean }> = {}): Promise<FixtureProduct> {
  const name = overrides.name ?? uniqueSlug('Product');
  const slug = uniqueSlug('product');
  const [id] = await db('products').insert({
    category_id: categoryId,
    item_type: overrides.itemType ?? 'PRODUCT',
    name,
    name_hi: name,
    slug,
    unit: 'piece',
    unit_value: 1,
    mrp: overrides.mrp ?? overrides.price ?? '100.00',
    price: overrides.price ?? '100.00',
    stock_qty: overrides.stockQty ?? 100,
    is_available: overrides.isAvailable === false ? 0 : 1,
    prescription_required: overrides.prescriptionRequired ? 1 : 0,
    max_qty_per_order: overrides.maxQtyPerOrder ?? 50,
    visiting_charge: overrides.visitingCharge ?? '0.00',
    is_quote_based: overrides.isQuoteBased ? 1 : 0,
    tax_rate: '0.00',
  });
  return { id, name, price: overrides.price ?? '100.00', slug };
}

/** Goes through the REAL UsersService.saveAddress so serviceability (A8) is computed exactly as prod. */
export async function createAddress(app: INestApplication, userId: number, input: Partial<AddressInput> & { villageId?: number | null; lat?: number | null; lng?: number | null; accuracyM?: number | null }): Promise<{ id: number; serviceability: unknown }> {
  const users = app.get(UsersService);
  return users.saveAddress(userId, null, {
    receiverName: 'Test Receiver',
    phone: uniquePhone(),
    line1: 'Ward 4, near temple',
    villageId: null,
    lat: null,
    lng: null,
    accuracyM: null,
    isDefault: true,
    ...input,
  });
}

/**
 * A serviceable address: bound to an ACTIVE village at STORE_CENTER, so ServiceAreaService.check()
 * (A8.3 rule 1 — the village always wins) always says serviceable, and — since the village falls
 * inside the one seeded 6km RADIUS zone — inherits its delivery_fee/min_order/eta as a fallback.
 */
export async function createServiceableAddress(db: Knex, userId: number, overrides: Partial<{ villageId: number }> = {}): Promise<number> {
  const villageId = overrides.villageId ?? (await createVillage(db, { isActive: true, distanceKm: 2 })).id;
  const [id] = await db('addresses').insert({
    user_id: userId,
    village_id: villageId,
    receiver_name: 'Test Receiver',
    phone: `91${uniquePhone()}`,
    line1: 'Ward 4, near temple',
    latitude: STORE_CENTER.lat,
    longitude: STORE_CENTER.lng,
    is_default: 1,
  });
  return id;
}

/** ~11 km from STORE_CENTER, with accurate GPS and no village chosen — outside the seeded 6 km zone. */
export async function createOutOfAreaAddress(db: Knex, userId: number): Promise<number> {
  const [id] = await db('addresses').insert({
    user_id: userId,
    village_id: null,
    receiver_name: 'Test Receiver',
    phone: `91${uniquePhone()}`,
    line1: 'Door ka Gaon',
    latitude: 25.842,
    longitude: 81.954,
    gps_accuracy_m: 10,
  });
  return id;
}

export async function createCoupon(db: Knex, overrides: Partial<{ code: string; discountType: 'FLAT' | 'PERCENT'; discountValue: string; minOrderValue: string; usageLimit: number | null; perUserLimit: number; firstOrderOnly: boolean; appliesTo: 'ALL' | 'PRODUCT' | 'SERVICE' }> = {}): Promise<{ id: number; code: string }> {
  const code = overrides.code ?? uniqueSlug('COUPON').toUpperCase();
  const [id] = await db('coupons').insert({
    code,
    discount_type: overrides.discountType ?? 'FLAT',
    discount_value: overrides.discountValue ?? '20.00',
    min_order_value: overrides.minOrderValue ?? '0.00',
    usage_limit: overrides.usageLimit ?? null,
    per_user_limit: overrides.perUserLimit ?? 1,
    first_order_only: overrides.firstOrderOnly ? 1 : 0,
    applies_to: overrides.appliesTo ?? 'ALL',
    starts_at: db.raw('NOW() - INTERVAL 1 DAY'),
    expires_at: db.raw('NOW() + INTERVAL 1 DAY'),
    is_active: 1,
  });
  return { id, code };
}

export async function setSetting(db: Knex, cacheInvalidate: () => void, key: string, value: string): Promise<void> {
  await db('settings').where({ key }).update({ value });
  cacheInvalidate();
}

/** Bypasses the multipart upload endpoint — writes a real file so PrescriptionsService.serve() can read it. */
export async function insertPrescription(app: INestApplication, userId: number, status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' = 'PENDING_REVIEW'): Promise<{ id: number; token: string }> {
  const env = app.get<Env>(ENV);
  const dir = join(env.STORAGE_PATH, 'private', 'rx', String(userId));
  mkdirSync(dir, { recursive: true });
  const fileName = `${uniqueSlug('rx')}.jpg`;
  writeFileSync(join(dir, fileName), Buffer.from([0xff, 0xd8, 0xff, 0xdb])); // minimal fake JPEG bytes
  const knex = app.get<Knex>(KNEX);
  const [id] = await knex('prescriptions').insert({
    user_id: userId,
    file_path: `private/rx/${userId}/${fileName}`,
    file_mime: 'image/jpeg',
    file_size: 4,
    status,
    expires_at: status === 'APPROVED' ? knex.raw('DATE_ADD(NOW(), INTERVAL 30 DAY)') : null,
  });
  const token = app.get(PrescriptionsService).token(id, userId);
  return { id, token };
}

/**
 * A2 step 8: SMS_DRIVER='null' (dev/test) writes each OTP to storage/logs/otp-dev.log as
 * "<iso> <phone10> <otp>", NEVER to the response body. Reads the LAST line for that phone
 * so the real send→verify HTTP round trip can be exercised without mocking anything.
 */
export function readDevOtp(storagePath: string, phone10: string): string {
  const path = join(storagePath, 'logs', 'otp-dev.log');
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  // The dev log stores the 10-digit number; callers may pass it with or without the 91 prefix.
  const want = phone10.length === 12 && phone10.startsWith('91') ? phone10.slice(2) : phone10;
  for (let i = lines.length - 1; i >= 0; i--) {
    const parts = lines[i].split(' ');
    const got = parts[1]?.length === 12 && parts[1].startsWith('91') ? parts[1].slice(2) : parts[1];
    if (got === want) return parts[2];
  }
  throw new Error(`no dev OTP found for ${phone10} in ${path}`);
}
