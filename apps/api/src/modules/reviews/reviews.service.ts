import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { AppError, conflict, isDuplicateKey, notFound } from '../../common/errors';
import { addRating, sanitizeComment } from '../../domain/ratings';
import { SettingsService } from '../settings/settings.service';

/** A23 — only buyers review, once per target per order, within 30 days of delivery. */
@Injectable()
export class ReviewsService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
  ) {}

  async create(userId: number, orderNumber: string, b: { targetType: 'ORDER' | 'PRODUCT' | 'RIDER'; targetId?: number; rating: number; comment?: string }): Promise<{ id: number; flagged: boolean }> {
    if (!(await this.settings.bool('reviews_enabled', true))) throw new AppError('BUSINESS_RULE', { reason: 'रिव्यू अभी बंद हैं' });
    const order = await this.db('orders').where({ order_number: orderNumber, customer_id: userId }).first('id', 'status', 'delivered_at', 'completed_at');
    if (!order) throw notFound();
    const doneAt = order.delivered_at ?? order.completed_at;
    if (!['DELIVERED', 'COMPLETED'].includes(order.status) || !doneAt || Date.now() - new Date(doneAt).getTime() > 30 * 86400_000) {
      throw new AppError('BUSINESS_RULE', { reason: 'डिलीवरी के 30 दिन के अंदर ही रिव्यू दे सकते हैं' });
    }
    let targetId = order.id as number;
    let productId: number | null = null;
    if (b.targetType === 'PRODUCT') {
      const item = await this.db('order_items').where({ order_id: order.id, product_id: b.targetId ?? 0, is_removed: 0 }).first('product_id');
      if (!item) throw notFound(); // only an item of THIS order
      targetId = item.product_id;
      productId = item.product_id;
    } else if (b.targetType === 'RIDER') {
      const a = await this.db('delivery_assignments').where({ order_id: order.id, rider_id: b.targetId ?? 0, status: 'DELIVERED' }).first('rider_id');
      if (!a) throw notFound(); // only the rider who delivered it
      targetId = a.rider_id;
    }
    const { comment, flagged } = sanitizeComment(b.comment);
    try {
      return await this.db.transaction(async (trx) => {
        const [id] = await trx('reviews').insert({ user_id: userId, order_id: order.id, target_type: b.targetType, target_id: targetId, product_id: productId, rating: b.rating, comment, is_flagged: flagged ? 1 : 0, is_approved: flagged ? 0 : 1 });
        if (!flagged) await this.bumpAggregate(trx, b.targetType, targetId, b.rating);
        return { id, flagged };
      });
    } catch (e) {
      if (isDuplicateKey(e)) throw conflict('आप इसका रिव्यू पहले दे चुके हैं');
      throw e;
    }
  }

  private async bumpAggregate(trx: Knex.Transaction, type: string, id: number, rating: number): Promise<void> {
    const table = type === 'PRODUCT' ? 'products' : type === 'RIDER' ? 'staff_profiles' : null;
    if (!table) return;
    const key = table === 'products' ? { id } : { user_id: id };
    const row = await trx(table).where(key).forUpdate().first('rating_avg', 'rating_count');
    if (!row) return;
    const next = addRating(Number(row.rating_avg), Number(row.rating_count), rating);
    await trx(table).where(key).update({ rating_avg: next.avg.toFixed(2), rating_count: next.count });
  }

  async forProduct(productId: number, limit = 10): Promise<unknown[]> {
    return this.db('reviews as r').join('users as u', 'u.id', 'r.user_id').where({ 'r.product_id': productId, 'r.is_approved': 1 }).orderBy('r.id', 'desc').limit(limit).select('r.rating', 'r.comment', 'r.created_at as createdAt', 'u.name');
  }

  /** Nightly ratings:recompute — hidden/flagged reviews corrected here. */
  async recomputeAll(): Promise<void> {
    await this.db.raw(`UPDATE products p LEFT JOIN (SELECT product_id, AVG(rating) a, COUNT(*) c FROM reviews WHERE target_type='PRODUCT' AND is_approved=1 GROUP BY product_id) r ON r.product_id = p.id SET p.rating_avg = COALESCE(ROUND(r.a, 2), 0), p.rating_count = COALESCE(r.c, 0)`);
    await this.db.raw(`UPDATE staff_profiles s LEFT JOIN (SELECT target_id, AVG(rating) a, COUNT(*) c FROM reviews WHERE target_type='RIDER' AND is_approved=1 GROUP BY target_id) r ON r.target_id = s.user_id SET s.rating_avg = COALESCE(ROUND(r.a, 2), 0), s.rating_count = COALESCE(r.c, 0)`);
  }

  async moderate(id: number, approve: boolean): Promise<void> {
    await this.db('reviews').where({ id }).update({ is_approved: approve ? 1 : 0, is_flagged: 0 });
  }
  async flaggedList(): Promise<unknown[]> {
    return this.db('reviews').where({ is_flagged: 1 }).orderBy('id', 'desc').limit(100);
  }
}
