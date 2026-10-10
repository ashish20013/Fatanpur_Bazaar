import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import {
  VERTICAL_SLUG,
  type CategoryNode,
  type CategoryVertical,
  type HomeResponse,
  type HomeSection,
  type ProductCard,
  type ProductDetail,
  type RootCategory,
  type Vertical,
} from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { CACHE, type ICacheProvider } from '../../common/cache/cache.provider';
import { notFound } from '../../common/errors';
import { ENV, type Env } from '../../config/config.module';
import { ComplianceService } from './compliance.service';
import {
  CARD_COLUMNS,
  supplierNameCol,
  IMG_SUBQUERIES,
  cardBase,
  isSeedPlaceholder,
  toCard,
  unitLabel,
  discountPercent,
  type CardRow,
  trimTitle,
} from './product-mapper';

export interface ListFilters {
  vertical?: Vertical;
  categorySlug?: string;
  itemType?: 'PRODUCT' | 'SERVICE';
  sort?: SortKey;
  ids?: number[];
  excludeId?: number;
  includeOutOfStock?: boolean;
}

export type SortKey = 'popular' | 'price_asc' | 'price_desc' | 'new' | 'az' | 'az_en';
/**
 * Sort allowlist — dynamic ORDER BY never comes from user input directly (SECURITY_AUDIT §4):
 * the controller validates the key, the SQL is a constant. `az` = अ→ज्ञ on the Hindi name (owner's
 * "A to Z" listing), `az_en` = A→Z on the English name for the English toggle.
 */
export const SORTS: Record<SortKey, string> = {
  popular: 'p.is_featured DESC, p.sold_count DESC, p.id DESC',
  price_asc: 'p.price ASC, p.id DESC',
  price_desc: 'p.price DESC, p.id DESC',
  new: 'p.id DESC',
  az: 'COALESCE(p.name_hi, p.name) ASC, p.id ASC',
  az_en: 'p.name ASC, p.id ASC',
};

interface CategoryRow {
  id: number;
  parent_id: number | null;
  name: string;
  name_hi: string | null;
  slug: string;
  image_url: string | null;
  image_url_sm: string | null;
  icon: string | null;
  vertical: CategoryVertical;
  item_type: 'PRODUCT' | 'SERVICE';
}

