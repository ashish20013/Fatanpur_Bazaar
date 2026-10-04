import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import {
  actorMayTransition,
  canTransition,
  NEGATIVE_TERMINAL_STATUSES,
  ORDER_STATUS_LABEL_HI,
  STATUS_TIMESTAMP_COLUMN,
  SUCCESS_STATUSES,
  type OrderStatus,
  type Permission,
  type Role,
} from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { AppError, CommitThenThrow, forbidden, notFound } from '../../common/errors';
import { Log } from '../../common/logger';
import { toPaise } from '../../common/utils/money';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../catalog/inventory.service';
import { WalletService } from '../wallet/wallet.service';
import { CouponsService } from '../coupons/coupons.service';
import { QueueService } from '../jobs/queue.service';
import { NotificationService } from '../notifications/notification.service';

export interface OrderRow {
  id: number;
  order_number: string;
  customer_id: number;
  order_type: 'DELIVERY' | 'SERVICE';
  status: OrderStatus;
  payment_method: 'COD' | 'UPI' | 'WALLET' | 'GATEWAY';
  payment_status: string;
  grand_total: string;
  final_grand_total: string | null;
  wallet_used: string;
  requires_prescription: number;
  prescription_status: string;
  ship_village: string | null;
  [k: string]: unknown;
}

export interface Actor {
  id: number | null; // null = SYSTEM (cron / webhook)
  kind: Role | 'SYSTEM';
  /** The owner. Only this account moves an order to any state without holding the permission. */
  isGlobalAdmin?: boolean;
  permissions: ReadonlySet<Permission>;
}
export const SYSTEM_ACTOR: Actor = { id: null, kind: 'SYSTEM', permissions: new Set() };

export interface TransitionExtra {
  otp?: string;
  note?: string;
  /** ADMIN override of the delivery OTP — reason is mandatory and audited. */
  overrideReason?: string;
  ip?: string;
}

export interface TransitionCtx {
  trx: Knex.Transaction;
  order: OrderRow;
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
  extra: TransitionExtra;
  /** Side effects that must run only after COMMIT (sockets, pushes). */
  afterCommit: (() => Promise<void> | void)[];
}

/**
 * Other modules plug into the state machine without the orders module importing them
 * (delivery: OTP gate + assignment settle; payments: refund/COD PAID; referral; tracking broadcast).
 */
export interface OrderLifecycleHook {
  name: string;
  /** Runs after the transition is authorised, before the status UPDATE — may throw to veto. */
  before?(ctx: TransitionCtx): Promise<void>;
  /** Runs after the status UPDATE, inside the same transaction. */
  after?(ctx: TransitionCtx): Promise<void>;
}

