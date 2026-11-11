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
    try {
      await Keychain.setGenericPassword('fb', JSON.stringify(tokens), { service: TOKEN_SERVICE });
    } catch {
      /*
       * Some low-end Android builds have a flaky keystore (it is the first thing to break on a
       * phone that has been factory-reset badly). Failing here used to abort the login that had
       * just succeeded on the server. The session still works — api.ts holds the tokens in
       * memory — the customer just signs in again after a restart, which beats not being able
       * to sign in at all. ⚠️ Still never AsyncStorage: a token on disk in the clear is worse
       * than a token that does not survive a restart.
       */
    }
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
    try {
      await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
    } catch {
      // Logging out must always complete; api.ts has already dropped the in-memory copies.
    }
  },
};

// ───────────────────────── non-secret cache (AsyncStorage) ─────────────────────────
const KEYS = {
  deviceId: 'fb.deviceId',
  village: 'fb.village', // last picked village (mirrors web's fb_village cookie)
  notifAskedAt: 'fb.notifAskedAt',
  locationQueue: 'fb.locationQueue', // offline rider pings, capped at 20 (A19)
  staffMode: 'fb.staffMode', // 'customer' | 'staff' — which side a staff member last used
  lang: 'fb.lang', // 'hi' | 'en' — mirrors the website's fb_lang cookie
} as const;

function randomId(): string {
  // RN has no crypto.randomUUID by default without a polyfill; this is not security-sensitive
  // (a stable per-install id for X-Device-Id / FCM bookkeeping), so Math.random is fine here.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Held in memory after the first read so the hot path — every single API call sends this as
 * X-Device-Id — touches the disk once per launch rather than once per request.
 */
let deviceIdCache: string | null = null;

export async function getOrCreateDeviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  /*
   * ⚠️ This must never throw and never hang.
   *
   * It is awaited inside rawFetch before the request goes out, so a slow or broken
   * AsyncStorage used to stop EVERY call from being made at all — and the caller turned that
   * into "इंटरनेट नहीं मिल रहा", on a phone whose internet was fine. On the cheap, nearly-full
   * Android phones this shop is built for, a stalled SQLite write is a real thing, and the
   * whole app going dark because a convenience value could not be read is not acceptable.
   *
   * The id only has to be stable for this install; if the disk will not cooperate we keep a
   * generated one in memory and carry on.
   */
  const fallback = (): string => (deviceIdCache ??= randomId());
  try {
    const existing = await withTimeout(AsyncStorage.getItem(KEYS.deviceId), 1500);
    if (existing) return (deviceIdCache = existing);
  } catch {
    return fallback();
  }
  const id = fallback();
  void AsyncStorage.setItem(KEYS.deviceId, id).catch(() => undefined); // best effort, not awaited
  return id;
}

/** Resolves with the promise, or rejects once `ms` have passed — never left pending. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('STORAGE_TIMEOUT')), ms)),
  ]);
}

export interface StoredVillage {
  id: number;
  name: string;
  nameHi: string | null;
}
export async function getLastVillage(): Promise<StoredVillage | null> {
  // A remembered village is a convenience. If the disk is slow or unhappy, the customer simply
  // picks it again — the screen waiting on this must not fail because of it.
  try {
    const raw = await withTimeout(AsyncStorage.getItem(KEYS.village), 1500);
    return raw ? (JSON.parse(raw) as StoredVillage) : null;
  } catch {
    return null;
  }
}
export async function setLastVillage(v: StoredVillage): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.village, JSON.stringify(v));
  } catch {
    // keeping it for next launch is a bonus, not a requirement
  }
}

/**
 * Which side of the app a staff member last used.
 *
 * The owner opens this app dozens of times a day. Asking "staff or customer?" on every launch
 * was two extra taps each time; the website asks once at login and then keeps you in your panel.
 * Remembered here, and changed from the Menu (staff) or the account tab (customer).
 */
export type StaffMode = 'customer' | 'staff';
export async function getStaffMode(): Promise<StaffMode | null> {
  try {
    const raw = await withTimeout(AsyncStorage.getItem(KEYS.staffMode), 1500);
    return raw === 'customer' || raw === 'staff' ? raw : null;
  } catch {
    return null;
  }
}
export async function setStaffMode(m: StaffMode | null): Promise<void> {
  try {
    if (m === null) await AsyncStorage.removeItem(KEYS.staffMode);
    else await AsyncStorage.setItem(KEYS.staffMode, m);
  } catch {
    // remembering is a convenience; the choice screen is the fallback
  }
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

/**
 * Which language the customer reads the shop in — the app's half of the website's `fb_lang`
 * cookie (which the site keeps for a year). It is a per-device preference, not account data:
 * the same person may well want Hindi on the family phone and English on their own.
 */
export async function getLang(): Promise<string | null> {
  try {
    return await withTimeout(AsyncStorage.getItem(KEYS.lang), 1500);
  } catch {
    // A missed preference means Hindi, which is the default anyway — never a blocked launch.
    return null;
  }
}
export async function setLangPref(lang: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.lang, lang);
  } catch {
    // Remembering it for next launch is a bonus; the switch itself has already happened.
  }
}
