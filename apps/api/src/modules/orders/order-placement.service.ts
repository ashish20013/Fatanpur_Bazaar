import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { ROLE_HOME, type PlaceOrderResponse } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { AppError, isDuplicateKey } from '../../common/errors';
import { Log } from '../../common/logger';
import { fromPaise, mulQty, toPaise } from '../../common/utils/money';
import { orderNumber as makeOrderNumber } from '../../common/utils/ids';
import { istYmd } from '../../common/utils/time';
import { SettingsService } from '../settings/settings.service';
import { InventoryService } from '../catalog/inventory.service';
import { WalletService } from '../wallet/wallet.service';
import { CouponsService } from '../coupons/coupons.service';
import { CartService } from '../cart/cart.service';
import { NotificationService } from '../notifications/notification.service';
import { RateLimitService } from '../identity/rate-limit.service';
import { PaymentRecordsService } from '../payments/payment-records.service';
import { BookingRecordsService } from '../services/booking-records.service';
import { PrescriptionRecordsService } from '../prescriptions/prescription-records.service';
import { QuoteService, type QuoteInput } from './quote.service';
import { OrderEvents } from './order-events';
import { OrderStateService, SYSTEM_ACTOR } from './order-state.service';
import { EXTRA_COLUMNS } from '../users/address-extras';

export interface PlaceInput extends QuoteInput {
  prescriptionId?: number;
  note?: string;
  slot?: { date: string; start: string };
}

