import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { Log } from '../../common/logger';
import { conflict, notFound } from '../../common/errors';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { AlertConfigService, type AlertConfig } from './alert-config.service';

const ACTIVE_ASSIGNMENT = ['OFFERED', 'ACCEPTED', 'PICKED_UP'];

/** What put an order in front of the admin. Kept in the audit trail and shown on the card. */
export type EscalationCause = 'TIMEOUT' | 'REJECTED' | 'ALL_DECLINED' | 'NO_RIDER' | 'EXPIRED';

export interface OrderSummary {
  orderNumber: string;
  customer: string;
  customerPhone: string;
  address: string;
  village: string | null;
  amount: string;
  paymentMethod: string;
  items: number;
  status: string;
  placedAt: string;
  waitingSec: number;
}

/**
 * The order-alert pipeline: who gets told about a new order, what they hear, and what happens
 * when nobody picks it up.
 *
 * ⚠️ This module is ADDITIVE. It adds no tables and changes no existing behaviour: the shop's
 * broadcast pool still works exactly as it did, and the website never calls any of this. What
 * it adds is (a) the metadata an Android phone needs to ring like a ride-hailing app, (b) a
 * quiet informational copy for the people who only watch, and (c) a timer that puts an order
 * nobody took in front of a human being.
 *
 * ⚠️ It also stores nothing of its own. A delivery boy's "no thanks" is a `delivery_assignments`
 * row with status REJECTED — the same row an admin-assigned rejection writes, so the rejection
 * history is one query over one table. An escalation, and a supervisor saying "I'll arrange
 * someone", are `audit_logs` rows. Both tables already exist, are already indexed on what is
 * queried here, and are already append-only.
 */
