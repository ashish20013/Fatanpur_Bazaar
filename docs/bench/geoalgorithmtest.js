// ── Algorithm jo build prompt me jayega — pehle yahan test karo ──
const R = 6371;
const rad = d => d * Math.PI / 180;
function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
// Ray casting. ring = [[lng,lat], ...] GeoJSON order
function pointInPolygon(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt.lat) !== (yj > pt.lat)) &&
      (pt.lng < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function bboxOf(ring) {
  const lats = ring.map(p => p[1]), lngs = ring.map(p => p[0]);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats),
           minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}
// Circle → polygon (admin map pe circle ko polygon me convert karne ke liye, 64 points)
function circleToPolygon(center, radiusKm, points = 64) {
  const ring = [];
  const latR = radiusKm / 110.574;
  const lngR = radiusKm / (111.320 * Math.cos(rad(center.lat)));
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 2 * Math.PI;
    ring.push([+(center.lng + lngR * Math.cos(t)).toFixed(7),
               +(center.lat + latR * Math.sin(t)).toFixed(7)]);
  }
  return ring;
}

const CENTER = { lat: 25.7420, lng: 81.9540 };
const RADIUS = 6;
let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}  →  ${got}${ok ? '' : `  (expected ${want})`}`);
};

console.log('── RADIUS mode ──');
const at = (km, bearing = 0) => ({
  lat: CENTER.lat + (km / 110.574) * Math.cos(rad(bearing)),
  lng: CENTER.lng + (km / (111.320 * Math.cos(rad(CENTER.lat)))) * Math.sin(rad(bearing)),
});
t('centre (0 km) inside',        haversineKm(CENTER, at(0)) <= RADIUS, true);
t('5.5 km north inside',         haversineKm(CENTER, at(5.5, 0)) <= RADIUS, true);
t('5.9 km east inside',          haversineKm(CENTER, at(5.9, 90)) <= RADIUS, true);
t('6.1 km south OUTSIDE',        haversineKm(CENTER, at(6.1, 180)) <= RADIUS, false);
t('12 km west OUTSIDE',          haversineKm(CENTER, at(12, 270)) <= RADIUS, false);
console.log(`   (5.9 km east ka naapa gaya distance: ${haversineKm(CENTER, at(5.9,90)).toFixed(3)} km)`);

console.log('\n── POLYGON mode (6 km circle → 64-point polygon) ──');
const ring = circleToPolygon(CENTER, RADIUS);
const bbox = bboxOf(ring);
t('polygon closed (first == last)', JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length-1]), true);
t('centre inside polygon',       pointInPolygon(at(0), ring), true);
t('5.0 km NE inside polygon',    pointInPolygon(at(5.0, 45), ring), true);
t('6.5 km NE OUTSIDE polygon',   pointInPolygon(at(6.5, 45), ring), false);
t('bbox pre-filter rejects far point',
  (at(50,90).lat >= bbox.minLat && at(50,90).lat <= bbox.maxLat &&
   at(50,90).lng >= bbox.minLng && at(50,90).lng <= bbox.maxLng), false);

console.log('\n── Custom polygon (road ke hisaab se — circle nahi) ──');
const custom = [[81.90,25.70],[82.01,25.70],[82.02,25.78],[81.93,25.80],[81.89,25.75],[81.90,25.70]];
t('Fatanpur centre custom polygon me',  pointInPolygon(CENTER, custom), true);
t('point bahar (81.85, 25.72)',         pointInPolygon({lat:25.72,lng:81.85}, custom), false);
t('point andar (81.97, 25.75)',         pointInPolygon({lat:25.75,lng:81.97}, custom), true);

console.log(`\nTESTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
