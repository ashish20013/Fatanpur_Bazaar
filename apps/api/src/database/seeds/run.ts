import type { Knex } from 'knex';
import { haversineKm, roundKm } from '../../common/utils/geo';
import { slugify } from '../../common/utils/translit';
import { referralCode } from '../../common/utils/ids';
import { buildSearchText } from '../../modules/catalog/search-text';
import { seedBannerStrips } from './banner-strips';
import { seedCategoryImages } from './category-images';
import { tuckRetiredRoots } from './retired-roots';
import { seedGlobalAdmin } from './global-admin';
import { VILLAGES } from './data/villages';
import { CATEGORIES, PRODUCTS, SERVICES, SUPPLIERS, SYNONYMS } from './data/catalog';
import { BLOG, FAQS, PAGES } from './data/content';
import { LOCAL_FAQS, LOCAL_POSTS } from './data/local-seo';
import { seedProductIcons } from './icons';
import { resanitizeStoredHtml } from './resanitize';
import { ROOTS, REPARENT, V2_ITEMS, V2_SERVICES, V2_SUPPLIERS } from './data/catalog-v2';
import { V3_ROOTS, V3_SUPPLIERS, V3_SUPPLIER_PATCHES, V3_RENAMES, V3_ITEMS, V3_SERVICES, type ItemSeedV3, type ServiceSeedV3 } from './data/catalog-v3';
import { seedDemo } from './demo';

/** A category as the item seeders need it (id + both names, for search_text). */
interface SeedCategory {
  id: number;
  name: string;
  nameHi: string;
}

export interface SeedOptions {
  demo: boolean;
  storagePath: string;
  publicUploadUrl: string;
  log: (msg: string) => void;
}

/** Owner's business details (BUILD_PROMPT §1). Only filled when still empty — never overwrites admin edits. */
const OWNER_SETTINGS: Record<string, string> = {
  support_phone: '9616038670',
  whatsapp_number: '9616038670',
  upi_vpa: '8576891104@ybl',
  upi_payee_name: 'Ashish Yadav',
};

/** Store centre = first active zone's centre (schema seed; ⚠️ approximate until set in the map editor). */
async function storeCenter(db: Knex): Promise<{ lat: number; lng: number; radiusKm: number }> {
  const z = await db('service_zones').where({ is_active: 1 }).orderBy('priority').first('center_lat', 'center_lng', 'radius_km');
  return { lat: Number(z?.center_lat ?? 25.742), lng: Number(z?.center_lng ?? 81.954), radiusKm: Number(z?.radius_km ?? 6) };
}

async function seedSettings(db: Knex, o: SeedOptions): Promise<void> {
  for (const [key, value] of Object.entries(OWNER_SETTINGS)) {
    const n = await db('settings').where({ key }).andWhere((q) => q.whereNull('value').orWhere('value', '')).update({ value });
    if (n) o.log(`settings.${key} set`);
  }
  // A26 pricing default: ₹20 delivery, free above ₹299 — the schema already seeds these.
}

/** §14 villages: distance by haversine; anything outside the radius is seeded INACTIVE with a warning. */
async function seedVillages(db: Knex, o: SeedOptions): Promise<void> {
  if (await db('villages').first('id')) return o.log('villages: already seeded — skipped');
  const c = await storeCenter(db);
  for (const [i, v] of VILLAGES.entries()) {
    const d = roundKm(haversineKm(c, { lat: v.lat, lng: v.lng }));
    const outside = d > c.radiusKm;
    if (outside && !v.demoInactive) o.log(`⚠️  village ${v.name} is ${d} km from centre (> ${c.radiusKm}) — seeded INACTIVE, fix coordinates in /admin/villages`);
    const [id] = await db('villages').insert({
      name: v.name,
      name_hi: v.nameHi,
      slug: slugify(v.name),
      block_name: 'Raniganj',
      latitude: v.lat,
      longitude: v.lng,
      distance_km: d,
      eta_minutes: 20 + Math.ceil(d * 4) + 10,
      is_active: outside || v.demoInactive ? 0 : 1,
      is_popular: v.popular ? 1 : 0,
      seo_title: `${v.nameHi} में घर बैठे सब्ज़ी-किराना — फतनपुर बाज़ार`,
      seo_description: `${v.nameHi} (${v.name}) में ताज़ी सब्ज़ी, फल और किराना की होम डिलीवरी। कैश ऑन डिलीवरी और UPI। फतनपुर बाज़ार से लगभग ${d} किमी।`.slice(0, 300),
      intro_html: v.intro,
      sort_order: i,
    });
    if (v.aliases.length) await db('village_aliases').insert(v.aliases.map((a) => ({ village_id: id, alias: a.alias, alias_type: a.type })));
  }
  o.log(`villages: ${VILLAGES.length} (+ aliases)`);
}