/** A14 — idempotent, transaction-safe order placement. */
@Injectable()
export class OrderPlacementService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) private readonly env: Env,
    private readonly settings: SettingsService,
    private readonly quotes: QuoteService,
    private readonly inventory: InventoryService,
    private readonly wallet: WalletService,
    private readonly coupons: CouponsService,
    private readonly cart: CartService,
    private readonly notify: NotificationService,
    private readonly limiter: RateLimitService,
    private readonly payments: PaymentRecordsService,
    private readonly bookings: BookingRecordsService,
    private readonly rx: PrescriptionRecordsService,
    private readonly events: OrderEvents,
    private readonly state: OrderStateService,
  ) {}

  async place(userId: number, input: PlaceInput, idemKey: string): Promise<PlaceOrderResponse> {
    // 2. rate limit
    await this.limiter.hit(`order:place:${userId}`, 6, 3600);
    // 3. idempotency — INSERT first; SELECT-then-INSERT would race
    try {
      await this.db('order_idempotency').insert({ user_id: userId, idem_key: idemKey });
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      const row = await this.db('order_idempotency').where({ user_id: userId, idem_key: idemKey }).first('order_id');
      if (row?.order_id) return this.responseFor(row.order_id);
      throw new AppError('ORDER_IN_PROGRESS');
    }
    try {
      return await this.placeInner(userId, input, idemKey);
    } catch (e) {
      // A failed attempt must not poison the key (the client may retry the same request).
      await this.db('order_idempotency').where({ user_id: userId, idem_key: idemKey }).whereNull('order_id').delete().catch(() => undefined);
      throw e;
    }
  }

  private async placeInner(userId: number, input: PlaceInput, idemKey: string): Promise<PlaceOrderResponse> {
    // 6. payment method availability
    if (input.paymentMethod === 'COD' && !(await this.settings.bool('cod_enabled', true))) throw new AppError('PAYMENT_METHOD_UNAVAILABLE');
    if (input.paymentMethod === 'UPI' && (!(await this.settings.bool('upi_enabled', true)) || !(await this.settings.str('upi_vpa')))) throw new AppError('PAYMENT_METHOD_UNAVAILABLE');
    if (input.paymentMethod === 'GATEWAY' && !(await this.settings.bool('gateway_enabled', false))) throw new AppError('PAYMENT_METHOD_UNAVAILABLE');

    const created = await this.db.transaction(async (trx) => {
      /*
       * One checkout per customer at a time.
       *
       * A coupon's "once per person" and "first order only" are checked by counting this person's
       * past usages and orders — plain reads that lock nothing. Two checkouts sent together (two
       * tabs, or a retry with a fresh idempotency key) each counted zero, and NAYA50 came off both
       * orders. Locking his own user row first makes the second checkout wait until the first has
       * committed, so its count sees the first. It costs nothing to anybody else: it is his row.
       */
      await trx('users').where({ id: userId }).forUpdate().first('id');
      // 4. quote — recomputed inside the transaction (address/geo/stock/coupon all re-checked: GEO-11)
      const q = await this.quotes.build(userId, input, trx);
      if (q.orderType === 'SERVICE' && !input.slot) throw new AppError('SLOT_UNAVAILABLE');

      // 5. prescription gate
      let rxStatus: 'PENDING_REVIEW' | 'APPROVED' | null = null;
      let rxId: number | null = null;
      if (q.out.needsPrescription) {
        const rx = await this.rx.validateForOrder(trx, userId, input.prescriptionId);
        rxStatus = rx.status;
        rxId = rx.id;
      }

      // 8. stock — locked in product_id ASC order, oversell impossible
      const lineInfo = input.items.map((i) => {
        const p = q.products.get(i.productId);
        if (!p) throw new AppError('PRODUCT_UNAVAILABLE', { item: `#${i.productId}` });
        return { p, quantity: i.quantity };
      });
      const orderNo = await this.nextOrderNumber(trx);
      await this.inventory.reserveForOrder(trx, lineInfo.map((l) => ({ productId: l.p.id, quantity: l.quantity, itemType: l.p.item_type, label: l.p.name_hi ?? l.p.name })), orderNo, userId);

      // 10. order row — COD goes straight to CONFIRMED (unless an rx still needs review)
      const o = q.out;
      const needsReview = q.out.needsPrescription && rxStatus !== 'APPROVED';
      // Nothing left to pay (wallet or coupon covered all of it): there is no UPI screen to show
      // and no money to wait for — record it as settled, or the order would sit in
      // PENDING_PAYMENT until the auto-cancel took it.
      const method = o.grandTotal === 0 && (input.paymentMethod === 'UPI' || input.paymentMethod === 'GATEWAY') ? 'WALLET' : input.paymentMethod;
      const status = method === 'COD' || (method === 'WALLET' && o.grandTotal === 0) ? (needsReview ? 'PENDING_PAYMENT' : 'CONFIRMED') : 'PENDING_PAYMENT';
      const a = q.address;
      const [orderId] = await trx('orders').insert({
        order_number: orderNo,
        customer_id: userId,
        address_id: a.id,
        order_type: q.orderType,
        status,
        items_total: fromPaise(o.itemsTotal),
        delivery_fee: fromPaise(o.deliveryFee),
        visiting_charge: fromPaise(o.visitingCharge),
        discount: fromPaise(o.discount),
        wallet_used: fromPaise(o.walletUsed),
        grand_total: fromPaise(o.grandTotal),
        payment_method: method,
        payment_status: method === 'WALLET' ? 'PAID' : 'PENDING',
        ship_name: a.receiver_name,
        ship_phone: a.phone,
        ship_line1: a.line1,
        ship_landmark: a.landmark,
        ship_village: q.villageName,
        ship_lat: a.latitude,
        ship_lng: a.longitude,
        distance_km: q.check.distanceKm,
        coupon_id: q.couponId,
        requires_prescription: q.out.needsPrescription ? 1 : 0,
        // ⚠️ an already-APPROVED rx is NOT sent back to review (else auto-cancel would kill the order)
        prescription_status: !q.out.needsPrescription ? 'NONE' : rxStatus === 'APPROVED' ? 'APPROVED' : 'PENDING_REVIEW',
        customer_note: input.note?.slice(0, 500) ?? null,
        eta_minutes: q.etaMinutes,
        confirmed_at: status === 'CONFIRMED' ? trx.fn.now() : null,
      });

      // 10b. rural details snapshot (guardian, alt phone, route, note) — rider sees what was true at order time
      await trx.raw(
        `INSERT INTO order_ship_extras (order_id, ${EXTRA_COLUMNS.join(', ')})
         SELECT ?, ${EXTRA_COLUMNS.join(', ')} FROM address_extras WHERE address_id = ?`,
        [orderId, a.id],
      );

      // 11. item snapshots (data already loaded — no per-item query)
      await trx('order_items').insert(
        lineInfo.map((l) => ({
          order_id: orderId,
          product_id: l.p.id,
          item_type: l.p.item_type,
          product_name: l.p.name,
          product_name_hi: l.p.name_hi,
          supplier_name: l.p.supplier_name,
          image_url: l.p.image_url,
          unit: l.p.unit,
          unit_value: l.p.unit_value,
          unit_price: l.p.price,
          mrp: l.p.mrp,
          tax_rate: l.p.tax_rate,
          quantity: l.quantity,
          line_total: fromPaise(mulQty(toPaise(l.p.price), l.quantity)),
          prescription_required: l.p.prescription_required,
        })),
      );
      // 12. status log
      await trx('order_status_logs').insert({ order_id: orderId, from_status: null, to_status: status, changed_by: userId, actor_role: 'CUSTOMER', note: 'placed' });
      // 13. rx
      if (rxId) await this.rx.attach(trx, rxId, orderId);
      // 14. wallet
      if (o.walletUsed > 0) await this.wallet.debit(trx, userId, o.walletUsed, 'ORDER_PAYMENT', orderNo, 'ऑर्डर में वॉलेट से भुगतान');
      // 15. coupon
      if (q.couponId && o.discount > 0) await this.coupons.recordUsage(trx, q.couponId, userId, orderId, o.discount);
      // 16. payment row
      await this.payments.createForOrder(trx, orderId, method, fromPaise(o.grandTotal));
      // 17. service booking
      if (q.orderType === 'SERVICE' && input.slot) await this.bookings.create(trx, orderId, input.slot, fromPaise(o.visitingCharge), input.note ?? null);
      // 18. idempotency → order
      await trx('order_idempotency').where({ user_id: userId, idem_key: idemKey }).update({ order_id: orderId });
      // 19. cart
      await this.cart.clear({ userId }, trx);
      // 21. notifications written in-trx (dedupe'd), pushes delivered by the queue after commit
      await this.notify.send({ userId, type: 'order.placed', title: 'ऑर्डर मिल गया', body: `ऑर्डर मिल गया — ${orderNo}। ₹${Number(fromPaise(o.grandTotal))}`, linkUrl: `/mera/order/${orderNo}`, dedupeKey: `order:${orderNo}:placed` }, trx);
      await this.notify.sendToPermission('orders.view_all', { type: 'order.placed', title: 'नया ऑर्डर', body: `${orderNo} · ₹${Number(fromPaise(o.grandTotal))} · ${q.villageName ?? ''}`, linkUrl: `/admin/orders/${orderNo}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `order:${orderNo}:placed` }, trx);
      if (needsReview) await this.notify.sendToPermission('prescriptions.review', { type: 'rx.pending', title: 'पर्ची जाँचें', body: `${orderNo} की पर्ची जाँच बाकी है`, linkUrl: '/admin/prescriptions', channels: ['IN_APP', 'PUSH'], dedupeKey: `rx:${orderNo}` }, trx);
      return { orderId, orderNo, status, grandTotal: fromPaise(o.grandTotal), villageName: q.villageName, orderType: q.orderType };
    });

    // 21. realtime side-effects strictly after COMMIT (never fail the order)
    try {
      this.events.orderPlaced({ userId, orderNumber: created.orderNo, total: created.grandTotal, village: created.villageName });
      // Broadcast model: a COD (or fully-wallet-paid) delivery order is CONFIRMED the instant it is
      // placed, so it drops into the rider pool right away. UPI orders reach CONFIRMED later, via the
      // state machine when payment is verified — the delivery hook broadcasts those (no double-fire
      // here because this path only confirms COD/WALLET). Services are assigned by the shop, not pooled.
      if (created.status === 'CONFIRMED' && created.orderType === 'DELIVERY') this.events.orderConfirmed(created.orderNo);
    } catch (e) {
      Log.warn('order.realtime_failed', { err: String(e) });
    }
    // A24: a confirmed service booking moves straight to SCHEDULED (its slot is already fixed).
    if (created.orderType === 'SERVICE' && created.status === 'CONFIRMED') {
      await this.state.changeStatus(created.orderNo, 'SCHEDULED', SYSTEM_ACTOR, { note: 'स्लॉट तय' }).catch((e) => Log.warn('order.schedule_failed', { err: String(e) }));
    }
    return this.responseFor(created.orderId);
  }

  /**
   * FB-YYYYMMDD-NNNN.
   *
   * Reading MAX(order_number) does not survive concurrency: two customers who press "order" in the
   * same second both read the same maximum, both build the same number, and the second insert dies
   * on the unique key — the customer sees a failure for no reason of his own. `LAST_INSERT_ID(x)`
   * makes the increment and the read-back one atomic statement per day-row instead, so each caller
   * gets its own sequence value no matter how many arrive together.
   */
  private async nextOrderNumber(trx: Knex.Transaction): Promise<string> {
    const ymd = istYmd();
    // LAST_INSERT_ID(1) on the insert path too — the table has no AUTO_INCREMENT, so without it the
    // first order of a new day would read back a stale value from an earlier statement.
    await trx.raw('INSERT INTO order_counters (ymd, seq) VALUES (?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE seq = LAST_INSERT_ID(seq + 1)', [ymd]);
    const r = (await trx.raw('SELECT LAST_INSERT_ID() AS seq')) as [{ seq: number }[]];
    return makeOrderNumber(ymd, Number(r[0][0].seq));
  }

  async responseFor(orderId: number): Promise<PlaceOrderResponse> {
    const o = await this.db('orders').where({ id: orderId }).first('order_number', 'status', 'grand_total', 'payment_method', 'eta_minutes');
    return {
      orderNumber: o.order_number,
      status: o.status,
      grandTotal: o.grand_total,
      paymentMethod: o.payment_method,
      upi: o.payment_method === 'UPI' ? await this.payments.upiDetails(o.order_number, o.grand_total, this.env.API_URL) : null,
      etaMinutes: Number(o.eta_minutes ?? 45),
      redirect: `${ROLE_HOME.CUSTOMER}/order/${o.order_number}`,
    };
  }
}