/** A15 — the one place an order's status ever changes. */
@Injectable()
export class OrderStateService {
  private readonly hooks: OrderLifecycleHook[] = [];

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly wallet: WalletService,
    private readonly coupons: CouponsService,
    private readonly queue: QueueService,
    private readonly notify: NotificationService,
  ) {}

  registerHook(h: OrderLifecycleHook): void {
    if (!this.hooks.some((x) => x.name === h.name)) this.hooks.push(h);
  }

  /** Public entry — own transaction. Use `changeStatusInTrx` when already inside one. */
  async changeStatus(orderNumber: string, to: OrderStatus, actor: Actor, extra: TransitionExtra = {}): Promise<{ orderNumber: string; status: OrderStatus }> {
    const afterCommit: TransitionCtx['afterCommit'] = [];
    let deferred: AppError | null = null;
    await this.db.transaction(async (trx) => {
      try {
        await this.changeStatusInTrx(trx, orderNumber, to, actor, extra, afterCommit);
      } catch (e) {
        // e.g. wrong delivery OTP: the attempt counter must be COMMITTED, then the 400 returned.
        if (e instanceof CommitThenThrow) {
          deferred = e.inner;
          return;
        }
        throw e;
      }
    });
    if (deferred) throw deferred;
    for (const fn of afterCommit) {
      try {
        await fn();
      } catch (err) {
        Log.error('order.after_commit_failed', { orderNumber, to, err: String(err) });
      }
    }
    return { orderNumber, status: to };
  }

  async changeStatusInTrx(trx: Knex.Transaction, orderNumber: string, to: OrderStatus, actor: Actor, extra: TransitionExtra, afterCommit: TransitionCtx['afterCommit']): Promise<void> {
    // 1. lock
    const order = (await trx('orders').where({ order_number: orderNumber }).forUpdate().first()) as OrderRow | undefined;
    if (!order) throw notFound();
    const from = order.status;
    // 2. state machine
    if (!canTransition(order.order_type, from, to)) {
      throw new AppError('INVALID_STATE_TRANSITION', { from: ORDER_STATUS_LABEL_HI[from], to: ORDER_STATUS_LABEL_HI[to] }, { data: { from, to } });
    }
    // 3. role / permission
    const decision = actorMayTransition({ kind: actor.kind, permissions: actor.permissions, isGlobalAdmin: actor.isGlobalAdmin }, from, to);
    if (!decision.allowed) throw forbidden();
    // 4. ownership (customer) — riders are checked by the delivery hook against their assignment
    if (actor.kind === 'CUSTOMER' && order.customer_id !== actor.id) throw notFound();

    const nonCod = order.payment_method !== 'COD';
    // 5. GATE-RX
    if (to === 'CONFIRMED' && Number(order.requires_prescription) === 1 && order.prescription_status !== 'APPROVED') {
      throw new AppError('PRESCRIPTION_PENDING');
    }
    // 6. GATE-PAY-CONFIRM: large prepaid orders need a verified payment before confirming
    if (to === 'CONFIRMED' && nonCod && ['PENDING', 'AWAITING_VERIFICATION'].includes(order.payment_status)) {
      const limit = await this.settings.money('upi_auto_accept_limit', 50000);
      if (toPaise(order.grand_total) > limit) throw new AppError('PAYMENT_NOT_VERIFIED');
    }
    // 7. GATE-PAY-PICKUP
    if (to === 'PICKED_UP' && nonCod && order.payment_status !== 'PAID' && (await this.settings.bool('prepaid_required_before_pickup', true))) {
      throw new AppError('PAYMENT_NOT_VERIFIED', {}, { data: { hint: 'भुगतान जाँचें या ऑर्डर को COD में बदलें' } });
    }

    const ctx: TransitionCtx = { trx, order, from, to, actor, extra, afterCommit };
    // 8. gates contributed by other modules (delivery OTP, service completion OTP …)
    for (const h of this.hooks) if (h.before) await h.before(ctx);

    // 9. status + timestamp
    const patch: Record<string, unknown> = { status: to };
    const tsCol = STATUS_TIMESTAMP_COLUMN[to];
    if (tsCol) patch[tsCol] = trx.fn.now();
    if (to === 'CANCELLED' || to === 'REJECTED') {
      patch.cancel_reason = extra.note?.slice(0, 255) ?? null;
      patch.cancelled_by = actor.kind;
    }
    await trx('orders').where({ id: order.id }).update(patch);
    // 10. log
    await trx('order_status_logs').insert({ order_id: order.id, from_status: from, to_status: to, changed_by: actor.id, actor_role: actor.kind, note: extra.note?.slice(0, 255) ?? null });

    // 11. negative terminal → restock, refunds, coupon back
    if ((NEGATIVE_TERMINAL_STATUSES as readonly OrderStatus[]).includes(to)) await this.unwind(ctx);
    // 12. success → phone becomes trusted; review request later
    if ((SUCCESS_STATUSES as readonly OrderStatus[]).includes(to)) {
      await trx('users').where({ id: order.customer_id, phone_verified: 0 }).update({ phone_verified: 1 });
      const delay = (await this.settings.int('review_request_delay_min', 30)) * 60;
      await this.queue.push('order.review_request', { orderNumber }, { trx, delaySec: delay, priority: 8 });
    }

    for (const h of this.hooks) if (h.after) await h.after(ctx);

    const manual = actor.kind !== 'SYSTEM' && actor.kind !== 'CUSTOMER' && actor.kind !== 'DELIVERY_BOY';
    if (manual || to === 'CANCELLED') {
      await this.audit.log({ actorId: actor.id, actorRole: actor.kind, action: to === 'CANCELLED' ? 'order.cancel' : 'order.status_change', entityType: 'order', entityId: orderNumber, before: { status: from }, after: { status: to }, reason: extra.overrideReason ?? extra.note ?? null, ip: extra.ip }, trx);
    }
    await this.notifyCustomer(ctx);
  }

  /** A15 §11 — everything a cancellation must give back, all inside the same transaction. */
  private async unwind(ctx: TransitionCtx): Promise<void> {
    const { trx, order } = ctx;
    const items = (await trx('order_items').where({ order_id: order.id, is_removed: 0 }).whereNotNull('product_id').select('product_id', 'quantity', 'final_quantity', 'item_type')) as { product_id: number; quantity: number; final_quantity: number | null; item_type: 'PRODUCT' | 'SERVICE' }[];
    for (const it of items.sort((a, b) => a.product_id - b.product_id)) {
      const qty = it.final_quantity ?? it.quantity;
      if (it.item_type === 'SERVICE') await this.inventory.releaseService(trx, it.product_id, qty);
      else await this.inventory.restock(trx, it.product_id, qty, 'CANCEL', order.order_number, ctx.actor.id);
    }
    const walletUsed = toPaise(order.wallet_used);
    if (walletUsed > 0) await this.wallet.credit(trx, order.customer_id, walletUsed, 'ORDER_REFUND', order.order_number, 'रद्द ऑर्डर का वॉलेट पैसा वापस');
    await this.coupons.rollback(trx, order.id);
    // payment refunds + assignment/tracking teardown are contributed by payments / delivery hooks
  }

  private async notifyCustomer(ctx: TransitionCtx): Promise<void> {
    const { order, to, trx } = ctx;
    const pushWorthy: OrderStatus[] = ['CONFIRMED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'SCHEDULED', 'DELIVERY_FAILED'];
    const body: Partial<Record<OrderStatus, string>> = {
      CONFIRMED: `आपका ऑर्डर ${order.order_number} पक्का हो गया है।`,
      PREPARING: 'आपका सामान तैयार हो रहा है।',
      PICKED_UP: 'आपका सामान रास्ते में है।',
      OUT_FOR_DELIVERY: 'डिलीवरी पार्टनर आपके पास आ रहा है।',
      DELIVERED: 'आपका ऑर्डर डिलीवर हो गया। धन्यवाद!',
      COMPLETED: 'आपका काम पूरा हो गया। धन्यवाद!',
      CANCELLED: `ऑर्डर ${order.order_number} रद्द हो गया।`,
      REJECTED: `माफ़ करें — ऑर्डर ${order.order_number} स्वीकार नहीं हो सका।`,
      SCHEDULED: 'आपकी सेवा का समय तय हो गया।',
      DELIVERY_FAILED: 'डिलीवरी नहीं हो पाई — हम आपसे संपर्क करेंगे।',
    };
    const text = body[to];
    if (!text) return;
    await this.notify.send(
      { userId: order.customer_id, type: `order.${to.toLowerCase()}`, title: ORDER_STATUS_LABEL_HI[to], body: text, linkUrl: `/mera/order/${order.order_number}`, channels: pushWorthy.includes(to) ? ['IN_APP', 'PUSH'] : ['IN_APP'], dedupeKey: `order:${order.order_number}:${to}` },
      trx,
    );
  }
}
