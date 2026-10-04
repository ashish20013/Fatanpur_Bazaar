import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import { CLAIMABLE_STATUSES, isClaimableStatus, type AvailableOrder } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { AppError, CommitThenThrow, conflict, forbidden, notFound } from '../../common/errors';
import { Log } from '../../common/logger';
import { fromPaise, toPaise } from '../../common/utils/money';
import { fourDigitCode } from '../../common/utils/ids';
import { localPhone } from '../../common/utils/phone';
import { mapsUrl, navUrl } from '../../common/utils/geo';
import { EXTRA_COLUMNS, extrasView } from '../users/address-extras';
import { isGlobalAdmin, type AuthUser } from '../../common/types';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationService } from '../notifications/notification.service';
import { OrderStateService, SYSTEM_ACTOR, type Actor, type TransitionCtx } from '../orders/order-state.service';
import { OrderEvents } from '../orders/order-events';
import { CronService } from '../jobs/cron.service';
import { TrackingService } from '../tracking/tracking.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

const ACTIVE = ['OFFERED', 'ACCEPTED', 'PICKED_UP'];
const MAX_OTP_ATTEMPTS = 3;
/** Louder FCM channel + sound for a fresh pool order (the mobile app registers this id). */
const POOL_PUSH_DATA = { channelId: 'urgent_orders', sound: 'order_alert', kind: 'pool' } as const;

function actorOf(u: AuthUser): Actor {
  return { id: u.id, kind: u.role, permissions: u.permissions, isGlobalAdmin: u.isGlobalAdmin };
}

