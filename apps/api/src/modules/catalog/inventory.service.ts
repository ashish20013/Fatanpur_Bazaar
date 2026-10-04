import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { AppError, notFound } from '../../common/errors';
import { decrementUnsigned } from '../../common/utils/unsigned';

export type InventoryReason = 'ORDER' | 'CANCEL' | 'RESTOCK' | 'MANUAL' | 'CORRECTION' | 'ADJUSTMENT';

/**
 * Every stock movement goes through here → one inventory_logs row per change.
 * Callers pass the transaction; products are always locked in product_id ASC order (deadlock-safe).
 */
@Injectable()
export class InventoryService {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  /** A14 step 8 — locks rows (id ASC), verifies stock, decrements, bumps sold_count, logs. */
  async reserveForOrder(trx: Knex.Transaction, lines: { productId: number; quantity: number; itemType: 'PRODUCT' | 'SERVICE'; label: string }[], orderNumber: string, actorId: number): Promise<void> {
    const sorted = [...lines].sort((a, b) => a.productId - b.productId);
    for (const l of sorted) {
      const row = await trx('products').where({ id: l.productId }).forUpdate().first('stock_qty');
      if (!row) throw new AppError('PRODUCT_UNAVAILABLE', { item: l.label });
      if (l.itemType === 'SERVICE') {
        await trx('products').where({ id: l.productId }).increment('sold_count', l.quantity);
        continue; // services have no stock
      }
      const stock = Number(row.stock_qty);
      if (stock < l.quantity) throw new AppError('STOCK_INSUFFICIENT', { item: l.label, n: Math.max(0, stock) });
      await trx('products').where({ id: l.productId }).update({ stock_qty: trx.raw('stock_qty - ?', [l.quantity]), sold_count: trx.raw('sold_count + ?', [l.quantity]) });
      await trx('inventory_logs').insert({ product_id: l.productId, change_qty: -l.quantity, qty_after: stock - l.quantity, reason: 'ORDER', reference: orderNumber, actor_id: actorId });
    }
  }

  /** Put stock back + reduce sold_count with the UNSIGNED-safe pattern (A15 §11, A16). */
  async restock(trx: Knex.Transaction, productId: number, qty: number, reason: 'CANCEL' | 'ADJUSTMENT', reference: string, actorId: number | null): Promise<void> {
    if (qty <= 0) return;
    const row = await trx('products').where({ id: productId }).forUpdate().first('stock_qty');
    if (!row) return; // product deleted since — nothing to restock
    await trx('products').where({ id: productId }).increment('stock_qty', qty);
    await decrementUnsigned(trx, 'products', 'sold_count', qty, { id: productId });
    await trx('inventory_logs').insert({ product_id: productId, change_qty: qty, qty_after: Number(row.stock_qty) + qty, reason, reference, actor_id: actorId });
  }

  /** A cancelled booking un-counts the sale — services keep no stock, but sold_count ranks them. */
  async releaseService(trx: Knex.Transaction, productId: number, qty: number): Promise<void> {
    if (qty <= 0) return;
    await decrementUnsigned(trx, 'products', 'sold_count', qty, { id: productId });
  }

  /** Admin stock edit — absolute value or delta, always logged. */
  async setStock(productId: number, input: { set?: number; delta?: number; reason: 'RESTOCK' | 'MANUAL' | 'CORRECTION'; note?: string }, actorId: number): Promise<{ before: number; after: number }> {
    return this.db.transaction(async (trx) => {
      const row = await trx('products').where({ id: productId }).forUpdate().first('stock_qty');
      if (!row) throw notFound();
      const before = Number(row.stock_qty);
      const after = input.set !== undefined ? input.set : before + (input.delta ?? 0);
      if (after < 0) throw new AppError('BUSINESS_RULE', { reason: 'स्टॉक शून्य से कम नहीं हो सकता' });
      await trx('products').where({ id: productId }).update({ stock_qty: after });
      await trx('inventory_logs').insert({ product_id: productId, change_qty: after - before, qty_after: after, reason: input.reason, note: input.note?.slice(0, 255) ?? null, actor_id: actorId });
      return { before, after };
    });
  }

  async lowStock(limit = 100): Promise<unknown[]> {
    return this.db('products').where('item_type', 'PRODUCT').where('is_available', 1).whereRaw('stock_qty <= low_stock_at').orderBy('stock_qty').limit(limit).select('id', 'name', 'name_hi as nameHi', 'stock_qty as stockQty', 'low_stock_at as lowStockAt');
  }

  async logs(productId: number, limit = 50): Promise<unknown[]> {
    return this.db('inventory_logs').where({ product_id: productId }).orderBy('id', 'desc').limit(limit);
  }
}
