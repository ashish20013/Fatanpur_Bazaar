import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import Geolocation, { type GeoPosition } from 'react-native-geolocation-service';
import type { LocationPing } from '@fb/shared-types';
import { api } from './api';
import { getSocket, sendLocation } from './socket';
import { clearQueuedPings, getQueuedPings, queueLocationPing } from './storage';

/**
 * Two small native modules the Android project must add — see android/README.md for the
 * exact Kotlin/Java + manifest snippets. Both are optional at the JS layer: if they are not
 * linked yet (fresh checkout, `react-native init` not run), every call is wrapped so the app
 * degrades to "no persistent notification / assume battery OK" instead of crashing.
 *  - FGLocationService: start/stop a foreground service + its persistent notification
 *    (Android requires this for background location — BUILD_PROMPT §10, LIVE_TRACKING).
 *  - DeviceBattery: reads the OS battery level (RN core ships no battery API).
 */
const { FGLocationService, DeviceBattery } = NativeModules as {
  FGLocationService?: { start: (title: string, text: string) => void; stop: () => void };
  DeviceBattery?: { getBatteryLevel: () => Promise<number> };
};

const NORMAL_INTERVAL_MS = 15_000;
const LOW_BATTERY_INTERVAL_MS = 30_000;
const LOW_BATTERY_THRESHOLD = 0.15;
const BATTERY_CHECK_MS = 30_000;

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
    title: 'लोकेशन की अनुमति',
    message: 'ग्राहक को लाइव लोकेशन दिखाने के लिए यह ज़रूरी है',
    buttonPositive: 'ठीक है',
    buttonNegative: 'मना करें',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

type BatteryListener = (isLow: boolean) => void;

/**
 * Rider-side half of A19. Owns exactly one active watch at a time (one active assignment
 * per rider in practice), and is the single place that decides interval/accuracy/queueing —
 * screens only call start()/stop() and read isActive()/isLowBattery().
 */
class LocationTrackerImpl {
  private watchId: number | null = null;
  private assignmentId: number | null = null;
  private intervalMs = NORMAL_INTERVAL_MS;
  private highAccuracy = true;
  private lowBattery = false;
  private batteryTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private readonly listeners = new Set<BatteryListener>();

  isActive(): boolean {
    return this.watchId !== null;
  }
  isLowBattery(): boolean {
    return this.lowBattery;
  }
  onBatteryStatus(cb: BatteryListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Called only while the assignment is ACCEPTED or PICKED_UP — the screen enforces that. */
  async start(assignmentId: number): Promise<void> {
    if (this.isActive() && this.assignmentId === assignmentId) return;
    await this.stop();
    const granted = await requestLocationPermission();
    if (!granted) throw new Error('LOCATION_PERMISSION_DENIED');
    this.assignmentId = assignmentId;
    try {
      FGLocationService?.start('फतनपुर बाज़ार', 'डिलीवरी लोकेशन शेयर हो रही है');
    } catch {
      // Native module missing in this build — location still works, just without the
      // persistent notification; android/README.md documents wiring it in properly.
    }
    await this.checkBattery();
    this.beginWatch();
    this.batteryTimer = setInterval(() => void this.checkBattery(), BATTERY_CHECK_MS);
    void this.flushQueue();
  }

  /** ⚠️ MUST be called when a delivery finishes/fails/is cancelled — clears the watch AND the service. */
  async stop(): Promise<void> {
    if (this.watchId !== null) Geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.assignmentId = null;
    if (this.batteryTimer) clearInterval(this.batteryTimer);
    this.batteryTimer = null;
    try {
      FGLocationService?.stop();
    } catch {
      // see start() — safe to ignore if the native module isn't linked
    }
  }

  private beginWatch(): void {
    this.watchId = Geolocation.watchPosition(
      (pos) => void this.handlePosition(pos),
      () => undefined, // transient GPS errors are common in rural coverage — the next tick retries
      {
        enableHighAccuracy: this.highAccuracy,
        distanceFilter: 0,
        interval: this.intervalMs,
        fastestInterval: this.intervalMs,
        forceRequestLocation: true,
        showLocationDialog: true,
      },
    );
  }

  private async checkBattery(): Promise<void> {
    let level: number | null = null;
    try {
      level = (await DeviceBattery?.getBatteryLevel()) ?? null;
    } catch {
      level = null; // module not linked — assume fine rather than needlessly degrading accuracy
    }
    const nowLow = level !== null && level < LOW_BATTERY_THRESHOLD;
    if (nowLow === this.lowBattery) return;
    this.lowBattery = nowLow;
    this.intervalMs = nowLow ? LOW_BATTERY_INTERVAL_MS : NORMAL_INTERVAL_MS;
    this.highAccuracy = !nowLow;
    this.listeners.forEach((cb) => cb(nowLow));
    if (this.isActive()) {
      Geolocation.clearWatch(this.watchId as number);
      this.watchId = null;
      this.beginWatch();
    }
  }

  private async handlePosition(pos: GeoPosition): Promise<void> {
    if (this.assignmentId === null) return;
    const ping: LocationPing = {
      assignmentId: this.assignmentId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
      speed: pos.coords.speed ?? undefined,
      ts: Date.now(),
    };
    const socket = getSocket();
    if (socket?.connected) {
      sendLocation(ping);
      void this.flushQueue(); // a previously-queued point can now go out too
      return;
    }
    // Socket down → REST fallback (LIVE_TRACKING §5); if that also fails, queue for later.
    try {
      await api.post('/delivery/ping', ping);
    } catch {
      await queueLocationPing(ping);
    }
  }

  private async flushQueue(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const queued = await getQueuedPings();
      if (!queued.length) return;
      for (const ping of queued) {
        await api.post('/delivery/ping', ping).catch(() => {
          throw new Error('still-offline'); // stop draining — keep the rest queued in order
        });
      }
      await clearQueuedPings();
    } catch {
      // still offline — the remaining queue (capped at 20 by queueLocationPing) is retried
      // on the next successful ping or reconnect.
    } finally {
      this.flushing = false;
    }
  }
}

export const LocationTracker = new LocationTrackerImpl();
