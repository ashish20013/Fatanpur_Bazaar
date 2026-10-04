/**
 * Web env. ⚠️ NEXT_PUBLIC_* browser bundle me jaata hai — usme secret kabhi nahi (SECURITY_AUDIT §8).
 * Server-only values sirf server components / route handlers me padhe jaate hain.
 */
function clean(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Browser se API ka URL (socket, UPI QR, uploads). */
export const PUBLIC_API_URL = clean(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000');
/** Website ka apna URL — canonical, sitemap, JSON-LD. */
export const SITE_URL = clean(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001');
export const SOCKET_PATH = process.env.NEXT_PUBLIC_SOCKET_PATH ?? '/socket';
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** Server→API call ka URL: same machine pe 127.0.0.1 (ek hop kam). */
export const API_INTERNAL_URL = clean(process.env.API_INTERNAL_URL ?? PUBLIC_API_URL);
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
export const IS_PROD = process.env.NODE_ENV === 'production';

export const BRAND = {
  nameHi: 'फतनपुर बाज़ार',
  nameEn: 'Fatanpur Bazaar',
  addressLine: 'Fatanpur Bazaar, Raniganj, Pratapgarh, Uttar Pradesh — 230301',
  addressHi: 'फतनपुर बाज़ार, रानीगंज, प्रतापगढ़, उत्तर प्रदेश — 230301',
  locality: 'Raniganj',
  region: 'Uttar Pradesh',
  pincode: '230301',
  /** ⚠️ approximate — admin map editor se exact karna hai (NEXT-STEPS). */
  lat: 25.742,
  lng: 81.954,
  radiusKm: 6,
} as const;
