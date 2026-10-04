import test from 'node:test';
import assert from 'node:assert/strict';
import { circleToPolygon, haversineKm, isSelfIntersecting, pointInPolygon, polygonAreaKm2, bboxOf, inBBox, zoneContains, type Ring } from '../../src/common/utils/geo';
import { checkServiceability, computeEta } from '../../src/domain/serviceability';
import { nearestFirst, pickerOrder, searchVillages } from '../../src/domain/village-search';
import { CHECK_VILLAGES, PICKER, RADIUS_ZONE, SETTINGS, STORE, at } from '../fixtures/villages';

test('GEO-01 haversine Fatanpur→Raniganj ≈ 2.5 km (±0.3)', () => {
  const d = haversineKm(STORE, { lat: 25.7601, lng: 81.9702 });
  assert.ok(Math.abs(d - 2.5) <= 0.3, `got ${d}`);
});

test('GEO-02 RADIUS: 5.9 km inside, 6.1 km outside', () => {
  assert.equal(zoneContains(RADIUS_ZONE, at(5.9, 90)), true);
  assert.equal(zoneContains(RADIUS_ZONE, at(6.1, 180)), false);
  assert.equal(zoneContains(RADIUS_ZONE, at(0)), true);
  assert.equal(zoneContains(RADIUS_ZONE, at(12, 270)), false);
});

test('GEO-03 circleToPolygon(6 km): closed ring, centre inside, 6.5 km outside', () => {
  const ring = circleToPolygon(STORE, 6);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  assert.equal(ring.length, 65);
  assert.equal(pointInPolygon(at(0), ring), true);
  assert.equal(pointInPolygon(at(5, 45), ring), true);
  assert.equal(pointInPolygon(at(6.5, 45), ring), false);
  const area = polygonAreaKm2(ring);
  assert.ok(Math.abs(area - Math.PI * 36) < 2, `area ${area}`);
});

test('GEO-04 custom non-circular polygon: inside and outside', () => {
  const custom: Ring = [[81.9, 25.7], [82.01, 25.7], [82.02, 25.78], [81.93, 25.8], [81.89, 25.75], [81.9, 25.7]];
  assert.equal(pointInPolygon(STORE, custom), true);
  assert.equal(pointInPolygon({ lat: 25.72, lng: 81.85 }, custom), false);
  assert.equal(pointInPolygon({ lat: 25.75, lng: 81.97 }, custom), true);
});

test('GEO-05 bbox pre-filter rejects a far point before the polygon test', () => {
  const ring = circleToPolygon(STORE, 6);
  const far = at(50, 90);
  assert.equal(inBBox(far, bboxOf(ring)), false);
  const zone = { ...RADIUS_ZONE, mode: 'POLYGON' as const, radiusKm: null, ring, bbox: bboxOf(ring) };
  assert.equal(zoneContains(zone, far), false);
  assert.equal(zoneContains(zone, at(3, 10)), true);
});

test('GEO-06 active village + GPS says 6.3 km → SERVE (village wins)', () => {
  const p = at(6.3, 0);
  const r = checkServiceability({ villageId: 2, lat: p.lat, lng: p.lng, accuracyM: 20 }, CHECK_VILLAGES, [RADIUS_ZONE], SETTINGS);
  assert.equal(r.serviceable, true);
  assert.equal(r.method, 'VILLAGE');
  assert.equal(r.reason, 'VILLAGE_ACTIVE');
});

test('GEO-06b inactive village → sorry, even with GPS inside', () => {
  const r = checkServiceability({ villageId: 6, lat: STORE.lat, lng: STORE.lng, accuracyM: 10 }, CHECK_VILLAGES, [RADIUS_ZONE], SETTINGS);
  assert.equal(r.serviceable, false);
  assert.equal(r.reason, 'VILLAGE_INACTIVE');
  assert.ok(r.servedAreas.length > 0);
});