/** Quote/cart view of a product (A11/A12) — includes the live vertical flag. */
export interface ProductForOrder {
  id: number;
  name: string;
  name_hi: string | null;
  slug: string;
  item_type: 'PRODUCT' | 'SERVICE';
  unit: string;
  unit_value: string;
  price: string;
  mrp: string;
  tax_rate: string;
  stock_qty: number;
  is_available: number;
  is_weighted: number;
  max_qty_per_order: number;
  prescription_required: number;
  visiting_charge: string;
  vertical: string;
  vertical_enabled: boolean;
  supplier_name: string | null;
  /** "<shop> से — हम सिर्फ़ पहुँचाने का काम करते हैं" (NULL when the supplier is hidden). */
  supplier_note: string | null;
  image_url: string | null;
  icon: string | null;
  family: string | null;
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(CACHE) private readonly cache: ICacheProvider,
    @Inject(ENV) private readonly env: Env,
    private readonly compliance: ComplianceService,
  ) {}

  /** A9 — the one listing builder. */
  async listProducts(
    f: ListFilters,
    page: number,
    perPage: number,
  ): Promise<{ items: ProductCard[]; total: number }> {
    const verticals = await this.compliance.sqlVerticals();
    const base = cardBase(this.db, verticals);
    if (!f.includeOutOfStock)
      base.where((q) => q.where('p.item_type', 'SERVICE').orWhere('p.stock_qty', '>', 0));
    if (f.vertical) base.where('c.vertical', f.vertical);
    if (f.itemType) base.where('p.item_type', f.itemType);
    if (f.ids) base.whereIn('p.id', f.ids.length ? f.ids : [0]);
    if (f.excludeId) base.whereNot('p.id', f.excludeId);
    if (f.categorySlug) {
      const cat = await this.db('categories').where({ slug: f.categorySlug, is_active: 1 }).first('id');
      if (!cat) return { items: [], total: 0 };
      // category + its direct children
      base.where((q) => q.where('c.id', cat.id).orWhere('c.parent_id', cat.id));
    }
    const [{ total }] = (await base.clone().count({ total: 'p.id' })) as { total: number }[];
    const q = base
      .clone()
      .select(CARD_COLUMNS)
      .select(supplierNameCol(this.db))
      .select(this.db.raw(IMG_SUBQUERIES.join(', ')));
    q.orderByRaw(SORTS[f.sort ?? 'popular']);
    const rows = (await q.limit(perPage).offset((page - 1) * perPage)) as CardRow[];
    return { items: rows.map(toCard), total: Number(total) };
  }

  async home(lang: 'hi' | 'en' = 'hi'): Promise<HomeResponse> {
    return this.cache.wrap(`catalog:home:${lang}`, 60_000, async () => {
      const [banners, verticals, featured, popular, categories, blocks] = await Promise.all([
        this.db('banners')
          .where({ is_active: 1, position: 'HOME_TOP' })
          .where((q) => q.whereNull('starts_at').orWhere('starts_at', '<=', this.db.fn.now()))
          .where((q) => q.whereNull('ends_at').orWhere('ends_at', '>=', this.db.fn.now()))
          .orderBy('sort_order')
          .limit(5)
          .select('id', 'title', 'image_url', 'link_url'),
        this.compliance.navItems(),
        this.listProducts({ sort: 'popular' }, 1, 12).then((r) => r.items.filter((_, i) => i < 8)),
        this.popularThisWeek(8),
        this.categoryTree(),
        // Each category shows ONE ROW on the home — 6 items fill one row at the widest breakpoint
        // (xl:grid-cols-6). The first five sections are server-rendered; the rest lazy-load their
        // own row as the shopper scrolls. Six items per section keeps the page well inside the
        // 50 KB 3G budget (§13) even with five sections baked in.
        this.homeSections(lang, 6, 6),
      ]);
      return {
        banners: (
          banners as { id: number; title: string; image_url: string | null; link_url: string | null }[]
        )
          .filter((b) => b.image_url)
          .map((b) => ({
            id: b.id,
            title: b.title,
            imageUrl: b.image_url as string,
            imageUrlSm: (b.image_url as string).replace(/-1280\.webp$/, '-640.webp'),
            linkUrl: b.link_url,
            // The 320×50 advertising strip, at the two widths the pipeline writes. Declared so the
            // slot can reserve its height before the picture arrives — a banner that pushes the
            // shop down the page as it loads is the most annoying kind of layout shift there is.
            width: 1280,
            height: 200,
          })),
        verticals,
        featured,
        popular,
        categories,
        roots: blocks.roots,
        sections: blocks.sections,
      };
    });
  }

  /**
   * Owner's home: every top-level category in his order, each with its first `perSection` items A→Z,
   * separated by a breaker line on the page. ONE windowed query (ROW_NUMBER per root — MySQL 8 and
   * MariaDB 10.2+ both have it); image subqueries run only for the rows that survive the window.
   */
  private async homeSections(lang: 'hi' | 'en', perSection: number, perSectionBelow = perSection): Promise<{ roots: RootCategory[]; sections: HomeSection[] }> {
    const verticals = await this.compliance.sqlVerticals();
    const cats = (await this.db('categories').where('is_active', 1).orderBy('sort_order').orderBy('id')
      .select('id', 'parent_id', 'name', 'name_hi', 'slug', 'image_url', 'image_url_sm', 'icon', 'vertical', 'item_type')) as CategoryRow[];
    const nameOrder = lang === 'en' ? 'p.name' : 'COALESCE(p.name_hi, p.name)';
    const inner = cardBase(this.db, verticals)
      .where((q) => q.where('p.item_type', 'SERVICE').orWhere('p.stock_qty', '>', 0))
      .select(CARD_COLUMNS)
      .select(supplierNameCol(this.db))
      .select(this.db.raw('COALESCE(p.icon, c.icon, pc.icon) AS cat_icon, COALESCE(pc.slug, c.slug) AS root_slug, COALESCE(pc.id, c.id) AS root_id'))
      .select(this.db.raw(`ROW_NUMBER() OVER (PARTITION BY COALESCE(pc.id, c.id) ORDER BY ${nameOrder}, p.id) AS rn`))
      .select(this.db.raw('COUNT(*) OVER (PARTITION BY COALESCE(pc.id, c.id)) AS root_total'));
    const rows = (await this.db
      .select('x.*')
      .select(this.db.raw('(SELECT url_sm FROM product_images pi WHERE pi.product_id = x.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS img_sm'))
      .select(this.db.raw('(SELECT url FROM product_images pi WHERE pi.product_id = x.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS img'))
      .from(inner.as('x'))
      .where('x.rn', '<=', perSection)
      .orderBy('x.root_id')
      .orderBy('x.rn')) as CardRow[];
    const byRoot = new Map<number, { items: ProductCard[]; total: number }>();
    for (const r of rows) {
      const k = Number(r.root_id);
      const g = byRoot.get(k) ?? { items: [], total: Number(r.root_total) };
      g.items.push(toCard(r));
      byRoot.set(k, g);
    }
    const showUpcoming = await this.compliance.showUpcoming();
    const roots: RootCategory[] = [];
    const sections: HomeSection[] = [];
    for (const c of cats.filter((x) => x.parent_id === null)) {
      const enabled = verticals.includes(c.vertical);
      const g = byRoot.get(c.id);
      const root: RootCategory = {
        id: c.id, name: c.name, nameHi: c.name_hi, slug: c.slug, image: c.image_url_sm ?? c.image_url, icon: c.icon, vertical: c.vertical,
        itemType: c.item_type, productCount: enabled ? (g?.total ?? 0) : 0, upcoming: !enabled,
      };
      if (enabled && g && g.total > 0) {
        roots.push(root);
        /*
         * Six items in every row.
         *
         * The grid is three columns on a phone and six on a wide screen, so six is the one count
         * that fills both — two complete rows of three, or one complete row of six. Four left two
         * empty columns on a desktop, which the owner rightly read as a shop that had run out.
         *
         * ⚠️ This costs page weight (see TEST_REPORT §10). What paid for it was taking the
         * discount ribbon and the struck-through MRP off every card, which the owner also asked
         * for — the two changes land within a kilobyte of each other.
         */
        const limit = sections.length === 0 ? perSection : perSectionBelow;
        sections.push({ category: root, items: g.items.slice(0, limit), total: g.total });
      } else if (!enabled && showUpcoming) {
        roots.push(root);
      }
    }
    return { roots, sections };
  }

  private async popularThisWeek(n: number): Promise<ProductCard[]> {
    const ids = (await this.db('order_items as oi')
      .join('orders as o', 'o.id', 'oi.order_id')
      .where('o.placed_at', '>', this.db.raw('NOW() - INTERVAL 7 DAY'))
      .whereNotNull('oi.product_id')
      .groupBy('oi.product_id')
      .orderByRaw('SUM(oi.quantity) DESC')
      .limit(n)
      .pluck('oi.product_id')) as number[];
    if (!ids.length) return (await this.listProducts({ sort: 'new' }, 1, n)).items;
    return (await this.listProducts({ ids }, 1, n)).items;
  }

  async categoryTree(): Promise<CategoryNode[]> {
    return this.cache.wrap('catalog:cats', 60_000, async () => {
      const verticals = await this.compliance.sqlVerticals();
      const rows = (await this.db('categories as c')
        .where('c.is_active', 1)
        .whereIn('c.vertical', verticals)
        .orderBy('c.sort_order')
        .orderBy('c.id')
        .select(
          'c.id',
          'c.parent_id',
          'c.name',
          'c.name_hi',
          'c.slug',
          'c.vertical',
          'c.item_type',
          'c.image_url',
          'c.icon',
        )
        .select(
          this.db.raw(
            '(SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_available = 1) AS product_count',
          ),
        )) as Record<string, unknown>[];
      const nodes = new Map<number, CategoryNode & { parentId: number | null }>();
      for (const r of rows) {
        nodes.set(Number(r.id), {
          id: Number(r.id),
          parentId: r.parent_id === null ? null : Number(r.parent_id),
          name: String(r.name),
          nameHi: (r.name_hi as string) ?? null,
          slug: String(r.slug),
          vertical: r.vertical as CategoryVertical,
          itemType: r.item_type as 'PRODUCT' | 'SERVICE',
          image: (r.image_url as string) ?? null,
          icon: (r.icon as string) ?? null,
          productCount: Number(r.product_count),
          children: [],
        });
      }
      const roots: CategoryNode[] = [];
      for (const n of nodes.values()) {
        const parent = n.parentId !== null ? nodes.get(n.parentId) : undefined;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { parentId: _unused, ...node } = n;

        // const parent = n.parentId !== null ? nodes.get(n.parentId) : undefined;
        // // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // const { parentId, ...node } = n;

        if (parent) parent.children.push(node);
        else roots.push(node);
      }
      return roots;
    });
  }

  async category(slug: string): Promise<{
    id: number;
    name: string;
    nameHi: string | null;
    slug: string;
    vertical: CategoryVertical;
    image: string | null;
    icon: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    introHtml: string | null;
    parent: { name: string; nameHi: string | null; slug: string } | null;
    children: { id: number; name: string; nameHi: string | null; slug: string; icon: string | null }[];
  }> {
    const c = await this.db('categories as c')
      .leftJoin('categories as pc', 'pc.id', 'c.parent_id')
      .where('c.slug', slug)
      .where('c.is_active', 1)
      .first(
        'c.id', 'c.name', 'c.name_hi', 'c.slug', 'c.vertical', 'c.image_url', 'c.image_url_sm', 'c.icon', 'c.seo_title', 'c.seo_description', 'c.intro_html',
        'pc.name as parent_name', 'pc.name_hi as parent_name_hi', 'pc.slug as parent_slug', 'pc.is_active as parent_active',
      );
    if (!c || !(await this.compliance.isEnabled(c.vertical))) throw notFound();
    // When a parent exists but is deactivated, treat the child as a root category
    // (matches categoryTree() which promotes orphaned children to root level).
    const parentActive = c.parent_slug ? !!Number(c.parent_active) : false;
    const verticals = await this.compliance.sqlVerticals();
    const children = (await this.db('categories').where({ parent_id: c.id, is_active: 1 }).whereIn('vertical', verticals)
      .orderBy('sort_order').orderBy('id').select('id', 'name', 'name_hi as nameHi', 'slug', 'icon')) as { id: number; name: string; nameHi: string | null; slug: string; icon: string | null }[];
    return {
      id: c.id,
      name: c.name,
      nameHi: c.name_hi,
      slug: c.slug,
      vertical: c.vertical,
      image: c.image_url_sm ?? c.image_url ?? null,
      icon: c.icon ?? null,
      seoTitle: c.seo_title,
      seoDescription: c.seo_description,
      introHtml: c.intro_html,
      parent: c.parent_slug && parentActive ? { name: c.parent_name, nameHi: c.parent_name_hi ?? null, slug: c.parent_slug } : null,
      children,
    };
  }

  /**
   * Product detail — stays 200 when out of stock (inStock:false) so Google doesn't churn the index;
   * 404 only when the product is gone or its vertical is switched off.
   */
  async detail(slug: string): Promise<ProductDetail> {
    const p = await this.db('products as p')
      .join('categories as c', 'c.id', 'p.category_id')
      .leftJoin('categories as pc', 'pc.id', 'c.parent_id')
      .leftJoin('suppliers as s', 's.id', 'p.supplier_id')
      .leftJoin('villages as sv', 'sv.id', 's.village_id')
      .where('p.slug', slug)
      .first(
        'p.*',
        'c.id as cat_id',
        'c.name as cat_name',
        'c.name_hi as cat_name_hi',
        'c.slug as cat_slug',
        'c.vertical',
        'c.is_active as cat_active',
        'c.icon as cat_icon',
        'pc.icon as parent_icon',
        'pc.name as root_name',
        'pc.name_hi as root_name_hi',
        'pc.slug as root_slug',
        'pc.is_active as root_active',
        this.db.raw('COALESCE(s.name_hi, s.name) AS supplier_name'),
        's.show_on_product',
        's.mediator_note as supplier_note',
        'sv.name_hi as supplier_village_hi',
        'sv.name as supplier_village',
      );
    if (!p || !Number(p.cat_active) || !(await this.compliance.isEnabled(p.vertical))) throw notFound();
    if (p.root_slug && !Number(p.root_active)) throw notFound();
    const allImages = (await this.db('product_images')
      .where({ product_id: p.id })
      .orderBy('sort_order')
      .orderBy('id')
      .select('url', 'url_sm', 'width', 'height', 'alt')) as {
      url: string;
      url_sm: string | null;
      width: number | null;
      height: number | null;
      alt: string | null;
    }[];
    // Seed placeholders are not photos — the web draws a label tile instead (see product-mapper).
    const images = allImages.filter((i) => !isSeedPlaceholder(i.url));
    const related = await this.listProducts({ categorySlug: p.cat_slug, excludeId: p.id }, 1, 6);
    const inStock = Number(p.is_available) === 1 && (p.item_type === 'SERVICE' || Number(p.stock_qty) > 0);
    void this.db('products')
      .where({ id: p.id })
      .increment('view_count', 1)
      .catch(() => undefined);
    const nameHi = p.name_hi as string | null;
    return {
      id: p.id,
      name: p.name,
      nameHi,
      slug: p.slug,
      itemType: p.item_type,
      unit: unitLabel(p.unit, p.unit_value),
      unitValue: String(p.unit_value),
      price: p.price,
      mrp: p.mrp,
      discountPercent: discountPercent(p.mrp, p.price),
      inStock,
      prescriptionRequired: Number(p.prescription_required) === 1,
      image: images[0]
        ? {
            url: images[0].url,
            urlSm: images[0].url_sm ?? images[0].url,
            width: images[0].width ?? 600,
            height: images[0].height ?? 600,
            alt: images[0].alt ?? nameHi ?? p.name,
          }
        : null,
      supplierName: Number(p.show_on_product) === 1 ? p.supplier_name : null,
      // Same gate as the name: a hidden supplier must not leak through its mediator note.
      supplierNote: Number(p.show_on_product) === 1 ? (p.supplier_note ?? null) : null,
      rating: { avg: String(p.rating_avg), count: Number(p.rating_count) },
      description: p.description,
      descriptionHi: null,
      stockQty: Math.max(0, Number(p.stock_qty)),
      maxQtyPerOrder: Number(p.max_qty_per_order),
      isWeighted: Number(p.is_weighted) === 1,
      brand: p.brand,
      images: images.map((i) => ({
        url: i.url,
        urlSm: i.url_sm ?? i.url,
        width: i.width ?? 600,
        height: i.height ?? 600,
        alt: i.alt ?? nameHi ?? p.name,
      })),
      category: {
        id: p.cat_id,
        name: p.cat_name,
        nameHi: p.cat_name_hi,
        slug: p.cat_slug,
        vertical: p.vertical,
      },
      root: p.root_slug ? { name: p.root_name, nameHi: p.root_name_hi ?? null, slug: p.root_slug } : null,
      icon: p.icon ?? p.cat_icon ?? p.parent_icon ?? null,
      family: p.root_slug ?? p.cat_slug,
      supplier:
        Number(p.show_on_product) === 1 && p.supplier_name
          ? { name: p.supplier_name, village: p.supplier_village_hi ?? p.supplier_village ?? null }
          : null,
      visitingCharge: p.visiting_charge ?? '0.00',
      // How the service actually runs (video-call flow, vet visit, vehicle hire) — the customer
      // must read this before booking, so it is part of the detail payload.
      serviceNote: (p.service_note as string | null) ?? null,
      serviceDurationMin: p.service_duration_min,
      isQuoteBased: Number(p.is_quote_based) === 1,
      related: related.items.slice(0, inStock ? 6 : 3),
      seo: {
        title: (p.meta_title as string | null) ?? trimTitle(`${nameHi ?? p.name}${nameHi ? ` (${String(p.name).replace(/\s*\([^)]*\)/g, '').trim()})` : ''}`),
        description:
          (p.meta_description as string | null) ??
          `${nameHi ?? p.name} ₹${p.price} — ${unitLabel(p.unit, p.unit_value)}. फतनपुर बाज़ार से घर बैठे मंगाएं, रानीगंज व आसपास 6 किमी तक डिलीवरी।`.slice(
            0,
            160,
          ),
        canonical: `${this.env.APP_URL}/product/${p.slug}`,
      },
    };
  }

  /** Cart / quote loader — ONE IN query for all lines (never a query per item). */
  async productsForOrder(ids: number[], trx?: Knex.Transaction): Promise<Map<number, ProductForOrder>> {
    if (!ids.length) return new Map();
    const verticals = await this.compliance.sqlVerticals();
    const rows = (await (trx ?? this.db)('products as p')
      .join('categories as c', 'c.id', 'p.category_id')
      .leftJoin('categories as pc', 'pc.id', 'c.parent_id')
      .leftJoin('suppliers as s', 's.id', 'p.supplier_id')
      .whereIn('p.id', ids)
      .select(
        'p.id',
        'p.name',
        'p.name_hi',
        'p.slug',
        'p.item_type',
        'p.unit',
        'p.unit_value',
        'p.price',
        'p.mrp',
        'p.tax_rate',
        'p.stock_qty',
        'p.is_available',
        'p.is_weighted',
        'p.max_qty_per_order',
        'p.prescription_required',
        'p.visiting_charge',
        'c.vertical',
        'c.is_active as cat_active',
        this.db.raw('COALESCE(s.name_hi, s.name) AS supplier_name'),
      )
      .select(this.db.raw('CASE WHEN s.show_on_product = 1 THEN s.mediator_note END AS supplier_note'))
      .select(this.db.raw('COALESCE(p.icon, c.icon, pc.icon) AS icon, COALESCE(pc.slug, c.slug) AS family, (pc.id IS NULL OR pc.is_active = 1) AS parent_ok'))
      .select(
        this.db.raw(
          '(SELECT url_sm FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS image_url',
        ),
      )) as (ProductForOrder & { cat_active: number })[];
    return new Map(
      rows.map((r) => [
        r.id,
        {
          ...r,
          visiting_charge: r.visiting_charge ?? '0.00',
          // seed placeholders are not photos (the web draws a label tile)
          image_url: isSeedPlaceholder(r.image_url) ? null : r.image_url,
          vertical_enabled: verticals.includes(r.vertical) && Number(r.cat_active) === 1 && Number((r as { parent_ok?: number }).parent_ok ?? 1) === 1,
        },
      ]),
    );
  }

  async services(
    categorySlug: string | undefined,
    page: number,
    perPage: number,
  ): Promise<{ items: ProductCard[]; total: number }> {
    return this.listProducts({ itemType: 'SERVICE', categorySlug }, page, perPage);
  }

  /** Sitemap feed — only enabled verticals (kill-switch applies to the sitemap too). */
  async sitemapEntries(): Promise<{
    products: { slug: string; updatedAt: string; itemType: string }[];
    categories: { slug: string; updatedAt: string }[];
    verticals: string[];
  }> {
    const verticals = await this.compliance.sqlVerticals();
    const [products, categories] = await Promise.all([
      this.db('products as p')
        .join('categories as c', 'c.id', 'p.category_id')
        .leftJoin('categories as pc', 'pc.id', 'c.parent_id')
        .whereIn('c.vertical', verticals)
        .where('c.is_active', 1)
        .where((q) => q.whereNull('pc.id').orWhere('pc.is_active', 1))
        .where('p.is_available', 1)
        .select('p.slug', 'p.updated_at as updatedAt', 'p.item_type as itemType')
        .limit(5000),
      this.db('categories as c')
        .leftJoin('categories as pc', 'pc.id', 'c.parent_id')
        .whereIn('c.vertical', verticals)
        .where('c.is_active', 1)
        .where((q) => q.whereNull('pc.id').orWhere('pc.is_active', 1))
        .select('c.slug', 'c.updated_at as updatedAt'),
    ]);
    return {
      products,
      categories,
      verticals: (await this.compliance.enabledVerticals()).map((v) => VERTICAL_SLUG[v]),
    };
  }

  invalidate(): void {
    this.cache.delPrefix('catalog:');
  }
}