async function seedSuppliersAndCategories(db: Knex): Promise<{ sup: Map<string, number>; cat: Map<string, { id: number; name: string; nameHi: string }> }> {
  const sup = new Map<string, number>();
  for (const s of SUPPLIERS) {
    const [id] = await db('suppliers').insert({ name: s.name, name_hi: s.nameHi, type: s.type, show_on_product: 1, is_active: 1, address_line: 'Fatanpur Bazaar, Raniganj, Pratapgarh' });
    sup.set(s.key, id);
  }
  const cat = new Map<string, { id: number; name: string; nameHi: string }>();
  for (const [i, c] of CATEGORIES.entries()) {
    const [id] = await db('categories').insert({
      vertical: c.vertical, item_type: c.itemType, name: c.name, name_hi: c.nameHi, slug: c.slug, icon: c.icon, sort_order: i, is_active: 1,
      seo_title: `${c.nameHi} (${c.name}) — फतनपुर बाज़ार | रानीगंज, प्रतापगढ़`,
      seo_description: `फतनपुर बाज़ार पर ${c.nameHi} ऑनलाइन मंगाएं — रानीगंज और आसपास के गाँवों में 6 किमी तक होम डिलीवरी, कैश ऑन डिलीवरी और UPI।`,
    });
    cat.set(c.key, { id, name: c.name, nameHi: c.nameHi });
  }
  return { sup, cat };
}

function synonymHits(text: string): string[] {
  const words = new Set(text.toLowerCase().split(/\s+/));
  return SYNONYMS.filter(([term]) => words.has(term)).map(([, to]) => to);
}

/**
 * No placeholder image files any more: a product without a real photo is drawn by the website as a
 * designed label tile (category colour + icon + Hindi name) — zero bytes to download on 3G, and it
 * never pretends to be a photo. Real photos come from /admin/products.
 */

async function seedProducts(db: Knex, o: SeedOptions, sup: Map<string, number>, cat: Map<string, { id: number; name: string; nameHi: string }>): Promise<void> {
  for (const p of PRODUCTS) {
    const c = cat.get(p.cat)!;
    const slug = slugify(p.name);
    const searchText = buildSearchText({ name: p.name, nameHi: p.hi, brand: p.brand ?? null, keywords: p.kw, categoryNames: [c.name, c.nameHi], synonymHits: synonymHits(p.kw) });
    await db('products').insert({
      category_id: c.id, supplier_id: sup.get(p.sup) ?? null, item_type: 'PRODUCT', name: p.name, name_hi: p.hi, slug,
      description: p.desc ?? `${p.hi} (${p.name}) — फतनपुर बाज़ार से घर तक। ${p.weighted ? 'तौल में कम निकले तो बिल अपने आप कम होगा।' : ''}`.trim(),
      brand: p.brand ?? null, unit: p.unit, unit_value: p.uv, mrp: p.mrp, price: p.price, stock_qty: p.stock, low_stock_at: Math.max(2, Math.floor(p.stock / 10)),
      is_weighted: p.weighted ? 1 : 0, is_available: 1, prescription_required: p.rx ? 1 : 0, is_regulated: p.regulated ? 1 : 0,
      max_qty_per_order: p.max ?? 10, search_text: searchText, is_featured: p.featured ? 1 : 0,
    });
  }
  for (const s of SERVICES) {
    const c = cat.get(s.cat)!;
    const slug = slugify(s.name);
    await db('products').insert({
      category_id: c.id, item_type: 'SERVICE', name: s.name, name_hi: s.hi, slug, description: `${s.hi} — घर पर। ${s.note}`,
      unit: 'visit', unit_value: 1, mrp: s.price, price: s.price, stock_qty: 0, service_duration_min: s.duration, visiting_charge: s.visiting,
      is_quote_based: s.quote ? 1 : 0, service_note: s.note, is_available: 1, max_qty_per_order: 1,
      search_text: buildSearchText({ name: s.name, nameHi: s.hi, keywords: s.kw, categoryNames: [c.name, c.nameHi], synonymHits: [] }),
    });
  }
  o.log(`products: ${PRODUCTS.length} + services: ${SERVICES.length}`);
}

