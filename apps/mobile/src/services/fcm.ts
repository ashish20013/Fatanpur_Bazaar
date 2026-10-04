import messaging from '@react-native-firebase/messaging';
import { Platform, Vibration } from 'react-native';
import { api } from './api';
import { getOrCreateDeviceId } from './storage';

/*
 * ⚠️ Loud new-order channel (broadcast model).
 *
 * The backend tags a fresh pool order's push with android.notification.channel_id = 'urgent_orders'
 * and data.kind = 'pool'. For Android to show it as a heads-up banner with a custom ring even on
 * silent, the app must REGISTER a channel of that exact id with IMPORTANCE_HIGH and a sound — do
 * this once at startup with a channel library (e.g. notifee: `notifee.createChannel({ id:
 * 'urgent_orders', name: 'नए ऑर्डर', importance: AndroidImportance.HIGH, sound: 'order_alert' })`,
 * and drop android/app/src/main/res/raw/order_alert.mp3). Until that channel exists the push still
 * arrives, just on the default channel. (Left as a launch step — see NEXT-STEPS — because it needs
 * a native build this sandbox cannot produce.)
 */
export const URGENT_CHANNEL_ID = 'urgent_orders';

let lastKnownToken: string | null = null;
let unsubscribeRefresh: (() => void) | null = null;

/**
 * A25 permission flow: called once, after the FIRST successful order — never on cold start.
 * Returns whether the user granted it, so the caller can decide whether to show the soft-ask
 * again later (it should not — a decline here is respected).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const status = await messaging().requestPermission();
  return status === messaging.AuthorizationStatus.AUTHORIZED || status === messaging.AuthorizationStatus.PROVISIONAL;
}

export async function hasNotificationPermission(): Promise<boolean> {
  const status = await messaging().hasPermission();
  return status === messaging.AuthorizationStatus.AUTHORIZED || status === messaging.AuthorizationStatus.PROVISIONAL;
}

/** Registers the current FCM token with the backend and keeps it fresh (POST /notifications/device-token). */
export async function registerDeviceToken(): Promise<void> {
  if (Platform.OS !== 'android') return; // this app only ships Android per §10
  try {
    const granted = await hasNotificationPermission();
    if (!granted) return;
    const token = await messaging().getToken();
    lastKnownToken = token;
    const deviceId = await getOrCreateDeviceId();
    await api.post('/notifications/device-token', { token, platform: 'ANDROID', deviceId });
    if (!unsubscribeRefresh) {
      unsubscribeRefresh = messaging().onTokenRefresh(async (next) => {
        lastKnownToken = next;
        await api.post('/notifications/device-token', { token: next, platform: 'ANDROID', deviceId }).catch(() => undefined);
      });
    }
  } catch {
    // Push is a nice-to-have, never a hard requirement — the app must keep working without it.
  }
}

/** Called on logout so a stale token does not keep receiving another user's pushes. */
export async function deactivateDeviceToken(): Promise<void> {
  try {
    const token = lastKnownToken ?? (await messaging().getToken().catch(() => null));
    if (token) await api.post('/notifications/device-token/deactivate', { token });
  } finally {
    lastKnownToken = null;
    if (unsubscribeRefresh) {
      unsubscribeRefresh();
      unsubscribeRefresh = null;
    }
  }
}

/** Foreground pushes: OS does not show a banner automatically — surface it as an in-app toast. */
export function onForegroundMessage(cb: (title: string, body: string, linkUrl?: string) => void): () => void {
  return messaging().onMessage(async (msg) => {
    const title = msg.notification?.title ?? '';
    const body = msg.notification?.body ?? '';
    const linkUrl = (msg.data?.linkUrl as string | undefined) ?? undefined;
    // A pool order in the foreground: the OS shows no banner, so buzz the phone and surface the toast
    // loudly — a rider staring at the app should still feel a new order land.
    if (msg.data?.kind === 'pool') Vibration.vibrate([0, 300, 150, 300]);
    if (title || body) cb(title, body, linkUrl);
  });
}
