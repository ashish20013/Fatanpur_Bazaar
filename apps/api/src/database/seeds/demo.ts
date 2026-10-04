import type { Knex } from 'knex';
import { fourDigitCode, orderNumber, referralCode } from '../../common/utils/ids';
import { fromPaise, mulQty, toPaise } from '../../common/utils/money';
import { istYmd } from '../../common/utils/time';

/**
 * DEMO data (only with `seed --demo`, refused in production): staff + customers + 6 orders in
 * different states + 1 service booking + 3 area requests — so dashboards are not empty in dev/QA.
 * Staff here are demo accounts with fake 9000000xxx numbers; real staff are created in /admin/staff.
 */
type Role = 'SUPERVISOR' | 'DELIVERY_BOY' | 'CUSTOMER';
interface DemoUser { phone: string; name: string; role: Role; code?: string; vehicle?: 'BIKE' | 'CYCLE' }

const USERS: DemoUser[] = [
  { phone: '919000000001', name: 'राजेश (सुपरवाइज़र)', role: 'SUPERVISOR', code: 'EMP-101' },
  { phone: '919000000002', name: 'मनोज (डिलीवरी)', role: 'DELIVERY_BOY', code: 'EMP-201', vehicle: 'BIKE' },
  { phone: '919000000003', name: 'सुनील (डिलीवरी)', role: 'DELIVERY_BOY', code: 'EMP-202', vehicle: 'CYCLE' },
  { phone: '919000000011', name: 'सीता देवी', role: 'CUSTOMER' },
  { phone: '919000000012', name: 'रामकुमार यादव', role: 'CUSTOMER' },
  { phone: '919000000013', name: 'अंकित वर्मा', role: 'CUSTOMER' },
];

async function insertUser(trx: Knex.Transaction, u: DemoUser): Promise<number> {
  // Demo seeding is an operator action (CLI), not public registration — role is explicit here by design.
  const [id] = await trx('users').insert({ phone: u.phone, name: u.name, role: u.role, status: 'ACTIVE', phone_verified: 1, referral_code: referralCode(8) });
  await trx('wallets').insert({ user_id: id, balance: 0 });
  if (u.role !== 'CUSTOMER') {
    await trx('staff_profiles').insert({ user_id: id, employee_code: u.code, designation: u.role === 'SUPERVISOR' ? 'Supervisor' : 'Delivery partner', joined_on: trx.raw('CURDATE()'), vehicle_type: u.vehicle ?? null, is_available: u.role === 'DELIVERY_BOY' ? 1 : 0 });
  }
  return id;
}

interface Ctx { trx: Knex.Transaction; ids: Map<string, number>; addr: Map<string, { id: number; line1: string; village: string; lat: number; lng: number; km: number }>; seq: number }

async function address(ctx: Ctx, phone: string, villageSlug: string, line1: string, landmark: string): Promise<void> {
  const v = await ctx.trx('villages').where({ slug: villageSlug }).first('id', 'name_hi', 'latitude', 'longitude', 'distance_km');
  if (!v) return;
  const u = ctx.ids.get(phone)!;
  const [id] = await ctx.trx('addresses').insert({
    user_id: u, village_id: v.id, label: 'घर', receiver_name: USERS.find((x) => x.phone === phone)!.name, phone: phone.slice(2), line1, landmark,
    latitude: v.latitude, longitude: v.longitude, distance_km: v.distance_km, is_serviceable: 1, check_method: 'VILLAGE', is_default: 1,
  });
  ctx.addr.set(phone, { id, line1, village: v.name_hi, lat: Number(v.latitude), lng: Number(v.longitude), km: Number(v.distance_km) });
}

interface DemoOrder { phone: string; status: string; method: 'COD' | 'UPI'; pay: string; items: [string, number][]; rider?: string; hoursAgo: number }

const ORDERS: DemoOrder[] = [
  { phone: '919000000011', status: 'CONFIRMED', method: 'COD', pay: 'PENDING', items: [['aloo-potato', 2], ['pyaz-onion', 1], ['tamatar-tomato', 1]], hoursAgo: 0 },
  { phone: '919000000012', status: 'PREPARING', method: 'COD', pay: 'PENDING', items: [['tamatar-tomato', 2], ['aloo-potato', 3]], hoursAgo: 1 },
  { phone: '919000000013', status: 'OUT_FOR_DELIVERY', method: 'COD', pay: 'PENDING', items: [['pyaz-onion', 2], ['aloo-potato', 2]], rider: '919000000002', hoursAgo: 1 },
  { phone: '919000000011', status: 'DELIVERED', method: 'COD', pay: 'PAID', items: [['aloo-potato', 5], ['pyaz-onion', 3]], rider: '919000000003', hoursAgo: 26 },
  { phone: '919000000012', status: 'PENDING_PAYMENT', method: 'UPI', pay: 'AWAITING_VERIFICATION', items: [['tamatar-tomato', 3], ['pyaz-onion', 3], ['aloo-potato', 4]], hoursAgo: 0 },
  { phone: '919000000013', status: 'CANCELLED', method: 'COD', pay: 'PENDING', items: [['aloo-potato', 1]], hoursAgo: 50 },
];

