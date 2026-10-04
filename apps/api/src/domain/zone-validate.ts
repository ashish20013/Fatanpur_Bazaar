import { bboxOf, circleToPolygon, haversineKm, inIndia, isSelfIntersecting, pointInPolygon, polygonAreaKm2, type BBox, type LatLng, type Ring } from '../common/utils/geo';

/** A8.6 save-time validation — a bad boundary can switch the business off, so be strict. */
export interface ZoneDraft {
  mode: 'RADIUS' | 'POLYGON';
  centerLat: number;
  centerLng: number;
  radiusKm?: number | null;
  polygon?: { type: 'Polygon'; coordinates: number[][][] } | null;
}
export type ZoneValidation =
  | { ok: true; ring: Ring | null; bbox: BBox; areaKm2: number }
  | { ok: false; code: 'FEW_POINTS' | 'SWAPPED' | 'SELF_INTERSECT' | 'STORE_OUTSIDE' | 'AREA' | 'RADIUS' | 'BAD_GEOJSON'; messageHi: string };

const fail = (code: Exclude<ZoneValidation, { ok: true }>['code'], messageHi: string): ZoneValidation => ({ ok: false, code, messageHi });

export function validateZone(d: ZoneDraft, store: LatLng): ZoneValidation {
  if (d.mode === 'RADIUS') {
    const r = Number(d.radiusKm);
    if (!Number.isFinite(r) || r < 1 || r > 15) return fail('RADIUS', 'दायरा 1 से 15 किमी के बीच होना चाहिए');
    const center = { lat: d.centerLat, lng: d.centerLng };
    if (!inIndia(center)) return fail('SWAPPED', 'केंद्र का अक्षांश/देशांतर गलत है');
    if (haversineKm(center, store) > r) return fail('STORE_OUTSIDE', 'दुकान ही दायरे से बाहर है');
    const ring = circleToPolygon(center, r, 64);
    return { ok: true, ring: null, bbox: bboxOf(ring), areaKm2: Math.PI * r * r };
  }
  const coords = d.polygon?.type === 'Polygon' ? d.polygon.coordinates?.[0] : undefined;
  if (!Array.isArray(coords) || !coords.every((p) => Array.isArray(p) && p.length >= 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)))) {
    return fail('BAD_GEOJSON', 'GeoJSON Polygon सही नहीं है');
  }
  const ring: Ring = coords.map((p) => [p[0], p[1]]);
  // [lat, lng] swapped is the #1 GeoJSON mistake: Indian lat (6–38) sits where lng (68–98) should.
  if (ring.some(([lng, lat]) => !inIndia({ lat, lng }))) {
    const swapped = ring.every(([a, b]) => inIndia({ lat: a, lng: b }));
    return fail('SWAPPED', swapped ? 'GeoJSON में [देशांतर, अक्षांश] यानी [lng, lat] होना चाहिए — आपने उल्टा डाला है' : 'कुछ बिंदु भारत के बाहर हैं');
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]); // close the ring
  const distinct = new Set(ring.slice(0, -1).map((p) => p.join(','))).size;
  if (distinct < 3) return fail('FEW_POINTS', 'कम से कम 3 बिंदु चाहिए');
  if (isSelfIntersecting(ring)) return fail('SELF_INTERSECT', 'रेखाएं आपस में कट रही हैं');
  if (!pointInPolygon(store, ring)) return fail('STORE_OUTSIDE', 'दुकान ही दायरे से बाहर है');
  const areaKm2 = polygonAreaKm2(ring);
  if (areaKm2 < 0.5 || areaKm2 > 500) return fail('AREA', `क्षेत्रफल ${areaKm2.toFixed(1)} वर्ग किमी — 0.5 से 500 के बीच होना चाहिए`);
  return { ok: true, ring, bbox: bboxOf(ring), areaKm2 };
}