async function seedCatalog(db: Knex, o: SeedOptions): Promise<void> {
  if (await db('products').first('id')) return o.log('catalog: already seeded — skipped');
  const { sup, cat } = await seedSuppliersAndCategories(db);
  await seedProducts(db, o, sup, cat);
  await db('search_synonyms').insert(SYNONYMS.map(([term, maps_to]) => ({ term, maps_to, is_active: 1 })));
  o.log(`synonyms: ${SYNONYMS.length}`);
}

/**
 * Catalog v2 (Sept-2026 brief) — runs on EVERY seed and is idempotent by slug, so it upgrades an
 * already-seeded database too: adds the 15 top-level categories, re-parents the v1 categories under
 * them, and adds the starter items. Existing rows (prices, names, stock the owner edited) are never
 * overwritten; only an emoji/empty icon is replaced by the icon key.
 */
async function seedCatalogV2(db: Knex, o: SeedOptions): Promise<void> {
  let addedRoots = 0;
  let addedItems = 0;
  const rootId = new Map<string, { id: number; name: string; nameHi: string }>();
  for (const [i, r] of ROOTS.entries()) {
    const found = await db('categories').where({ slug: r.slug }).first('id', 'parent_id', 'icon');
    if (found) {
      const patch: Record<string, unknown> = {};
      if (found.parent_id !== null) patch.parent_id = null;
      if (!found.icon || !/^[a-z0-9-]+$/.test(String(found.icon))) patch.icon = r.icon;
      if (Object.keys(patch).length) await db('categories').where({ id: found.id }).update(patch);
      rootId.set(r.slug, { id: found.id, name: r.name, nameHi: r.nameHi });
      continue;
    }
    const [id] = await db('categories').insert({
      vertical: r.vertical, item_type: r.itemType, name: r.name, name_hi: r.nameHi, slug: r.slug, icon: r.icon, sort_order: i, is_active: 1,
      seo_title: `${r.nameHi} (${r.name}) — फतनपुर बाज़ार | रानीगंज, प्रतापगढ़`,
      seo_description: `${r.intro} फतनपुर बाज़ार, रानीगंज (प्रतापगढ़) से आसपास के गाँवों में होम डिलीवरी।`.slice(0, 300),
      intro_html: `<p>${r.intro}</p>`,
    });
    rootId.set(r.slug, { id, name: r.name, nameHi: r.nameHi });
    addedRoots++;
  }
  // v1 categories → under their new roots (only while still top-level; an admin's re-parenting wins)
  for (const [slug, [root, icon]] of Object.entries(REPARENT)) {
    const c = await db('categories').where({ slug }).first('id', 'parent_id', 'icon');
    const r = rootId.get(root);
    if (!c || !r) continue;
    const patch: Record<string, unknown> = {};
    if (c.parent_id === null && c.id !== r.id) patch.parent_id = r.id;
    if (!c.icon || !/^[a-z0-9-]+$/.test(String(c.icon))) patch.icon = icon;
    if (Object.keys(patch).length) await db('categories').where({ id: c.id }).update(patch);
  }
  const sup = new Map<string, number>();
  for (const s of await db('suppliers').select('id', 'name')) sup.set(String(s.name), Number(s.id));
  const supKey = new Map<string, number>();
  for (const s of V2_SUPPLIERS) {
    // V3_RENAMES: a supplier v3 renamed must not look "missing" here and be inserted twice.
    let id = sup.get(s.name) ?? sup.get(V3_RENAMES[s.name] ?? '');
    if (!id) [id] = await db('suppliers').insert({ name: s.name, name_hi: s.nameHi, type: s.type, show_on_product: 0, is_active: 1, address_line: 'Fatanpur Bazaar, Raniganj, Pratapgarh' });
    supKey.set(s.key, id as number);
  }
  const verma = sup.get('Verma Store') ?? null;
  for (const p of V2_ITEMS) {
    const c = rootId.get(p.root);
    const slug = slugify(p.name);
    if (!c || (await db('products').where({ slug }).first('id'))) continue;
    await db('products').insert({
      category_id: c.id, supplier_id: p.sup === 'verma' ? verma : (supKey.get(p.sup ?? '') ?? null), item_type: 'PRODUCT', name: p.name, name_hi: p.hi, slug,
      description: `${p.hi} (${p.name}) — फतनपुर बाज़ार से घर तक।`, unit: p.unit, unit_value: p.uv, mrp: p.mrp, price: p.price,
      stock_qty: p.stock, low_stock_at: Math.max(2, Math.floor(p.stock / 10)), is_available: 1, max_qty_per_order: p.max ?? 10,
      search_text: buildSearchText({ name: p.name, nameHi: p.hi, keywords: p.kw, categoryNames: [c.name, c.nameHi], synonymHits: synonymHits(p.kw) }),
    });
    addedItems++;
  }
  for (const s of V2_SERVICES) {
    const c = rootId.get(s.root);
    const slug = slugify(s.name);
    if (!c || (await db('products').where({ slug }).first('id'))) continue;
    await db('products').insert({
      category_id: c.id, item_type: 'SERVICE', name: s.name, name_hi: s.hi, slug, description: `${s.hi}। ${s.note}`,
      unit: 'visit', unit_value: 1, mrp: s.price, price: s.price, stock_qty: 0, service_duration_min: s.duration, visiting_charge: s.visiting,
      is_quote_based: s.quote ? 1 : 0, service_note: s.note, is_available: 1, max_qty_per_order: 1,
      search_text: buildSearchText({ name: s.name, nameHi: s.hi, keywords: s.kw, categoryNames: [c.name, c.nameHi], synonymHits: [] }),
    });
    addedItems++;
  }
  o.log(`catalog v2: +${addedRoots} top-level categories, +${addedItems} items (idempotent)`);
}

