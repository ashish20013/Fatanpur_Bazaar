/** A23 incremental aggregate; the nightly `ratings:recompute` corrects hidden/flagged drift. */
export function addRating(avg: number, count: number, r: number): { avg: number; count: number } {
  const next = (avg * count + r) / (count + 1);
  return { avg: Math.round(next * 100) / 100, count: count + 1 };
}

/** Review comment hygiene: strip HTML, clamp 1000, flag links (spam). */
export function sanitizeComment(input: string | null | undefined): { comment: string | null; flagged: boolean } {
  if (!input) return { comment: null, flagged: false };
  const text = input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  const flagged = /(https?:\/\/|www\.|\.com\b|\.in\b|t\.me\/|wa\.me\/)/i.test(text);
  return { comment: text || null, flagged };
}
