// Mirrors docs/bench/villagepickertest.sql — the dataset the picker rules were verified on.
import type { PickerVillage } from '../../src/domain/village-search';
import type { VillageForCheck, ZoneForCheck, ServiceSettings } from '../../src/domain/serviceability';

export const STORE = { lat: 25.742, lng: 81.954 };

export const PICKER: PickerVillage[] = [
  { id: 1, name: 'Fatanpur Bazaar', nameHi: 'फतनपुर बाज़ार', isActive: true, isPopular: true, orderCount: 64, distanceKm: 0, lat: 25.742, lng: 81.954, aliases: [] },
  { id: 2, name: 'Raniganj', nameHi: 'रानीगंज', isActive: true, isPopular: true, orderCount: 18, distanceKm: 2.56, lat: 25.7601, lng: 81.9702, aliases: ['Rani Ganj', 'raniganj', 'रानी गंज'] },
  { id: 3, name: 'Bhagesar', nameHi: 'भगेसर', isActive: true, isPopular: false, orderCount: 7, distanceKm: 3.42, lat: 25.718, lng: 81.931, aliases: ['Bhagesar Kala'] },
  { id: 4, name: 'Katra', nameHi: 'कटरा', isActive: true, isPopular: false, orderCount: 3, distanceKm: 3.87, lat: 25.7755, lng: 81.9385, aliases: [] },
  { id: 5, name: 'Rampur', nameHi: 'रामपुर', isActive: true, isPopular: false, orderCount: 0, distanceKm: 4.52, lat: 25.729, lng: 81.998, aliases: ['Rampur Purwa', 'रामपुर पुरवा'] },
  { id: 6, name: 'Antu', nameHi: 'अंतू', isActive: false, isPopular: false, orderCount: 0, distanceKm: 10.2, lat: 25.813, lng: 82.041, aliases: [] },
];

export const CHECK_VILLAGES: VillageForCheck[] = PICKER.map((v) => ({
  id: v.id, name: v.name, nameHi: v.nameHi, isActive: v.isActive, lat: v.lat, lng: v.lng,
  distanceKm: v.distanceKm, deliveryFee: 0, minOrder: 0, etaMinutes: 0, zoneId: null,
}));

export const RADIUS_ZONE: ZoneForCheck = {
  id: 1, mode: 'RADIUS', centerLat: STORE.lat, centerLng: STORE.lng, radiusKm: 6, ring: null, bbox: null,
  priority: 10, deliveryFee: 2000, minOrder: 9900, etaMinutes: 45,
};

export const SETTINGS: ServiceSettings = {
  gpsAccuracyThresholdM: 500, defaultDeliveryFee: 2000, defaultMinOrder: 9900, defaultEtaMinutes: 45,
  prepMinutes: 20, minutesPerKm: 4, etaBufferMinutes: 10, store: STORE,
};

/** Point `km` away from the store on a bearing (same helper as geoalgorithmtest.js). */
export function at(km: number, bearing = 0): { lat: number; lng: number } {
  const rad = (d: number): number => (d * Math.PI) / 180;
  return {
    lat: STORE.lat + (km / 110.574) * Math.cos(rad(bearing)),
    lng: STORE.lng + (km / (111.32 * Math.cos(rad(STORE.lat)))) * Math.sin(rad(bearing)),
  };
}
