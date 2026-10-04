import type { Knex } from 'knex';
import { sanitizeHtml } from '../../common/utils/sanitize';

/**
 * One pass over every stored rich-text column through the current allowlist sanitiser.
 * Rows written before the sanitiser was hardened (or before product/category HTML was
 * sanitised at all) are fixed in place. Idempotent: clean HTML comes back byte-identical,
 * so only rows that actually change are updated.
 */
const COLUMNS: [table: string, column: string][] = [
  ['villages', 'intro_html'],
  ['categories', 'intro_html'],
  ['products', 'description'],
  ['pages', 'body_html'],
  ['blog_posts', 'body_html'],
  ['faqs', 'answer'],
];

export async function resanitizeStoredHtml(db: Knex, log: (m: string) => void): Promise<number> {
  let changed = 0;
  for (const [table, column] of COLUMNS) {
    const rows = (await db(table).whereNotNull(column).select('id', column)) as Record<string, unknown>[];
    for (const r of rows) {
      const before = String(r[column] ?? '');
      const after = sanitizeHtml(before);
      if (after !== before) {
        await db(table).where({ id: r.id }).update({ [column]: after });
        changed++;
      }
    }
  }
  log(`html: re-sanitised ${changed} stored rich-text value(s)`);
  return changed;
}
