import type { Knex } from 'knex';
import type { ProductCard, ProductImage } from '@fb/shared-types';
import { toPaise } from '../../common/utils/money';

/** Columns every listing selects (A9) — one builder so no page grows its own N+1 variant. */
export const CARD_COLUMNS = [
  'p.id', 'p.name', 'p.name_hi', 'p.slug', 'p.item_type', 'p.unit', 'p.unit_value', 'p.mrp', 'p.price',
  'p.stock_qty', 'p.is_available', 'p.prescription_required', 'p.rating_avg', 'p.rating_count',
  's.show_on_product', 's.mediator_note as supplier_note',
];
/** The customer site is Hindi-first, so the shop's Hindi name wins when it has one. */
export const supplierNameCol = (db: Knex): Knex.Raw => db.raw('COALESCE(s.name_hi, s.name) AS supplier_name');
/**
 * First image via correlated subquery (single round-trip, no N+1), plus the icon and the
 * ROOT category slug (tile colour family) from the `pc` parent join that `cardBase` adds.
 * The product's own icon wins over its category's — one icon per category cannot tell a diya from
 * a rocket, or a tablet from a test kit.
 */
export const IMG_SUBQUERIES = [
  '(SELECT url_sm FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS img_sm',
  '(SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS img',
  'COALESCE(p.icon, c.icon, pc.icon) AS cat_icon',
  'COALESCE(pc.slug, c.slug) AS root_slug',
];

/**
 * The shared FROM/JOIN/WHERE of every product listing: available product, active category whose
 * parent (if any) is active too, and a vertical that Compliance allows. Callers add filters + sort.
 */
export function cardBase(db: Knex, verticals: readonly string[]): Knex.QueryBuilder {
  return db('products as p')
    .join('categories as c', 'c.id', 'p.category_id')
    .leftJoin('categories as pc', 'pc.id', 'c.parent_id')
    .leftJoin('suppliers as s', 's.id', 'p.supplier_id')
    .where('p.is_available', 1)
    .where('c.is_active', 1)
    .where((q) => q.whereNull('pc.id').orWhere('pc.is_active', 1))
    .whereIn('c.vertical', verticals as string[]);
}

export type CardRow = Record<string, unknown>;

export function discountPercent(mrp: string, price: string): number {
  const m = toPaise(mrp);
  const p = toPaise(price);
  return m > p && m > 0 ? Math.round(((m - p) * 100) / m) : 0;
}

export function unitLabel(unit: string, unitValue: string | number): string {
  const v = Number(unitValue);
  const map: Record<string, string> = { kg: 'किलो', g: 'ग्राम', gm: 'ग्राम', l: 'लीटर', litre: 'लीटर', ml: 'मि.ली.', piece: 'पीस', pc: 'पीस', dozen: 'दर्जन', pack: 'पैकेट', bundle: 'गड्डी', visit: 'विज़िट', packet: 'पैकेट', bottle: 'बोतल', box: 'डिब्बा', pair: 'जोड़ी', bag: 'बोरी', metre: 'मीटर', m: 'मीटर', trip: 'फेरा', hour: 'घंटा', test: 'जाँच', plate: 'प्लेट', set: 'सेट', strip: 'पत्ता', cup: 'कप' };
  const u = map[unit.toLowerCase()] ?? unit;
  return `${Number.isInteger(v) ? v : v.toString()} ${u}`;
}

/**
 * Seed placeholders (/uploads/products/seed/…) are not real photos. The web draws a designed label
 * tile instead of shipping those bytes, so they are reported as "no image".
 */
export function isSeedPlaceholder(url: string | null | undefined): boolean {
  return !!url && url.includes('/products/seed/');
}

export function toCard(r: CardRow): ProductCard {
  const nameHi = (r.name_hi as string | null) ?? null;
  const rawUrl = (r.img as string | null) ?? null;
  const url = isSeedPlaceholder(rawUrl) ? null : rawUrl;
  const urlSm = url ? ((r.img_sm as string | null) ?? url) : null;
  const image: ProductImage | null = url ? { url, urlSm: urlSm ?? url, width: 600, height: 600, alt: nameHi ?? String(r.name) } : null;
  const isProduct = r.item_type === 'PRODUCT';
  // One flag decides both: a supplier the owner hides must not leak through its mediator note.
  const showSupplier = Number(r.show_on_product) === 1;
  return {
    id: Number(r.id),
    name: String(r.name),
    nameHi,
    slug: String(r.slug),
    itemType: r.item_type as 'PRODUCT' | 'SERVICE',
    unit: unitLabel(String(r.unit), r.unit_value as string),
    unitValue: String(r.unit_value),
    price: String(r.price),
    mrp: String(r.mrp),
    discountPercent: discountPercent(String(r.mrp), String(r.price)),
    inStock: Number(r.is_available) === 1 && (!isProduct || Number(r.stock_qty) > 0),
    prescriptionRequired: Number(r.prescription_required) === 1,
    image,
    supplierName: showSupplier ? ((r.supplier_name as string | null) ?? null) : null,
    supplierNote: showSupplier ? ((r.supplier_note as string | null) ?? null) : null,
    rating: { avg: String(r.rating_avg ?? '0.00'), count: Number(r.rating_count ?? 0) },
    icon: (r.cat_icon as string | null) ?? null,
    family: (r.root_slug as string | null) ?? null,
  };
}

/**
 * Cut a page title to `max` without leaving wreckage behind.
 *
 * A plain slice(0, 60) on "डॉक्टर से मिलने का समय (क्लिनिक) (Doctor Appointment (Clinic))" left
 * "…(Doctor Appointment (Clinic" in Google's results — half a word and two open brackets. So:
 * drop the bracketed English alias first, then cut on a word boundary, then close or drop any
 * bracket still hanging open.
 */
export function trimTitle(raw: string, max = 48): string {
  let s = raw.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  if (s.length <= max) return s;
  const withoutAlias = s.replace(/\s*\([^()]*\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (withoutAlias.length <= max && withoutAlias.length > 0) return withoutAlias;
  s = (withoutAlias || s).slice(0, max);
  const lastSpace = s.lastIndexOf(' ');
  if (lastSpace > max * 0.6) s = s.slice(0, lastSpace);
  const opens = (s.match(/\(/g) ?? []).length;
  const closes = (s.match(/\)/g) ?? []).length;
  if (opens > closes) s = s.slice(0, s.lastIndexOf('('));
  return s.replace(/[\s—–\-,:;.]+$/, '').trim();
}
