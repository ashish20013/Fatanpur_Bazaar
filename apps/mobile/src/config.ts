import Config from 'react-native-config';

/**
 * Central place for build-time config. `react-native-config` reads `.env` at native build
 * time — see .env.example. Falls back to the Android emulator loopback so a fresh checkout
 * still boots against `npm run dev --workspace=apps/api` without any setup.
 */
const API_BASE_URL: string = (Config.API_BASE_URL ?? 'http://10.0.2.2:3000').replace(/\/+$/, '');

export const CONFIG = {
  apiBaseUrl: API_BASE_URL,
  apiUrl: `${API_BASE_URL}/v1`,
  socketUrl: API_BASE_URL,
  socketPath: Config.SOCKET_PATH ?? '/socket',
  supportPhone: Config.SUPPORT_PHONE ?? '9616038670',
} as const;