@Injectable()
export class AlertsService implements OnModuleDestroy {
  /**
   * Escalation timers, by order number.
   *
   * In-process on purpose. The task asks for a two-minute escalation and the shop's cron ticks
   * every five, so the cron alone can be three minutes late on a two-minute promise. The cron
   * sweep still runs (see `sweep`) and is what catches an order whose timer died with a restart;
   * the timer is what makes the common case punctual. Both go through `escalate`, which is
   * idempotent, so the two can never double-alert.
   */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly cfg: AlertConfigService,
    private readonly notify: NotificationService,
    private readonly audit: AuditService,
    private readonly gateway: TrackingGateway,
  ) {}

  onModuleDestroy(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // ───────────────────────── new order ─────────────────────────

  /**
   * Called once, after an order is confirmed and announced to the pool (post-commit).
   *
   * The pool push itself is still the delivery module's; this adds the alert metadata the app
   * needs to show a full-screen, ringing card with ACCEPT and REJECT, the quiet copy for admins
   * and supervisors, and the escalation timer.
   */
  async onOrderAnnounced(orderNumber: string): Promise<void> {
    const config = await this.cfg.read();
    if (!config.enabled) return;
    const order = await this.summary(orderNumber);
    if (!order) return;

    await this.ringRiders(order, config);
    await this.informWatchers(order, config);
    this.armEscalation(orderNumber, config.escalationSec);
  }

  /** The loud one: a card that stays up until it is answered. */
  private async ringRiders(o: OrderSummary, config: AlertConfig): Promise<void> {
    const riders = await this.riderRecipients(config);
    if (riders.length === 0) {
      // Nobody is on duty. That is itself an escalation — there is no point waiting two minutes
      // to discover it, and the owner would rather hear now while he can still call someone.
      await this.escalate(o.orderNumber, 'NO_RIDER');
      return;
    }
    const expiresAt = config.offerExpirySec > 0 ? new Date(Date.now() + config.offerExpirySec * 1000).toISOString() : '';
    const data = {
      ...this.pushBehaviour(config),
      kind: 'incoming_order',
      alert: 'FULLSCREEN',
      actions: 'ACCEPT,REJECT',
      expiresAt,
      ttlSec: String(config.offerExpirySec),
      ...this.orderFields(o, config),
    };
    for (const userId of riders) {
      await this.notify.send({
        userId,
        type: 'alert.incoming_order',
        title: fill(config.text.alert_title_new, o),
        body: fill(config.text.alert_body_new, o),
        linkUrl: '/delivery',
        channels: ['IN_APP', 'PUSH'],
        data,
        dedupeKey: `alert:new:${o.orderNumber}:${userId}`,
      });
    }
    this.gateway.emitAlert('ops:pool', 'alert.incoming_order', { ...o, expiresAt, actions: ['ACCEPT', 'REJECT'], ringtone: config.ringtone, vibration: config.vibration });
  }

  /**
   * The quiet one: admins and supervisors are told, and that is all.
   *
   * ⚠️ No ACCEPT and no REJECT, ever — deliberately, and not merely hidden in the app: the
   * payload carries no actions at all, so there is nothing for a client to render or replay.
   * These people are watching the shop, not taking the job, and an accept button on the owner's
   * phone would take the order out of the pool without anyone to deliver it.
   */
  private async informWatchers(o: OrderSummary, config: AlertConfig): Promise<void> {
    const watchers = await this.watcherRecipients(config);
    if (watchers.length === 0) return;
    const data = {
      ...this.pushBehaviour(config),
      kind: 'order_info',
      alert: 'BANNER',
      autoDismissSec: String(config.infoDismissSec),
      ...this.orderFields(o, config),
    };
    for (const userId of watchers) {
      await this.notify.send({
        userId,
        type: 'alert.order_info',
        title: fill(config.text.alert_title_info, o),
        body: fill(config.text.alert_body_info, o),
        linkUrl: `/admin/orders/${o.orderNumber}`,
        channels: ['IN_APP', 'PUSH'],
        data,
        dedupeKey: `alert:info:${o.orderNumber}:${userId}`,
      });
    }
    this.gateway.emitAlert('ops:orders', 'alert.order_info', { ...o, autoDismissSec: config.infoDismissSec, ringtone: config.ringtone, vibration: config.vibration });
  }

  // ───────────────────────── rider says no ─────────────────────────

  /**
   * A delivery boy declines a pool order.
   *
   * It is written as a REJECTED `delivery_assignments` row: the order stays in the pool for
   * everyone else (only OFFERED/ACCEPTED/PICKED_UP hold an order), this rider stops being rung
   * for it, and the shop's rejection history gains a row in the table that already holds the
   * admin-assigned rejections.
   */
  async decline(orderNumber: string, rider: AuthUser, reason: string): Promise<{ declined: true; escalated: boolean }> {
    const order = await this.db('orders').where({ order_number: orderNumber }).first('id', 'status');
    if (!order) throw notFound();
    const taken = await this.db('delivery_assignments').where({ order_id: order.id }).whereIn('status', ACTIVE_ASSIGNMENT).first('id');
    if (taken) throw conflict('यह ऑर्डर किसी और ने ले लिया', undefined, 'Another delivery partner already took this order');

    const already = await this.db('delivery_assignments').where({ order_id: order.id, rider_id: rider.id, status: 'REJECTED' }).first('id');
    if (!already) {
      await this.db('delivery_assignments').insert({
        order_id: order.id,
        rider_id: rider.id,
        job_type: 'DELIVERY',
        status: 'REJECTED',
        assigned_by: null,
        earning: '0.00',
        reject_reason: reason.slice(0, 255) || 'declined from pool',
      });
      await this.audit.log({ actorId: rider.id, actorRole: rider.role, action: 'alert.decline', entityType: 'order', entityId: orderNumber, after: { riderId: rider.id, reason: reason.slice(0, 255) } });
    }

    // Everyone who could have taken it has now said no → do not make the shop wait out the timer.
    const config = await this.cfg.read();
    const remaining = (await this.riderRecipients(config)).filter((id) => id !== rider.id);
    const declinedIds = new Set(
      ((await this.db('delivery_assignments').where({ order_id: order.id, status: 'REJECTED' }).pluck('rider_id')) as number[]).map(Number),
    );
    const anyoneLeft = remaining.some((id) => !declinedIds.has(id));
    if (!anyoneLeft) {
      // Report what actually happened: `escalate` returns false when this order already has an
      // alert out in the current window, and telling the rider's app "escalated" when nothing
      // was sent would put a status on his screen that no admin ever saw.
      const escalated = await this.escalate(orderNumber, 'ALL_DECLINED');
      return { declined: true, escalated };
    }
    return { declined: true, escalated: false };
  }

  // ───────────────────────── escalation ─────────────────────────

  private armEscalation(orderNumber: string, sec: number): void {
    if (sec <= 0) return;
    const existing = this.timers.get(orderNumber);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.timers.delete(orderNumber);
      void this.escalate(orderNumber, 'TIMEOUT').catch((e) => Log.warn('alert.escalate_failed', { orderNumber, err: String(e) }));
    }, sec * 1000);
    // Never hold the process open for a timer; a pending escalation is not a reason to refuse
    // to shut down, and the sweep picks it up on the next boot.
    t.unref?.();
    this.timers.set(orderNumber, t);
  }

  /** Called when the order finally gets a rider — by claim, by assignment, or by cancellation. */
  resolve(orderNumber: string, how: string): void {
    const t = this.timers.get(orderNumber);
    if (t) clearTimeout(t);
    this.timers.delete(orderNumber);
    this.gateway.emitAlert('ops:orders', 'alert.escalation.resolved', { orderNumber, how });
    this.gateway.emitAlert('ops:delivery', 'alert.escalation.resolved', { orderNumber, how });
  }

  /**
   * Put an unassigned order in front of the people who can do something about it.
   *
   * Idempotent twice over: the notification's dedupe key is unique per order and cycle, so a
   * timer and the cron sweep firing together produce one alert; and an order that has since been
   * taken is dropped before anything is sent.
   */
  async escalate(orderNumber: string, cause: EscalationCause): Promise<boolean> {
    const config = await this.cfg.read();
    if (!config.enabled) return false;
    // ⚠️ The timeout check belongs HERE, not only where the timer is armed. A repeat timer armed
    // under the old setting keeps its own copy of the interval, so after the owner sets the
    // escalation time to 0 ("never") in the admin panel, those already-armed repeats went on
    // alerting him every five minutes until the API happened to restart — he turns it off and it
    // does not stop, which is the kind of thing that makes people ignore the alerts altogether.
    // NO_RIDER and ALL_DECLINED are facts rather than timeouts and still get through; the master
    // switch (`enabled`, checked above) is what silences everything.
    if (cause === 'TIMEOUT' && config.escalationSec <= 0) return false;
    const order = await this.summary(orderNumber);
    if (!order) return false;

    // Already taken, or no longer waiting for a rider → nothing to escalate.
    const row = await this.db('orders').where({ order_number: orderNumber }).first('id', 'status');
    if (!row) return false;
    const taken = await this.db('delivery_assignments').where({ order_id: row.id }).whereIn('status', ACTIVE_ASSIGNMENT).first('id');
    if (taken) return false;
    if (!['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'SCHEDULED'].includes(String(row.status))) return false;

    // One alert per order per repeat window. With repeats off, cycle is always 0 → exactly one.
    const window = config.escalationRepeatSec > 0 ? config.escalationRepeatSec * 1000 : Number.MAX_SAFE_INTEGER;
    const cycle = config.escalationRepeatSec > 0 ? Math.floor(Date.now() / window) : 0;
    const dedupeKey = `alert:esc:${orderNumber}:${cycle}`;

    const watchers = await this.watcherRecipients(config, true);
    const data = {
      ...this.pushBehaviour(config),
      kind: 'order_unassigned',
      alert: 'ESCALATION',
      actions: 'ASSIGN,ARRANGE',
      cause,
      ...this.orderFields(order, config),
    };
    let sent = 0;
    for (const userId of watchers) {
      const id = await this.notify.send({
        userId,
        type: 'alert.order_unassigned',
        title: fill(config.text.alert_title_unassigned, order),
        body: fill(config.text.alert_body_unassigned, order),
        linkUrl: '/admin/delivery',
        channels: ['IN_APP', 'PUSH'],
        data,
        dedupeKey: `${dedupeKey}:${userId}`,
      });
      if (id !== null) sent += 1;
    }
    if (sent === 0) return false; // every watcher already had this cycle's alert

    await this.audit.log({ actorId: null, actorRole: 'SYSTEM', action: 'alert.escalated', entityType: 'order', entityId: orderNumber, after: { cause, cycle, watchers: watchers.length } });
    const ack = await this.arrangingBy(orderNumber);
    this.gateway.emitAlert('ops:orders', 'alert.order_unassigned', { ...order, cause, actions: ['ASSIGN', 'ARRANGE'], arrangingBy: ack?.name ?? null, ringtone: config.ringtone, vibration: config.vibration });
    this.gateway.emitAlert('ops:delivery', 'alert.order_unassigned', { ...order, cause, arrangingBy: ack?.name ?? null });

    if (config.escalationRepeatSec > 0) this.armRepeat(orderNumber, config.escalationRepeatSec);
    return true;
  }

  private armRepeat(orderNumber: string, sec: number): void {
    const existing = this.timers.get(orderNumber);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.timers.delete(orderNumber);
      void this.escalate(orderNumber, 'TIMEOUT').catch(() => undefined);
    }, sec * 1000);
    t.unref?.();
    this.timers.set(orderNumber, t);
  }

  /**
   * "I'll arrange a delivery boy."
   *
   * ⚠️ This does NOT assign the order and must not look as though it did. It records that a
   * named person has taken responsibility, tells the supervisors, and leaves the order exactly
   * where it was — visible, unassigned, and still being watched — until a real delivery partner
   * is on it. Anything else would hide an undelivered order from the only people looking for it.
   */
  async arrange(orderNumber: string, actor: AuthUser, ip: string): Promise<{ arrangingBy: string; orderNumber: string }> {
    const order = await this.db('orders').where({ order_number: orderNumber }).first('id', 'status');
    if (!order) throw notFound();
    const taken = await this.db('delivery_assignments').where({ order_id: order.id }).whereIn('status', ACTIVE_ASSIGNMENT).first('id');
    if (taken) throw conflict('इस ऑर्डर पर पहले से डिलीवरी पार्टनर है', undefined, 'This order already has a delivery partner');

    const me = (await this.db('users').where({ id: actor.id }).first('name')) as { name: string | null } | undefined;
    const name = me?.name ?? 'स्टाफ़';
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'alert.escalation_ack', entityType: 'order', entityId: orderNumber, after: { arrangingBy: name, userId: actor.id }, ip });

    // Stop the repeat: a human has it. The order stays unassigned and stays on the board.
    const t = this.timers.get(orderNumber);
    if (t) clearTimeout(t);
    this.timers.delete(orderNumber);

    const config = await this.cfg.read();
    for (const userId of await this.watcherRecipients(config, true)) {
      if (userId === actor.id) continue;
      await this.notify.send({
        userId,
        type: 'alert.escalation_ack',
        title: 'डिलीवरी का इंतज़ाम हो रहा है',
        body: `${orderNumber} — ${name} डिलीवरी बॉय का इंतज़ाम कर रहे हैं`,
        linkUrl: '/admin/delivery',
        channels: ['IN_APP'],
        dedupeKey: `alert:ack:${orderNumber}:${userId}`,
      });
    }
    this.gateway.emitAlert('ops:orders', 'alert.escalation.arranging', { orderNumber, arrangingBy: name });
    this.gateway.emitAlert('ops:delivery', 'alert.escalation.arranging', { orderNumber, arrangingBy: name });
    return { arrangingBy: name, orderNumber };
  }

  /** Who, if anyone, said they would arrange a rider for this order — and when. */
  private async arrangingBy(orderNumber: string): Promise<{ name: string; at: string } | null> {
    const row = (await this.db('audit_logs')
      .where({ entity: 'order', entity_id: orderNumber, action: 'alert.escalation_ack' })
      .orderBy('id', 'desc')
      .first('after_json', 'created_at')) as { after_json: unknown; created_at: Date } | undefined;
    const parsed = asObject(row?.after_json);
    const name = typeof parsed.arrangingBy === 'string' ? parsed.arrangingBy : null;
    return name && row ? { name, at: new Date(row.created_at).toISOString() } : null;
  }

  /**
   * Every order still waiting for a delivery partner — the escalation screen's list.
   *
   * It is computed, never stored, so it cannot drift from the truth: an order is on this list
   * exactly while it is in a status that wants a rider and holds no active assignment.
   */
  async unassigned(): Promise<(OrderSummary & { declinedBy: number; arrangingBy: string | null; arrangingAt: string | null })[]> {
    const rows = (await this.db('orders as o')
      .where('o.order_type', 'DELIVERY')
      .whereIn('o.status', ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'])
      .whereNotExists(this.db('delivery_assignments as d').whereRaw('d.order_id = o.id').whereIn('d.status', ACTIVE_ASSIGNMENT))
      .orderByRaw('COALESCE(o.confirmed_at, o.placed_at) ASC')
      .limit(50)
      .select('o.order_number')) as { order_number: string }[];

    const out: (OrderSummary & { declinedBy: number; arrangingBy: string | null; arrangingAt: string | null })[] = [];
    for (const r of rows) {
      const s = await this.summary(r.order_number);
      if (!s) continue;
      const id = (await this.db('orders').where({ order_number: r.order_number }).first('id')) as { id: number };
      const declined = Number(((await this.db('delivery_assignments').where({ order_id: id.id, status: 'REJECTED' }).count({ n: '*' }).first()) as { n: number | string } | undefined)?.n ?? 0);
      const ack = await this.arrangingBy(r.order_number);
      out.push({ ...s, declinedBy: declined, arrangingBy: ack?.name ?? null, arrangingAt: ack?.at ?? null });
    }
    return out;
  }

  /**
   * Cron safety net (every 5-minute tick): escalate anything that has been waiting longer than
   * the configured threshold. Catches orders whose in-process timer was lost to a restart.
   */
  async sweep(): Promise<string> {
    const config = await this.cfg.read();
    if (!config.enabled || config.escalationSec <= 0) return 'alerts off';
    const rows = (await this.db('orders as o')
      .where('o.order_type', 'DELIVERY')
      .whereIn('o.status', ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'])
      .whereRaw('COALESCE(o.confirmed_at, o.placed_at) < NOW() - INTERVAL ? SECOND', [config.escalationSec])
      .whereNotExists(this.db('delivery_assignments as d').whereRaw('d.order_id = o.id').whereIn('d.status', ACTIVE_ASSIGNMENT))
      .limit(50)
      .select('o.order_number')) as { order_number: string }[];
    let n = 0;
    for (const r of rows) if (await this.escalate(r.order_number, 'TIMEOUT')) n += 1;
    return `escalated ${n}/${rows.length}`;
  }

  // ───────────────────────── monitoring (Phase 6 §E) ─────────────────────────

  async history(kind: 'notifications' | 'escalations' | 'rejections' | 'assignments' | 'config', limit: number): Promise<unknown[]> {
    switch (kind) {
      case 'notifications':
        // Delivery history and failures in one: `pushed_at` null on a PUSH row that is past its
        // job's last attempt is exactly "we could not reach that phone".
        return this.db('notifications as n')
          .leftJoin('users as u', 'u.id', 'n.user_id')
          // ⚠️ `.where(col, 'like', …)`, never knex's `.whereLike()`: that helper appends
          // `COLLATE utf8_bin`, which MySQL/MariaDB refuses against this column's charset
          // (ERROR 1253) — the history silently came back empty.
          .where('n.type', 'like', 'alert.%')
          .orderBy('n.id', 'desc')
          .limit(limit)
          .select('n.id', 'n.type', 'n.title', 'n.body', 'n.dedupe_key as dedupeKey', 'n.is_read as isRead', 'n.pushed_at as pushedAt', 'n.created_at as createdAt', 'u.name as userName', 'u.role as userRole');
      case 'escalations':
        return this.db('audit_logs')
          .whereIn('action', ['alert.escalated', 'alert.escalation_ack'])
          .orderBy('id', 'desc')
          .limit(limit)
          .select('id', 'action', 'actor_id as actorId', 'actor_role as actorRole', 'entity_id as orderNumber', 'after_json as detail', 'created_at as createdAt');
      case 'rejections':
        return this.db('delivery_assignments as d')
          .join('orders as o', 'o.id', 'd.order_id')
          .leftJoin('users as u', 'u.id', 'd.rider_id')
          .where('d.status', 'REJECTED')
          .orderBy('d.id', 'desc')
          .limit(limit)
          .select('d.id', 'o.order_number as orderNumber', 'u.name as riderName', 'd.reject_reason as reason', 'd.assigned_by as assignedBy', 'd.offered_at as offeredAt');
      case 'assignments':
        return this.db('delivery_assignments as d')
          .join('orders as o', 'o.id', 'd.order_id')
          .leftJoin('users as u', 'u.id', 'd.rider_id')
          .orderBy('d.id', 'desc')
          .limit(limit)
          .select('d.id', 'o.order_number as orderNumber', 'u.name as riderName', 'd.status', 'd.assigned_by as assignedBy', 'd.offered_at as offeredAt', 'd.accepted_at as acceptedAt', 'd.delivered_at as deliveredAt');
      default:
        return this.db('audit_logs')
          .where('action', 'alert.config')
          .orderBy('id', 'desc')
          .limit(limit)
          .select('id', 'actor_id as actorId', 'actor_role as actorRole', 'before_json as before', 'after_json as after', 'created_at as createdAt');
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  private pushBehaviour(c: AlertConfig): Record<string, string> {
    return {
      channelId: c.priority === 'HIGH' ? 'urgent_orders' : 'orders',
      sound: c.ringtone ? 'order_alert' : '',
      ringtone: c.ringtone ? '1' : '0',
      vibrate: c.vibration ? '1' : '0',
      priority: c.priority,
      visibility: c.visibility,
      repeat: String(c.repeatCount),
    };
  }

  /** Only the facts the owner chose to show, so the alert says what he wants it to say. */
  private orderFields(o: OrderSummary, c: AlertConfig): Record<string, string> {
    const all: Record<string, string> = {
      orderNumber: o.orderNumber,
      customer: o.customer,
      customerPhone: o.customerPhone,
      address: o.address,
      village: o.village ?? '',
      amount: o.amount,
      paymentMethod: o.paymentMethod,
      items: String(o.items),
      status: o.status,
      placedAt: o.placedAt,
    };
    const out: Record<string, string> = { orderNumber: o.orderNumber };
    for (const f of c.fields) if (all[f] !== undefined) out[f] = all[f];
    return out;
  }

  private async riderRecipients(c: AlertConfig): Promise<number[]> {
    if (c.riderMode === 'SELECTED') {
      if (c.riderUserIds.length === 0) return [];
      return (await this.db('users').whereIn('id', c.riderUserIds).where({ role: 'DELIVERY_BOY', status: 'ACTIVE' }).pluck('id')) as number[];
    }
    const q = this.db('users as u').join('staff_profiles as s', 's.user_id', 'u.id').where('u.role', 'DELIVERY_BOY').where('u.status', 'ACTIVE');
    if (c.riderMode === 'ON_DUTY') q.where('s.is_available', 1);
    return (await q.pluck('u.id')) as number[];
  }

  /**
   * Admins and supervisors, plus anyone the owner added by hand.
   *
   * `forEscalation` narrows to the people who can actually act on it — assigning a rider is a
   * permission, and ringing someone about a job they cannot do teaches them to ignore the phone.
   */
  private async watcherRecipients(c: AlertConfig, forEscalation = false): Promise<number[]> {
    const roles: string[] = [];
    if (c.adminEnabled) roles.push('ADMIN');
    if (c.supervisorEnabled) roles.push('SUPERVISOR');
    const ids = new Set<number>();
    if (roles.length) {
      const rows = (await this.db('users').whereIn('role', roles).where({ status: 'ACTIVE' }).select('id', 'role', 'is_global_admin')) as { id: number; role: string; is_global_admin: number }[];
      for (const u of rows) {
        if (!forEscalation || u.role === 'ADMIN' || Number(u.is_global_admin) === 1) {
          ids.add(u.id);
          continue;
        }
        const has = await this.db('role_permissions').where({ role: u.role, permission_code: 'delivery.assign' }).first('permission_code');
        const override = (await this.db('user_permissions').where({ user_id: u.id, permission_code: 'delivery.assign' }).first('granted')) as { granted: number } | undefined;
        if (override ? Number(override.granted) === 1 : Boolean(has)) ids.add(u.id);
      }
    }
    for (const id of c.extraUserIds) {
      const u = await this.db('users').where({ id, status: 'ACTIVE' }).first('id');
      if (u) ids.add(Number(u.id));
    }
    return [...ids];
  }

  private async summary(orderNumber: string): Promise<OrderSummary | null> {
    const o = (await this.db('orders as o')
      .leftJoin('users as c', 'c.id', 'o.customer_id')
      .where('o.order_number', orderNumber)
      .first(
        'o.id',
        'o.order_number',
        'o.status',
        'o.grand_total',
        'o.final_grand_total',
        'o.payment_method',
        'o.ship_name',
        'o.ship_phone',
        'o.ship_line1',
        'o.ship_landmark',
        'o.ship_village',
        'o.placed_at',
        'o.confirmed_at',
        'c.name as customer_name',
      )) as Record<string, unknown> | undefined;
    if (!o) return null;
    const items = Number(((await this.db('order_items').where({ order_id: o.id as number, is_removed: 0 }).count({ n: '*' }).first()) as { n: number | string } | undefined)?.n ?? 0);
    const since = new Date(((o.confirmed_at ?? o.placed_at) as string) ?? Date.now()).getTime();
    return {
      orderNumber: o.order_number as string,
      customer: (o.ship_name as string | null) ?? (o.customer_name as string | null) ?? 'ग्राहक',
      customerPhone: (o.ship_phone as string | null) ?? '',
      address: [o.ship_line1, o.ship_landmark, o.ship_village].filter(Boolean).join(', '),
      village: (o.ship_village as string | null) ?? null,
      amount: String(o.final_grand_total ?? o.grand_total ?? '0.00'),
      paymentMethod: (o.payment_method as string) ?? 'COD',
      items,
      status: o.status as string,
      placedAt: new Date(o.placed_at as string).toISOString(),
      waitingSec: Math.max(0, Math.floor((Date.now() - since) / 1000)),
    };
  }
}

/**
 * A JSON column, whichever shape the driver hands back.
 *
 * ⚠️ `audit_logs.after_json` is LONGTEXT, but this driver returns it ALREADY PARSED as an
 * object. `JSON.parse` on an object stringifies it to "[object Object]" and throws, so the
 * original version of this quietly reported "nobody is arranging a rider" for an order somebody
 * had taken responsibility for — the one piece of information the escalation card exists to
 * show. Accept both, trust neither.
 */
function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/** `{village} · ₹{amount}` → the order's own values. An unknown placeholder is left alone. */
function fill(template: string, o: OrderSummary): string {
  const money = o.paymentMethod === 'COD' ? `₹${Number(o.amount)} नकद` : 'भुगतान हो चुका';
  const map: Record<string, string> = {
    orderNumber: o.orderNumber,
    customer: o.customer,
    address: o.address,
    village: o.village ?? '',
    amount: String(Number(o.amount)),
    money,
    items: String(o.items),
    status: o.status,
    minutes: String(Math.round(o.waitingSec / 60)),
  };
  return (template || '').replace(/\{(\w+)\}/g, (whole, k: string) => map[k] ?? whole);
}
