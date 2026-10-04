import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { AppError, conflict, isDuplicateKey, notFound } from '../../common/errors';
import { decrementUnsigned } from '../../common/utils/unsigned';
import { fromPaise, type Paise } from '../../common/utils/money';
import { evaluateCoupon, normalizeCouponCode, type CouponResult, type CouponRow } from '../../domain/coupon';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../audit/audit.service';

/** A13 coupons — evaluation (pure domain) + usage bookkeeping inside the order transaction. */
@Injectable()
export class CouponsService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly audit: AuditService,
  ) {}

  async evaluate(code: string, ctx: { userId: number; itemsTotal: Paise; orderType: 'DELIVERY' | 'SERVICE' }, trx?: Knex.Transaction): Promise<CouponResult> {
    const conn = trx ?? this.db;
    const c = (await conn('coupons').where({ code: normalizeCouponCode(code) }).first()) as CouponRow | undefined;
    const [{ used }] = c ? ((await conn('coupon_usages').where({ coupon_id: c.id, user_id: ctx.userId }).count({ used: '*' })) as { used: number }[]) : [{ used: 0 }];
    const [{ orders }] = (await conn('orders').where({ customer_id: ctx.userId }).whereNotIn('status', ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED']).count({ orders: '*' })) as { orders: number }[];
    return evaluateCoupon(c, { itemsTotal: ctx.itemsTotal, orderType: ctx.orderType, isFirstOrder: Number(orders) === 0, userUsageCount: Number(used), now: new Date() });
  }

  /** A14 step 15 — atomic: usage row + used_count (locks the coupon row to respect usage_limit). */
  async recordUsage(trx: Knex.Transaction, couponId: number, userId: number, orderId: number, discount: Paise): Promise<void> {
    const c = await trx('coupons').where({ id: couponId }).forUpdate().first('usage_limit', 'used_count');
    if (c.usage_limit !== null && Number(c.used_count) >= Number(c.usage_limit)) throw new AppError('COUPON_INVALID', { reason: 'कूपन खत्म हो गया' });
    await trx('coupon_usages').insert({ coupon_id: couponId, user_id: userId, order_id: orderId, discount_amount: fromPaise(discount) });
    await trx('coupons').where({ id: couponId }).increment('used_count', 1);
  }

  /** A15 §11 — cancellation gives the coupon back (UNSIGNED-safe decrement). */
  async rollback(trx: Knex.Transaction, orderId: number): Promise<void> {
    const u = await trx('coupon_usages').where({ order_id: orderId }).first('id', 'coupon_id');
    if (!u) return;
    await trx('coupon_usages').where({ id: u.id }).delete();
    await decrementUnsigned(trx, 'coupons', 'used_count', 1, { id: u.coupon_id });
  }

  async list(): Promise<unknown[]> {
    return this.db('coupons').orderBy('id', 'desc');
  }

  async save(id: number | null, b: { code: string; title?: string; description?: string; discountType: 'FLAT' | 'PERCENT'; discountValue: string; maxDiscount?: string | null; minOrderValue?: string; usageLimit?: number | null; perUserLimit?: number; firstOrderOnly?: boolean; appliesTo?: 'ALL' | 'PRODUCT' | 'SERVICE'; startsAt: string; expiresAt: string; isActive?: boolean }, actor: AuthUser, ip: string): Promise<{ id: number }> {
    const row = {
      code: normalizeCouponCode(b.code), title: b.title ?? null, description: b.description ?? null, discount_type: b.discountType, discount_value: b.discountValue,
      max_discount: b.maxDiscount ?? null, min_order_value: b.minOrderValue ?? '0.00', usage_limit: b.usageLimit ?? null, per_user_limit: b.perUserLimit ?? 1,
      first_order_only: b.firstOrderOnly ? 1 : 0, applies_to: b.appliesTo ?? 'ALL', starts_at: b.startsAt, expires_at: b.expiresAt, is_active: b.isActive === false ? 0 : 1,
    };
    try {
      let rid = id;
      if (id) {
        const n = await this.db('coupons').where({ id }).update(row);
        if (!n) throw notFound();
      } else [rid] = await this.db('coupons').insert({ ...row, created_by: actor.id });
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: id ? 'coupon.update' : 'coupon.create', entityType: 'coupon', entityId: rid as number, after: row, ip });
      return { id: rid as number };
    } catch (e) {
      if (isDuplicateKey(e)) throw conflict('यह कूपन कोड पहले से है');
      throw e;
    }
  }
}