/** A18 — manual assignment (2 riders don't need an algorithm), rider actions, delivery OTP gate. */
@Injectable()
export class DeliveryService implements OnModuleInit {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly wallet: WalletService,
    private readonly notify: NotificationService,
    private readonly state: OrderStateService,
    private readonly events: OrderEvents,
    private readonly cron: CronService,
    private readonly tracking: TrackingService,
    private readonly gateway: TrackingGateway,
  ) {}

  onModuleInit(): void {
    this.state.registerHook({ name: 'delivery', before: (c) => this.beforeTransition(c), after: (c) => this.afterTransition(c) });
    // Broadcast model: when a COD order is confirmed at placement, the orders module fires this
    // (it never imports delivery). UPI/rx orders reach CONFIRMED through the state machine and are
    // announced from the afterTransition hook below — so every path into CONFIRMED hits the pool.
    this.events.onOrderConfirmed((no) => void this.announceToPool(no).catch((e) => Log.warn('pool.announce_failed', { orderNumber: no, err: String(e) })));
    // A pool order nobody takes within pool_unclaimed_alert_min → re-ring the riders and alert the admin.
    this.cron.register({ name: 'delivery:pool-alert', schedule: { every: true }, run: () => this.poolAlert() });
  }

  // ───────────── state-machine hook ─────────────
  private async beforeTransition(ctx: TransitionCtx): Promise<void> {
    const { trx, order, to, actor, extra } = ctx;
    if (actor.kind === 'DELIVERY_BOY') {
      // riders act only on their own ACTIVE assignment (A15 rider rule)
      const a = await trx('delivery_assignments').where({ order_id: order.id, rider_id: actor.id }).whereIn('status', ['ACCEPTED', 'PICKED_UP']).forUpdate().first();
      if (!a) throw forbidden();
      if (to === 'DELIVERED' && order.order_type === 'DELIVERY') await this.otpGate(trx, a, extra.otp, order.order_number);
      return;
    }
    if (to === 'DELIVERED' && actor.kind !== 'SYSTEM') {
      // Only an ADMIN may skip the customer OTP, and only with a written, audited reason.
      if (actor.kind !== 'ADMIN' || !extra.overrideReason) throw new AppError('BUSINESS_RULE', { reason: 'डिलीवरी सिर्फ ग्राहक के OTP से पूरी होती है (एडमिन कारण लिखकर ओवरराइड कर सकते हैं)' });
    }
  }

  /** GATE-OTP (A15 §8). Wrong code → attempts+1 is COMMITTED, then 400. 3 wrong → 429 + admin alert. */
  private async otpGate(trx: Knex.Transaction, a: { id: number; otp_attempts: number; delivery_otp: string | null }, otp: string | undefined, orderNumber: string): Promise<void> {
    if (a.otp_attempts >= MAX_OTP_ATTEMPTS) {
      await this.notify.sendToRole('ADMIN', { type: 'delivery.otp_locked', title: 'डिलीवरी OTP लॉक', body: `${orderNumber}: 3 बार गलत OTP — राइडर को मदद चाहिए`, linkUrl: `/admin/orders/${orderNumber}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `otplock:${a.id}` }, trx);
      throw new CommitThenThrow(new AppError('DELIVERY_OTP_LOCKED'));
    }
    if (!otp || !a.delivery_otp || otp !== a.delivery_otp) {
      await trx('delivery_assignments').where({ id: a.id }).update({ otp_attempts: a.otp_attempts + 1 });
      throw new CommitThenThrow(new AppError('DELIVERY_OTP_INVALID', { n: Math.max(0, MAX_OTP_ATTEMPTS - a.otp_attempts - 1) }));
    }
    await trx('delivery_assignments').where({ id: a.id }).update({ otp_verified_at: trx.fn.now(), delivery_otp: null });
  }

  private async afterTransition(ctx: TransitionCtx): Promise<void> {
    const { trx, order, to } = ctx;
    const a = await trx('delivery_assignments').where({ order_id: order.id }).whereIn('status', ACTIVE).orderBy('id', 'desc').forUpdate().first();
    const no = order.order_number;
    ctx.afterCommit.push(() => this.gateway.emitStatus(no, to));
    // UPI/rx orders become CONFIRMED here (not at placement). Drop them into the rider pool once the
    // transaction commits — but only if no rider is already on it (e.g. an admin pre-assigned).
    if (to === 'CONFIRMED' && order.order_type === 'DELIVERY' && !a) {
      ctx.afterCommit.push(() => void this.announceToPool(no).catch((e) => Log.warn('pool.announce_failed', { orderNumber: no, err: String(e) })));
    }
    if (!a) {
      if (['CANCELLED', 'REJECTED', 'PAYMENT_FAILED'].includes(to)) ctx.afterCommit.push(() => this.gateway.emitCancelled(no, String(ctx.extra.note ?? 'रद्द')));
      return;
    }
    if (to === 'PICKED_UP') {
      await trx('delivery_assignments').where({ id: a.id }).update({ status: 'PICKED_UP', picked_up_at: trx.fn.now() });
      this.tracking.markStatusChange(a.id);
      this.tracking.invalidateAssignment(a.id, a.rider_id);
      await this.notify.send({ userId: order.customer_id, type: 'order.picked_up', title: 'सामान रास्ते में है', body: `डिलीवरी कोड: ${a.delivery_otp ?? ''} — सामान मिलने पर डिलीवरी पार्टनर को बताएं।`, linkUrl: `/mera/order/${no}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `pickup:${no}` }, trx);
      ctx.afterCommit.push(() => this.gateway.emitStarted(no));
    } else if (to === 'DELIVERED' || to === 'COMPLETED') {
      const collected = toPaise(order.final_grand_total ?? order.grand_total);
      const cod = order.payment_method === 'COD' ? collected : 0;
      await trx('delivery_assignments').where({ id: a.id }).update({ status: 'DELIVERED', delivered_at: trx.fn.now(), cod_collected: fromPaise(cod) });
      await trx('staff_profiles').where({ user_id: a.rider_id }).update({ total_deliveries: trx.raw('total_deliveries + 1'), cod_in_hand: trx.raw('cod_in_hand + ?', [fromPaise(cod)]) });
      await this.wallet.credit(trx, a.rider_id, toPaise(a.earning), 'RIDER_EARNING', no, 'डिलीवरी कमाई');
      await this.tracking.endSession(trx, a.id, 'DELIVERED');
      this.tracking.invalidateAssignment(a.id, a.rider_id);
      /*
       * Tell the shop, not only the customer.
       *
       * The customer already learns his order arrived; the shop did not, and for a cash sale that
       * is the one message that matters most — the moment this fires, money has left the counter
       * and is in a rider's pocket until he hands it over. The owner's rule is exactly this: "the
       * rider enters the code, the goods are handed over, and it reaches the admin that it is
       * delivered." The amount is in the line so the day's cash can be checked without opening
       * anything, and the dedupe key keeps a retried job from buzzing the same phone twice.
       */
      const cash = cod > 0 ? ` · नकद ₹${fromPaise(cod)} राइडर के पास` : '';
      await this.notify.sendToPermission(
        'orders.view_all',
        {
          type: 'order.delivered',
          title: `डिलीवर हो गया — ${no}`,
          body: `${order.ship_village ? `${order.ship_village} · ` : ''}${order.ship_name ?? ''}${cash}`,
          linkUrl: `/admin/orders/${no}`,
          channels: ['IN_APP', 'PUSH'],
          dedupeKey: `delivered:${no}`,
        },
        trx,
      );
      ctx.afterCommit.push(() => this.gateway.emitCompleted(no));
    } else if (['CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'DELIVERY_FAILED'].includes(to)) {
      const failed = to === 'DELIVERY_FAILED';
      await trx('delivery_assignments').where({ id: a.id }).update({ status: failed ? 'FAILED' : 'CANCELLED', fail_reason: failed ? ctx.extra.note?.slice(0, 255) ?? null : null });
      await this.tracking.endSession(trx, a.id, failed ? 'FAILED' : 'CANCELLED');
      this.tracking.invalidateAssignment(a.id, a.rider_id);
      await this.notify.send({ userId: a.rider_id, type: 'delivery.cancelled', title: 'डिलीवरी रद्द', body: `${no} अब डिलीवर नहीं करना है।`, channels: ['IN_APP', 'PUSH'], dedupeKey: `dcancel:${a.id}` }, trx);
      ctx.afterCommit.push(() => {
        this.gateway.emitCompleted(no, failed ? 'FAILED' : 'CANCELLED');
        this.gateway.emitCancelled(no, String(ctx.extra.note ?? 'रद्द'));
      });
    }
  }

  // ───────────── admin / supervisor ─────────────
  async assign(orderNumber: string, riderId: number, actor: AuthUser, ip: string, reassign = false): Promise<unknown> {
    const earning = await this.settings.str('rider_per_delivery', '20.00');
    const afterCommit: (() => void)[] = [];
    const result = await this.db.transaction(async (trx) => {
      const order = await trx('orders').where({ order_number: orderNumber }).forUpdate().first();
      if (!order) throw notFound();
      // ⚠️ one ACTIVE assignment per order — enforced here (no DB unique so re-assign stays possible)
      const existing = await trx('delivery_assignments').where({ order_id: order.id }).whereIn('status', ACTIVE).forUpdate().first('id', 'rider_id');
      if (existing && !reassign) throw conflict('इस ऑर्डर पर पहले से डिलीवरी पार्टनर लगा है', undefined, 'A delivery partner is already on this order — use Reassign');
      // "Reassign" with nobody currently on the order (e.g. the rider rejected it) is simply an
      // assign — the admin should not have to pick the other button to get the same result.
      // It still needs the assign permission, like the assign endpoint does.
      if (reassign && !existing && !isGlobalAdmin(actor) && !actor.permissions.has('delivery.assign')) throw new AppError('FORBIDDEN');
      const isService = order.order_type === 'SERVICE';
      const rider = await trx('users as u').join('staff_profiles as s', 's.user_id', 'u.id').where('u.id', riderId).first('u.id', 'u.name', 'u.phone', 'u.role', 'u.status', 's.is_available');
      const roleOk = rider && (rider.role === 'DELIVERY_BOY' || (isService && rider.role === 'SUPERVISOR'));
      if (!roleOk || rider.status !== 'ACTIVE') throw new AppError('BUSINESS_RULE', { reason: 'यह व्यक्ति डिलीवरी पार्टनर नहीं है या उसका खाता बंद है', reasonEn: 'This person is not an active delivery partner' });
      if (!Number(rider.is_available)) throw new AppError('BUSINESS_RULE', { reason: 'यह डिलीवरी पार्टनर अभी ड्यूटी पर नहीं है', reasonEn: 'This delivery partner is off duty right now' });
      if (existing) {
        await trx('delivery_assignments').where({ id: existing.id }).update({ status: 'CANCELLED', reject_reason: 'reassigned' });
        await this.tracking.endSession(trx, existing.id, 'MANUAL');
        this.tracking.invalidateAssignment(existing.id, existing.rider_id);
        await this.notify.send({ userId: existing.rider_id, type: 'delivery.reassigned', title: 'डिलीवरी हटाई गई', body: `${orderNumber} किसी और को सौंपा गया।`, channels: ['IN_APP', 'PUSH'] }, trx);
      }
      const otp = fourDigitCode();
      const [assignmentId] = await trx('delivery_assignments').insert({ order_id: order.id, rider_id: riderId, job_type: isService ? 'SERVICE_VISIT' : 'DELIVERY', status: 'OFFERED', assigned_by: actor.id, earning, delivery_otp: isService ? null : otp });
      if (isService) await trx('service_bookings').where({ order_id: order.id }).update({ technician_id: riderId });
      if (!existing) {
        const ac: TransitionCtx['afterCommit'] = [];
        await this.state.changeStatusInTrx(trx, orderNumber, 'ASSIGNED', actorOf(actor), { ip }, ac);
        afterCommit.push(...ac.map((f) => () => void f()));
      }
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: existing ? 'delivery.reassign' : 'delivery.assign', entityType: 'order', entityId: orderNumber, before: existing ? { riderId: existing.rider_id } : null, after: { riderId, assignmentId }, ip }, trx);
      await this.notify.send({ userId: riderId, type: 'delivery.assigned', title: isService ? 'नया सेवा काम' : 'नई डिलीवरी', body: `${orderNumber} · ${order.ship_village ?? ''} — ऐप में स्वीकार करें`, linkUrl: `/delivery/${assignmentId}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `assign:${assignmentId}` }, trx);
      await this.notify.send({ userId: order.customer_id, type: 'delivery.assigned', title: 'डिलीवरी पार्टनर तय हुआ', body: `${rider.name ?? 'डिलीवरी पार्टनर'} आपका ऑर्डर लाएंगे।${isService ? '' : ` डिलीवरी कोड: ${otp}`}`, linkUrl: `/mera/order/${orderNumber}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `assign:${assignmentId}:c` }, trx);
      afterCommit.push(() => {
        this.gateway.joinRiderToAssignment(riderId, assignmentId, orderNumber);
        this.gateway.emitAssigned(orderNumber, order.customer_id, { name: rider.name, phone: localPhone(rider.phone) }, isService ? null : otp);
        // Admin took it off the board → it leaves every rider's pool too.
        this.gateway.emitPoolGone(orderNumber, rider.name ?? null);
      });
      return { assignmentId, riderId, orderNumber };
    });
    for (const f of afterCommit) f();
    return result;
  }

  // ───────────── broadcast pool (self-claim) ─────────────
  /**
   * Every DELIVERY order that is confirmed and not yet taken. Shown on every rider's dashboard;
   * the first to tap "मैं ले रहा हूँ" wins (claim() enforces one active assignment per order).
   */
  async availablePool(): Promise<AvailableOrder[]> {
    const earning = await this.settings.str('rider_per_delivery', '20.00');
    const rows = (await this.db('orders as o')
      .where('o.order_type', 'DELIVERY')
      .whereIn('o.status', CLAIMABLE_STATUSES as unknown as string[])
      .whereNotExists(this.db('delivery_assignments as d').whereRaw('d.order_id = o.id').whereIn('d.status', ACTIVE))
      .orderByRaw('COALESCE(o.confirmed_at, o.placed_at) ASC')
      .orderBy('o.id', 'asc')
      .limit(50)
      .select('o.id', 'o.order_number', 'o.ship_village', 'o.distance_km', 'o.grand_total', 'o.final_grand_total', 'o.payment_method', 'o.eta_minutes', 'o.confirmed_at', 'o.placed_at')) as Record<string, unknown>[];
    const ids = rows.map((r) => Number(r.id));
    const counts = ids.length ? ((await this.db('order_items').whereIn('order_id', ids).where('is_removed', 0).groupBy('order_id').select('order_id').count({ n: '*' })) as { order_id: number; n: number | string }[]) : [];
    const countMap = new Map(counts.map((c) => [Number(c.order_id), Number(c.n)]));
    const now = Date.now();
    return rows.map((r) => {
      const since = new Date((r.confirmed_at ?? r.placed_at) as string).getTime();
      return {
        orderNumber: r.order_number as string,
        village: (r.ship_village as string | null) ?? null,
        distanceKm: r.distance_km === null ? null : Number(r.distance_km),
        collectAmount: r.payment_method === 'COD' ? String(r.final_grand_total ?? r.grand_total) : '0.00',
        paymentMethod: r.payment_method as AvailableOrder['paymentMethod'],
        itemCount: countMap.get(Number(r.id)) ?? 0,
        etaMinutes: Number(r.eta_minutes ?? 45),
        earning,
        waitingSec: Math.max(0, Math.floor((now - since) / 1000)),
        placedAt: new Date(r.placed_at as string).toISOString(),
      };
    });
  }

  /**
   * A rider takes an order himself — the broadcast model's core move. Race-safe: the order row is
   * locked, the "one active assignment" check runs under that lock, so if two riders tap together
   * the second gets a clean 409 (GEO-style). No admin in the loop; the admin only gets told.
   */
  async claim(orderNumber: string, rider: AuthUser, ip: string): Promise<unknown> {
    // Only delivery boys pull from the pool; a supervisor reaches the same screens but delivers only
    // what the admin hands him (keeps the rider flow — earnings, COD-in-hand — to actual riders).
    if (rider.role !== 'DELIVERY_BOY') throw forbidden();
    const earning = await this.settings.str('rider_per_delivery', '20.00');
    const afterCommit: (() => void)[] = [];
    const result = (await this.db.transaction(async (trx) => {
      const order = await trx('orders').where({ order_number: orderNumber }).forUpdate().first();
      if (!order) throw notFound();
      if (order.order_type !== 'DELIVERY') throw conflict('यह काम खुद नहीं लिया जा सकता', undefined, 'This job cannot be self-claimed');
      if (!isClaimableStatus(order.status)) throw conflict('यह ऑर्डर अब उपलब्ध नहीं है', undefined, 'This order is no longer available');
      // one ACTIVE assignment per order — the race gate, under the order's row lock
      const existing = await trx('delivery_assignments').where({ order_id: order.id }).whereIn('status', ACTIVE).forUpdate().first('id');
      if (existing) throw conflict('यह ऑर्डर किसी और ने ले लिया', undefined, 'Another rider already took this order');
      const prof = await trx('staff_profiles').where({ user_id: rider.id }).first('is_available');
      if (!prof || !Number(prof.is_available)) throw new AppError('BUSINESS_RULE', { reason: 'पहले ड्यूटी चालू करें, फिर ऑर्डर लें', reasonEn: 'Turn duty on before taking an order' });
      const otp = fourDigitCode();
      // Self-claimed → straight to ACCEPTED (no OFFERED step; he chose it). assigned_by NULL = self.
      const [assignmentId] = await trx('delivery_assignments').insert({ order_id: order.id, rider_id: rider.id, job_type: 'DELIVERY', status: 'ACCEPTED', assigned_by: null, earning, delivery_otp: otp, accepted_at: trx.fn.now() });
      // The rider's role cannot set ASSIGNED (A15); claiming is a SYSTEM action the rider triggered.
      const ac: TransitionCtx['afterCommit'] = [];
      await this.state.changeStatusInTrx(trx, orderNumber, 'ASSIGNED', SYSTEM_ACTOR, { note: `राइडर ने खुद ऑर्डर लिया (#${rider.id})`, ip }, ac);
      afterCommit.push(...ac.map((f) => () => void f()));
      await this.tracking.startSession(trx, assignmentId, rider.id);
      await this.audit.log({ actorId: rider.id, actorRole: rider.role, action: 'delivery.claim', entityType: 'order', entityId: orderNumber, after: { riderId: rider.id, assignmentId }, ip }, trx);
      const riderRow = (await trx('users').where({ id: rider.id }).first('name', 'phone')) as { name: string | null; phone: string } | undefined;
      await this.notify.send({ userId: order.customer_id, type: 'delivery.assigned', title: 'डिलीवरी पार्टनर तय हुआ', body: `${riderRow?.name ?? 'डिलीवरी पार्टनर'} आपका ऑर्डर लाएंगे। डिलीवरी कोड: ${otp}`, linkUrl: `/mera/order/${orderNumber}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `assign:${assignmentId}:c` }, trx);
      // The admin only watches — a quiet line on the monitor, not a job to do.
      await this.notify.sendToPermission('orders.view_all', { type: 'delivery.claimed', title: 'राइडर ने ऑर्डर लिया', body: `${orderNumber}${order.ship_village ? ` · ${order.ship_village}` : ''} · ${riderRow?.name ?? 'राइडर'}`, linkUrl: `/admin/orders/${orderNumber}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `claimed:${assignmentId}` }, trx);
      afterCommit.push(() => {
        this.gateway.joinRiderToAssignment(rider.id, assignmentId, orderNumber);
        this.gateway.emitAssigned(orderNumber, order.customer_id, { name: riderRow?.name ?? null, phone: localPhone(String(riderRow?.phone ?? '')) }, otp);
        this.gateway.emitPoolGone(orderNumber, riderRow?.name ?? null);
      });
      return { assignmentId, orderNumber, status: 'ACCEPTED' };
    })) as { assignmentId: number; orderNumber: string; status: string };
    for (const f of afterCommit) f();
    this.tracking.invalidateAssignment(result.assignmentId, rider.id);
    return result;
  }

  /**
   * Ring the pool: a loud push to every on-duty rider + a socket nudge to all rider/admin boards.
   * Idempotent per order (dedupe key), and a no-op if the order has already been taken or is no
   * longer claimable — so it is safe to call from both the placement path and the state machine.
   */
  async announceToPool(orderNumber: string): Promise<void> {
    const order = await this.db('orders').where({ order_number: orderNumber }).first('id', 'order_type', 'status', 'ship_village', 'grand_total', 'final_grand_total', 'payment_method', 'eta_minutes', 'distance_km');
    if (!order || order.order_type !== 'DELIVERY' || !isClaimableStatus(order.status)) return;
    const active = await this.db('delivery_assignments').where({ order_id: order.id }).whereIn('status', ACTIVE).first('id');
    if (active) return;
    const itemCount = Number(((await this.db('order_items').where({ order_id: order.id, is_removed: 0 }).count({ n: '*' }).first()) as { n: number | string } | undefined)?.n ?? 0);
    const cod = order.payment_method === 'COD';
    const collect = cod ? String(order.final_grand_total ?? order.grand_total) : '0.00';
    const money = cod ? `₹${Number(collect)} नकद` : 'भुगतान हो चुका';
    await this.notify.sendToOnDutyRiders({
      type: 'pool.new',
      title: '🛵 नया ऑर्डर आया!',
      body: `${order.ship_village ? `${order.ship_village} · ` : ''}${money} · ${itemCount} सामान — सबसे पहले लो!`,
      linkUrl: '/delivery',
      channels: ['IN_APP', 'PUSH'],
      data: { ...POOL_PUSH_DATA, orderNumber },
      dedupeKey: `pool:${orderNumber}`,
    });
    this.gateway.emitPoolNew({ orderNumber, village: order.ship_village ?? null, collectAmount: collect, itemCount, etaMinutes: Number(order.eta_minutes ?? 45), distanceKm: order.distance_km === null ? null : Number(order.distance_km) });
  }

  /** Cron: a confirmed order nobody has claimed for pool_unclaimed_alert_min → re-ring + admin alert. */
  async poolAlert(): Promise<string> {
    const mins = await this.settings.int('pool_unclaimed_alert_min', 5);
    const rows = (await this.db('orders as o')
      .where('o.order_type', 'DELIVERY')
      .whereIn('o.status', CLAIMABLE_STATUSES as unknown as string[])
      .whereRaw('COALESCE(o.confirmed_at, o.placed_at) < NOW() - INTERVAL ? MINUTE', [mins])
      .whereNotExists(this.db('delivery_assignments as d').whereRaw('d.order_id = o.id').whereIn('d.status', ACTIVE))
      .limit(50)
      .select('o.order_number', 'o.ship_village')) as { order_number: string; ship_village: string | null }[];
    const bucket = Math.floor(Date.now() / (Math.max(1, mins) * 60000));
    for (const o of rows) {
      const where = o.ship_village ? ` · ${o.ship_village}` : '';
      await this.notify.sendToPermission('delivery.assign', { type: 'pool.stuck', title: '⚠️ ऑर्डर अटका है', body: `${o.order_number}${where} — ${mins}+ मिनट से किसी राइडर ने नहीं लिया`, linkUrl: '/admin/delivery', channels: ['IN_APP', 'PUSH'], dedupeKey: `poolstuck:${o.order_number}:${bucket}` });
      await this.notify.sendToOnDutyRiders({ type: 'pool.new', title: '🛵 ऑर्डर अब भी बाकी है', body: `${o.order_number}${where} — अभी तक किसी ने नहीं लिया, जल्दी लो!`, linkUrl: '/delivery', channels: ['IN_APP', 'PUSH'], data: { ...POOL_PUSH_DATA, orderNumber: o.order_number }, dedupeKey: `poolre:${o.order_number}:${bucket}` });
    }
    return `alerted ${rows.length}`;
  }

  // ───────────── rider actions ─────────────
  async accept(a: { id: number; rider_id: number; status: string; order_id: number }, rider: AuthUser): Promise<unknown> {
    if (a.status !== 'OFFERED') throw conflict('यह डिलीवरी अब स्वीकार नहीं हो सकती');
    await this.db.transaction(async (trx) => {
      await trx('delivery_assignments').where({ id: a.id, status: 'OFFERED' }).update({ status: 'ACCEPTED', accepted_at: trx.fn.now() });
      await this.tracking.startSession(trx, a.id, rider.id);
    });
    this.tracking.invalidateAssignment(a.id, rider.id);
    return { status: 'ACCEPTED' };
  }

  /** Rider reject never freezes the order: assignment REJECTED, order back to the pool. */
  async reject(a: { id: number; rider_id: number; status: string; order_id: number }, reason: string, rider: AuthUser): Promise<unknown> {
    if (!['OFFERED', 'ACCEPTED'].includes(a.status)) throw conflict('अब यह डिलीवरी मना नहीं कर सकते');
    const order = await this.db('orders').where({ id: a.order_id }).first('order_number', 'order_type');
    const ac: TransitionCtx['afterCommit'] = [];
    await this.db.transaction(async (trx) => {
      await trx('delivery_assignments').where({ id: a.id }).update({ status: 'REJECTED', reject_reason: reason.slice(0, 255) });
      await this.tracking.endSession(trx, a.id, 'MANUAL');
      await this.state.changeStatusInTrx(trx, order.order_number, order.order_type === 'SERVICE' ? 'SCHEDULED' : 'READY_FOR_PICKUP', SYSTEM_ACTOR, { note: `राइडर ने मना किया: ${reason}` }, ac);
      await this.notify.sendToPermission('delivery.assign', { type: 'delivery.rejected', title: 'राइडर ने मना किया', body: `${order.order_number}: ${reason} — दोबारा सौंपें`, linkUrl: '/admin/delivery', channels: ['IN_APP', 'PUSH'], dedupeKey: `reject:${a.id}` }, trx);
    });
    this.tracking.invalidateAssignment(a.id, rider.id);
    this.gateway.removeRiderFromOrder(rider.id, a.id, order.order_number);
    for (const f of ac) await f();
    return { status: 'REJECTED' };
  }

  async pickup(a: { id: number; order_id: number }, rider: AuthUser): Promise<unknown> {
    const o = await this.db('orders').where({ id: a.order_id }).first('order_number');
    return this.state.changeStatus(o.order_number, 'PICKED_UP', actorOf(rider));
  }
  async outForDelivery(a: { id: number; order_id: number }, rider: AuthUser): Promise<unknown> {
    const o = await this.db('orders').where({ id: a.order_id }).first('order_number');
    return this.state.changeStatus(o.order_number, 'OUT_FOR_DELIVERY', actorOf(rider));
  }
  async complete(a: { id: number; order_id: number }, otp: string, rider: AuthUser): Promise<unknown> {
    const o = await this.db('orders').where({ id: a.order_id }).first('order_number', 'order_type');
    return this.state.changeStatus(o.order_number, o.order_type === 'SERVICE' ? 'COMPLETED' : 'DELIVERED', actorOf(rider), { otp });
  }
  async fail(a: { id: number; order_id: number }, reason: string, rider: AuthUser): Promise<unknown> {
    const o = await this.db('orders').where({ id: a.order_id }).first('order_number');
    const r = await this.state.changeStatus(o.order_number, 'DELIVERY_FAILED', actorOf(rider), { note: reason });
    await this.notify.sendToPermission('delivery.assign', { type: 'delivery.failed', title: 'डिलीवरी नहीं हो पाई', body: `${o.order_number}: ${reason}`, linkUrl: `/admin/orders/${o.order_number}`, channels: ['IN_APP', 'PUSH'] });
    return r;
  }

  async setDuty(riderId: number, available: boolean): Promise<{ available: boolean }> {
    await this.db('staff_profiles').where({ user_id: riderId }).update({ is_available: available ? 1 : 0 });
    return { available };
  }

  async myAssignments(riderId: number): Promise<unknown[]> {
    const rows = (await this.db('delivery_assignments as da')
      .join('orders as o', 'o.id', 'da.order_id')
      .leftJoin('order_ship_extras as x', 'x.order_id', 'o.id')
      .where('da.rider_id', riderId)
      .whereIn('da.status', ACTIVE)
      .orderBy('da.offered_at')
      .select(EXTRA_COLUMNS.map((c) => `x.${c}`))
      .select('da.id', 'da.status', 'da.job_type', 'da.earning', 'da.offered_at', 'o.id as order_id', 'o.order_number', 'o.status as order_status', 'o.payment_method', 'o.payment_status', 'o.grand_total', 'o.final_grand_total', 'o.ship_name', 'o.ship_phone', 'o.ship_line1', 'o.ship_landmark', 'o.ship_village', 'o.ship_lat', 'o.ship_lng')) as Record<string, unknown>[];
    const ids = rows.map((r) => Number(r.order_id));
    const items = ids.length ? ((await this.db('order_items').whereIn('order_id', ids).where('is_removed', 0).select('order_id', 'product_name_hi', 'product_name', 'quantity', 'final_quantity', 'unit', 'unit_value')) as Record<string, unknown>[]) : [];
    return rows.map((r) => ({
      id: r.id, orderNumber: r.order_number, status: r.status, jobType: r.job_type, orderStatus: r.order_status, earning: r.earning,
      // ⚠️ rider collects final_grand_total ?? grand_total — never the stale pre-adjustment total (A16)
      collectAmount: r.payment_method === 'COD' ? String(r.final_grand_total ?? r.grand_total) : '0.00',
      paymentMethod: r.payment_method, paymentStatus: r.payment_status,
      customer: {
        name: r.ship_name, phone: localPhone(String(r.ship_phone)), line1: r.ship_line1, landmark: r.ship_landmark, village: r.ship_village,
        lat: r.ship_lat === null ? null : Number(r.ship_lat), lng: r.ship_lng === null ? null : Number(r.ship_lng),
        mapsUrl: mapsUrl(r.ship_lat as string | null, r.ship_lng as string | null),
        // The rider gets navigation, not a pin — see navUrl.
        navUrl: navUrl(r.ship_lat as string | null, r.ship_lng as string | null), ...extrasView(r),
      },
      items: items.filter((i) => Number(i.order_id) === Number(r.order_id)).map((i) => ({ name: i.product_name_hi ?? i.product_name, quantity: String(i.final_quantity ?? i.quantity), unit: `${Number(i.unit_value)} ${i.unit}` })),
      offeredAt: new Date(r.offered_at as string).toISOString(),
    }));
  }

  async history(riderId: number, page: number, perPage: number): Promise<unknown[]> {
    return this.db('delivery_assignments as da').join('orders as o', 'o.id', 'da.order_id').where('da.rider_id', riderId).whereNotIn('da.status', ACTIVE).orderBy('da.id', 'desc').limit(perPage).offset((page - 1) * perPage)
      .select('da.id', 'da.status', 'da.earning', 'da.cod_collected as codCollected', 'da.delivered_at as deliveredAt', 'o.order_number as orderNumber', 'o.ship_village as village');
  }

  async earnings(riderId: number): Promise<unknown> {
    const s = await this.db('staff_profiles').where({ user_id: riderId }).first('cod_in_hand', 'total_deliveries', 'rating_avg', 'is_available');
    const today = await this.db('delivery_assignments').where({ rider_id: riderId, status: 'DELIVERED' }).whereRaw('DATE(delivered_at) = CURDATE()').sum({ e: 'earning' }).count({ n: '*' }).first();
    const w = await this.wallet.balance(riderId);
    return { walletBalance: fromPaise(w), codInHand: s?.cod_in_hand ?? '0.00', totalDeliveries: s?.total_deliveries ?? 0, rating: s?.rating_avg ?? '0.00', onDuty: Number(s?.is_available) === 1, today: { deliveries: Number(today?.n ?? 0), earning: String(today?.e ?? '0.00') } };
  }

  // ───────────── COD settlement (A17) ─────────────
  /** Rider hands cash to the store. ⚠️ Never debits the rider's wallet — that cash was never credited there. */
  async settleCod(riderId: number, amountStr: string, reference: string | undefined, note: string | undefined, actor: AuthUser, ip: string): Promise<unknown> {
    const amount = toPaise(amountStr);
    if (amount <= 0) throw new AppError('VALIDATION_FAILED', {}, { field: 'amount' });
    return this.db.transaction(async (trx) => {
      const s = await trx('staff_profiles').where({ user_id: riderId }).forUpdate().first('cod_in_hand');
      if (!s) throw notFound();
      const inHand = toPaise(s.cod_in_hand);
      if (amount > inHand) throw new AppError('BUSINESS_RULE', { reason: `राइडर के पास सिर्फ ₹${Number(s.cod_in_hand)} हैं` });
      const after = inHand - amount;
      await trx('staff_profiles').where({ user_id: riderId }).update({ cod_in_hand: fromPaise(after) });
      const [id] = await trx('cod_settlements').insert({ rider_id: riderId, amount: fromPaise(amount), balance_after: fromPaise(after), received_by: actor.id, reference: reference?.slice(0, 80) ?? null, note: note?.slice(0, 255) ?? null });
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'cod.settle', entityType: 'rider', entityId: riderId, before: { codInHand: fromPaise(inHand) }, after: { codInHand: fromPaise(after), amount: fromPaise(amount) }, ip }, trx);
      return { id, balanceAfter: fromPaise(after) };
    });
  }

  /** Paying the rider's EARNINGS in cash → wallet PAYOUT debit (the only wallet movement here). */
  async payout(riderId: number, amountStr: string, actor: AuthUser, ip: string): Promise<unknown> {
    const amount = toPaise(amountStr);
    return this.db.transaction(async (trx) => {
      const bal = await this.wallet.debit(trx, riderId, amount, 'PAYOUT', null, 'कमाई नकद दी', actor.id);
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'rider.payout', entityType: 'rider', entityId: riderId, after: { amount: amountStr }, ip }, trx);
      return { walletBalance: fromPaise(bal) };
    });
  }

  async board(): Promise<unknown> {
    const [riders, ready, active] = await Promise.all([
      this.db('users as u').join('staff_profiles as s', 's.user_id', 'u.id').where('u.status', 'ACTIVE').whereIn('u.role', ['DELIVERY_BOY']).select('u.id', 'u.name', 'u.phone', 's.is_available as onDuty', 's.cod_in_hand as codInHand', 's.total_deliveries as deliveries')
        .select(this.db.raw("(SELECT COUNT(*) FROM delivery_assignments d WHERE d.rider_id = u.id AND d.status IN ('OFFERED','ACCEPTED','PICKED_UP')) AS activeJobs")),
      this.db('orders').whereIn('status', ['READY_FOR_PICKUP', 'SCHEDULED', 'PREPARING', 'CONFIRMED']).orderBy('placed_at').limit(100).select('order_number as orderNumber', 'status', 'ship_village as village', this.db.raw('COALESCE(final_grand_total, grand_total) AS total'), 'placed_at as placedAt', 'order_type as orderType'),
      this.db('delivery_assignments as d').join('orders as o', 'o.id', 'd.order_id').join('users as u', 'u.id', 'd.rider_id').leftJoin('tracking_sessions as t', 't.assignment_id', 'd.id').whereIn('d.status', ACTIVE)
        .select('d.id', 'd.status', 'o.order_number as orderNumber', 'o.status as orderStatus', 'o.ship_village as village', 'u.name as rider', 't.last_lat as lat', 't.last_lng as lng', 't.last_ping_at as lastPingAt', 't.is_live as isLive'),
    ]);
    return { riders: (riders as { phone: string }[]).map((r) => ({ ...r, phone: localPhone(r.phone) })), ready, active };
  }

  /** Cron: alert when a rider holds > ₹3000 COD or cash older than 3 days. */
  async codAlerts(): Promise<number> {
    const limit = await this.settings.str('cod_alert_amount', '3000.00');
    const days = await this.settings.int('cod_alert_days', 3);
    const rows = (await this.db('staff_profiles as s').join('users as u', 'u.id', 's.user_id').where('s.cod_in_hand', '>', 0)
      .where((w) => w.where('s.cod_in_hand', '>', limit).orWhereExists(this.db('delivery_assignments as d').whereRaw('d.rider_id = s.user_id').where('d.cod_collected', '>', 0).where('d.delivered_at', '<', this.db.raw('NOW() - INTERVAL ? DAY', [days])).whereRaw('d.delivered_at > COALESCE((SELECT MAX(c.created_at) FROM cod_settlements c WHERE c.rider_id = s.user_id), \'1970-01-01\')')))
      .select('u.id', 'u.name', 's.cod_in_hand')) as { id: number; name: string; cod_in_hand: string }[];
    for (const r of rows) {
      await this.notify.sendToRole('ADMIN', { type: 'cod.high', title: 'राइडर के पास ज़्यादा नकद', body: `${r.name}: ₹${Number(r.cod_in_hand)} जमा करवाएं`, linkUrl: '/admin/cod', channels: ['IN_APP', 'PUSH'], dedupeKey: `cod:${r.id}:${new Date().toISOString().slice(0, 10)}` });
    }
    return rows.length;
  }
}
