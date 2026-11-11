import Config from 'react-native-config';

/**
 * Central place for build-time config. `react-native-config` reads `.env` at native build
 * time — see .env.example. The production fallback keeps a release APK working even if the
 * native config module fails to hand over the env at runtime; the emulator loopback is no use
 * on a customer's phone.
 */
const PRODUCTION_API = 'https://api.fatanpurbazaar.com';
const API_BASE_URL: string = (Config.API_BASE_URL || PRODUCTION_API).replace(/\/+$/, '');

export const CONFIG = {
  apiBaseUrl: API_BASE_URL,
  apiUrl: `${API_BASE_URL}/v1`,
  socketUrl: API_BASE_URL,
  socketPath: Config.SOCKET_PATH ?? '/socket',
  supportPhone: Config.SUPPORT_PHONE ?? '9616038670',
  whatsapp: Config.WHATSAPP ?? '9616038670',
  /** App version — synced with android/app/build.gradle versionName */
  appVersion: Config.APP_VERSION ?? '1.0.0',
} as const;

/**
 * The API serves image paths relative to its own origin ("/uploads/products/…").
 * The website resolves those against its own document origin; React Native has no document,
 * so a bare "/uploads/…" URI silently renders nothing — which is why every picture in the app
 * was blank. Every image URI coming from the API goes through this before <Image source>.
 */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|file:)/i.test(path)) return path;
  return `${CONFIG.apiBaseUrl}/${path.replace(/^\/+/, '')}`;
}
