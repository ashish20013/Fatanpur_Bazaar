import test from 'node:test';
import assert from 'node:assert/strict';
import { validateZone } from '../../src/domain/zone-validate';
import { circleToPolygon, zoneContains } from '../../src/common/utils/geo';
import { STORE, PICKER, at } from '../fixtures/villages';

const poly = (ring: number[][]) => ({ type: 'Polygon' as const, coordinates: [ring] });

test('GEO-13 self-intersecting polygon rejected with Hindi message', () => {
  const bow = [[81.9, 25.7], [82.0, 25.8], [82.0, 25.7], [81.9, 25.8], [81.9, 25.7]];
  const r = validateZone({ mode: 'POLYGON', centerLat: STORE.lat, centerLng: STORE.lng, polygon: poly(bow) }, STORE);
  assert.ok(!r.ok && r.code === 'SELF_INTERSECT' && r.messageHi.includes('कट'));
});
test('GEO-14 store centre outside the zone rejected (polygon + radius)', () => {
  const far = circleToPolygon(at(20, 90), 3);
  const r = validateZone({ mode: 'POLYGON', centerLat: STORE.lat, centerLng: STORE.lng, polygon: poly(far) }, STORE);
  assert.ok(!r.ok && r.code === 'STORE_OUTSIDE');
  const c = at(9, 0);
  const rr = validateZone({ mode: 'RADIUS', centerLat: c.lat, centerLng: c.lng, radiusKm: 6 }, STORE);
  assert.ok(!rr.ok && rr.code === 'STORE_OUTSIDE');
});
test('polygon validation: swapped [lat,lng], <3 points, area bounds, auto-close', () => {
  const ring = circleToPolygon(STORE, 6).map(([lng, lat]) => [lat, lng]);
  const s = validateZone({ mode: 'POLYGON', centerLat: STORE.lat, centerLng: STORE.lng, polygon: poly(ring) }, STORE);
  assert.ok(!s.ok && s.code === 'SWAPPED');
  const two = validateZone({ mode: 'POLYGON', centerLat: STORE.lat, centerLng: STORE.lng, polygon: poly([[81.95, 25.74], [81.96, 25.75], [81.95, 25.74]]) }, STORE);
  assert.ok(!two.ok && two.code === 'FEW_POINTS');
  const tiny = circleToPolygon(STORE, 0.2);
  const t = validateZone({ mode: 'POLYGON', centerLat: STORE.lat, centerLng: STORE.lng, polygon: poly(tiny) }, STORE);
  assert.ok(!t.ok && t.code === 'AREA');
  const open = circleToPolygon(STORE, 6).slice(0, -1);
  const ok = validateZone({ mode: 'POLYGON', centerLat: STORE.lat, centerLng: STORE.lng, polygon: poly(open) }, STORE);
  assert.ok(ok.ok && ok.ring && ok.ring[0].join() === ok.ring[ok.ring.length - 1].join());
  assert.ok(!validateZone({ mode: 'RADIUS', centerLat: STORE.lat, centerLng: STORE.lng, radiusKm: 40 }, STORE).ok);
});
test('GEO-15 shrinking the zone reports which ACTIVE villages fall outside', () => {
  const small = validateZone({ mode: 'RADIUS', centerLat: STORE.lat, centerLng: STORE.lng, radiusKm: 3 }, STORE);
  assert.ok(small.ok);
  const zone = { mode: 'RADIUS' as const, centerLat: STORE.lat, centerLng: STORE.lng, radiusKm: 3, ring: null, bbox: null };
  const outside = PICKER.filter((v) => v.isActive && v.lat !== null && !zoneContains(zone, { lat: v.lat, lng: v.lng as number })).map((v) => v.nameHi);
  assert.deepEqual(outside, ['भगेसर', 'कटरा', 'रामपुर']);
});
