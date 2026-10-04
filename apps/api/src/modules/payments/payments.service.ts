import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import QRCode from 'qrcode';
import type { OrderStatus } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { AppError, conflict, isDuplicateKey, notFound } from '../../common/errors';
import { Log } from '../../common/logger';
import { fromPaise, toPaise } from '../../common/utils/money';
import type { AuthUser } from '../../common/types';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationService } from '../notifications/notification.service';
import { QueueService } from '../jobs/queue.service';
import { OrderStateService, SYSTEM_ACTOR, type TransitionCtx } from '../orders/order-state.service';
import { PaymentRecordsService } from './payment-records.service';
import { CashfreeProvider, RazorpayProvider, type IPaymentProvider } from './gateway.provider';
import { excessPaise, heldPaise } from '../../domain/payment-money';

const NEGATIVE: OrderStatus[] = ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'DELIVERY_FAILED'];

/** A17 — COD, UPI direct (HDFC, manual verify), gateway (ready, OFF). */
@Injectable()
export class PaymentsService implements OnModuleInit {

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) private readonly env: Env,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly wallet: WalletService,
    private readonly notify: NotificationService,
    private readonly queue: QueueService,
    private readonly state: OrderStateService,
    private readonly records: PaymentRecordsService,
  ) {
  }

  /**
   * The gateway, built fresh from settings on every call.
   *
   * It used to be built once in the constructor from environment variables, which meant switching
   * the gateway on — or fixing a mistyped key — needed an edit on the server and a restart. The
   * owner is applying for Cashfree now and will be given his keys long after this is live, from
   * his phone, so the keys live in Admin → Payments (encrypted) and are read at the moment they
   * are used. Building the object is a few microseconds; it is not on any hot path, because
   * nothing calls it unless a gateway payment or a webhook is actually in flight.
   *
   * .env still wins where it is set, so a server that would rather keep its keys out of the
   * database entirely can, and nothing about the existing deployment has to change.
   */
  private async provider(forDriver?: string): Promise<IPaymentProvider> {
    /*
     * A webhook names its driver in the URL the gateway was given, and that name wins over the
     * configured one. Answering "not my driver, here's a 200" would mean an unsigned POST to
     * /webhooks/payment/razorpay is accepted without a single check the day someone switches the
     * setting to cashfree. Building the named provider instead means the request still has to
     * carry a valid signature, and with no keys for that driver it simply cannot.
     */
    const driver = forDriver ?? (await this.settings.str('payment_gateway_driver', 'cashfree'));
    if (driver === 'razorpay') {
      return new RazorpayProvider(process.env.GATEWAY_WEBHOOK_SECRET, process.env.GATEWAY_KEY_ID, process.env.GATEWAY_KEY_SECRET);
    }
    const [appId, secretKey, webhookSecret, mode] = await Promise.all([
      this.settings.str('cashfree_app_id'),
      this.settings.secret('cashfree_secret_key'),
      this.settings.secret('cashfree_webhook_secret'),
      this.settings.str('cashfree_mode', 'TEST'),
    ]);
    return new CashfreeProvider(
      process.env.CASHFREE_WEBHOOK_SECRET || webhookSecret,
      process.env.CASHFREE_APP_ID || appId,
      process.env.CASHFREE_SECRET_KEY || secretKey,
      mode === 'PROD' ? 'PROD' : 'TEST',
    );
  }

  /**
   * Is the gateway ready to take money? Both switches AND the keys.
   *
   * `gateway_enabled` alone is not enough: switching it on before the keys are in place would show
   * customers a payment option that fails at the last step of checkout, which is the single worst
   * place to fail. The option only appears when the shop can actually complete the payment.
   */
  async gatewayReady(): Promise<{ ready: boolean; driver: string; mode: string; reason: string | null }> {
    const driver = await this.settings.str('payment_gateway_driver', 'cashfree');
    const mode = await this.settings.str('cashfree_mode', 'TEST');
    if (!(await this.settings.bool('gateway_enabled', false))) return { ready: false, driver, mode, reason: 'gateway_disabled' };
    if (driver === 'razorpay') return { ready: !!process.env.GATEWAY_KEY_ID && !!process.env.GATEWAY_KEY_SECRET, driver, mode, reason: null };
    const hasId = !!(process.env.CASHFREE_APP_ID || (await this.settings.str('cashfree_app_id')));
    const hasSecret = !!(process.env.CASHFREE_SECRET_KEY || (await this.settings.secret('cashfree_secret_key')));
    const hasHook = !!(process.env.CASHFREE_WEBHOOK_SECRET || (await this.settings.secret('cashfree_webhook_secret')));
    if (!hasId || !hasSecret) return { ready: false, driver, mode, reason: 'keys_missing' };
    // No webhook secret means no way to trust a "paid" callback, so we would be taking money we
    // could never confirm. That is worse than not offering the option at all.
    if (!hasHook) return { ready: false, driver, mode, reason: 'webhook_secret_missing' };
    return { ready: true, driver, mode, reason: null };
  }

  onModuleInit(): void {
    this.state.registerHook({ name: 'payments', after: (ctx) => this.onTransition(ctx) });
    this.queue.register('payment.gateway_refund', (p) => this.gatewayRefund(Number(p.paymentId)));
  }

  /** State-machine hook: refunds on negative terminal (A15 §11), COD → PAID on delivery (§12). */
  private async onTransition(ctx: TransitionCtx): Promise<void> {
    const { trx, order, to } = ctx;
    const pay = await trx('payments').where({ order_id: order.id }).forUpdate().first();
    if (!pay) return;
    if (NEGATIVE.includes(to)) {
      // From what the shop HOLDS — received minus anything already given back — never from what is
      // owed. Using "owed" here subtracted an adjustment's refund twice (domain/payment-money.ts).
      const paid = heldPaise(pay);
      if (pay.status === 'PAID' && paid > 0) {
        if (pay.method === 'GATEWAY' && pay.gateway_payment_id) {
          await trx('payments').where({ id: pay.id }).update({ status: 'REFUND_PENDING' });
          await trx('orders').where({ id: order.id }).update({ payment_status: 'REFUND_PENDING' });
          await this.queue.push('payment.gateway_refund', { paymentId: pay.id }, { trx, priority: 2 });
        } else {
          // UPI / COD money we hold → instant, dispute-free wallet credit.
          await this.wallet.credit(trx, order.customer_id, paid, 'ORDER_REFUND', order.order_number, 'रद्द ऑर्डर का भुगतान वापस');
          await trx('payments').where({ id: pay.id }).update({ status: 'REFUNDED', refund_amount: fromPaise(toPaise(pay.refund_amount) + paid), refunded_at: trx.fn.now(), refund_ref: 'WALLET' });
          await trx('orders').where({ id: order.id }).update({ payment_status: 'REFUNDED' });
        }
      } else if (pay.status === 'AWAITING_VERIFICATION') {
        // ⚠️ the customer really sent money — park it in the admin refund queue, never drop it.
        await trx('payments').where({ id: pay.id }).update({ status: 'REFUND_PENDING' });
        await trx('orders').where({ id: order.id }).update({ payment_status: 'REFUND_PENDING' });
        await this.notify.sendToRole('ADMIN', { type: 'refund.pending', title: '⚠️ रिफंड बाकी', body: `${order.order_number}: ग्राहक ने UTR ${pay.upi_utr ?? ''} से भुगतान किया था, ऑर्डर रद्द हुआ — रिफंड करें।`, linkUrl: '/admin/payments?tab=refunds', channels: ['IN_APP', 'PUSH'], dedupeKey: `refund:${order.order_number}` }, trx);
      } else if (pay.status === 'PENDING') {
        await trx('payments').where({ id: pay.id }).update({ status: 'FAILED', failure_reason: `order ${to}` });
      }
      return;
    }
    if (to === 'RETURNED') {
      // Goods came back after delivery. How much to give back depends on what came back and in
      // what state (half the sabzi? all of it?) — a person decides, so it goes to the refund queue
      // with the full held amount as the ceiling, never paid out automatically.
      if (pay.status === 'PAID' && heldPaise(pay) > 0) {
        await trx('payments').where({ id: pay.id }).update({ status: 'REFUND_PENDING' });
        await trx('orders').where({ id: order.id }).update({ payment_status: 'REFUND_PENDING' });
        await this.notify.sendToRole('ADMIN', { type: 'refund.pending', title: 'वापसी — रिफंड तय करें', body: `${order.order_number}: सामान वापस आया। कितना पैसा लौटाना है, रिफंड कतार में तय करें।`, linkUrl: '/admin/payments?tab=refunds', channels: ['IN_APP', 'PUSH'], dedupeKey: `refund:${order.order_number}` }, trx);
      }
      return;
    }
    if ((to === 'DELIVERED' || to === 'COMPLETED') && pay.method === 'COD') {
      const collected = order.final_grand_total ?? order.grand_total;
      await trx('payments').where({ id: pay.id }).update({ status: 'PAID', paid_at: trx.fn.now(), amount_final: collected, amount_received: collected });
      await trx('orders').where({ id: order.id }).update({ payment_status: 'PAID' });
      order.payment_status = 'PAID'; // later hooks (referral) read it
    }
  }

  private async loadForCustomer(orderNumber: string, userId: number): Promise<{ order: Record<string, unknown>; pay: Record<string, unknown> }> {
    const order = await this.db('orders').where({ order_number: orderNumber, customer_id: userId }).first();
    if (!order) throw notFound();
    const pay = await this.db('payments').where({ order_id: order.id }).first();
    if (!pay) throw notFound();
    return { order, pay };
  }

  async upiDetails(orderNumber: string, userId: number): Promise<unknown> {
    const { order } = await this.loadForCustomer(orderNumber, userId);
    if (order.payment_method !== 'UPI') throw notFound();
    return this.records.upiDetails(orderNumber, String(order.final_grand_total ?? order.grand_total), this.env.API_URL);
  }

  /**
   * Start a gateway payment for an order: returns the session token its checkout needs.
   *
   * Everything the call needs — keys, mode, whether the gateway is on at all — is read at this
   * moment from settings, so the day Cashfree approves the shop the owner pastes three values into
   * Admin → Payments and this begins working. No deploy, no restart, nobody needed.
   *
   * ⚠️ The amount is taken from the ORDER, never from the request. A client that could name its
   * own amount could buy a month of groceries for one rupee.
   */
  async gatewaySession(orderNumber: string, userId: number): Promise<{ driver: string; mode: string; paymentSessionId: string; orderNumber: string; amount: string }> {
    const ready = await this.gatewayReady();
    if (!ready.ready) throw new AppError('PAYMENT_METHOD_UNAVAILABLE', { reason: 'ऑनलाइन भुगतान अभी चालू नहीं है — COD या UPI चुनें', reasonEn: 'Online payment is not switched on yet — choose COD or UPI' });
    const { order, pay } = await this.loadForCustomer(orderNumber, userId);
    if (pay.method !== 'GATEWAY') throw notFound();
    if (pay.status === 'PAID') throw conflict('इस ऑर्डर का भुगतान हो चुका है', undefined, 'This order is already paid');
    if (['CANCELLED', 'PAYMENT_FAILED', 'REJECTED'].includes(String(order.status))) throw conflict('यह ऑर्डर रद्द हो चुका है', undefined, 'This order has been cancelled');

    const provider = await this.provider();
    if (!(provider instanceof CashfreeProvider)) throw new AppError('PAYMENT_METHOD_UNAVAILABLE');
    const amount = String(order.final_grand_total ?? order.grand_total);
    const customer = await this.db('users').where({ id: userId }).first('name', 'phone');
    const session = await provider.createOrder({
      orderNumber,
      amountPaise: toPaise(amount),
      customerId: `fb-${userId}`,
      phone10: String(customer?.phone ?? '').replace(/^91/, ''),
      name: customer?.name ?? null,
      returnUrl: (await this.settings.str('cashfree_return_url')) || `${this.env.APP_URL}/mera/order/${orderNumber}`,
    });
    // The payment is NOT marked paid here, and must never be: only a signed webhook does that.
    // This id is just the handle the customer's browser hands to Cashfree's checkout.
    await this.db('payments').where({ id: pay.id }).update({ gateway_order_id: session.cfOrderId });
    Log.info('payment.gateway_session', { orderNumber, driver: provider.name, mode: ready.mode });
    return { driver: provider.name, mode: ready.mode, paymentSessionId: session.paymentSessionId, orderNumber, amount };
  }

  /** Server-side QR (desktop checkout) — never trust a client-built QR. */
  async upiQrPng(orderNumber: string, userId: number): Promise<Buffer> {
    const d = (await this.upiDetails(orderNumber, userId)) as { intentUrl: string };
    return QRCode.toBuffer(d.intentUrl, { type: 'png', width: 320, margin: 1, errorCorrectionLevel: 'M' });
  }

  /** Customer says "I paid" with a UTR → AWAITING_VERIFICATION. Never PAID from the client. */
  async claimUpi(orderNumber: string, utr: string | undefined, userId: number): Promise<unknown> {
    const { order, pay } = await this.loadForCustomer(orderNumber, userId);
    if (pay.method !== 'UPI') throw new AppError('BUSINESS_RULE', { reason: 'यह UPI ऑर्डर नहीं है' });
    if (!['PENDING', 'FAILED'].includes(String(pay.status))) throw conflict('इस ऑर्डर का भुगतान पहले ही दर्ज है');
    if (['CANCELLED', 'PAYMENT_FAILED', 'REJECTED'].includes(String(order.status))) throw conflict('यह ऑर्डर रद्द हो चुका है');
    try {
      await this.db.transaction(async (trx) => {
        // NULL, not '', when there is no UTR: the column carries a unique index, and MySQL lets
        // NULLs repeat while a second empty string would collide with the previous claim.
        const ref = utr ? utr.toUpperCase() : null;
        // What he was shown on the UPI screen is what he sent. Recorded now, because the shop may
        // still weigh the order short before somebody verifies it — and then the difference is
        // his to get back (see verify()).
        await trx('payments').where({ id: pay.id }).update({ status: 'AWAITING_VERIFICATION', upi_utr: ref, upi_claimed_at: trx.fn.now(), reject_reason: null, amount_received: order.final_grand_total ?? order.grand_total });
        await trx('orders').where({ id: order.id }).update({ payment_status: 'AWAITING_VERIFICATION' });
        await this.notify.sendToPermission(
          'payments.verify',
          {
            type: 'payment.claimed',
            title: 'UPI भुगतान जाँचें',
            body: `${orderNumber} · ₹${Number(order.final_grand_total ?? order.grand_total)}${ref ? ` · UTR ${ref}` : ' · UTR नहीं दिया — बैंक ऐप में रकम और समय से मिलाएं'}`,
            linkUrl: '/admin/payments',
            channels: ['IN_APP', 'PUSH'],
            dedupeKey: `claim:${orderNumber}:${ref ?? 'no-utr'}`,
          },
          trx,
        );
      });
    } catch (e) {
      if (isDuplicateKey(e)) throw new AppError('DUPLICATE_UTR');
      throw e;
    }
    // Small UPI orders can be confirmed on claim; big ones wait for admin (GATE-PAY-CONFIRM decides).
    if (order.status === 'PENDING_PAYMENT' && order.prescription_status !== 'PENDING_REVIEW') {
      try {
        await this.state.changeStatus(orderNumber, 'CONFIRMED', SYSTEM_ACTOR, { note: 'UPI दावा — छोटी राशि' });
      } catch (e) {
        if (!(e instanceof AppError)) throw e; // PAYMENT_NOT_VERIFIED for big amounts is expected
      }
    }
    return { status: 'AWAITING_VERIFICATION' };
  }

  /** ADMIN-only by default (payments.verify) — the money lands in the owner's HDFC account. */
  async verify(paymentId: number, actor: AuthUser, ip: string): Promise<unknown> {
    const orderNumber = await this.db.transaction(async (trx) => {
      const pay = await trx('payments').where({ id: paymentId }).forUpdate().first();
      if (!pay) throw notFound();
      if (!['AWAITING_VERIFICATION', 'PENDING'].includes(pay.status)) throw conflict('इस भुगतान की स्थिति बदल चुकी है');
      const order = await trx('orders').where({ id: pay.order_id }).forUpdate().first('id', 'order_number', 'customer_id', 'grand_total', 'final_grand_total');
      const received = pay.amount_received ?? pay.amount_final ?? pay.amount;
      await trx('payments').where({ id: paymentId }).update({ status: 'PAID', verified_by: actor.id, verified_at: trx.fn.now(), paid_at: trx.fn.now(), amount_received: received });
      await trx('orders').where({ id: order.id }).update({ payment_status: 'PAID' });
      /*
       * ⚠️ The normal UPI path, not an edge case. Small UPI orders are confirmed the moment the
       * customer submits his UTR, while the money is still waiting to be checked — and confirmed
       * orders are exactly the ones the shop weighs and adjusts. So a ₹300 payment can be verified
       * against a ₹250 order. The adjustment could not refund the ₹50 (nothing was PAID yet), and
       * nothing here did either: the customer simply lost it. The difference is settled now.
       */
      const owed = toPaise(order.final_grand_total ?? order.grand_total);
      const over = excessPaise({ amount: pay.amount, amount_received: received, refund_amount: pay.refund_amount }, owed);
      if (over > 0) {
        await this.wallet.credit(trx, order.customer_id, over, 'ORDER_REFUND', order.order_number, 'ऑर्डर बदलाव का अंतर वापस');
        await trx('payments').where({ id: paymentId }).update({ refund_amount: fromPaise(toPaise(pay.refund_amount) + over) });
      }
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'payment.verify', entityType: 'payment', entityId: paymentId, before: { status: pay.status }, after: { status: 'PAID', utr: pay.upi_utr }, ip }, trx);
      await this.notify.send({ userId: order.customer_id, type: 'payment.verified', title: 'भुगतान मिल गया ✓', body: `ऑर्डर ${order.order_number} का भुगतान मिल गया।`, linkUrl: `/mera/order/${order.order_number}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `paid:${order.order_number}` }, trx);
      return order.order_number as string;
    });
    const o = await this.db('orders').where({ order_number: orderNumber }).first('status', 'prescription_status');
    if (o.status === 'PENDING_PAYMENT' && o.prescription_status !== 'PENDING_REVIEW') {
      await this.state.changeStatus(orderNumber, 'CONFIRMED', { id: actor.id, kind: actor.role, permissions: actor.permissions, isGlobalAdmin: actor.isGlobalAdmin }, { note: 'UPI भुगतान जाँचा', ip });
    }
    return { status: 'PAID', orderNumber };
  }

  /** Reject a UTR claim → FAILED; the order is either converted to COD or cancelled. */
  async reject(paymentId: number, reason: string, action: 'CONVERT_COD' | 'CANCEL', actor: AuthUser, ip: string): Promise<unknown> {
    const pay = await this.db('payments').where({ id: paymentId }).first();
    if (!pay) throw notFound();
    /*
     * Only a claim that is still waiting to be checked can be rejected. Rejecting a PAID payment
     * reset it to PENDING, so the cancellation that followed refunded nothing; rejecting one in the
     * refund queue knocked it out of the queue while the customer was still owed his money.
     */
    if (!['AWAITING_VERIFICATION', 'PENDING'].includes(String(pay.status))) throw conflict('इस भुगतान की स्थिति बदल चुकी है — इसे अब अस्वीकार नहीं किया जा सकता', undefined, 'This payment can no longer be rejected');
    const order = await this.db('orders').where({ id: pay.order_id }).first('order_number', 'customer_id');
    if (action === 'CONVERT_COD') return this.convertToCod(order.order_number, actor, ip, reason);
    // The reject and the cancellation stand or fall together: a reject that commits and a cancel that
    // then fails would leave a "PENDING" payment on an order nobody is going to deliver.
    const ac: TransitionCtx['afterCommit'] = [];
    await this.db.transaction(async (trx) => {
      // amount_received is cleared too: the money was not there, so nothing is held.
      await trx('payments').where({ id: paymentId }).update({ status: 'PENDING', reject_reason: reason.slice(0, 255), upi_utr: null, amount_received: null });
      await trx('orders').where({ id: pay.order_id }).update({ payment_status: 'PENDING' });
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'payment.reject', entityType: 'payment', entityId: paymentId, before: { status: pay.status, utr: pay.upi_utr }, after: { action }, reason, ip }, trx);
      await this.state.changeStatusInTrx(trx, order.order_number, 'CANCELLED', { id: actor.id, kind: actor.role, permissions: actor.permissions, isGlobalAdmin: actor.isGlobalAdmin }, { note: `भुगतान नहीं मिला: ${reason}`, ip }, ac);
    });
    for (const f of ac) f();
    return { status: 'CANCELLED' };
  }

  async convertToCod(orderNumber: string, actor: AuthUser, ip: string, reason = 'COD में बदला'): Promise<unknown> {
    await this.db.transaction(async (trx) => {
      const order = await trx('orders').where({ order_number: orderNumber }).forUpdate().first('id', 'payment_method', 'payment_status', 'customer_id');
      if (!order) throw notFound();
      if (order.payment_status === 'PAID') throw conflict('भुगतान पहले ही हो चुका है');
      await trx('orders').where({ id: order.id }).update({ payment_method: 'COD', payment_status: 'PENDING' });
      await trx('payments').where({ order_id: order.id }).update({ method: 'COD', status: 'PENDING', upi_utr: null, reject_reason: reason.slice(0, 255) });
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'payment.convert_cod', entityType: 'order', entityId: orderNumber, before: { method: order.payment_method }, after: { method: 'COD' }, reason, ip }, trx);
      await this.notify.send({ userId: order.customer_id, type: 'payment.cod', title: 'भुगतान का तरीका बदला', body: `ऑर्डर ${orderNumber} अब कैश ऑन डिलीवरी है — सामान मिलने पर भुगतान करें।`, linkUrl: `/mera/order/${orderNumber}`, channels: ['IN_APP', 'PUSH'] }, trx);
    });
    const o = await this.db('orders').where({ order_number: orderNumber }).first('status', 'prescription_status');
    if (o.status === 'PENDING_PAYMENT' && o.prescription_status !== 'PENDING_REVIEW') await this.state.changeStatus(orderNumber, 'CONFIRMED', { id: actor.id, kind: actor.role, permissions: actor.permissions, isGlobalAdmin: actor.isGlobalAdmin }, { note: 'COD में बदला', ip });
    return { status: 'COD' };
  }

  /** Refund-queue resolution (REFUND_PENDING → REFUNDED). Default: wallet credit. */
  async refund(paymentId: number, b: { method: 'WALLET' | 'UPI_MANUAL'; reference?: string; amount?: string }, actor: AuthUser, ip: string): Promise<unknown> {
    return this.db.transaction(async (trx) => {
      const pay = await trx('payments').where({ id: paymentId }).forUpdate().first();
      if (!pay) throw notFound();
      if (pay.status !== 'REFUND_PENDING') throw conflict('यह भुगतान रिफंड कतार में नहीं है');
      const order = await trx('orders').where({ id: pay.order_id }).first('id', 'order_number', 'customer_id');
      const held = heldPaise(pay);
      const amount = b.amount ? toPaise(b.amount) : held;
      if (amount <= 0) throw conflict('रिफंड राशि शून्य है');
      // A typo of ₹4500 for ₹450 must not become ₹4500 in a customer's wallet.
      if (amount > held) throw new AppError('BUSINESS_RULE', { reason: `इस भुगतान पर अधिकतम ₹${fromPaise(held)} ही वापस हो सकते हैं`, reasonEn: `At most ₹${fromPaise(held)} can be refunded on this payment` });
      if (b.method === 'WALLET') await this.wallet.credit(trx, order.customer_id, amount, 'ORDER_REFUND', order.order_number, 'भुगतान वापस', actor.id);
      await trx('payments').where({ id: paymentId }).update({ status: 'REFUNDED', refund_amount: fromPaise(toPaise(pay.refund_amount) + amount), refunded_at: trx.fn.now(), refund_ref: (b.reference ?? b.method).slice(0, 80) });
      await trx('orders').where({ id: order.id }).update({ payment_status: 'REFUNDED' });
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'refund.initiate', entityType: 'payment', entityId: paymentId, after: { amount: fromPaise(amount), method: b.method, reference: b.reference }, ip }, trx);
      await this.notify.send({ userId: order.customer_id, type: 'payment.refunded', title: 'रिफंड हो गया', body: `ऑर्डर ${order.order_number} के ₹${Number(fromPaise(amount))} ${b.method === 'WALLET' ? 'आपके वॉलेट में' : 'आपके UPI में'} वापस भेजे गए।`, channels: ['IN_APP', 'PUSH'] }, trx);
      return { status: 'REFUNDED', amount: fromPaise(amount) };
    });
  }

  /** "अटके हुए भुगतान" — should be empty every evening. */
  async pending(): Promise<{ awaiting: unknown[]; stuck: unknown[]; refunds: unknown[] }> {
    const cols = ['p.id', 'p.method', 'p.status', 'p.amount', 'p.amount_final as amountFinal', 'p.upi_utr as utr', 'p.upi_claimed_at as claimedAt', 'o.order_number as orderNumber', 'o.status as orderStatus', 'o.ship_name as customer', 'o.placed_at as placedAt'];
    const [awaiting, stuck, refunds] = await Promise.all([
      this.db('payments as p').join('orders as o', 'o.id', 'p.order_id').where('p.status', 'AWAITING_VERIFICATION').orderBy('p.upi_claimed_at').select(cols),
      this.db('payments as p').join('orders as o', 'o.id', 'p.order_id').whereIn('o.payment_status', ['PENDING', 'AWAITING_VERIFICATION']).whereIn('o.status', ['DELIVERED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'COMPLETED']).select(cols),
      this.db('payments as p').join('orders as o', 'o.id', 'p.order_id').where('p.status', 'REFUND_PENDING').orderBy('p.updated_at').select([...cols, 'p.amount_received', 'p.refund_amount']),
    ]);
    // The refund screen offers "held" — the most that may go back — never the amount owed.
    const withHeld = (refunds as (Record<string, unknown> & { amount: string; amount_received: string | null; refund_amount: string })[]).map(({ amount_received, refund_amount, ...r }) => ({
      ...r,
      held: fromPaise(heldPaise({ amount: r.amount, amount_received, refund_amount })),
    }));
    return { awaiting, stuck, refunds: withHeld };
  }

  // ───────────── gateway webhook (A17) ─────────────
  async webhook(driver: string, rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>): Promise<{ received: true }> {
    if (!rawBody) return { received: true };
    const gateway = await this.provider(driver);
    // An unknown driver in the URL is not a gateway we ever configured — nothing to verify against.
    if (driver !== gateway.name) return { received: true };
    const ok = gateway.verifyWebhook(rawBody, headers);
    if (!ok) {
      Log.warn('security.webhook_bad_signature', { driver });
      throw new AppError('VALIDATION_FAILED'); // 400 — signature mismatch is the one non-200
    }
    let evt;
    try {
      evt = gateway.parseWebhook(rawBody);
    } catch (e) {
      Log.warn('webhook.unparseable', { err: String(e) });
      return { received: true };
    }
    try {
      await this.db('webhook_events').insert({ provider: driver, event_id: evt.eventId.slice(0, 120), event_type: evt.type, payload: rawBody.toString('utf8').slice(0, 60000), signature_ok: 1 });
    } catch (e) {
      if (isDuplicateKey(e)) return { received: true }; // already processed — idempotent
      throw e;
    }
    try {
      if (evt.orderNumber && evt.type === 'captured') {
        const o = await this.db('orders').where({ order_number: evt.orderNumber }).first('id', 'status', 'payment_status', 'customer_id', 'grand_total', 'final_grand_total');
        if (o && o.payment_status !== 'PAID' && o.payment_status !== 'REFUND_PENDING' && o.payment_status !== 'REFUNDED') {
          const owed = o.final_grand_total ?? o.grand_total;
          // The gateway says how much it actually took; that is what the shop received.
          const received = evt.amountPaise !== null ? fromPaise(evt.amountPaise) : owed;
          /*
           * ⚠️ Money arriving for an order that is already dead.
           *
           * A customer can pay on Cashfree's page after the order was cancelled behind him (auto-
           * cancel for an unpaid order, the shop running out of stock). Marking that PAID left the
           * money with the shop on an order nobody was going to deliver, and nothing would ever
           * refund it. It goes into the refund queue instead, and the owner is told at once.
           */
          const dead = ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'DELIVERY_FAILED'].includes(String(o.status));
          await this.db('payments').where({ order_id: o.id }).update({ status: dead ? 'REFUND_PENDING' : 'PAID', paid_at: this.db.fn.now(), gateway_payment_id: evt.gatewayPaymentId, amount_received: received });
          await this.db('orders').where({ id: o.id }).update({ payment_status: dead ? 'REFUND_PENDING' : 'PAID' });
          if (dead) {
            await this.notify.sendToRole('ADMIN', { type: 'refund.pending', title: '⚠️ रिफंड बाकी', body: `${evt.orderNumber}: ऑनलाइन भुगतान ₹${received} रद्द ऑर्डर पर आया — रिफंड करें।`, linkUrl: '/admin/payments?tab=refunds', channels: ['IN_APP', 'PUSH'], dedupeKey: `refund:${evt.orderNumber}` });
          } else if (o.status === 'PENDING_PAYMENT') {
            await this.state.changeStatus(evt.orderNumber, 'CONFIRMED', SYSTEM_ACTOR, { note: 'gateway captured' }).catch((err) => Log.warn('webhook.confirm_failed', { err: String(err) }));
          }
        }
      } else if (evt.orderNumber && evt.type === 'failed') {
        await this.state.changeStatus(evt.orderNumber, 'PAYMENT_FAILED', SYSTEM_ACTOR, { note: 'gateway failed' }).catch((err) => Log.warn('webhook.fail_transition', { err: String(err) }));
      }
      await this.db('webhook_events').where({ provider: driver, event_id: evt.eventId.slice(0, 120) }).update({ processed_at: this.db.fn.now() });
    } catch (e) {
      await this.db('webhook_events').where({ provider: driver, event_id: evt.eventId.slice(0, 120) }).update({ error: String(e).slice(0, 500) });
      Log.error('webhook.process_failed', { err: String(e) });
    }
    return { received: true }; // always 200 so the gateway stops retrying
  }

  private async gatewayRefund(paymentId: number): Promise<void> {
    const pay = await this.db('payments').where({ id: paymentId }).first();
    if (!pay || pay.status !== 'REFUND_PENDING' || !pay.gateway_payment_id) return;
    const amount = heldPaise(pay);
    if (amount <= 0) return;
    const ref = await (await this.provider()).refund(pay.gateway_payment_id, amount);
    await this.db('payments').where({ id: paymentId }).update({ status: 'REFUNDED', refund_ref: ref, refunded_at: this.db.fn.now(), refund_amount: fromPaise(toPaise(pay.refund_amount) + amount) });
    await this.db('orders').where({ id: pay.order_id }).update({ payment_status: 'REFUNDED' });
  }

  async gatewayEnabled(): Promise<boolean> {
    return (await this.gatewayReady()).ready;
  }
}
