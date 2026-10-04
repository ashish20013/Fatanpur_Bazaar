import { haversineKm, roundKm, zoneContains, type LatLng, type ZoneShape } from '../common/utils/geo';

/**
 * A8.3 decision matrix. Pure: callers load villages/zones/settings and pass them in.
 *
 * Three rules that must never break:
 *  1. An ACTIVE village always wins — GPS "6.3 km" does not block a listed village.
 *  2. Bad GPS (accuracy > threshold, or none) never blocks — it asks for a village instead.
 *  3. Outside ≠ dead end — callers always get servedAreas + nearestServedKm for the sorry screen.
 */
export interface VillageForCheck {
  id: number;
  name: string;
  nameHi: string | null;
  isActive: boolean;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  deliveryFee: number; // paise; 0 → fall through to zone/settings
  minOrder: number; // paise; 0 → fall through
  etaMinutes: number; // 0 → fall through
  zoneId: number | null;
}
export interface ZoneForCheck extends ZoneShape {
  id: number;
  priority: number;
  deliveryFee: number; // paise (schema: NOT NULL)
  minOrder: number; // paise
  etaMinutes: number;
}
export interface ServiceSettings {
  gpsAccuracyThresholdM: number;
  defaultDeliveryFee: number; // paise
  defaultMinOrder: number; // paise
  defaultEtaMinutes: number;
  prepMinutes: number;
  minutesPerKm: number;
  etaBufferMinutes: number;
  store: LatLng;
}
export interface CheckInput {
  villageId?: number | null;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
}
export type CheckMethod = 'VILLAGE' | 'POLYGON' | 'RADIUS' | 'UNKNOWN';
export type CheckReason =
  | 'VILLAGE_ACTIVE'
  | 'VILLAGE_INACTIVE'
  | 'VILLAGE_UNKNOWN'
  | 'GPS_INSIDE'
  | 'GPS_OUTSIDE'
  | 'GPS_UNRELIABLE'
  | 'NO_INPUT';

export interface CheckResult {
  serviceable: boolean;
  method: CheckMethod;
  reason: CheckReason;
  zone: ZoneForCheck | null;
  village: VillageForCheck | null;
  needsVillagePick: boolean;
  flagNewArea: boolean;
  distanceKm: number | null;
  etaMinutes: number;
  deliveryFee: number;
  minOrder: number;
  servedAreas: string[];
  nearestServedKm: number | null;
}

export function findZone(zones: readonly ZoneForCheck[], pt: LatLng): ZoneForCheck | null {
  const ordered = [...zones].sort((a, b) => a.priority - b.priority || a.id - b.id);
  return ordered.find((z) => zoneContains(z, pt)) ?? null;
}

/** A8.8 — never returns NaN/empty ETA: distance may be null (no GPS). */
export function computeEta(distanceKm: number | null, zone: ZoneForCheck | null, village: VillageForCheck | null, s: ServiceSettings): number {
  if (distanceKm !== null && Number.isFinite(distanceKm)) {
    return s.prepMinutes + Math.ceil(distanceKm * s.minutesPerKm) + s.etaBufferMinutes;
  }
  return zone?.etaMinutes || village?.etaMinutes || s.defaultEtaMinutes;
}

/**
 * Precedence (see ASSUMPTIONS — A8.8 and A12 disagree): a village-specific non-zero override is
 * the most specific → then the matched zone → then global settings.
 */
export function feeAndMin(zone: ZoneForCheck | null, village: VillageForCheck | null, s: ServiceSettings): { deliveryFee: number; minOrder: number } {
  const deliveryFee = village && village.deliveryFee > 0 ? village.deliveryFee : zone ? zone.deliveryFee : s.defaultDeliveryFee;
  const minOrder = village && village.minOrder > 0 ? village.minOrder : zone ? zone.minOrder : s.defaultMinOrder;
  return { deliveryFee, minOrder };
}

