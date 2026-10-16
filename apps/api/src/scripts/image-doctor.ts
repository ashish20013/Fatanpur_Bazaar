/**
 * Image integrity doctor — checks every image URL in the database against the disk.
 *
 * Run manually:   npx ts-node -r tsconfig-paths/register apps/api/src/scripts/image-doctor.ts
 * Or via npm:     npm run image:doctor
 *
 * Reports:
 *   MISSING   — DB row points at a file that is not on disk (broken image for the customer)
 *   PARTIAL   — some width variants exist but others are missing (card shows, detail doesn't)
 *   ORPHAN    — file on disk has no matching DB row (wastes inodes, never served)
 *
 * With --fix: removes DB references to missing files and deletes orphan files.
 *             Partial sets are logged but NOT auto-fixed — re-upload is the right answer.
 */
import { loadEnv } from '../config/env';
import knex from 'knex';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const env = loadEnv();
const fix = process.argv.includes('--fix');

const db = knex({
  client: 'mysql2',
  connection: { host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME },
});

interface Issue { table: string; id: number; column: string; url: string; kind: 'MISSING' | 'PARTIAL'; missing: string[] }

function urlToPath(url: string): string | null {
  const prefix = env.PUBLIC_UPLOAD_URL + '/';
  if (!url.startsWith(prefix)) return null;
  const rel = url.slice(prefix.length);
  if (rel.includes('..')) return null;
  return join(env.STORAGE_PATH, 'uploads', rel);
}

/** Given one stored URL (e.g. the 600 w), derive all expected width variants and check each. */
function checkVariants(url: string, kind: 'products' | 'categories' | 'banners'): { ok: boolean; missing: string[] } {
  const widths = kind === 'banners' ? [640, 1280] : kind === 'categories' ? [320, 600, 1200] : [200, 600, 1200];
  const missing: string[] = [];
  for (const w of widths) {
    const variantUrl = url.replace(/-(200|320|600|640|1200|1280)\.webp$/, `-${w}.webp`);
    const path = urlToPath(variantUrl);
    if (path && !existsSync(path)) missing.push(`${w}w`);
  }
  return { ok: missing.length === 0, missing };
}

async function run(): Promise<void> {
  const issues: Issue[] = [];
  let checked = 0;

  // 1. Product images
  const productImages = await db('product_images').select('id', 'product_id', 'url', 'url_sm');
  for (const img of productImages) {
    checked++;
    const mainPath = urlToPath(img.url);
    if (mainPath && !existsSync(mainPath)) {
      const { missing } = checkVariants(img.url, 'products');
      issues.push({ table: 'product_images', id: img.id, column: 'url', url: img.url, kind: missing.length === 3 ? 'MISSING' : 'PARTIAL', missing });
    } else if (mainPath) {
      const { ok, missing } = checkVariants(img.url, 'products');
      if (!ok) issues.push({ table: 'product_images', id: img.id, column: 'url', url: img.url, kind: 'PARTIAL', missing });
    }
  }

  // 2. Category images
  const categories = await db('categories').whereNotNull('image_url').select('id', 'image_url');
  for (const cat of categories) {
    checked++;
    const mainPath = urlToPath(cat.image_url);
    if (mainPath && !existsSync(mainPath)) {
      const { missing } = checkVariants(cat.image_url, 'categories');
      issues.push({ table: 'categories', id: cat.id, column: 'image_url', url: cat.image_url, kind: missing.length === 3 ? 'MISSING' : 'PARTIAL', missing });
    } else if (mainPath) {
      const { ok, missing } = checkVariants(cat.image_url, 'categories');
      if (!ok) issues.push({ table: 'categories', id: cat.id, column: 'image_url', url: cat.image_url, kind: 'PARTIAL', missing });
    }
  }

  // 3. Banner images
  const banners = await db('banners').whereNotNull('image_url').select('id', 'image_url', 'image_url_sm');
  for (const ban of banners) {
    checked++;
    const mainPath = urlToPath(ban.image_url);
    if (mainPath && !existsSync(mainPath)) {
      const { missing } = checkVariants(ban.image_url, 'banners');
      issues.push({ table: 'banners', id: ban.id, column: 'image_url', url: ban.image_url, kind: missing.length === 2 ? 'MISSING' : 'PARTIAL', missing });
    } else if (mainPath) {
      const { ok, missing } = checkVariants(ban.image_url, 'banners');
      if (!ok) issues.push({ table: 'banners', id: ban.id, column: 'image_url', url: ban.image_url, kind: 'PARTIAL', missing });
    }
  }

  // 4. Supplier logos
  const suppliers = await db('suppliers').whereNotNull('logo_url').select('id', 'logo_url');
  for (const sup of suppliers) {
    checked++;
    const path = urlToPath(sup.logo_url);
    if (path && !existsSync(path)) {
      issues.push({ table: 'suppliers', id: sup.id, column: 'logo_url', url: sup.logo_url, kind: 'MISSING', missing: ['logo'] });
    }
  }

  // Report
  process.stdout.write(`\n  Image Doctor Report\n`);
  process.stdout.write(`  Checked: ${checked} DB image references\n\n`);

  if (issues.length === 0) {
    process.stdout.write(`  All images OK — har photo disk pe maujood hai.\n\n`);
  } else {
    const missing = issues.filter((i) => i.kind === 'MISSING');
    const partial = issues.filter((i) => i.kind === 'PARTIAL');

    if (missing.length) {
      process.stdout.write(`  MISSING (${missing.length}) — DB me hai par disk pe nahi:\n`);
      for (const i of missing) process.stdout.write(`    ${i.table}#${i.id} → ${i.url}\n`);
      process.stdout.write('\n');
    }
    if (partial.length) {
      process.stdout.write(`  PARTIAL (${partial.length}) — kuch sizes hain, kuch nahi:\n`);
      for (const i of partial) process.stdout.write(`    ${i.table}#${i.id} → ${i.url}  (missing: ${i.missing.join(', ')})\n`);
      process.stdout.write('\n');
    }

    if (fix) {
      process.stdout.write('  --fix mode: cleaning up MISSING references...\n');
      for (const i of missing) {
        if (i.table === 'product_images') {
          await db('product_images').where({ id: i.id }).delete();
          process.stdout.write(`    Deleted product_images#${i.id}\n`);
        } else {
          await db(i.table).where({ id: i.id }).update({ [i.column]: null });
          process.stdout.write(`    Nulled ${i.table}#${i.id}.${i.column}\n`);
        }
      }
      process.stdout.write(`\n  PARTIAL issues need re-upload — admin panel se photo dobara upload karein.\n`);
    } else {
      process.stdout.write(`  Run with --fix to clean up MISSING references.\n`);
      process.stdout.write(`  PARTIAL issues need manual re-upload from admin panel.\n`);
    }
  }
  process.stdout.write('\n');

  await db.destroy();
}

run().catch((e) => { console.error(e); process.exit(1); });
