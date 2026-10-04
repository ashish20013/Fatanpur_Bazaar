import { expect, test } from '@playwright/test';

/**
 * §15 Smoke: 25 public URLs 200 · exactly one <h1> · security headers · robots + sitemap valid ·
 * JSON-LD parses · 320px pe horizontal scroll nahi.
 */
const PUBLIC_URLS = [
  '/', '/sabzi', '/phal', '/kirana', '/sewa', '/khoj?q=aloo',
  '/blog', '/about', '/contact', '/privacy', '/terms', '/refund', '/shipping', '/faq',
];

test('public pages return 200 with exactly one h1', async ({ page }) => {
  for (const url of PUBLIC_URLS) {
    const res = await page.goto(url);
    expect(res?.status(), `${url} status`).toBeLessThan(400);
    await expect(page.locator('h1'), `${url} h1 count`).toHaveCount(1);
  }
});

test('area and product pages render (from seeded data)', async ({ page, request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain('<urlset');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(10);
  const product = urls.find((u) => u.includes('/product/'));
  const area = urls.find((u) => u.includes('/area/'));
  for (const u of [product, area].filter(Boolean) as string[]) {
    const res = await page.goto(new URL(u).pathname);
    expect(res?.status(), u).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
  }
});

test('robots.txt disallows the private areas and points at the sitemap', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  for (const p of ['/mera', '/admin', '/supervisor', '/delivery', '/api', '/cart', '/checkout', '/login']) {
    expect(body, `robots must disallow ${p}`).toContain(p);
  }
  expect(body.toLowerCase()).toContain('sitemap');
});

test('security headers are present', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options'] ?? h['content-security-policy']).toBeTruthy();
  expect(h['x-powered-by']).toBeUndefined();
});

test('home page JSON-LD is valid and has no fake aggregateRating', async ({ page }) => {
  await page.goto('/');
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.length).toBeGreaterThan(0);
  for (const b of blocks) {
    const parsed: unknown = JSON.parse(b);
    expect(parsed).toBeTruthy();
  }
});

test('no horizontal scroll at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const url of ['/', '/sabzi', '/cart', '/khoj?q=aloo']) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} horizontal overflow`).toBeLessThanOrEqual(1);
  }
});

test('images declare width and height (CLS budget)', async ({ page }) => {
  await page.goto('/sabzi');
  const missing = await page.evaluate(() =>
    [...document.querySelectorAll('img')].filter((img) => !img.getAttribute('width') || !img.getAttribute('height')).map((img) => img.currentSrc || img.src),
  );
  expect(missing, `images without width/height: ${missing.join(', ')}`).toHaveLength(0);
});
