import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import type { CartItemView, CartView, CartWarningCode } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { AppError, notFound } from '../../common/errors';
import { fromPaise, mulQty, toPaise } from '../../common/utils/money';
import { CatalogService } from '../catalog/catalog.service';
import { unitLabel } from '../catalog/product-mapper';

export interface CartOwner {
  userId?: number;
  guestKey?: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validGuestKey(k: unknown): string | undefined {
  return typeof k === 'string' && UUID.test(k) ? k.toLowerCase() : undefined;
}

/**
 * A11 server-side cart (web + mobile share it). Every GET re-validates price/stock/availability/vertical.
 * schema.sql has no price-at-add column, so PRICE_CHANGED is computed against prices the client last
 * saw (optional `known` map) — see ASSUMPTIONS.
 */
@Injectable()
export class CartService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly catalog: CatalogService,
  ) {}

  private async cartId(owner: CartOwner, create: boolean, trx?: Knex.Transaction): Promise<number | null> {
    const conn = trx ?? this.db;
    const where = owner.userId
      ? { user_id: owner.userId }
      : owner.guestKey
        ? { guest_key: owner.guestKey }
        : null;
    if (!where) throw new AppError('UNAUTHENTICATED');
    const c = await conn('carts').where(where).first('id');
    if (c) return c.id as number;
    if (!create) return null;
    await conn.raw('INSERT IGNORE INTO carts (user_id, guest_key) VALUES (?, ?)', [
      owner.userId ?? null,
      owner.userId ? null : (owner.guestKey ?? null),
    ]);
    return ((await conn('carts').where(where).first('id')) as { id: number }).id;
  }

  async view(owner: CartOwner, known: Record<number, string> = {}): Promise<CartView> {
    const id = await this.cartId(owner, false);
    if (!id) return { items: [], itemsTotal: '0.00', itemCount: 0, needsPrescription: false, warnings: [] };
    const rows = (await this.db('cart_items')
      .where({ cart_id: id })
      .orderBy('id')
      .select('id', 'product_id', 'quantity', 'slot_date', 'slot_start')) as {
      id: number;
      product_id: number;
      quantity: number;
      slot_date: string | null;
      slot_start: string | null;
    }[];
    const products = await this.catalog.productsForOrder(rows.map((r) => r.product_id));
    const items: CartItemView[] = [];
    const warnings: CartView['warnings'] = [];
    let total = 0;
    let needsRx = false;
    for (const r of rows) {
      const p = products.get(r.product_id);
      if (!p) continue;
      const issues: CartWarningCode[] = [];
      const label = p.name_hi ?? p.name;
      if (!p.vertical_enabled) {
        issues.push('VERTICAL_OFF');
        warnings.push({ code: 'VERTICAL_OFF', productId: p.id, message: `${label} अभी उपलब्ध नहीं है` });
      } else if (!Number(p.is_available)) {
        issues.push('UNAVAILABLE');
        warnings.push({ code: 'UNAVAILABLE', productId: p.id, message: `${label} अभी उपलब्ध नहीं है` });
      } else if (p.item_type === 'PRODUCT' && p.stock_qty < r.quantity) {
        issues.push('STOCK_LOW');
        warnings.push({
          code: 'STOCK_LOW',
          productId: p.id,
          message: p.stock_qty > 0 ? `${label} का सिर्फ ${p.stock_qty} स्टॉक है` : `${label} का स्टॉक खत्म`,
        });
      }
      const seen = known[p.id];
      if (seen && /^\d+(\.\d{1,2})?$/.test(seen) && toPaise(seen) !== toPaise(p.price)) {
        issues.push('PRICE_CHANGED');
        warnings.push({
          code: 'PRICE_CHANGED',
          productId: p.id,
          message: `${label} का दाम ₹${Number(seen)} से ₹${Number(p.price)} हो गया`,
        });
      }
      const line = mulQty(toPaise(p.price), r.quantity);
      if (!issues.some((i) => i !== 'PRICE_CHANGED')) total += line;
      if (Number(p.prescription_required)) needsRx = true;
      items.push({
        id: r.id,
        productId: p.id,
        name: p.name,
        nameHi: p.name_hi,
        slug: p.slug,
        unit: unitLabel(p.unit, p.unit_value),
        image: p.image_url,
        icon: p.icon,
        family: p.family,
        maxQty: p.max_qty_per_order,
        price: p.price,
        quantity: r.quantity,
        lineTotal: fromPaise(line),
        itemType: p.item_type,
        slotDate: r.slot_date ? String(r.slot_date).slice(0, 10) : null,
        slotStart: r.slot_start,
        issues,
      });
    }
    return {
      items,
      itemsTotal: fromPaise(total),
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      needsPrescription: needsRx,
      warnings,
    };
  }

  async add(
    owner: CartOwner,
    b: { productId: number; quantity: number; slotDate?: string; slotStart?: string },
  ): Promise<CartView> {
    const p = (await this.catalog.productsForOrder([b.productId])).get(b.productId);
    if (!p || !p.vertical_enabled || !Number(p.is_available))
      throw new AppError('PRODUCT_UNAVAILABLE', { item: p ? (p.name_hi ?? p.name) : 'यह सामान' });
    if (b.quantity > p.max_qty_per_order)
      throw new AppError('QTY_LIMIT', { item: p.name_hi ?? p.name, n: p.max_qty_per_order });
    if (p.item_type === 'SERVICE' && (!b.slotDate || !b.slotStart)) throw new AppError('SLOT_UNAVAILABLE');
    const id = (await this.cartId(owner, true)) as number;
    await this.db.raw(
      `INSERT INTO cart_items (cart_id, product_id, quantity, slot_date, slot_start) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), slot_date = VALUES(slot_date), slot_start = VALUES(slot_start)`,
      [id, b.productId, b.quantity, b.slotDate ?? null, b.slotStart ?? null],
    );
    await this.db('carts').where({ id }).update({ updated_at: this.db.fn.now() });
    return this.view(owner);
  }

  async setQty(owner: CartOwner, itemId: number, quantity: number): Promise<CartView> {
    const id = await this.cartId(owner, false);
    if (!id) throw notFound();
    const item = await this.db('cart_items').where({ id: itemId, cart_id: id }).first('product_id');
    if (!item) throw notFound();
    if (quantity <= 0) await this.db('cart_items').where({ id: itemId }).delete();
    else {
      const p = (await this.catalog.productsForOrder([item.product_id])).get(item.product_id);
      if (p && quantity > p.max_qty_per_order)
        throw new AppError('QTY_LIMIT', { item: p.name_hi ?? p.name, n: p.max_qty_per_order });
      await this.db('cart_items').where({ id: itemId }).update({ quantity });
    }
    return this.view(owner);
  }

  async remove(owner: CartOwner, itemId: number): Promise<CartView> {
    const id = await this.cartId(owner, false);
    if (id) await this.db('cart_items').where({ id: itemId, cart_id: id }).delete();
    return this.view(owner);
  }

  async clear(owner: CartOwner, trx?: Knex.Transaction): Promise<void> {
    const id = await this.cartId(owner, false, trx);
    if (id) await (trx ?? this.db)('cart_items').where({ cart_id: id }).delete();
  }

  /** Right after login: fold the guest cart in (max quantity wins, capped), delete the guest cart. */
  async merge(userId: number, guestKey: string): Promise<CartView> {
    await this.db.transaction(async (trx) => {
      const guest = await trx('carts').where({ guest_key: guestKey }).forUpdate().first('id');
      if (!guest) return;
      const userCart = (await this.cartId({ userId }, true, trx)) as number;
      const items = (await trx('cart_items')
        .where({ cart_id: guest.id })
        .select('product_id', 'quantity', 'slot_date', 'slot_start')) as {
        product_id: number;
        quantity: number;
        slot_date: string | null;
        slot_start: string | null;
      }[];
      const products = await this.catalog.productsForOrder(
        items.map((i) => i.product_id),
        trx,
      );
      for (const it of items) {
        const cap = products.get(it.product_id)?.max_qty_per_order ?? 20;
        await trx.raw(
          `INSERT INTO cart_items (cart_id, product_id, quantity, slot_date, slot_start) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = LEAST(GREATEST(quantity, VALUES(quantity)), ?)`,
          [userCart, it.product_id, Math.min(it.quantity, cap), it.slot_date, it.slot_start, cap],
        );
      }
      await trx('carts').where({ id: guest.id }).delete();
    });
    return this.view({ userId });
  }

  /** Cron: carts idle for 7 days go (cart_items cascade). */
  async cleanup(): Promise<number> {
    return this.db('carts').where('updated_at', '<', this.db.raw('NOW() - INTERVAL 7 DAY')).delete();
  }
}