function servedSummary(villages: readonly VillageForCheck[], pt: LatLng | null): { servedAreas: string[]; nearestServedKm: number | null } {
  const active = villages.filter((v) => v.isActive);
  const servedAreas = active.slice(0, 8).map((v) => v.nameHi ?? v.name);
  let nearest: number | null = null;
  if (pt) {
    for (const v of active) {
      if (v.lat === null || v.lng === null) continue;
      const d = haversineKm(pt, { lat: v.lat, lng: v.lng });
      if (nearest === null || d < nearest) nearest = d;
    }
  }
  return { servedAreas, nearestServedKm: nearest === null ? null : roundKm(nearest) };
}

export function checkServiceability(
  input: CheckInput,
  villages: readonly VillageForCheck[],
  zones: readonly ZoneForCheck[],
  s: ServiceSettings,
): CheckResult {
  const hasGps = typeof input.lat === 'number' && typeof input.lng === 'number' && Number.isFinite(input.lat) && Number.isFinite(input.lng);
  const pt: LatLng | null = hasGps ? { lat: input.lat as number, lng: input.lng as number } : null;
  // Missing accuracy is treated as unreliable: "location nahi mili" ≠ "aap bahar hain".
  const gpsReliable = pt !== null && typeof input.accuracyM === 'number' && input.accuracyM <= s.gpsAccuracyThresholdM;
  const summary = servedSummary(villages, pt);
  const base = { ...summary, flagNewArea: false, needsVillagePick: false };

  // ── 1. Village chosen → village decides (GPS irrelevant for the verdict) ──
  if (input.villageId) {
    const village = villages.find((v) => v.id === input.villageId) ?? null;
    if (village) {
      const distanceKm =
        pt && gpsReliable
          ? roundKm(haversineKm(s.store, pt))
          : village.distanceKm ?? (village.lat !== null && village.lng !== null ? roundKm(haversineKm(s.store, { lat: village.lat, lng: village.lng })) : null);
      const zone = (village.zoneId !== null ? zones.find((z) => z.id === village.zoneId) : undefined) ?? (village.lat !== null && village.lng !== null ? findZone(zones, { lat: village.lat, lng: village.lng }) : null);
      const { deliveryFee, minOrder } = feeAndMin(zone ?? null, village, s);
      return {
        ...base,
        serviceable: village.isActive,
        method: 'VILLAGE',
        reason: village.isActive ? 'VILLAGE_ACTIVE' : 'VILLAGE_INACTIVE',
        zone: zone ?? null,
        village,
        distanceKm,
        etaMinutes: computeEta(village.isActive ? village.distanceKm ?? distanceKm : distanceKm, zone ?? null, village, s),
        deliveryFee,
        minOrder,
      };
    }
    // Unknown id falls through to GPS — same as "मेरा गाँव इसमें नहीं है".
  }

  // ── 2. No village: GPS must be present AND accurate, otherwise ask for a village ──
  if (!pt || !gpsReliable) {
    const { deliveryFee, minOrder } = feeAndMin(null, null, s);
    return {
      ...base,
      serviceable: false,
      method: 'UNKNOWN',
      reason: pt ? 'GPS_UNRELIABLE' : input.villageId ? 'VILLAGE_UNKNOWN' : 'NO_INPUT',
      zone: null,
      village: null,
      needsVillagePick: true,
      distanceKm: null,
      etaMinutes: computeEta(null, null, null, s),
      deliveryFee,
      minOrder,
    };
  }

  // ── 3. Accurate GPS → zone test ──
  const zone = findZone(zones, pt);
  const distanceKm = roundKm(haversineKm(s.store, pt));
  const { deliveryFee, minOrder } = feeAndMin(zone, null, s);
  const method: CheckMethod = zone ? zone.mode : zones.some((z) => z.mode === 'POLYGON') ? 'POLYGON' : 'RADIUS';
  return {
    ...base,
    serviceable: zone !== null,
    method,
    reason: zone ? 'GPS_INSIDE' : 'GPS_OUTSIDE',
    zone,
    village: null,
    flagNewArea: zone !== null, // served, but the village isn't on our list → admin review
    distanceKm,
    etaMinutes: computeEta(distanceKm, zone, null, s),
    deliveryFee,
    minOrder,
  };
}
