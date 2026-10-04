import { haversineKm, inIndia } from '../common/utils/geo';

/**
 * A19 location pipeline — the pure part (steps 3–5 + 8). The gateway does auth/ownership,
 * keeps one TrackState per assignment in memory and calls `evaluatePing` for every event.
 */
export interface TrackConfig {
  throttleMs: number; // 10 s
  maxAgeMs: number; // 2 min — older = stale buffer flush
  weakAccuracyM: number; // 200 m
  persistMeters: number; // 100 m
  persistEveryMs: number; // 60 s
  sessionUpdateEveryMs: number; // 30 s
  dedupeWindow: number; // last 50 ts
}
export const DEFAULT_TRACK_CONFIG: TrackConfig = {
  throttleMs: 10_000,
  maxAgeMs: 120_000,
  weakAccuracyM: 200,
  persistMeters: 100,
  persistEveryMs: 60_000,
  sessionUpdateEveryMs: 30_000,
  dedupeWindow: 50,
};
export interface TrackState {
  lastAcceptedAt: number | null; // server clock
  lastPersisted: { lat: number; lng: number; at: number } | null;
  lastSessionUpdateAt: number | null;
  recentTs: number[];
  forcePersist: boolean; // set on status change (pickup / deliver)
}
export function newTrackState(): TrackState {
  return { lastAcceptedAt: null, lastPersisted: null, lastSessionUpdateAt: null, recentTs: [], forcePersist: true };
}
export interface Ping {
  lat: number;
  lng: number;
  accuracy?: number;
  ts: number;
}
export type PingVerdict =
  | { accept: false; reason: 'OUT_OF_BOUNDS' | 'TOO_OLD' | 'THROTTLED' | 'DUPLICATE' | 'BAD_PAYLOAD'; breadcrumbOnly?: boolean }
  | { accept: true; weakSignal: boolean; persist: boolean; updateSession: boolean };

export function evaluatePing(state: TrackState, p: Ping, now: number, cfg: TrackConfig = DEFAULT_TRACK_CONFIG): PingVerdict {
  if (![p.lat, p.lng, p.ts].every((n) => typeof n === 'number' && Number.isFinite(n))) return { accept: false, reason: 'BAD_PAYLOAD' };
  if (!inIndia(p)) return { accept: false, reason: 'OUT_OF_BOUNDS' };
  if (state.recentTs.includes(p.ts)) return { accept: false, reason: 'DUPLICATE' };
  // record ts for dedupe before other drops so replays of a throttled ping are also dupes
  state.recentTs.push(p.ts);
  if (state.recentTs.length > cfg.dedupeWindow) state.recentTs.shift();
  if (now - p.ts > cfg.maxAgeMs) return { accept: false, reason: 'TOO_OLD', breadcrumbOnly: true };
  if (state.lastAcceptedAt !== null && now - state.lastAcceptedAt < cfg.throttleMs && !state.forcePersist) {
    return { accept: false, reason: 'THROTTLED' };
  }
  state.lastAcceptedAt = now;
  const weakSignal = typeof p.accuracy === 'number' && p.accuracy > cfg.weakAccuracyM;
  const lp = state.lastPersisted;
  const persist =
    state.forcePersist ||
    lp === null ||
    haversineKm(lp, p) * 1000 > cfg.persistMeters ||
    now - lp.at >= cfg.persistEveryMs;
  if (persist) {
    state.lastPersisted = { lat: p.lat, lng: p.lng, at: now };
    state.forcePersist = false;
  }
  const updateSession = state.lastSessionUpdateAt === null || now - state.lastSessionUpdateAt >= cfg.sessionUpdateEveryMs;
  if (updateSession) state.lastSessionUpdateAt = now;
  return { accept: true, weakSignal, persist, updateSession };
}

/** Stale rule (LIVE_TRACKING §5): > 90 s since last ping → never shown as "live". */
export function isStale(lastPingAt: Date | null, now: Date, staleSeconds: number): boolean {
  return lastPingAt === null || now.getTime() - lastPingAt.getTime() > staleSeconds * 1000;
}
