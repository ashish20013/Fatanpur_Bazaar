/**
 * Geo primitives for the 6 km service boundary (BUILD_PROMPT A8.2).
 * haversine / pointInPolygon / circleToPolygon are the exact algorithms verified in
 * docs/bench/geoalgorithmtest.js — do not "improve" them without re-running GEO-01..05.
 */
export interface LatLng {
  lat: number;
  lng: number;
}
/** GeoJSON ring: [[lng, lat], ...] — longitude FIRST. */
export type Ring = [number, number][];
export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const R = 6371;
const rad = (d: number): number => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Ray casting. Planar treatment is fine at a 6 km scale. */
export function pointInPolygon(pt: LatLng, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function bboxOf(ring: Ring): BBox {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function inBBox(pt: LatLng, b: BBox): boolean {
  return pt.lat >= b.minLat && pt.lat <= b.maxLat && pt.lng >= b.minLng && pt.lng <= b.maxLng;
}

/** Circle → closed editable polygon (admin "गोल दायरे से शुरू करें"). */
export function circleToPolygon(center: LatLng, radiusKm: number, points = 64): Ring {
  const ring: Ring = [];
  const latR = radiusKm / 110.574;
  const lngR = radiusKm / (111.32 * Math.cos(rad(center.lat)));
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 2 * Math.PI;
    ring.push([+(center.lng + lngR * Math.cos(t)).toFixed(7), +(center.lat + latR * Math.sin(t)).toFixed(7)]);
  }
  // i === points yields cos(2π)/sin(2π) ≈ first point but not bit-identical; force closure.
  ring[ring.length - 1] = [ring[0][0], ring[0][1]];
  return ring;
}

export interface ZoneShape {
  mode: 'RADIUS' | 'POLYGON';
  centerLat: number;
  centerLng: number;
  radiusKm: number | null;
  ring: Ring | null;
  bbox: BBox | null;
}

export function zoneContains(zone: ZoneShape, pt: LatLng): boolean {
  if (zone.mode === 'RADIUS') {
    if (zone.radiusKm === null) return false;
    return haversineKm({ lat: zone.centerLat, lng: zone.centerLng }, pt) <= zone.radiusKm;
  }
  if (!zone.ring) return false;
  const box = zone.bbox ?? bboxOf(zone.ring);
  if (!inBBox(pt, box)) return false; // cheap pre-filter
  return pointInPolygon(pt, zone.ring);
}

/** Shoelace area on an equirectangular projection around the ring's mean latitude, km². */
export function polygonAreaKm2(ring: Ring): number {
  if (ring.length < 4) return 0;
  const meanLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = 111.32 * Math.cos(rad(meanLat));
  const ky = 110.574;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    a += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.abs(a) / 2;
}

function segmentsIntersect(p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]): boolean {
  const d = (a: [number, number], b: [number, number], c: [number, number]): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when any two non-adjacent edges cross (O(n²) — fine for ≤ 500 vertices). */
export function isSelfIntersecting(ring: Ring): boolean {
  const n = ring.length - 1; // closed ring: last == first
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

/** Rough India bounds — used to catch [lat,lng] swapped GeoJSON and tracking garbage. */
export function inIndia(pt: LatLng): boolean {
  return pt.lat >= 6 && pt.lat <= 38 && pt.lng >= 68 && pt.lng <= 98;
}

export function roundKm(km: number): number {
  return Math.round(km * 100) / 100;
}

/**
 * Google Maps link for a saved pin — the rider taps it and navigation opens. Coordinates are
 * rounded to 6 dp (~0.1 m) so the URL never carries float noise. Null when there is no pin.
 */
export function mapsUrl(lat: number | string | null | undefined, lng: number | string | null | undefined): string | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === '' || lng === '') return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${a.toFixed(6)},${b.toFixed(6)}`;
}

/**
 * Google Maps turn-by-turn navigation URL — the rider opens it and gets spoken directions.
 * Separate from mapsUrl which just drops a pin.
 */
export function navUrl(lat: number | string | null | undefined, lng: number | string | null | undefined): string | null {
  const pin = mapsUrl(lat, lng);
  if (!pin) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}&travelmode=driving`;
}
