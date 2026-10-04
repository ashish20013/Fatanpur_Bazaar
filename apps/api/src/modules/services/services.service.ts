import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { AppError, CommitThenThrow, conflict, notFound } from '../../common/errors';
import { fromPaise, toPaise } from '../../common/utils/money';
import { hhmmToMinutes, istDate, istMinutes, minutesToHhmm } from '../../common/utils/time';
import type { AuthUser } from '../../common/types';
import { buildSlots } from '../../domain/slots';
import { SettingsService } from '../settings/settings.service';
import { NotificationService } from '../notifications/notification.service';
import { OrderStateService, SYSTEM_ACTOR, type TransitionCtx } from '../orders/order-state.service';
import { TrackingService } from '../tracking/tracking.service';
import { BookingRecordsService } from './booking-records.service';

const MAX_OTP_ATTEMPTS = 3;

/** A24 — service bookings: slots, technician start, quote approval, completion OTP, reschedule. */
@Injectable()
export class ServicesService implements OnModuleInit {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
    private readonly notify: NotificationService,
    private readonly state: OrderStateService,
    private readonly tracking: TrackingService,
    private readonly records: BookingRecordsService,
  ) {}

  onModuleInit(): void {
    this.state.registerHook({ name: 'services', before: (c) => this.before(c), after: (c) => this.after(c) });
  }

  private async before(ctx: TransitionCtx): Promise<void> {
    const { trx, order, to, actor, extra } = ctx;
    if (order.order_type !== 'SERVICE' || to !== 'COMPLETED') return;
    const b = await trx('service_bookings').where({ order_id: order.id }).forUpdate().first();
    if (!b) throw notFound();
    const q = await trx('service_quotes').where({ booking_id: b.id }).first('status');
    if (q && q.status !== 'APPROVED') throw new AppError('BUSINESS_RULE', { reason: 'ग्राहक ने अभी अंतिम रकम मंज़ूर नहीं की है' });
    if (actor.kind === 'ADMIN' && extra.overrideReason) return;
    if (b.otp_attempts >= MAX_OTP_ATTEMPTS) throw new CommitThenThrow(new AppError('DELIVERY_OTP_LOCKED'));
    if (!extra.otp || extra.otp !== b.completion_otp) {
      await trx('service_bookings').where({ id: b.id }).update({ otp_attempts: b.otp_attempts + 1 });
      throw new CommitThenThrow(new AppError('DELIVERY_OTP_INVALID', { n: Math.max(0, MAX_OTP_ATTEMPTS - b.otp_attempts - 1) }));
    }
    await trx('service_bookings').where({ id: b.id }).update({ otp_verified_at: trx.fn.now(), completed_at: trx.fn.now(), completion_otp: null });
  }

  private async after(ctx: TransitionCtx): Promise<void> {
    const { trx, order, to } = ctx;
    if (order.order_type !== 'SERVICE') return;
    if (to === 'CONFIRMED') ctx.afterCommit.push(async () => void (await this.state.changeStatus(order.order_number, 'SCHEDULED', SYSTEM_ACTOR, { note: 'स्लॉट तय' })));
    if (to === 'IN_PROGRESS') await trx('service_bookings').where({ order_id: order.id }).update({ started_at: trx.fn.now() });
    if (to === 'SCHEDULED') {
      const b = await trx('service_bookings').where({ order_id: order.id }).first('scheduled_date', 'slot_start');
      if (b) await this.notify.send({ userId: order.customer_id, type: 'service.scheduled', title: 'सेवा का समय तय', body: `${String(b.scheduled_date).slice(0, 10)} को ${String(b.slot_start).slice(0, 5)} बजे।`, linkUrl: `/mera/order/${order.order_number}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `sched:${order.order_number}:${b.scheduled_date}:${b.slot_start}` }, trx);
    }
  }

  async slots(slug: string, date: string): Promise<unknown> {
    const p = await this.db('products').where({ slug, item_type: 'SERVICE', is_available: 1 }).first('id');
    if (!p) throw notFound();
    const booked = (await this.db('service_bookings as b').join('orders as o', 'o.id', 'b.order_id').where('b.scheduled_date', date).whereNotIn('o.status', ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED']).groupBy('b.slot_start').select('b.slot_start').count({ n: '*' })) as { slot_start: string; n: number }[];
    const bookedByStart: Record<string, number> = {};
    for (const r of booked) bookedByStart[String(r.slot_start).slice(0, 5)] = Number(r.n);
    return buildSlots({
      open: await this.settings.str('service_open_time', '08:00'),
      close: await this.settings.str('service_close_time', '19:00'),
      slotMinutes: await this.settings.int('service_slot_minutes', 120),
      technicians: await this.records.technicianCount(),
      bookedByStart,
      isToday: date === istDate(),
      nowMinutes: istMinutes(),
    });
  }

  async myBookings(userId: number): Promise<unknown[]> {
    return this.db('service_bookings as b').join('orders as o', 'o.id', 'b.order_id').where('o.customer_id', userId).orderBy('b.scheduled_date', 'desc')
      .select('b.id', 'o.order_number as orderNumber', 'o.status', 'b.scheduled_date as date', 'b.slot_start as slotStart', 'b.slot_end as slotEnd', 'b.final_amount as finalAmount', 'b.reschedule_count as rescheduleCount');
  }

  async technicianJobs(techId: number): Promise<unknown[]> {
    return this.db('service_bookings as b').join('orders as o', 'o.id', 'b.order_id').where('b.technician_id', techId).whereIn('o.status', ['ASSIGNED', 'IN_PROGRESS'])
      .select('b.id', 'o.order_number as orderNumber', 'o.status', 'b.scheduled_date as date', 'b.slot_start as slotStart', 'o.ship_name as customer', 'o.ship_line1 as address', 'o.ship_village as village');
  }

  /** "काम शुरू" — IN_PROGRESS + live tracking so the customer sees the technician coming. */
  async start(booking: { id: number; order_number: string; technician_id: number | null }, tech: AuthUser): Promise<unknown> {
    if (booking.technician_id !== tech.id) throw notFound();
    const r = await this.state.changeStatus(booking.order_number, 'IN_PROGRESS', { id: tech.id, kind: tech.role, permissions: tech.permissions });
    const a = await this.db('delivery_assignments as d').join('orders as o', 'o.id', 'd.order_id').where({ 'o.order_number': booking.order_number, 'd.rider_id': tech.id }).whereIn('d.status', ['OFFERED', 'ACCEPTED']).first('d.id');
    if (a) {
      await this.db('delivery_assignments').where({ id: a.id }).update({ status: 'ACCEPTED', accepted_at: this.db.fn.now() });
      await this.tracking.startSession(this.db, a.id, tech.id);
    }
    return r;
  }

  /** Quote-based work: technician proposes the final amount; the customer must approve. */
  async proposeQuote(booking: { id: number; order_id: number; order_number: string; technician_id: number | null; customer_id: number }, amount: string, note: string | undefined, tech: AuthUser): Promise<unknown> {
    if (booking.technician_id !== tech.id) throw notFound();
    await this.db.raw('INSERT INTO service_quotes (booking_id, amount, status, proposed_by) VALUES (?, ?, \'PENDING\', ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount), status = \'PENDING\', decided_at = NULL', [booking.id, amount, tech.id]);
    await this.db('service_bookings').where({ id: booking.id }).update({ final_amount: amount, work_note: note?.slice(0, 1000) ?? null });
    await this.notify.send({ userId: booking.customer_id, type: 'service.quote', title: 'काम की रकम मंज़ूर करें', body: `तकनीशियन ने कुल ₹${Number(amount)} बताया है। ऐप में मंज़ूर करें।`, linkUrl: `/mera/order/${booking.order_number}`, channels: ['IN_APP', 'PUSH'] });
    return { status: 'PENDING' };
  }

  async decideQuote(booking: { id: number; order_id: number; order_number: string; customer_id: number }, approve: boolean, user: AuthUser): Promise<unknown> {
    if (booking.customer_id !== user.id) throw notFound();
    const q = await this.db('service_quotes').where({ booking_id: booking.id, status: 'PENDING' }).first('amount');
    if (!q) throw conflict('मंज़ूरी के लिए कोई रकम नहीं है');
    await this.db.transaction(async (trx) => {
      await trx('service_quotes').where({ booking_id: booking.id }).update({ status: approve ? 'APPROVED' : 'REJECTED', decided_at: trx.fn.now() });
      if (approve) {
        const o = await trx('orders').where({ id: booking.order_id }).first('visiting_charge', 'discount', 'wallet_used');
        // final bill = approved work amount + visiting charge − discount − wallet (never negative)
        const grand = Math.max(0, toPaise(q.amount) + toPaise(o.visiting_charge) - toPaise(o.discount) - toPaise(o.wallet_used));
        await trx('orders').where({ id: booking.order_id }).update({ final_items_total: q.amount, final_grand_total: fromPaise(grand) });
        await trx('payments').where({ order_id: booking.order_id }).update({ amount_final: fromPaise(grand) });
      }
    });
    return { status: approve ? 'APPROVED' : 'REJECTED' };
  }

  /** Max 2 reschedules, up to 2 h before the slot; capacity re-checked. */
  async reschedule(booking: { id: number; order_id: number; order_number: string; customer_id: number; technician_id: number | null; scheduled_date: string; slot_start: string; reschedule_count: number }, date: string, start: string, user: AuthUser): Promise<unknown> {
    const isOwner = booking.customer_id === user.id;
    const isStaff = user.role !== 'CUSTOMER';
    if (!isOwner && !isStaff) throw notFound();
    const max = await this.settings.int('max_reschedules', 2);
    if (booking.reschedule_count >= max) throw new AppError('BUSINESS_RULE', { reason: `समय ${max} बार से ज़्यादा नहीं बदल सकते` });
    const cutoffH = await this.settings.int('reschedule_cutoff_hours', 2);
    const slotAt = new Date(`${String(booking.scheduled_date).slice(0, 10)}T${String(booking.slot_start).slice(0, 5)}:00+05:30`).getTime();
    if (isOwner && slotAt - Date.now() < cutoffH * 3600_000) throw new AppError('BUSINESS_RULE', { reason: `स्लॉट से ${cutoffH} घंटे पहले तक ही समय बदल सकते हैं` });
    const slotMin = await this.settings.int('service_slot_minutes', 120);
    await this.db.transaction(async (trx) => {
      const [{ n }] = (await trx('service_bookings').where({ scheduled_date: date, slot_start: `${start}:00` }).whereNot({ id: booking.id }).forUpdate().count({ n: '*' })) as { n: number }[];
      if (Number(n) >= (await this.records.technicianCount(trx))) throw new AppError('SLOT_UNAVAILABLE');
      await trx('service_bookings').where({ id: booking.id }).update({ scheduled_date: date, slot_start: `${start}:00`, slot_end: `${minutesToHhmm(hhmmToMinutes(start) + slotMin)}:00`, reschedule_count: booking.reschedule_count + 1 });
    });
    if (booking.technician_id) await this.notify.send({ userId: booking.technician_id, type: 'service.rescheduled', title: 'सेवा का समय बदला', body: `${booking.order_number}: ${date} ${start}`, channels: ['IN_APP', 'PUSH'] });
    return { date, start };
  }
}