async function lines(trx: Knex.Transaction, items: [string, number][]): Promise<{ rows: Record<string, unknown>[]; totalPaise: number }> {
  const prods = await trx('products').whereIn('slug', items.map(([s]) => s)).select('id', 'slug', 'name', 'name_hi', 'unit', 'unit_value', 'price', 'mrp', 'tax_rate', 'item_type');
  let totalPaise = 0;
  const rows = items.flatMap(([slug, qty]) => {
    const p = prods.find((x) => x.slug === slug);
    if (!p) return [];
    const line = mulQty(toPaise(p.price), qty);
    totalPaise += line;
    return [{ product_id: p.id, item_type: p.item_type, product_name: p.name, product_name_hi: p.name_hi, supplier_name: 'फतनपुर मंडी', unit: p.unit, unit_value: p.unit_value, unit_price: p.price, mrp: p.mrp, tax_rate: p.tax_rate, quantity: qty, line_total: fromPaise(line) }];
  });
  return { rows, totalPaise };
}

async function demoOrder(ctx: Ctx, d: DemoOrder): Promise<void> {
  const { trx } = ctx;
  const a = ctx.addr.get(d.phone);
  if (!a) return;
  const { rows, totalPaise } = await lines(trx, d.items);
  const fee = totalPaise >= 29900 ? 0 : 2000;
  const no = orderNumber(istYmd(), ++ctx.seq);
  const at = trx.raw('NOW() - INTERVAL ? HOUR', [d.hoursAgo]);
  const [orderId] = await trx('orders').insert({
    order_number: no, customer_id: ctx.ids.get(d.phone), address_id: a.id, order_type: 'DELIVERY', status: d.status,
    items_total: fromPaise(totalPaise), delivery_fee: fromPaise(fee), grand_total: fromPaise(totalPaise + fee), payment_method: d.method, payment_status: d.pay,
    ship_name: USERS.find((u) => u.phone === d.phone)!.name, ship_phone: d.phone.slice(2), ship_line1: a.line1, ship_village: a.village, ship_lat: a.lat, ship_lng: a.lng,
    distance_km: a.km, eta_minutes: 20 + Math.ceil(a.km * 4) + 10, placed_at: at,
    confirmed_at: d.status === 'PENDING_PAYMENT' ? null : at, delivered_at: d.status === 'DELIVERED' ? at : null, cancelled_at: d.status === 'CANCELLED' ? at : null,
    cancel_reason: d.status === 'CANCELLED' ? 'ग्राहक ने रद्द किया (डेमो)' : null,
  });
  await trx('order_items').insert(rows.map((r) => ({ ...r, order_id: orderId })));
  await trx('order_status_logs').insert({ order_id: orderId, from_status: null, to_status: d.status, changed_by: ctx.ids.get(d.phone), actor_role: 'SYSTEM', note: 'demo seed' });
  await trx('payments').insert({
    order_id: orderId, method: d.method, status: d.pay === 'AWAITING_VERIFICATION' ? 'AWAITING_VERIFICATION' : d.pay, amount: fromPaise(totalPaise + fee),
    upi_vpa: d.method === 'UPI' ? '8576891104@ybl' : null, upi_utr: d.pay === 'AWAITING_VERIFICATION' ? '426512345678' : null, upi_claimed_at: d.pay === 'AWAITING_VERIFICATION' ? at : null,
    paid_at: d.pay === 'PAID' ? at : null,
  });
  if (d.status !== 'CANCELLED') await reserve(trx, rows, no);
  if (d.rider) await demoAssignment(ctx, orderId, d);
}

/** Keep stock consistent with the demo orders (inventory_logs is the audit trail). */
async function reserve(trx: Knex.Transaction, rows: Record<string, unknown>[], ref: string): Promise<void> {
  for (const r of rows) {
    const qty = Number(r.quantity);
    await trx('products').where({ id: r.product_id }).update({ stock_qty: trx.raw('stock_qty - ?', [qty]), sold_count: trx.raw('sold_count + ?', [qty]) });
    const p = await trx('products').where({ id: r.product_id }).first('stock_qty');
    await trx('inventory_logs').insert({ product_id: r.product_id, change_qty: -qty, qty_after: p.stock_qty, reason: 'ORDER', reference: ref, note: 'demo seed' });
  }
}

