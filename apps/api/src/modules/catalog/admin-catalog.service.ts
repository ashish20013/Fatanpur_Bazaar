import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { sanitizeHtml } from '../../common/utils/sanitize';
import { KNEX } from '../../database/knex.provider';
import { conflict, isDuplicateKey, notFound } from '../../common/errors';
import { slugify } from '../../common/utils/translit';
import { buildSearchText } from './search-text';
export { buildSearchText } from './search-text';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { CatalogService } from './catalog.service';
import { ImagesService } from './images.service';
import { InventoryService } from './inventory.service';

export interface ProductInput {
  categoryId: number;
  supplierId?: number | null;
  itemType: 'PRODUCT' | 'SERVICE';
  sku?: string | null;
  name: string;
  nameHi?: string | null;
  description?: string | null;
  brand?: string | null;
  unit: string;
  unitValue: number;
  mrp: string;
  price: string;
  costPrice?: string | null;
  stockQty?: number;
  lowStockAt?: number;
  isWeighted?: boolean;
  serviceDurationMin?: number | null;
  visitingCharge?: string | null;
  isQuoteBased?: boolean;
  serviceNote?: string | null;
  isAvailable?: boolean;
  prescriptionRequired?: boolean;
  isRegulated?: boolean;
  maxQtyPerOrder?: number;
  hsnCode?: string | null;
  taxRate?: string;
  keywords?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isFeatured?: boolean;
}


