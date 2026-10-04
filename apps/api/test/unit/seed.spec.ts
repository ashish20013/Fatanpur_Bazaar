import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VILLAGES } from '../../src/database/seeds/data/villages';
import { CATEGORIES, PRODUCTS, SERVICES, SUPPLIERS, SYNONYMS } from '../../src/database/seeds/data/catalog';
import { BLOG, FAQS, PAGES } from '../../src/database/seeds/data/content';
import { haversineKm } from '../../src/common/utils/geo';
import { slugify } from '../../src/common/utils/translit';
import { buildSearchText } from '../../src/modules/catalog/search-text';
import { placeholderSvg } from '../../src/database/seeds/placeholder';

const CENTER = { lat: 25.742, lng: 81.954 };
const words = (html: string): number => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

test('SEED: 80 products + 8 services, 14 categories, 4 suppliers, 60 synonyms', () => {
  assert.equal(PRODUCTS.length, 80);
  assert.equal(SERVICES.length, 8);
  assert.equal(CATEGORIES.length, 14);
  assert.equal(SUPPLIERS.length, 4);
  assert.equal(SYNONYMS.length, 60);
});

test('SEED: product + service slugs unique; prices are valid money strings, price <= mrp', () => {
  const slugs = [...PRODUCTS.map((p) => slugify(p.name)), ...SERVICES.map((s) => slugify(s.name))];
  assert.equal(new Set(slugs).size, slugs.length);
  for (const p of PRODUCTS) {
    assert.match(p.price, /^\d+\.\d{2}$/);
    assert.ok(Number(p.price) <= Number(p.mrp), p.name);
  }
});

test('SEED: no meat/chicken in catalog (out of scope)', () => {
  const all = [...PRODUCTS.map((p) => `${p.name} ${p.hi} ${p.kw}`), ...SERVICES.map((s) => s.name)].join(' ').toLowerCase();
  for (const w of ['chicken', 'mutton', 'meat', 'fish', 'मुर्गा', 'मांस']) assert.ok(!all.includes(w), w);
});

test('SEED: demo-referenced slugs exist', () => {
  const slugs = new Set([...PRODUCTS.map((p) => slugify(p.name)), ...SERVICES.map((s) => slugify(s.name))]);
  for (const s of ['aloo-potato', 'pyaz-onion', 'tamatar-tomato', 'fan-repair']) assert.ok(slugs.has(s), s);
  const v = new Set(VILLAGES.map((x) => slugify(x.name)));
  for (const s of ['fatanpur-bazaar', 'raniganj', 'suwansa']) assert.ok(v.has(s), s);
});

test('SEED: every active village within 6 km of the centre; demo-inactive one outside', () => {
  for (const v of VILLAGES) {
    const d = haversineKm(CENTER, v);
    if (v.demoInactive) assert.ok(d > 6, `${v.name} should be outside`);
    else assert.ok(d <= 6, `${v.name} is ${d.toFixed(2)} km`);
  }
});

test('SEED: village intros unique, ~200 words, 2+ aliases each (picker search)', () => {
  const intros = new Set(VILLAGES.map((v) => v.intro));
  assert.equal(intros.size, VILLAGES.length);
  for (const v of VILLAGES) {
    if (!v.demoInactive) assert.ok(words(v.intro) >= 190, `${v.name}: ${words(v.intro)} words`);
    assert.ok(v.aliases.length >= 2, v.name);
  }
});

test('SEED: 6 blog posts with 400+ words, 6 pages, 10 FAQs', () => {
  assert.equal(BLOG.length, 6);
  for (const b of BLOG) assert.ok(words(b.body) >= 400, `${b.slug}: ${words(b.body)}`);
  assert.deepEqual(PAGES.map((p) => p.slug).sort(), ['about', 'contact', 'privacy', 'refund', 'shipping', 'terms']);
  assert.equal(FAQS.length, 10);
});

test('SEED: search_text covers Hindi, roman and synonyms ("आलू aloo alu potato")', () => {
  const t = buildSearchText({ name: 'Aloo (Potato)', nameHi: 'आलू', keywords: 'aloo alu aalu potato', categoryNames: ['Vegetables', 'सब्ज़ी'], synonymHits: ['aloo potato आलू'] });
  for (const w of ['आलू', 'aloo', 'alu', 'potato', 'सब्ज़ी']) assert.ok(t.split(' ').includes(w), w);
  assert.ok(t.length <= 500);
});

test('SEED: placeholder SVG escapes text and is square', () => {
  const svg = placeholderSvg('<b>&', 'x', 'slug', 200);
  assert.ok(!svg.includes('<b>'));
  assert.match(svg, /width="200" height="200"/);
});