/** v3 top-level categories, appended after the v2 ones. Idempotent by slug. */
async function seedV3Roots(db: Knex): Promise<number> {
  let added = 0;
  for (const [i, r] of V3_ROOTS.entries()) {
    if (await db('categories').where({ slug: r.slug }).first('id')) continue;
    await db('categories').insert({
      vertical: r.vertical, item_type: r.itemType, name: r.name, name_hi: r.nameHi, slug: r.slug, icon: r.icon,
      sort_order: ROOTS.length + i, is_active: 1,
      seo_title: `${r.nameHi} (${r.name}) — फतनपुर बाज़ार | रानीगंज, प्रतापगढ़`,
      seo_description: `${r.intro} फतनपुर बाज़ार, रानीगंज (प्रतापगढ़) से आसपास के गाँवों में होम डिलीवरी।`.slice(0, 300),
      intro_html: `<p>${r.intro}</p>`,
    });
    added++;
  }
  return added;
}

/**
 * v3 suppliers + the mediator note on the older ones. A note/rename is written only while the row
 * still looks untouched (note NULL, seeded name) — the owner's own wording always wins.
 */
async function seedV3Suppliers(db: Knex): Promise<{ byKey: Map<string, number>; added: number }> {
  const byKey = new Map<string, number>();
  let added = 0;
  for (const s of V3_SUPPLIERS) {
    const found = await db('suppliers').where({ name: s.name }).first('id', 'mediator_note');
    if (found) {
      if (found.mediator_note === null) await db('suppliers').where({ id: found.id }).update({ mediator_note: s.note, mediator_note_en: s.noteEn });
      byKey.set(s.key, Number(found.id));
      continue;
    }
    const [id] = await db('suppliers').insert({
      name: s.name, name_hi: s.nameHi, type: s.type, show_on_product: 1, is_active: 1,
      mediator_note: s.note, mediator_note_en: s.noteEn, address_line: 'Fatanpur Bazaar, Raniganj, Pratapgarh',
    });
    byKey.set(s.key, id as number);
    added++;
  }
  for (const p of V3_SUPPLIER_PATCHES) {
    // A renamed row no longer matches, which is exactly what makes the rename run only once.
    const row = await db('suppliers').where({ name: p.match }).first('id', 'mediator_note');
    if (!row) continue;
    const patch: Record<string, unknown> = {};
    if (row.mediator_note === null) Object.assign(patch, { mediator_note: p.note, mediator_note_en: p.noteEn });
    if (p.rename) Object.assign(patch, { name: p.rename, name_hi: p.renameHi });
    if (p.show) patch.show_on_product = 1;
    if (Object.keys(patch).length) await db('suppliers').where({ id: row.id }).update(patch);
  }
  return { byKey, added };
}

