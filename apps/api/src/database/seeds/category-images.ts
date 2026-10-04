import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Knex } from 'knex';

/**
 * The shop-front photograph on each category card.
 *
 * ⚠️ This lives in the seed, not in a migration, and that is the whole point.
 *
 * It was a migration first (014), and on the shopkeeper's machine it did nothing at all: a
 * migration runs exactly once, and it ran at a moment when his database still held the v1
 * categories. Its sixteen UPDATEs matched zero rows, recorded themselves as applied, and could
 * never run again — so the rail stayed empty while every file was sitting right there on disk.
 *
 * A migration is for changing the shape of the database. Filling in rows that the seed itself
 * creates belongs in the seed, which runs after those rows exist and runs again whenever they
 * change. Migration 014 stays where it is so an already-correct database is not disturbed; this is
 * what actually makes the pictures appear.
 *
 * Two rules it never breaks: a category that already has a picture is left alone (an admin upload
 * always wins), and a file that is not on disk is never written into the database — a broken image
 * on the rail is worse than a drawing.
 */

/** slug → the base name under uploads/categories/seed/. Sizes are appended: -320, -600, -1200. */
const SHOP_PHOTOS: Record<string, string> = {
  kirana: 'cat-kirana',
  'fal-sabzi': 'cat-fal-sabzi',
  'fast-food': 'cat-fast-food',
  mithai: 'cat-mithai',
  electronics: 'cat-electronics',
  beauty: 'cat-beauty',
  kapde: 'cat-kapde',
  'joote-chappal': 'cat-joote-chappal',
  'building-material': 'cat-building-material',
  'body-checkup': 'cat-body-checkup',
  dawai: 'cat-dawai',
  'bhada-gadi': 'cat-bhada-gadi',
  'beej-bhandar': 'cat-beej-bhandar',
  'doctor-consult': 'cat-doctor-consult',
  patakha: 'cat-patakha',
  birthday: 'cat-birthday',
};

export async function seedCategoryImages(db: Knex, storagePath: string, publicUploadUrl: string, log: (m: string) => void): Promise<void> {
  const dir = join(storagePath, 'uploads', 'categories', 'seed');
  let set = 0;
  let missing = 0;
  let kept = 0;

  for (const [slug, base] of Object.entries(SHOP_PHOTOS)) {
    const row = (await db('categories').where({ slug }).first('id', 'image_url')) as { id: number; image_url: string | null } | undefined;
    if (!row) continue; // this shop does not have that category — nothing to do, not an error
    if (row.image_url) {
      kept++;
      continue; // already has a picture (seeded before, or uploaded by the admin) — never overwrite
    }
    if (!existsSync(join(dir, `${base}-600.webp`)) || !existsSync(join(dir, `${base}-320.webp`))) {
      missing++;
      continue;
    }
    await db('categories').where({ id: row.id }).update({
      image_url: `${publicUploadUrl}/categories/seed/${base}-600.webp`,
      image_url_sm: `${publicUploadUrl}/categories/seed/${base}-320.webp`,
    });
    set++;
  }

  const parts = [`${set} set`];
  if (kept) parts.push(`${kept} already had one`);
  if (missing) parts.push(`${missing} skipped (file not on disk)`);
  log(`seed: category shop photos — ${parts.join(', ')}`);
}