test('GEO-07 no village + accuracy 800 m → NOT blocked as outside; village picker required', () => {
  const p = at(9, 0);
  const r = checkServiceability({ lat: p.lat, lng: p.lng, accuracyM: 800 }, CHECK_VILLAGES, [RADIUS_ZONE], SETTINGS);
  assert.equal(r.method, 'UNKNOWN');
  assert.equal(r.needsVillagePick, true);
  assert.equal(r.reason, 'GPS_UNRELIABLE');
  const none = checkServiceability({}, CHECK_VILLAGES, [RADIUS_ZONE], SETTINGS);
  assert.equal(none.needsVillagePick, true);
  assert.ok(Number.isFinite(none.etaMinutes) && none.etaMinutes > 0, 'ETA never empty');
});

test('GEO-08 no village + accurate GPS + outside → not serviceable, lead data present', () => {
  const p = at(8.4, 45);
  const r = checkServiceability({ lat: p.lat, lng: p.lng, accuracyM: 30 }, CHECK_VILLAGES, [RADIUS_ZONE], SETTINGS);
  assert.equal(r.serviceable, false);
  assert.equal(r.reason, 'GPS_OUTSIDE');
  assert.equal(r.method, 'RADIUS');
  assert.ok(r.distanceKm !== null && Math.abs(r.distanceKm - 8.4) < 0.1);
  assert.ok(r.nearestServedKm !== null && r.nearestServedKm > 0);
  assert.ok(r.servedAreas.length <= 8);
});

test('GEO-09 no village + accurate GPS + inside → allow + admin flag', () => {
  const p = at(2, 200);
  const r = checkServiceability({ lat: p.lat, lng: p.lng, accuracyM: 50 }, CHECK_VILLAGES, [RADIUS_ZONE], SETTINGS);
  assert.equal(r.serviceable, true);
  assert.equal(r.flagNewArea, true);
  assert.equal(r.reason, 'GPS_INSIDE');
  assert.equal(r.etaMinutes, 20 + Math.ceil((r.distanceKm as number) * 4) + 10);
});

test('A8.8 ETA falls back when distance is null', () => {
  assert.equal(computeEta(null, null, null, SETTINGS), 45);
  assert.equal(computeEta(2.56, null, null, SETTINGS), 20 + 11 + 10);
});

test('GEO-13 self-intersecting polygon (bow-tie) detected; simple polygon passes', () => {
  const bow: Ring = [[81.9, 25.7], [82.0, 25.8], [82.0, 25.7], [81.9, 25.8], [81.9, 25.7]];
  assert.equal(isSelfIntersecting(bow), true);
  assert.equal(isSelfIntersecting(circleToPolygon(STORE, 6)), false);
});

test('GEO-17 picker never shows inactive villages', () => {
  const ids = pickerOrder(PICKER).map((v) => v.id);
  assert.equal(ids.includes(6), false);
  assert.equal(searchVillages(PICKER, 'antu').length, 0);
  assert.equal(searchVillages(PICKER, 'अंतू').length, 0);
});

test('GEO-18 alias search: "rani" / "रानी" / "Rani Ganj" → रानीगंज', () => {
  for (const q of ['rani', 'रानी', 'Rani Ganj', 'RANIGANJ', 'raniganj']) {
    const r = searchVillages(PICKER, q);
    assert.equal(r[0]?.nameHi, 'रानीगंज', `query ${q} → ${r.map((x) => x.name).join(',')}`);
  }
});

test('GEO-19 hamlet alias "Rampur Purwa" → रामपुर', () => {
  assert.equal(searchVillages(PICKER, 'Rampur Purwa')[0]?.nameHi, 'रामपुर');
  assert.equal(searchVillages(PICKER, 'रामपुर पुरवा')[0]?.nameHi, 'रामपुर');
});

test('GEO-20 picker order: is_popular DESC, order_count DESC, distance ASC', () => {
  assert.deepEqual(pickerOrder(PICKER).map((v) => v.id), [1, 2, 3, 4, 5]);
});

test('GEO-21 GPS button pins nearest 3 but selects nothing', () => {
  const r = nearestFirst(PICKER, { lat: 25.73, lng: 81.995 }); // right next to Rampur
  assert.equal(r.list[0].id, 5);
  assert.equal(r.pinnedIds.length, 3);
  assert.equal(r.selectedId, null);
  assert.equal(r.list.some((v) => v.id === 6), false);
});
