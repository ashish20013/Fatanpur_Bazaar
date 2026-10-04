import type { Knex } from 'knex';

/**
 * Root categories that an older seed created and a newer one replaced.
 *
 * A seed is idempotent about what it *adds* — it never inserts the same slug twice. It has nothing
 * to say about what it once added and no longer would. So a shop seeded a year ago keeps every
 * category every past version of this file ever created, sitting at the top level forever.
 *
 * The shopkeeper hit exactly this: his rail carried both "दीपावली" (from an old seed) and
 * "पटाखे व दीपावली" (its replacement) — the same shop, twice, one of them empty.
 *
 * So each retired slug names its successor and is tucked underneath it. Nothing is deleted: the
 * old category keeps its products, its URL still resolves, and anything an admin filed under it is
 * still there — it simply stops being one of the twenty doors on the front page.
 *
 * ⚠️ Only while it is still top-level. An admin who has deliberately re-parented or re-purposed a
 * category has made a decision, and a seed does not get to overrule it.
 */
const RETIRED: Record<string, string> = {
  // "दीपावली" → "पटाखे व दीपावली" (v3), which covers the same goods under a clearer name.
  diwali: 'patakha',
};

export async function tuckRetiredRoots(db: Knex, log: (m: string) => void): Promise<void> {
  let moved = 0;
  for (const [oldSlug, newSlug] of Object.entries(RETIRED)) {
    const old = (await db('categories').where({ slug: oldSlug }).first('id', 'parent_id')) as { id: number; parent_id: number | null } | undefined;
    if (!old || old.parent_id !== null) continue; // absent, or already filed somewhere — leave it
    const heir = (await db('categories').where({ slug: newSlug }).first('id')) as { id: number } | undefined;
    if (!heir || heir.id === old.id) continue; // no successor yet — better two doors than none
    await db('categories').where({ id: old.id }).update({ parent_id: heir.id });
    moved++;
    log(`seed: "${oldSlug}" is now a sub-category of "${newSlug}" (it was a leftover top-level category from an older seed)`);
  }
  if (!moved) log('seed: no retired top-level categories to tidy');
}
