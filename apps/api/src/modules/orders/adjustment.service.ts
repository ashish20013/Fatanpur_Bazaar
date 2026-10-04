import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { AppError, notFound } from '../../common/errors';
import { formatInr, fromPaise, toPaise } from '../../common/utils/money';
import { adjustedSettlement, couponDiscountOn, applyAdjustment, AdjustError, type AdjustChange } from '../../domain/adjustment';
import { excessPaise } from '../../domain/payment-money';
import type { AuthUser } from '../../common/types';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../catalog/inventory.service';

import { WalletService } from '../wallet/wallet.service';
import { NotificationService } from '../notifications/notification.service';
import { OrderStateService } from './order-state.service';

/** A16 — weighing / out-of-stock adjustments. Totals only ever go DOWN. */
@Injectable()
export class AdjustmentService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly wallet: WalletService,
    private readonly notify: NotificationService,
    private readonly state: OrderStateService,
  ) {}

  async adjust(
    orderNumber: string,
    changes: (AdjustChange & { note?: string })[],
    actor: AuthUser,
    ip: string,
  ): Promise<unknown> {
    if (!(await this.settings.bool('order_adjust_enabled', true)))
      throw new AppError('BUSINESS_RULE', { reason: 'ऑर्डर बदलाव अभी बंद है' });
    let cancelAll = false;
    const result = await this.db.transaction(async (trx) => {
      const order = await trx('orders').where({ order_number: orderNumber }).forUpdate().first();
      if (!order) throw notFound();
      if (!['CONFIRMED', 'PREPARING'].includes(order.status))
        throw new AppError('BUSINESS_RULE', {
          reason: 'सिर्फ पक्के या तैयार हो रहे ऑर्डर में बदलाव हो सकता है',
        });
      const items = (await trx('order_items as oi')
        .leftJoin('products as p', 'p.id', 'oi.product_id')
        .where('oi.order_id', order.id)
        .select('oi.*', 'p.is_weighted')) as Record<string, unknown>[];
      let r;
      try {
        r = applyAdjustment(
          items.map((i) => ({
            itemId: Number(i.id),
            quantity: Number(i.quantity),
            unitPrice: toPaise(i.unit_price as string),
            lineTotal: toPaise(i.line_total as string),
            isWeighted: Number(i.is_weighted) === 1,
            alreadyRemoved: Number(i.is_removed) === 1,
            currentFinalQty: i.final_quantity === null ? null : Number(i.final_quantity),
            currentFinalLineTotal: i.final_line_total === null ? null : toPaise(i.final_line_total as string),
          })),
          changes,
        );
      } catch (e) {
        if (e instanceof AdjustError) throw new AppError('BUSINESS_RULE', { reason: e.reason });
        throw e;
      }
      if (r.allRemoved) {
        cancelAll = true; // everything gone → full cancel (A15), not an adjustment
        return null;
      }
      const notes: string[] = [];
      for (const l of r.lines) {
        const it = items.find((i) => Number(i.id) === l.itemId) as Record<string, unknown>;
        const note = changes.find((c) => c.itemId === l.itemId)?.note ?? null;
        await trx('order_items')
          .where({ id: l.itemId })
          .update({
            final_quantity: l.finalQuantity,
            final_line_total: fromPaise(l.finalLineTotal),
            is_removed: l.removed ? 1 : 0,
            adjust_note: note?.slice(0, 160) ?? null,
          });
        if (it.product_id && it.item_type === 'PRODUCT' && l.returnedQty > 0)
          await this.inventory.restock(
            trx,
            Number(it.product_id),
            l.returnedQty,
            'ADJUSTMENT',
            orderNumber,
            actor.id,
          );
        const name = (it.product_name_hi as string) ?? String(it.product_name);
        notes.push(
          l.removed ? `${name} उपलब्ध नहीं था` : note ? `${name}: ${note}` : `${name} की मात्रा/रकम बदली`,
        );
      }
      // Coupon re-worked on the new total with the same rule placement used: below its minimum →
      // 0 (customer is told); a PERCENT coupon shrinks with the order instead of keeping the old
      // rupee amount. Never MORE than the discount he was originally given.
      let discountAfter = toPaise(order.discount);
      if (order.coupon_id && discountAfter > 0) {
        const c = await trx('coupons').where({ id: order.coupon_id }).first('discount_type', 'discount_value', 'max_discount', 'min_order_value');
        if (c) {
          const recomputed = couponDiscountOn(r.newItemsTotal, c);
          if (recomputed === 0) notes.push('नया कुल कूपन की न्यूनतम राशि से कम है — कूपन छूट हटाई गई');
          discountAfter = Math.min(discountAfter, recomputed);
        }
      }
      discountAfter = Math.min(discountAfter, r.newItemsTotal);
      // Delivery fee stays exactly as ordered (never increased) — deliberate, in the customer's favour.
      const settle = adjustedSettlement({
        newItemsTotal: r.newItemsTotal,
        deliveryFee: order.delivery_fee,
        visitingCharge: order.visiting_charge,
        discountAfter,
        walletUsed: order.wallet_used,
      });
      const newGrand = settle.grand;
      const oldGrand = toPaise(order.final_grand_total ?? order.grand_total);
      await trx('orders')
        .where({ id: order.id })
        .update({
          final_items_total: fromPaise(r.newItemsTotal),
          final_grand_total: fromPaise(newGrand),
          discount: fromPaise(discountAfter),
          // The wallet only covers what the smaller order costs; the rest goes back just below.
          wallet_used: fromPaise(settle.walletUsedAfter),
          adjusted_at: trx.fn.now(),
          adjusted_by: actor.id,
          adjustment_note: notes.join('; ').slice(0, 300),
        });
      // Wallet money the smaller order no longer needs.
      if (settle.walletBack > 0) {
        await this.wallet.credit(trx, order.customer_id, settle.walletBack, 'ORDER_REFUND', orderNumber, 'ऑर्डर बदलाव — वॉलेट की रकम वापस');
        notes.push(`वॉलेट में ₹${fromPaise(settle.walletBack)} वापस`);
      }
      const pay = await trx('payments').where({ order_id: order.id }).forUpdate().first();
      await trx('payments').where({ order_id: order.id }).update({ amount_final: fromPaise(newGrand) });
      /*
       * Paid already → the over-payment goes back now (wallet: instant, dispute-free).
       *
       * Worked out from what the shop HOLDS, not from old-owed minus new-owed. They agree on a
       * single adjustment, but the second one disagrees with the first, and a later cancellation
       * reads the same `refund_amount` — so both have to come from the one formula. A UPI payment
       * still AWAITING_VERIFICATION is settled by verify() instead, once the money is confirmed.
       */
      if (pay && pay.status === 'PAID') {
        const over = excessPaise(pay, newGrand);
        if (over > 0) {
          await this.wallet.credit(trx, order.customer_id, over, 'ORDER_REFUND', orderNumber, 'ऑर्डर बदलाव का अंतर वापस');
          await trx('payments').where({ order_id: order.id }).update({ refund_amount: fromPaise(toPaise(pay.refund_amount) + over) });
        }
      }
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'order.adjust',
          entityType: 'order',
          entityId: orderNumber,
          before: { grand: fromPaise(oldGrand) },
          after: { grand: fromPaise(newGrand), changes },
          ip,
        },
        trx,
      );
      const window = await this.settings.int('adjust_cancel_window_min', 5);
      await this.notify.send(
        {
          userId: order.customer_id,
          type: 'order.adjusted',
          title: 'आपके ऑर्डर में बदलाव',
          body: `${notes.join('। ')}। नया कुल ${formatInr(newGrand)} (पहले ${formatInr(oldGrand)})। मंज़ूर न हो तो ${window} मिनट में रद्द कर सकते हैं।`,
          linkUrl: `/mera/order/${orderNumber}`,
          channels: ['IN_APP', 'PUSH'],
        },
        trx,
      );
      return { orderNumber, finalGrandTotal: fromPaise(newGrand), previous: fromPaise(oldGrand), notes };
    });
    if (cancelAll) {
      await this.state.changeStatus(
        orderNumber,
        'CANCELLED',
        { id: actor.id, kind: actor.role, permissions: actor.permissions, isGlobalAdmin: actor.isGlobalAdmin },
        { note: 'सभी आइटम उपलब्ध नहीं थे', ip },
      );
      return { orderNumber, cancelled: true };
    }
    return result;
  }
}
