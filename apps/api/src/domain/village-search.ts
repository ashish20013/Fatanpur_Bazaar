import { haversineKm, roundKm, type LatLng } from '../common/utils/geo';
import { skeleton } from '../common/utils/translit';

/** Village picker logic (A8.9) — tiny list, done in JS so Devanagari↔roman matching works. */
export interface PickerVillage {
  id: number;
  name: string;
  nameHi: string | null;
  isActive: boolean;
  isPopular: boolean;
  orderCount: number;
  distanceKm: number | null;
  lat: number | null;
  lng: number | null;
  aliases: string[];
}

/** Rule 1 + 2: only active villages, ordered popular → order_count → distance. */
export function pickerOrder<T extends PickerVillage>(villages: readonly T[]): T[] {
  return villages
    .filter((v) => v.isActive)
    .sort(
      (a, b) =>
        Number(b.isPopular) - Number(a.isPopular) ||
        b.orderCount - a.orderCount ||
        (a.distanceKm ?? 999) - (b.distanceKm ?? 999) ||
        a.id - b.id,
    );
}

function haystacks(v: PickerVillage): string[] {
  return [v.name, v.nameHi ?? '', ...v.aliases].filter(Boolean);
}

/**
 * Rule 3: match name + name_hi + aliases, case/accent-insensitive, both scripts.
 * Exact/prefix hits rank above substring hits; picker order breaks ties.
 */
export function searchVillages<T extends PickerVillage>(villages: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return pickerOrder(villages);
  const qs = skeleton(q);
  const scored: { v: T; score: number }[] = [];
  for (const v of pickerOrder(villages)) {
    let best = 0;
    for (const h of haystacks(v)) {
      const hl = h.toLowerCase();
      const hs = skeleton(h);
      if (hl === q || (qs.length > 0 && hs === qs)) best = Math.max(best, 3);
      else if (hl.startsWith(q) || (qs.length >= 2 && hs.startsWith(qs))) best = Math.max(best, 2);
      else if (hl.includes(q) || (qs.length >= 2 && hs.includes(qs))) best = Math.max(best, 1);
    }
    if (best > 0) scored.push({ v, score: best });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.v);
}

/**
 * Rule 4: GPS button → nearest 3 pinned on top, but NOTHING is auto-selected.
 * Returns the reordered list + the pinned ids; `selectedId` is always null by design.
 */
export function nearestFirst<T extends PickerVillage>(
  villages: readonly T[],
  pt: LatLng,
  n = 3,
): { list: T[]; pinnedIds: number[]; selectedId: null } {
  const ordered = pickerOrder(villages);
  const withD = ordered
    .filter((v) => v.lat !== null && v.lng !== null)
    .map((v) => ({ v, d: roundKm(haversineKm(pt, { lat: v.lat as number, lng: v.lng as number })) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
  const pinnedIds = withD.map((x) => x.v.id);
  const rest = ordered.filter((v) => !pinnedIds.includes(v.id));
  return { list: [...withD.map((x) => x.v), ...rest], pinnedIds, selectedId: null };
}