async function insertV3Item(db: Knex, p: ItemSeedV3, c: SeedCategory, supplierId: number | null): Promise<void> {
  const description = `${p.hi} (${p.name}) — फतनपुर बाज़ार से घर तक।${p.note ? ` ${p.note}` : ''}`;
  await db('products').insert({
    category_id: c.id, supplier_id: supplierId, item_type: 'PRODUCT', name: p.name, name_hi: p.hi,
    slug: slugify(p.name), icon: p.icon, description, unit: p.unit, unit_value: p.uv, mrp: p.mrp, price: p.price,
    stock_qty: p.stock, low_stock_at: Math.max(2, Math.floor(p.stock / 10)), is_available: 1,
    prescription_required: p.rx ? 1 : 0, is_regulated: p.regulated ? 1 : 0, max_qty_per_order: p.max,
    search_text: buildSearchText({ name: p.name, nameHi: p.hi, keywords: p.kw, categoryNames: [c.name, c.nameHi], synonymHits: synonymHits(p.kw) }),
  });
}

async function insertV3Service(db: Knex, s: ServiceSeedV3, c: SeedCategory, supplierId: number | null): Promise<void> {
  await db('products').insert({
    category_id: c.id, supplier_id: supplierId, item_type: 'SERVICE', name: s.name, name_hi: s.hi,
    slug: slugify(s.name), icon: s.icon, description: `${s.hi}। ${s.note}`, unit: 'visit', unit_value: 1,
    mrp: s.price, price: s.price, stock_qty: 0, service_duration_min: s.duration, visiting_charge: s.visiting,
    is_quote_based: s.quote ? 1 : 0, service_note: s.note, is_available: 1, max_qty_per_order: 1,
    search_text: buildSearchText({ name: s.name, nameHi: s.hi, keywords: s.kw, categoryNames: [c.name, c.nameHi], synonymHits: [] }),
  });
}

/** Every category a v3 row points at — the new roots plus older ones (dawai, body-checkup, …). */
async function v3Categories(db: Knex): Promise<Map<string, SeedCategory>> {
  const slugs = new Set([...V3_ITEMS.map((i) => i.root), ...V3_SERVICES.map((s) => s.root)]);
  const map = new Map<string, SeedCategory>();
  for (const slug of slugs) {
    const c = await db('categories').where({ slug }).first('id', 'name', 'name_hi');
    if (c) map.set(slug, { id: Number(c.id), name: String(c.name), nameHi: String(c.name_hi ?? c.name) });
  }
  return map;
}

