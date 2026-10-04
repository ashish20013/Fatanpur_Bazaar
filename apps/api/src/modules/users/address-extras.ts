import type { AddressExtras, LocationMethod } from '@fb/shared-types';

/** Columns shared by address_extras and order_ship_extras (migration 003). */
export const EXTRA_COLUMNS = [
  'guardian_name', 'alt_phone', 'district', 'pincode', 'directions', 'delivery_note', 'location_method',
  // migration 005 — where the customer was standing when the order was placed
  'origin_lat', 'origin_lng', 'origin_accuracy_m', 'ordered_from_here',
] as const;

export interface ExtrasInput {
  guardianName?: string | null;
  altPhone?: string | null;
  district?: string | null;
  pincode?: string | null;
  directions?: string | null;
  deliveryNote?: string | null;
  locationMethod?: LocationMethod | null;
  originLat?: number | null;
  originLng?: number | null;
  originAccuracyM?: number | null;
  /** true = "I am at the place where I want the goods"; false = ordering from somewhere else. */
  orderedFromHere?: boolean | null;
}

const clean = (s: string | null | undefined, max: number): string | null => {
  const v = (s ?? '').trim();
  return v ? v.slice(0, max) : null;
};

/** Input → DB row. Phones are stored like everywhere else: '91' + 10 digits. */
export function extrasRow(b: ExtrasInput): Record<(typeof EXTRA_COLUMNS)[number], string | number | null> {
  const alt = clean(b.altPhone, 10);
  return {
    guardian_name: clean(b.guardianName, 120),
    alt_phone: alt ? `91${alt}` : null,
    district: clean(b.district, 80),
    pincode: clean(b.pincode, 6),
    directions: clean(b.directions, 500),
    delivery_note: clean(b.deliveryNote, 300),
    location_method: b.locationMethod ?? null,
    origin_lat: typeof b.originLat === 'number' ? b.originLat : null,
    origin_lng: typeof b.originLng === 'number' ? b.originLng : null,
    origin_accuracy_m: typeof b.originAccuracyM === 'number' ? Math.min(65535, Math.round(b.originAccuracyM)) : null,
    ordered_from_here: b.orderedFromHere === null || b.orderedFromHere === undefined ? null : b.orderedFromHere ? 1 : 0,
  };
}

/** DB row (possibly all-null from a LEFT JOIN) → API shape. */
export function extrasView(r: Record<string, unknown>): AddressExtras {
  const s = (k: string): string | null => (r[k] === null || r[k] === undefined || r[k] === '' ? null : String(r[k]));
  const alt = s('alt_phone');
  return {
    guardianName: s('guardian_name'),
    altPhone: alt ? alt.replace(/^91(?=\d{10}$)/, '') : null,
    district: s('district'),
    pincode: s('pincode'),
    directions: s('directions'),
    deliveryNote: s('delivery_note'),
    locationMethod: (s('location_method') as LocationMethod | null) ?? null,
    originLat: r.origin_lat === null || r.origin_lat === undefined ? null : Number(r.origin_lat),
    originLng: r.origin_lng === null || r.origin_lng === undefined ? null : Number(r.origin_lng),
    originAccuracyM: r.origin_accuracy_m === null || r.origin_accuracy_m === undefined ? null : Number(r.origin_accuracy_m),
    orderedFromHere: r.ordered_from_here === null || r.ordered_from_here === undefined ? null : Number(r.ordered_from_here) === 1,
  };
}
