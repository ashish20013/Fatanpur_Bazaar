import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Knex } from 'knex';

/**
 * Give every seeded product its own picture-mark.
 *
 * The mapping lives in the icon migrations (008–011) as plain UPDATE … WHERE name IN (…)
 * statements. On an existing shop the migration runner applies them once; on a fresh install the
 * migrations run BEFORE the seed, so the products they were meant for do not exist yet and every
 * tile would fall back to its category's icon — sixteen vegetables sharing one mark again.
 *
 * Re-running the same statements at the end of the seed closes that hole. They match on the
 * product NAME and only set what is unset (except the corrections, which are explicit), so running
 * them twice changes nothing, and an icon the shopkeeper picked himself is never overwritten.
 */
export async function seedProductIcons(db: Knex, log: (m: string) => void): Promise<void> {
  const dir = join(__dirname, '..', 'migrations');
  const files = (await readdir(dir)).filter((f) => /^(008|009|010|011)_.*\.sql$/.test(f)).sort();
  let statements = 0;
  for (const f of files) {
    const sql = await readFile(join(dir, f), 'utf8');
    // Comments go first: a `--` line may itself contain a semicolon, and splitting on `;` before
    // removing them cuts a comment in half and feeds its tail to the server as SQL.
    const body = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    for (const raw of body.split(';')) {
      const stmt = raw.trim();
      if (!stmt) continue;
      await db.raw(stmt);
      statements++;
    }
  }
  const [{ n }] = (await db('products').whereNotNull('icon').whereNot('icon', '').count({ n: '*' })) as { n: number }[];
  log(`product icons: ${statements} rules applied, ${Number(n)} products have their own mark`);
}
