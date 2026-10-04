import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

/**
 * Tokens live in react-native-keychain ONLY — never AsyncStorage, never anything that maps
 * to localStorage-like storage (BUILD_PROMPT §10 / A4). AsyncStorage is for non-secret,
 * per-device convenience data only (last village, device id, offline location queue).
 */
const TOKEN_SERVICE = 'fb.tokens.v1';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export const TokenStore = {
  async save(tokens: StoredTokens): Promise<void> {
    // Keychain stores one username/password pair per service — encode both tokens as JSON
    // in the "password" slot so a single secure entry holds the pair atomically.
    await Keychain.setGenericPassword('fb', JSON.stringify(tokens), { service: TOKEN_SERVICE });
  },
  async load(): Promise<StoredTokens | null> {
    try {
      const r = await Keychain.getGenericPassword({ service: TOKEN_SERVICE });
      if (!r) return null;
      const parsed = JSON.parse(r.password) as Partial<StoredTokens>;
      if (!parsed.accessToken || !parsed.refreshToken) return null;
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
    } catch {
      // Corrupt keychain entry (rare, e.g. after an OS restore) — treat as logged out.
      return null;
    }
  },
  async clear(): Promise<void> {
    await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
  },
};

// ───────────────────────── non-secret cache (AsyncStorage) ─────────────────────────
const KEYS = {
  deviceId: 'fb.deviceId',
  village: 'fb.village', // last picked village (mirrors web's fb_village cookie)
  notifAskedAt: 'fb.notifAskedAt',
  locationQueue: 'fb.locationQueue', // offline rider pings, capped at 20 (A19)
} as const;

function randomId(): string {
  // RN has no crypto.randomUUID by default without a polyfill; this is not security-sensitive
  // (a stable per-install id for X-Device-Id / FCM bookkeeping), so Math.random is fine here.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEYS.deviceId);
  if (existing) return existing;
  const id = randomId();
  await AsyncStorage.setItem(KEYS.deviceId, id);
  return id;
}

export interface StoredVillage {
  id: number;
  name: string;
  nameHi: string | null;
}
export async function getLastVillage(): Promise<StoredVillage | null> {
  const raw = await AsyncStorage.getItem(KEYS.village);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredVillage;
  } catch {
    return null;
  }
}
export async function setLastVillage(v: StoredVillage): Promise<void> {
  await AsyncStorage.setItem(KEYS.village, JSON.stringify(v));
}

/** "Later" on the notification soft-ask silences it for 7 days (A25). */
export async function shouldAskNotificationPermission(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEYS.notifAskedAt);
  if (!raw) return true;
  const askedAt = Number(raw);
  return Number.isFinite(askedAt) ? Date.now() - askedAt > 7 * 86_400_000 : true;
}
export async function markNotificationAsked(): Promise<void> {
  await AsyncStorage.setItem(KEYS.notifAskedAt, String(Date.now()));
}

export interface QueuedPing {
  assignmentId: number;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  ts: number;
}
const MAX_QUEUE = 20;

export async function queueLocationPing(p: QueuedPing): Promise<void> {
  const list = await getQueuedPings();
  list.push(p);
  // Cap at 20 — drop the oldest first (A19's offline-queue rule). Location points are not
  // secret; they simply describe where the rider was, so plain AsyncStorage is fine here.
  const trimmed = list.length > MAX_QUEUE ? list.slice(list.length - MAX_QUEUE) : list;
  await AsyncStorage.setItem(KEYS.locationQueue, JSON.stringify(trimmed));
}
export async function getQueuedPings(): Promise<QueuedPing[]> {
  const raw = await AsyncStorage.getItem(KEYS.locationQueue);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedPing[]) : [];
  } catch {
    return [];
  }
}
export async function clearQueuedPings(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.locationQueue);
}
