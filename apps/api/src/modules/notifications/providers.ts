import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import webpush from 'web-push';
import { Log } from '../../common/logger';

/** One interface for FCM (mobile) and Web Push (browser) — A25. */
export interface PushMessage {
  title: string;
  body: string;
  linkUrl?: string | null;
  data?: Record<string, string>;
}
export type PushOutcome = 'SENT' | 'INVALID_TOKEN' | 'RETRY';
export interface INotificationProvider {
  readonly enabled: boolean;
  send(target: string, msg: PushMessage): Promise<PushOutcome>;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/**
 * FCM HTTP v1 without firebase-admin (saves ~40 MB / thousands of inodes on shared hosting):
 * sign a service-account JWT → OAuth token (cached ~55 min) → POST messages:send.
 */
export class FcmProvider implements INotificationProvider {
  readonly enabled: boolean;
  private sa: ServiceAccount | null = null;
  private token: { value: string; exp: number } | null = null;

  constructor(serviceAccountPath: string | undefined) {
    if (serviceAccountPath) {
      try {
        this.sa = JSON.parse(readFileSync(serviceAccountPath, 'utf8')) as ServiceAccount;
      } catch (e) {
        Log.error('fcm.service_account_unreadable', { err: String(e) });
      }
    }
    this.enabled = this.sa !== null;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const sa = this.sa as ServiceAccount;
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(
      JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }),
    ).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const jwt = `${header}.${claim}.${signer.sign(sa.private_key).toString('base64url')}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`FCM oauth ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  async send(token: string, msg: PushMessage): Promise<PushOutcome> {
    if (!this.sa) return 'RETRY';
    // A pool/new-order alert rings on its own channel so the rider's phone wakes and sounds even on
    // silent — an order he does not hear is an order he does not take. Other notifications keep the
    // normal 'orders' channel. The channel id and sound ride along in the notification's data so the
    // app (which must register the channel with the same id + sound) lights up the right one.
    const channelId = msg.data?.channelId ?? 'orders';
    const sound = msg.data?.sound;
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: msg.body },
          data: { ...(msg.data ?? {}), ...(msg.linkUrl ? { link: msg.linkUrl } : {}) },
          android: { priority: 'HIGH', notification: { channel_id: channelId, ...(sound ? { sound, default_sound: false } : {}) } },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return 'SENT';
    const text = await res.text();
    if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/.test(text)) return 'INVALID_TOKEN';
    throw new Error(`FCM ${res.status}`);
  }
}

export class WebPushProvider implements INotificationProvider {
  readonly enabled: boolean;
  constructor(publicKey: string | undefined, privateKey: string | undefined, subject: string) {
    this.enabled = Boolean(publicKey && privateKey);
    if (this.enabled) webpush.setVapidDetails(subject, publicKey as string, privateKey as string);
  }
  /** target = JSON {endpoint, keys:{p256dh, auth}} */
  async send(target: string, msg: PushMessage): Promise<PushOutcome> {
    try {
      await webpush.sendNotification(JSON.parse(target) as webpush.PushSubscription, JSON.stringify({ title: msg.title, body: msg.body, url: msg.linkUrl ?? '/' }), { TTL: 3600, timeout: 10_000 });
      return 'SENT';
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'INVALID_TOKEN';
      throw e;
    }
  }
}