/**
 * Catalog v3 (Sept-2026 brief, part 2) — runs on EVERY seed and is idempotent by slug/name, so it
 * upgrades an already-seeded database: five new top-level categories, the licensed shops that
 * actually sell the regulated goods, and ~150 items. Nothing the owner has edited is overwritten.
 */
async function seedCatalogV3(db: Knex, o: SeedOptions): Promise<void> {
  const addedRoots = await seedV3Roots(db);
  const { byKey, added: addedSuppliers } = await seedV3Suppliers(db);
  const cats = await v3Categories(db);
  let addedItems = 0;
  for (const p of V3_ITEMS) {
    const c = cats.get(p.root);
    if (!c || (await db('products').where({ slug: slugify(p.name) }).first('id'))) continue;
    await insertV3Item(db, p, c, byKey.get(p.sup ?? '') ?? null);
    addedItems++;
  }
  for (const s of V3_SERVICES) {
    const c = cats.get(s.root);
    if (!c || (await db('products').where({ slug: slugify(s.name) }).first('id'))) continue;
    await insertV3Service(db, s, c, byKey.get(s.sup ?? '') ?? null);
    addedItems++;
  }
  o.log(`catalog v3: +${addedRoots} top-level categories, +${addedSuppliers} suppliers, +${addedItems} items (idempotent)`);
}

/** Blog author: a DISABLED system account (cannot log in: status≠ACTIVE; not staff). */
async function systemAuthor(db: Knex): Promise<number> {
  const phone = '910000000000';
  const u = await db('users').where({ phone }).first('id');
  if (u) return u.id;
  const [id] = await db('users').insert({ phone, name: 'फतनपुर बाज़ार टीम', role: 'CUSTOMER', status: 'DISABLED', referral_code: referralCode(10), disable_reason: 'system author (blog)' });
  return id;
}

async function seedContent(db: Knex, o: SeedOptions): Promise<void> {
  if (await db('pages').first('id')) return o.log('content: already seeded — skipped');
  await db('pages').insert(PAGES.map((p) => ({ slug: p.slug, title: p.title, body_html: p.body, seo_title: p.seoTitle, seo_description: p.seoDescription, is_published: 1 })));
  await db('faqs').insert(FAQS.map((f, i) => ({ question: f.q, answer: f.a, page_scope: 'general', sort_order: i, is_active: 1 })));
  const author = await systemAuthor(db);
  for (const [i, b] of BLOG.entries()) {
    const words = b.body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    await db('blog_posts').insert({
      author_id: author, title: b.title, slug: b.slug, excerpt: b.excerpt, body_html: b.body, status: 'PUBLISHED',
      seo_title: `${b.title}`.slice(0, 170), seo_description: b.excerpt.slice(0, 300), read_minutes: Math.max(1, Math.round(words / 180)),
      published_at: db.raw('NOW() - INTERVAL ? DAY', [BLOG.length - i]),
    });
  }
  o.log(`content: ${PAGES.length} pages, ${FAQS.length} faqs, ${BLOG.length} posts`);
}