@Injectable()
export class AdminCatalogService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly audit: AuditService,
    private readonly catalog: CatalogService,
    private readonly images: ImagesService,
    private readonly inventory: InventoryService,
    private readonly notify: NotificationService,
  ) {}

  async list(q: { search?: string; categoryId?: number; lowStock?: boolean; page: number; perPage: number }): Promise<{ items: unknown[]; total: number }> {
    const base = this.db('products as p').join('categories as c', 'c.id', 'p.category_id').leftJoin('suppliers as s', 's.id', 'p.supplier_id');
    if (q.search) base.where((w) => w.where('p.name', 'like', `%${q.search}%`).orWhere('p.name_hi', 'like', `%${q.search}%`).orWhere('p.sku', q.search as string));
    if (q.categoryId) base.where('p.category_id', q.categoryId);
    if (q.lowStock) base.whereRaw('p.stock_qty <= p.low_stock_at').where('p.item_type', 'PRODUCT');
    const [{ total }] = (await base.clone().count({ total: 'p.id' })) as { total: number }[];
    const items = await base
      .clone()
      .orderBy('p.id', 'desc')
      .limit(q.perPage)
      .offset((q.page - 1) * q.perPage)
      .select('p.id', 'p.name', 'p.name_hi as nameHi', 'p.slug', 'p.sku', 'p.item_type as itemType', 'p.price', 'p.mrp', 'p.stock_qty as stockQty', 'p.low_stock_at as lowStockAt', 'p.is_available as isAvailable', 'p.is_featured as isFeatured', 'c.name_hi as category', 's.name as supplier')
      .select(this.db.raw('(SELECT url_sm FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS image'));
    return { items, total: Number(total) };
  }

  async get(id: number): Promise<unknown> {
    const p = await this.db('products').where({ id }).first();
    if (!p) throw notFound();
    const images = await this.db('product_images').where({ product_id: id }).orderBy('sort_order');
    const kw = await this.db('product_keywords').where({ product_id: id }).first('keywords');
    return { ...p, keywords: kw?.keywords ?? null, images };
  }

  private async saveKeywords(productId: number, keywords: string | null | undefined): Promise<void> {
    const k = (keywords ?? '').trim().slice(0, 500);
    if (!k) {
      await this.db('product_keywords').where({ product_id: productId }).del();
      return;
    }
    await this.db.raw('INSERT INTO product_keywords (product_id, keywords) VALUES (?, ?) ON DUPLICATE KEY UPDATE keywords = VALUES(keywords)', [productId, k]);
  }

  private async searchTextFor(input: ProductInput, trx: Knex | Knex.Transaction): Promise<string> {
    const cats = (await trx('categories as c').leftJoin('categories as pc', 'pc.id', 'c.parent_id').where('c.id', input.categoryId).first('c.name', 'c.name_hi', 'pc.name as pname', 'pc.name_hi as pname_hi')) as Record<string, string | null> | undefined;
    const nameWords = `${input.name} ${input.nameHi ?? ''}`.toLowerCase().split(/\s+/).filter(Boolean);
    const syn = (await trx('search_synonyms').where({ is_active: 1 }).select('term', 'maps_to')) as { term: string; maps_to: string }[];
    const hits = syn.filter((s) => s.maps_to.toLowerCase().split(/\s+/).some((w) => nameWords.includes(w)) || nameWords.includes(s.term.toLowerCase())).flatMap((s) => [s.term, s.maps_to]);
    return buildSearchText({ name: input.name, nameHi: input.nameHi, brand: input.brand, keywords: input.keywords, categoryNames: [cats?.name, cats?.name_hi, cats?.pname, cats?.pname_hi].filter((x): x is string => Boolean(x)), synonymHits: hits });
  }

  private row(input: ProductInput, searchText: string): Record<string, unknown> {
    return {
      category_id: input.categoryId,
      supplier_id: input.supplierId ?? null,
      item_type: input.itemType,
      sku: input.sku || null,
      name: input.name,
      name_hi: input.nameHi ?? null,
      // Rendered as HTML on the product page → allowlist-sanitised on the way IN (stored-XSS guard).
      description: input.description ? sanitizeHtml(input.description) : null,
      brand: input.brand ?? null,
      unit: input.unit,
      unit_value: input.unitValue,
      mrp: input.mrp,
      price: input.price,
      cost_price: input.costPrice ?? null,
      low_stock_at: input.lowStockAt ?? 5,
      is_weighted: input.isWeighted ? 1 : 0,
      service_duration_min: input.serviceDurationMin ?? null,
      visiting_charge: input.visitingCharge ?? null,
      is_quote_based: input.isQuoteBased ? 1 : 0,
      service_note: input.serviceNote ?? null,
      is_available: input.isAvailable === false ? 0 : 1,
      prescription_required: input.prescriptionRequired ? 1 : 0,
      is_regulated: input.isRegulated ? 1 : 0,
      max_qty_per_order: input.maxQtyPerOrder ?? 20,
      hsn_code: input.hsnCode ?? null,
      tax_rate: input.taxRate ?? '0.00',
      search_text: searchText,
      meta_title: input.metaTitle ?? null,
      meta_description: input.metaDescription ?? null,
      is_featured: input.isFeatured ? 1 : 0,
    };
  }

  async create(input: ProductInput, actor: AuthUser, ip: string): Promise<{ id: number; slug: string }> {
    const searchText = await this.searchTextFor(input, this.db);
    let slug = slugify(`${input.name} ${input.unitValue} ${input.unit}`);
    if (await this.db('products').where({ slug }).first('id')) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    try {
      const [id] = await this.db('products').insert({ ...this.row(input, searchText), slug, stock_qty: input.stockQty ?? 0, created_by: actor.id });
      await this.saveKeywords(id, input.keywords);
      if (input.stockQty) await this.db('inventory_logs').insert({ product_id: id, change_qty: input.stockQty, qty_after: input.stockQty, reason: 'RESTOCK', note: 'initial', actor_id: actor.id });
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'product.create', entityType: 'product', entityId: id, after: { name: input.name, price: input.price }, ip });
      this.catalog.invalidate();
      return { id, slug };
    } catch (e) {
      if (isDuplicateKey(e)) throw conflict('यह SKU पहले से मौजूद है');
      throw e;
    }
  }

  /** Price edits need products.price_change and are always audited (checked by the controller). */
  async update(id: number, input: ProductInput, actor: AuthUser, ip: string, canChangePrice: boolean): Promise<{ ok: true }> {
    const before = await this.db('products').where({ id }).first();
    if (!before) throw notFound();
    const priceChanged = before.price !== input.price || before.mrp !== input.mrp;
    if (priceChanged && !canChangePrice) throw conflict('दाम बदलने की अनुमति आपके पास नहीं है');
    const searchText = await this.searchTextFor(input, this.db);
    const patch = this.row(input, searchText);
    await this.db('products').where({ id }).update(patch);
    // Keep the admin's own keywords as typed so the next edit shows them again (search_text is derived).
    if (input.keywords !== undefined) await this.saveKeywords(id, input.keywords);
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: priceChanged ? 'product.price_change' : 'product.update', entityType: 'product', entityId: id, before: { price: before.price, mrp: before.mrp, is_available: before.is_available }, after: { price: input.price, mrp: input.mrp, is_available: patch.is_available }, ip });
    this.catalog.invalidate();
    return { ok: true };
  }

  async changePrice(id: number, price: string, mrp: string | undefined, actor: AuthUser, ip: string): Promise<{ ok: true }> {
    const before = await this.db('products').where({ id }).first('price', 'mrp');
    if (!before) throw notFound();
    await this.db('products').where({ id }).update({ price, ...(mrp ? { mrp } : {}) });
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'product.price_change', entityType: 'product', entityId: id, before, after: { price, mrp: mrp ?? before.mrp }, ip });
    this.catalog.invalidate();
    return { ok: true };
  }

  async changeStock(id: number, b: { set?: number; delta?: number; reason: 'RESTOCK' | 'MANUAL' | 'CORRECTION'; note?: string }, actor: AuthUser, ip: string): Promise<{ before: number; after: number }> {
    const r = await this.inventory.setStock(id, b, actor.id);
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'inventory.adjust', entityType: 'product', entityId: id, before: { stock: r.before }, after: { stock: r.after, reason: b.reason }, reason: b.note ?? null, ip });
    if (r.before <= 0 && r.after > 0) await this.notifyBackInStock(id);
    this.catalog.invalidate();
    return r;
  }

  private async notifyBackInStock(productId: number): Promise<void> {
    const p = await this.db('products').where({ id: productId }).first('name', 'name_hi', 'slug');
    const alerts = (await this.db('stock_alerts').where({ product_id: productId }).whereNull('notified_at').whereNotNull('user_id').select('id', 'user_id')) as { id: number; user_id: number }[];
    for (const a of alerts) {
      await this.notify.send({ userId: a.user_id, type: 'stock.back', title: 'सामान वापस आ गया', body: `${p.name_hi ?? p.name} अब उपलब्ध है — जल्दी मंगाएं।`, linkUrl: `/product/${p.slug}`, channels: ['IN_APP', 'PUSH'], dedupeKey: `stock:${productId}:${a.id}` });
    }
    await this.db('stock_alerts').where({ product_id: productId }).whereNull('notified_at').update({ notified_at: this.db.fn.now() });
  }

  async remove(id: number, actor: AuthUser, ip: string): Promise<{ ok: true }> {
    const p = await this.db('products').where({ id }).first('id', 'name');
    if (!p) throw notFound();
    const imgs = (await this.db('product_images').where({ product_id: id }).pluck('url')) as string[];
    await this.db('products').where({ id }).delete(); // order_items keep their snapshot (product_id → NULL)
    for (const u of imgs) await this.images.removeByUrl(u);
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'product.delete', entityType: 'product', entityId: id, before: p, ip });
    this.catalog.invalidate();
    return { ok: true };
  }

  async addImage(productId: number, buf: Buffer, alt: string | undefined): Promise<unknown> {
    const p = await this.db('products').where({ id: productId }).first('slug', 'name_hi', 'name');
    if (!p) throw notFound();
    const stored = await this.images.storeProductImage(buf, p.slug);
    const [{ n }] = (await this.db('product_images').where({ product_id: productId }).count({ n: '*' })) as { n: number }[];
    const [id] = await this.db('product_images').insert({ product_id: productId, url: stored.url, url_sm: stored.urlSm, width: stored.width, height: stored.height, alt: alt ?? p.name_hi ?? p.name, sort_order: Number(n) });
    this.catalog.invalidate();
    return { id, ...stored, files: undefined };
  }

  async removeImage(imageId: number): Promise<void> {
    const img = await this.db('product_images').where({ id: imageId }).first('url');
    if (!img) throw notFound();
    await this.db('product_images').where({ id: imageId }).delete();
    await this.images.removeByUrl(img.url);
    this.catalog.invalidate();
  }

  /**
   * A category's own photograph — what the rail and the section heading show once it exists.
   *
   * Squared like a product shot, because the rail medallion is a circle and a wide photo would
   * lose its subject to the crop. The drawn mark stays in the database untouched, so removing the
   * photo puts the drawing straight back rather than leaving a hole.
   */
  async setCategoryImage(categoryId: number, buf: Buffer, actor: AuthUser, ip: string): Promise<{ imageUrl: string }> {
    const c = await this.db('categories').where({ id: categoryId }).first('id', 'slug', 'image_url');
    if (!c) throw notFound();
    const stored = await this.images.storeProductImage(buf, `cat-${c.slug}`, 'categories');
    // Both sizes: the rail draws it at 70 px, the category page heading at 44 px. Serving the
    // 600 px file to a 70 px circle is most of a home page's weight on a 3G phone.
    await this.db('categories').where({ id: categoryId }).update({ image_url: stored.url, image_url_sm: stored.urlSm });
    if (c.image_url) await this.images.removeByUrl(c.image_url); // no orphan files on re-upload
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'category.image', entityType: 'category', entityId: categoryId, before: { image_url: c.image_url }, after: { image_url: stored.url }, ip });
    this.catalog.invalidate();
    return { imageUrl: stored.url };
  }

  async removeCategoryImage(categoryId: number, actor: AuthUser, ip: string): Promise<void> {
    const c = await this.db('categories').where({ id: categoryId }).first('id', 'image_url');
    if (!c) throw notFound();
    await this.db('categories').where({ id: categoryId }).update({ image_url: null, image_url_sm: null });
    if (c.image_url) await this.images.removeByUrl(c.image_url);
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'category.image_remove', entityType: 'category', entityId: categoryId, before: { image_url: c.image_url }, ip });
    this.catalog.invalidate();
  }

  // ── categories / suppliers / banners / synonyms (small CRUDs) ──
  async listCategories(): Promise<unknown[]> {
    return this.db('categories as c')
      .leftJoin('categories as pc', 'pc.id', 'c.parent_id')
      .orderByRaw('COALESCE(pc.sort_order, c.sort_order), COALESCE(pc.id, c.id), c.parent_id IS NOT NULL, c.sort_order, c.id')
      .select('c.*', 'pc.name as parent_name')
      .select(this.db.raw('(SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count'))
      .select(this.db.raw('(SELECT COUNT(*) FROM categories k WHERE k.parent_id = c.id) AS child_count'));
  }

  /**
   * "Remove" a category. Empty (no products, no sub-categories) → really deleted. Otherwise it is
   * switched OFF instead, so no product or order history is orphaned; the admin sees which happened.
   */
  async removeCategory(id: number, actor: AuthUser, ip: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    const c = await this.db('categories').where({ id }).first('id', 'name', 'slug', 'is_active');
    if (!c) throw notFound();
    const [{ n }] = (await this.db('products').where({ category_id: id }).count({ n: '*' })) as { n: number }[];
    const [{ k }] = (await this.db('categories').where({ parent_id: id }).count({ k: '*' })) as { k: number }[];
    const hard = Number(n) === 0 && Number(k) === 0;
    if (hard) await this.db('categories').where({ id }).delete();
    else await this.db('categories').where({ id }).update({ is_active: 0 });
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: hard ? 'category.delete' : 'category.deactivate', entityType: 'category', entityId: id, before: c, after: { products: Number(n), children: Number(k) }, ip });
    this.catalog.invalidate();
    return { deleted: hard, deactivated: !hard };
  }
  async saveCategory(id: number | null, b: { name: string; nameHi?: string; parentId?: number | null; vertical: string; itemType: 'PRODUCT' | 'SERVICE'; sortOrder?: number; isActive?: boolean; seoTitle?: string; seoDescription?: string; introHtml?: string; icon?: string }, actor: AuthUser, ip: string): Promise<{ id: number }> {
    if (id && b.parentId === id) throw conflict('श्रेणी अपनी ही उप-श्रेणी नहीं हो सकती', undefined, 'A category cannot be its own parent');
    const row = { name: b.name, name_hi: b.nameHi ?? null, parent_id: b.parentId ?? null, vertical: b.vertical, item_type: b.itemType, sort_order: b.sortOrder ?? 0, is_active: b.isActive === false ? 0 : 1, seo_title: b.seoTitle ?? null, seo_description: b.seoDescription ?? null, intro_html: b.introHtml ? sanitizeHtml(b.introHtml) : null, icon: b.icon ?? null };
    let rid = id;
    if (id) await this.db('categories').where({ id }).update(row);
    else {
      let slug = slugify(b.name) || `category-${Date.now().toString(36)}`;
      if (await this.db('categories').where({ slug }).first('id')) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      [rid] = await this.db('categories').insert({ ...row, slug });
    }
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: id ? 'category.update' : 'category.create', entityType: 'category', entityId: rid as number, after: row, ip });
    this.catalog.invalidate();
    return { id: rid as number };
  }
  async listSuppliers(): Promise<unknown[]> {
    return this.db('suppliers as s').leftJoin('villages as v', 'v.id', 's.village_id').orderBy('s.name').select('s.*', 'v.name_hi as villageName');
  }
  async saveSupplier(id: number | null, b: Record<string, unknown>, actor: AuthUser, ip: string): Promise<{ id: number }> {
    const row = {
      name: b.name, name_hi: b.nameHi ?? null, type: b.type ?? 'SHOP', contact_person: b.contactPerson ?? null, phone: b.phone ? `91${String(b.phone)}` : null,
      village_id: b.villageId ?? null, address_line: b.addressLine ?? null, gstin: b.gstin ?? null, fssai_license: b.fssaiLicense ?? null, fssai_expiry: b.fssaiExpiry ?? null,
      show_on_product: b.showOnProduct === false ? 0 : 1, is_active: b.isActive === false ? 0 : 1, notes: b.notes ?? null,
    };
    let rid = id;
    if (id) await this.db('suppliers').where({ id }).update(row);
    else [rid] = await this.db('suppliers').insert(row);
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: id ? 'supplier.update' : 'supplier.create', entityType: 'supplier', entityId: rid as number, after: row, ip });
    this.catalog.invalidate();
    return { id: rid as number };
  }
  async listSynonyms(): Promise<unknown[]> {
    return this.db('search_synonyms').orderBy('term');
  }
  async saveSynonym(term: string, mapsTo: string): Promise<void> {
    await this.db.raw('INSERT INTO search_synonyms (term, maps_to, is_active) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE maps_to = VALUES(maps_to), is_active = 1', [term.toLowerCase().trim(), mapsTo.trim()]);
    this.catalog.invalidate();
  }
  async removeBanner(id: number, actor: AuthUser, ip: string): Promise<void> {
    const b = await this.db('banners').where({ id }).first('id', 'title', 'image_url');
    if (!b) throw notFound();
    await this.db('banners').where({ id }).delete();
    if (b.image_url) await this.images.removeByUrl(b.image_url).catch(() => undefined);
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'banner.delete', entityType: 'banner', entityId: id, before: b, ip });
    this.catalog.invalidate();
  }
  async listBanners(): Promise<unknown[]> {
    return this.db('banners').orderBy('position').orderBy('sort_order');
  }
  async saveBanner(id: number | null, b: { title: string; subtitle?: string; linkUrl?: string; position?: string; sortOrder?: number; isActive?: boolean; startsAt?: string | null; endsAt?: string | null }, image: Buffer | null): Promise<{ id: number }> {
    const row: Record<string, unknown> = { title: b.title, subtitle: b.subtitle ?? null, link_url: b.linkUrl ?? null, position: b.position ?? 'HOME_TOP', sort_order: b.sortOrder ?? 0, is_active: b.isActive === false ? 0 : 1, starts_at: b.startsAt ?? null, ends_at: b.endsAt ?? null };
    if (image) row.image_url = (await this.images.storeProductImage(image, slugify(b.title) || 'banner', 'banners')).urlLg;
    let rid = id;
    if (id) await this.db('banners').where({ id }).update(row);
    else [rid] = await this.db('banners').insert(row);
    this.catalog.invalidate();
    return { id: rid as number };
  }
}
