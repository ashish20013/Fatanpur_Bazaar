import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Knex } from 'knex';
import type { Env } from '../config/env';

/**
 * `npm run doctor` — one command that answers "why does the site not look right?".
 *
 * Three times now a category picture was correct on the build machine and missing on the
 * shopkeeper's, and each round trip cost him a day. The reason was never in the code: it was the
 * database row, the file on disk, or the API not serving it — three things no screenshot can tell
 * apart. So this walks all three, in the order a browser does, and writes what it found to
 * DIAGNOSTIC.txt so the whole answer travels in one file instead of a conversation.
 *
 * It only reads. Running it on a live shop is safe.
 */

export type Line = { level: 'ok' | 'warn' | 'fail' | 'info'; msg: string };

async function head(url: string, ms = 4000): Promise<{ status: number; type: string; bytes: number } | { error: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get('content-type') ?? '', bytes: buf.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Categories: the row, the file it names, and whether the API will actually hand that file over. */
async function checkCategories(db: Knex, env: Env, base: string, out: Line[]): Promise<void> {
  const rows = (await db('categories')
    .whereNull('parent_id')
    .orderBy('sort_order')
    .select('slug', 'name_hi', 'image_url', 'image_url_sm')) as { slug: string; name_hi: string | null; image_url: string | null; image_url_sm: string | null }[];

  out.push({ level: 'info', msg: `top-level categories: ${rows.length}` });
  if (!rows.length) {
    out.push({ level: 'fail', msg: 'no categories at all — the database was never seeded. Run: npm run db:seed -- --demo' });
    return;
  }

  const withPic = rows.filter((r) => r.image_url);
  out.push({ level: withPic.length ? 'ok' : 'fail', msg: `categories with a picture in the DB: ${withPic.length} of ${rows.length}` });
  if (!withPic.length) {
    /*
     * Telling someone "the migration has not run" when it has is worse than saying nothing: it
     * sends them to re-run a command that will report success and change nothing. The two causes
     * look identical from the outside and have to be told apart here.
     *
     * The giveaway is which categories exist. The shop-front photographs are keyed to the v2/v3
     * root categories; a database still holding only the v1 ones was seeded before those layers
     * existed, so the picture rows name slugs it does not have.
     */
    const v2 = await db('categories').whereIn('slug', ['kirana', 'fal-sabzi', 'mithai']).count({ n: '*' }).first();
    if (!Number(v2?.n ?? 0)) {
      out.push({ level: 'fail', msg: 'this database is still on the first catalogue — the v2/v3 categories (kirana, fal-sabzi, mithai …) were never seeded, so nothing matched the picture rows.' });
      out.push({ level: 'info', msg: 'Fix: npm run db:seed -- --demo   (it is idempotent — it adds the missing categories and leaves your data alone)' });
    } else {
      out.push({ level: 'fail', msg: 'the categories exist but carry no picture. Fix: npm run db:seed -- --demo' });
    }
  }

  const uploads = join(env.STORAGE_PATH, 'uploads');
  for (const r of rows) {
    const label = `${r.slug} (${r.name_hi ?? ''})`;
    if (!r.image_url) {
      out.push({ level: 'warn', msg: `${label}: no picture — the rail draws its icon instead` });
      continue;
    }
    // The URL the browser gets is PUBLIC_UPLOAD_URL + path; the file sits under STORAGE_PATH/uploads.
    for (const url of [r.image_url, r.image_url_sm].filter((u): u is string => Boolean(u))) {
      const rel = url.startsWith(env.PUBLIC_UPLOAD_URL) ? url.slice(env.PUBLIC_UPLOAD_URL.length) : url;
      const disk = join(uploads, rel);
      if (!existsSync(disk)) {
        out.push({ level: 'fail', msg: `${label}: DB points at ${url} but there is no such file at ${disk}` });
        continue;
      }
      const bytes = statSync(disk).size;
      if (bytes === 0) out.push({ level: 'fail', msg: `${label}: ${url} is an empty file` });
      // Only the small variant is judged on weight: that is the one the rail downloads on every
      // first visit. The 600 and 1200 are opened one at a time, on purpose, by someone who asked.
      else if (url === r.image_url_sm && bytes > 25_000) {
        out.push({ level: 'warn', msg: `${label}: card picture is ${Math.round(bytes / 1024)} KB — over the 25 KB the rail budgets per card` });
      }
    }
  }

  // Now the part a file check cannot prove: does the running API hand the picture over?
  const sample = withPic[0];
  if (!sample?.image_url_sm) return;
  const imgUrl = base + sample.image_url_sm;
  const img = await head(imgUrl);
  if ('error' in img) {
    out.push({ level: 'fail', msg: `API not answering at ${base} (${img.error}). Start it first: npm run dev:api` });
    return;
  }
  if (img.status !== 200) out.push({ level: 'fail', msg: `API returned ${img.status} for ${imgUrl} — the file is on disk but not being served` });
  else if (!img.type.startsWith('image/')) out.push({ level: 'fail', msg: `${imgUrl} came back as "${img.type}", not an image` });
  else out.push({ level: 'ok', msg: `API serves category pictures (${imgUrl} → ${img.status}, ${Math.round(img.bytes / 1024)} KB)` });

  // And does the categories endpoint actually put the picture in its answer? This is the field the
  // rail reads; a picture can be on disk, served, and still never reach the page.
  const api = await head(`${base}/v1/catalog/categories`);
  if ('error' in api) {
    out.push({ level: 'fail', msg: `categories endpoint unreachable: ${api.error}` });
    return;
  }
  const body = await fetch(`${base}/v1/catalog/categories`).then((r) => r.json() as Promise<{ data?: unknown }>).catch(() => null);
  const list = (body?.data as { categories?: unknown[] } | undefined)?.categories ?? (body?.data as unknown[] | undefined) ?? [];
  const withImage = (list as { image?: string | null }[]).filter((c) => c?.image).length;
  out.push({
    level: withImage ? 'ok' : 'fail',
    msg: `GET /v1/catalog/categories returns ${(list as unknown[]).length} categories, ${withImage} of them carrying a picture`,
  });
}

/** Products, banners: same three questions, counted rather than listed. */
async function checkImages(db: Knex, env: Env, out: Line[]): Promise<void> {
  const uploads = join(env.STORAGE_PATH, 'uploads');
  const imgs = (await db('product_images').select('url', 'url_sm')) as { url: string | null; url_sm: string | null }[];
  let missing = 0;
  let heavy = 0;
  for (const i of imgs) {
    for (const url of [i.url, i.url_sm].filter((u): u is string => Boolean(u))) {
      const rel = url.startsWith(env.PUBLIC_UPLOAD_URL) ? url.slice(env.PUBLIC_UPLOAD_URL.length) : url;
      const disk = join(uploads, rel);
      if (!existsSync(disk)) missing++;
      else if (statSync(disk).size > 120_000) heavy++;
    }
  }
  out.push({ level: missing ? 'fail' : 'ok', msg: `product image files: ${imgs.length} rows, ${missing} missing on disk, ${heavy} over 120 KB` });
}

/** Settings that decide whether a customer can even place an order. */
async function checkSettings(db: Knex, out: Line[]): Promise<void> {
  const rows = (await db('settings').select('key', 'value')) as { key: string; value: string }[];
  const s = new Map(rows.map((r) => [r.key, r.value]));
  const need = ['upi_vpa', 'support_phone', 'store_open_time', 'store_close_time'];
  for (const k of need) {
    const v = s.get(k);
    out.push({ level: v ? 'ok' : 'warn', msg: `setting ${k} = ${v || '(empty — the shopkeeper must fill this before launch)'}` });
  }
  const zones = await db('service_zones').where({ is_active: 1 }).count({ n: '*' }).first();
  const villages = await db('villages').where({ is_active: 1 }).count({ n: '*' }).first();
  out.push({ level: Number(zones?.n ?? 0) ? 'ok' : 'fail', msg: `active service zones: ${zones?.n ?? 0}` });
  out.push({ level: Number(villages?.n ?? 0) ? 'ok' : 'fail', msg: `active villages: ${villages?.n ?? 0} (with none, the village picker is empty and nobody can check out)` });
}

/** Migrations: the single most common reason the code and the database disagree. */
async function checkMigrations(db: Knex, out: Line[]): Promise<void> {
  const has = await db.schema.hasTable('schema_migrations');
  if (!has) {
    out.push({ level: 'fail', msg: 'schema_migrations table missing — no migration has ever run. Run: npm run db:migrate' });
    return;
  }
  const applied = (await db('schema_migrations').orderBy('version')) as { version: string }[];
  out.push({ level: 'info', msg: `migrations applied: ${applied.length} (latest: ${applied.at(-1)?.version ?? 'none'})` });
}

export async function runDoctor(db: Knex, env: Env): Promise<Line[]> {
  const base = `http://127.0.0.1:${env.PORT}`;
  const out: Line[] = [];
  out.push({ level: 'info', msg: `STORAGE_PATH = ${env.STORAGE_PATH}` });
  out.push({ level: 'info', msg: `PUBLIC_UPLOAD_URL = ${env.PUBLIC_UPLOAD_URL}` });
  out.push({ level: 'info', msg: `API expected at ${base}` });
  // Where the plain-language warning/error file lives — the one to hand over after testing.
  const problems = join(env.STORAGE_PATH, 'logs', 'problems.log');
  out.push({
    level: 'info',
    msg: existsSync(problems) ? `problem log: ${problems} (${Math.round(statSync(problems).size / 1024)} KB)` : `problem log: ${problems} (empty so far — nothing has gone wrong)`,
  });

  // Everything below needs the database. Ask once, in plain words, rather than letting four
  // separate checks each spit the same connection error at the shopkeeper.
  try {
    await db.raw('select 1');
  } catch (e) {
    out.push({ level: 'fail', msg: `cannot reach the database: ${e instanceof Error ? e.message : String(e)}` });
    out.push({ level: 'info', msg: 'Start MySQL/MariaDB first, then run this again. On Windows that is usually XAMPP → Start MySQL.' });
    return out;
  }

  const steps: [string, () => Promise<void>][] = [
    ['migrations', () => checkMigrations(db, out)],
    ['categories', () => checkCategories(db, env, base, out)],
    ['product images', () => checkImages(db, env, out)],
    ['settings', () => checkSettings(db, out)],
  ];
  for (const [name, run] of steps) {
    out.push({ level: 'info', msg: `--- ${name} ---` });
    try {
      await run();
    } catch (e) {
      // One broken check must not hide the other three.
      out.push({ level: 'fail', msg: `${name} check itself failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return out;
}