/** Local-area articles + FAQs. Idempotent by slug / question, so re-running never touches admin edits. */
async function seedLocalContent(db: Knex, o: SeedOptions): Promise<void> {
  const author = await systemAuthor(db);
  let posts = 0;
  for (const [i, b] of LOCAL_POSTS.entries()) {
    if (await db('blog_posts').where({ slug: b.slug }).first('id')) continue;
    const words = b.body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    await db('blog_posts').insert({
      author_id: author, title: b.title, slug: b.slug, excerpt: b.excerpt, body_html: b.body, status: 'PUBLISHED',
      seo_title: b.seoTitle.slice(0, 170), seo_description: b.seoDescription.slice(0, 300), read_minutes: Math.max(1, Math.round(words / 180)),
      published_at: db.raw('NOW() - INTERVAL ? HOUR', [(LOCAL_POSTS.length - i) * 5]),
    });
    posts++;
  }
  let faqs = 0;
  const base = Number((await db('faqs').max<{ m: number }[]>({ m: 'sort_order' }))[0]?.m ?? 0);
  for (const [i, f] of LOCAL_FAQS.entries()) {
    if (await db('faqs').where({ question: f.q }).first('id')) continue;
    await db('faqs').insert({ question: f.q, answer: f.a, page_scope: 'general', sort_order: base + i + 1, is_active: 1 });
    faqs++;
  }
  o.log(`local content: +${posts} posts, +${faqs} faqs (idempotent)`);
}

async function seedPromos(db: Knex, o: SeedOptions): Promise<void> {
  if (await db('coupons').first('id')) return;
  const start = db.raw('NOW()');
  const end = db.raw('NOW() + INTERVAL 365 DAY');
  await db('coupons').insert([
    { code: 'NAYA50', title: 'पहले ऑर्डर पर ₹50 छूट', description: '₹199 से ऊपर के पहले ऑर्डर पर', discount_type: 'FLAT', discount_value: 50, min_order_value: 199, per_user_limit: 1, first_order_only: 1, applies_to: 'ALL', starts_at: start, expires_at: end, is_active: 1 },
    { code: 'FREEDEL', title: '₹20 छूट (डिलीवरी जितनी)', description: '₹149 से ऊपर; डिलीवरी फीस पर नहीं, सामान पर', discount_type: 'FLAT', discount_value: 20, min_order_value: 149, per_user_limit: 3, first_order_only: 0, applies_to: 'PRODUCT', starts_at: start, expires_at: end, is_active: 1 },
    { code: 'SABZI10', title: '10% छूट (अधिकतम ₹40)', description: '₹250 से ऊपर के ऑर्डर पर', discount_type: 'PERCENT', discount_value: 10, max_discount: 40, min_order_value: 250, per_user_limit: 2, first_order_only: 0, applies_to: 'PRODUCT', starts_at: start, expires_at: end, is_active: 1 },
  ]);
  await db('banners').insert([
    { title: 'ताज़ी सब्ज़ी, घर तक', subtitle: '₹299 से ऊपर डिलीवरी मुफ़्त', link_url: '/sabzi', position: 'HOME_TOP', sort_order: 0, is_active: 1 },
    { title: 'पहले ऑर्डर पर ₹50 छूट', subtitle: 'कूपन: NAYA50', link_url: '/kirana', position: 'HOME_MID', sort_order: 1, is_active: 1 },
  ]);
  o.log('coupons: NAYA50, FREEDEL, SABZI10 · banners: 2');
}

export async function seedAll(db: Knex, o: SeedOptions): Promise<void> {
  if (o.demo && process.env.NODE_ENV === 'production') throw new Error('Refusing to seed DEMO users/orders in production.');
  await seedSettings(db, o);
  // Before anything else that records "who did this": the owner's account has to exist first.
  await seedGlobalAdmin(db, o.log);
  await seedVillages(db, o);
  await seedCatalog(db, o);
  await seedCatalogV2(db, o);
  await seedCatalogV3(db, o);
  // After v3, because that is where the last of the twenty root categories is created.
  await tuckRetiredRoots(db, o.log);
  await seedCategoryImages(db, o.storagePath, o.publicUploadUrl, o.log);
  await seedBannerStrips(db, o.storagePath, o.publicUploadUrl, o.log);
  await seedContent(db, o);
  await seedLocalContent(db, o);
  await seedPromos(db, o);
  await seedProductIcons(db, o.log);
  await resanitizeStoredHtml(db, o.log);
  if (o.demo) await seedDemo(db, o.log);
  o.log('seed: done');
}
