/** A10 search helpers (pure). */
export function normalizeQuery(q: string): string {
  return q.replace(/[+\-<>()~*"@]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}
export function terms(q: string): string[] {
  return normalizeQuery(q).split(' ').filter(Boolean);
}
/** Expand each term with its synonyms ("alu" → "aloo potato आलू"), deduped. */
export function expandTerms(baseTerms: readonly string[], synonyms: ReadonlyMap<string, string>): string[] {
  const out = new Set<string>();
  for (const t of baseTerms) {
    out.add(t);
    const m = synonyms.get(t.toLowerCase());
    if (m) for (const x of m.split(/\s+/)) if (x) out.add(x);
  }
  return [...out];
}
/**
 * InnoDB BOOLEAN MODE query. Each ORIGINAL term becomes a required group of itself + its
 * synonyms: +(alu* aloo* potato* आलू*). Terms < 3 chars are skipped (below ft_min_token_size)
 * — the LIKE fallback covers them.
 */
export function booleanQuery(baseTerms: readonly string[], synonyms: ReadonlyMap<string, string>): string | null {
  const groups: string[] = [];
  for (const t of baseTerms) {
    const variants = [t, ...(synonyms.get(t.toLowerCase())?.split(/\s+/) ?? [])].filter((x) => [...x].length >= 3);
    if (variants.length === 0) continue;
    groups.push(`+(${[...new Set(variants)].map((v) => `${v}*`).join(' ')})`);
  }
  return groups.length ? groups.join(' ') : null;
}
/** LIKE-safe pattern. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}