async function demoAssignment(ctx: Ctx, orderId: number, d: DemoOrder): Promise<void> {
  const { trx } = ctx;
  const delivered = d.status === 'DELIVERED';
  const total = (await trx('orders').where({ id: orderId }).first('grand_total')).grand_total;
  const riderId = ctx.ids.get(d.rider!)!;
  await trx('delivery_assignments').insert({
    order_id: orderId, rider_id: riderId, job_type: 'DELIVERY', status: delivered ? 'DELIVERED' : 'PICKED_UP', assigned_by: ctx.ids.get('919000000001'),
    earning: '25.00', cod_collected: delivered ? total : 0, delivery_otp: delivered ? null : fourDigitCode(), otp_verified_at: delivered ? trx.fn.now() : null,
    accepted_at: trx.fn.now(), picked_up_at: trx.fn.now(), delivered_at: delivered ? trx.fn.now() : null,
  });
  if (delivered) {
    await trx('staff_profiles').where({ user_id: riderId }).update({ total_deliveries: trx.raw('total_deliveries + 1'), cod_in_hand: trx.raw('cod_in_hand + ?', [total]) });
    const w = await trx('wallets').where({ user_id: riderId }).first('id', 'balance');
    const bal = fromPaise(toPaise(w.balance) + 2500);
    await trx('wallets').where({ id: w.id }).update({ balance: bal });
    await trx('wallet_transactions').insert({ wallet_id: w.id, type: 'CREDIT', source: 'RIDER_EARNING', amount: '25.00', balance_after: bal, reference_id: String(orderId), note: 'demo seed' });
  }
}

async function demoService(ctx: Ctx): Promise<void> {
  const { trx } = ctx;
  const s = await trx('products').where({ slug: 'fan-repair' }).first('id', 'name', 'name_hi', 'price', 'visiting_charge');
  const a = ctx.addr.get('919000000012');
  if (!s || !a) return;
  const no = orderNumber(istYmd(), ++ctx.seq);
  const total = toPaise(s.price) + toPaise(s.visiting_charge);
  const [orderId] = await trx('orders').insert({
    order_number: no, customer_id: ctx.ids.get('919000000012'), address_id: a.id, order_type: 'SERVICE', status: 'SCHEDULED', items_total: s.price, visiting_charge: s.visiting_charge,
    grand_total: fromPaise(total), payment_method: 'COD', payment_status: 'PENDING', ship_name: 'रामकुमार यादव', ship_phone: '9000000012', ship_line1: a.line1, ship_village: a.village,
    ship_lat: a.lat, ship_lng: a.lng, distance_km: a.km, eta_minutes: 45, confirmed_at: trx.fn.now(),
  });
  await trx('order_items').insert({ order_id: orderId, product_id: s.id, item_type: 'SERVICE', product_name: s.name, product_name_hi: s.name_hi, unit: 'visit', unit_value: 1, unit_price: s.price, mrp: s.price, quantity: 1, line_total: s.price });
  await trx('order_status_logs').insert({ order_id: orderId, to_status: 'SCHEDULED', changed_by: ctx.ids.get('919000000012'), actor_role: 'SYSTEM', note: 'demo seed' });
  await trx('payments').insert({ order_id: orderId, method: 'COD', status: 'PENDING', amount: fromPaise(total) });
  await trx('service_bookings').insert({ order_id: orderId, scheduled_date: trx.raw('CURDATE() + INTERVAL 1 DAY'), slot_start: '10:00:00', slot_end: '12:00:00', visiting_charge: s.visiting_charge, completion_otp: fourDigitCode() });
}

export async function seedDemo(db: Knex, log: (m: string) => void): Promise<void> {
  if (await db('users').where({ phone: '919000000011' }).first('id')) return log('demo: already seeded — skipped');
  await db.transaction(async (trx) => {
    const ctx: Ctx = { trx, ids: new Map(), addr: new Map(), seq: 0 };
    for (const u of USERS) ctx.ids.set(u.phone, await insertUser(trx, u));
    await address(ctx, '919000000011', 'fatanpur-bazaar', 'वार्ड 2, बड़ी मस्जिद वाली गली', 'पोस्ट ऑफ़िस के सामने');
    await address(ctx, '919000000012', 'raniganj', 'तहसील रोड, मकान 14', 'हनुमान मंदिर के पास');
    await address(ctx, '919000000013', 'suwansa', 'पूरब टोला', 'प्राथमिक विद्यालय के पीछे');
    const last = await trx('orders').where('order_number', 'like', `FB-${istYmd()}-%`).max({ m: 'order_number' }).first();
    ctx.seq = last?.m ? Number(String(last.m).split('-')[2]) : 0;
    for (const o of ORDERS) await demoOrder(ctx, o);
    await demoService(ctx);
    await trx('service_area_requests').insert([
      { phone: '9000000021', area_text: 'अंतू बाज़ार', village_guess: 'Antu', latitude: 25.803, longitude: 81.985, distance_km: 7.4, source: 'CHECKOUT' },
      { phone: '9000000022', area_text: 'Antu', village_guess: 'Antu', source: 'HOMEPAGE' },
      { phone: '9000000023', area_text: 'सांगीपुर', village_guess: 'Sangipur', latitude: 25.69, longitude: 81.88, distance_km: 9.1, source: 'ADDRESS' },
    ]);
  });
  log(`demo: ${USERS.length} users, ${ORDERS.length} orders + 1 service booking, 3 area requests`);
}
