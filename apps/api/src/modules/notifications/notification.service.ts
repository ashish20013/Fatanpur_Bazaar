import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import type { Permission, Role } from '@fb/shared-types';
import { IdentityService } from '../identity/identity.service';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { QueueService } from '../jobs/queue.service';
import { isDuplicateKey } from '../../common/errors';
import { Log } from '../../common/logger';
import { FcmProvider, WebPushProvider } from './providers';
import { sha256 } from '../../common/utils/hash';

export type Channel = 'IN_APP' | 'PUSH' | 'SMS';
export interface NotifyInput {
  userId: number;
  type: string;
  title: string;
  body: string;
  linkUrl?: string | null;
  data?: Record<string, string>;
  channels?: Channel[];
  /** Same key for the same user → silently skipped (no duplicate notifications). */
  dedupeKey?: string;
  delaySec?: number;
}

/**
 * A25 Notify.send — in-app row first (dedupe), then PUSH via the queue so a slow FCM never
 * slows the request. Can run inside a caller transaction (rows + jobs commit together).
 */
@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly fcm: FcmProvider;
  private readonly webpush: WebPushProvider;
  /** Set by the tracking gateway so in-app notifications also reach open sockets. */
  socketEmitter: ((userId: number, payload: { id: number; title: string; body: string; linkUrl: string | null }) => void) | null = null;

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) env: Env,
    private readonly queue: QueueService,
    private readonly identity: IdentityService,
  ) {
    this.fcm = new FcmProvider(env.FIREBASE_SERVICE_ACCOUNT);
    this.webpush = new WebPushProvider(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT);
  }

  onModuleInit(): void {
    this.queue.register('push.send', (p) => this.deliverPush(p as { notificationId: number }));
  }

  async send(n: NotifyInput, trx?: Knex.Transaction): Promise<number | null> {
    const conn = trx ?? this.db;
    const channels = n.channels ?? ['IN_APP'];
    let id: number;
    try {
      [id] = await conn('notifications').insert({
        user_id: n.userId,
        type: n.type.slice(0, 40),
        title: n.title.slice(0, 160),
        body: n.body.slice(0, 500),
        link_url: n.linkUrl ?? null,
        data_json: n.data ? JSON.stringify(n.data) : null,
        dedupe_key: n.dedupeKey ?? null,
      });
    } catch (e) {
      if (isDuplicateKey(e)) return null;
      throw e;
    }
    if (channels.includes('PUSH')) await this.queue.push('push.send', { notificationId: id }, { trx, delaySec: n.delaySec, priority: 3 });
    if (!trx && this.socketEmitter) this.socketEmitter(n.userId, { id, title: n.title, body: n.body, linkUrl: n.linkUrl ?? null });
    return id;
  }

  /** Fan-out to every ACTIVE staff member holding a permission (the owner always included). */
  async sendToPermission(perm: Permission, n: Omit<NotifyInput, 'userId'>, trx?: Knex.Transaction): Promise<void> {
    const staff = (await (trx ?? this.db)('users').where({ status: 'ACTIVE' }).whereIn('role', ['ADMIN', 'SUPERVISOR', 'DELIVERY_BOY']).select('id', 'role', 'is_global_admin')) as { id: number; role: Role; is_global_admin: number }[];
    for (const u of staff) {
      // A scoped admin is notified about what he has access to, not about everything — otherwise
      // the manager's phone buzzes for prescriptions and refunds he cannot even open.
      const global = u.role === 'ADMIN' && Number(u.is_global_admin) === 1;
      if (!global && !(await this.identity.permissionsFor(u.id, u.role, false)).has(perm)) continue;
      await this.send({ ...n, userId: u.id }, trx);
    }
  }

  async sendToRole(role: 'ADMIN', n: Omit<NotifyInput, 'userId'>, trx?: Knex.Transaction): Promise<void> {
    const ids = (await (trx ?? this.db)('users').where({ role, status: 'ACTIVE' }).pluck('id')) as number[];
    for (const id of ids) await this.send({ ...n, userId: id }, trx);
  }

  /**
   * Broadcast model: ring every rider who is on duty right now (ACTIVE DELIVERY_BOY with
   * is_available = 1). Used when a fresh order drops into the pool — whoever is free grabs it.
   */
  async sendToOnDutyRiders(n: Omit<NotifyInput, 'userId'>, trx?: Knex.Transaction): Promise<void> {
    const ids = (await (trx ?? this.db)('users as u')
      .join('staff_profiles as s', 's.user_id', 'u.id')
      .where('u.role', 'DELIVERY_BOY')
      .where('u.status', 'ACTIVE')
      .where('s.is_available', 1)
      .pluck('u.id')) as number[];
    for (const id of ids) await this.send({ ...n, userId: id }, trx);
  }

  private async deliverPush(p: { notificationId: number }): Promise<void> {
    const n = await this.db('notifications').where({ id: p.notificationId }).first();
    if (!n) return;
    // The extra data saved with the notification (e.g. a louder channel + sound for pool alerts)
    // rides along to the device so the app can pick the right channel.
    let extra: Record<string, string> = {};
    if (n.data_json) try { extra = JSON.parse(n.data_json as string) as Record<string, string>; } catch { extra = {}; }
    const msg = { title: n.title as string, body: n.body as string, linkUrl: n.link_url as string | null, data: { ...extra, type: n.type as string, id: String(n.id) } };
    let retry = false;
    if (this.fcm.enabled) {
      const tokens = (await this.db('device_tokens').where({ user_id: n.user_id, is_active: 1 }).select('id', 'token')) as { id: number; token: string }[];
      for (const t of tokens) {
        try {
          const r = await this.fcm.send(t.token, msg);
          if (r === 'INVALID_TOKEN') await this.db('device_tokens').where({ id: t.id }).update({ is_active: 0 });
        } catch (e) {
          retry = true;
          Log.warn('push.fcm_failed', { err: String(e) });
        }
      }
    }
    if (this.webpush.enabled) {
      const subs = (await this.db('push_subscriptions').where({ user_id: n.user_id }).select('id', 'endpoint', 'p256dh', 'auth_key')) as { id: number; endpoint: string; p256dh: string; auth_key: string }[];
      for (const s of subs) {
        try {
          const r = await this.webpush.send(JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }), msg);
          if (r === 'INVALID_TOKEN') await this.db('push_subscriptions').where({ id: s.id }).delete();
        } catch (e) {
          retry = true;
          Log.warn('push.webpush_failed', { err: String(e) });
        }
      }
    }
    await this.db('notifications').where({ id: n.id }).update({ pushed_at: this.db.fn.now() });
    if (retry) throw new Error('some push targets failed — retry with backoff');
  }

  // ── device registration ──
  async registerDeviceToken(userId: number, token: string, platform: 'ANDROID' | 'IOS' | 'WEB', deviceId?: string): Promise<void> {
    await this.db.raw(
      `INSERT INTO device_tokens (user_id, token, token_hash, platform, device_id, is_active) VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform), device_id = VALUES(device_id), is_active = 1, fail_count = 0`,
      [userId, token, sha256(token), platform, deviceId ?? null],
    );
  }
  async deactivateDeviceToken(userId: number, token: string): Promise<void> {
    await this.db('device_tokens').where({ user_id: userId, token_hash: sha256(token) }).update({ is_active: 0 });
  }
  async saveWebPush(userId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, ua?: string): Promise<void> {
    await this.db.raw(
      `INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_key, user_agent) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth_key = VALUES(auth_key), fail_count = 0`,
      [userId, sub.endpoint, sha256(sub.endpoint), sub.keys.p256dh, sub.keys.auth, ua?.slice(0, 255) ?? null],
    );
  }

  async list(userId: number, page: number, perPage: number): Promise<{ items: unknown[]; total: number; unread: number }> {
    const [items, [{ total }], [{ unread }]] = await Promise.all([
      this.db('notifications').where({ user_id: userId }).orderBy('id', 'desc').limit(perPage).offset((page - 1) * perPage).select('id', 'type', 'title', 'body', 'link_url as linkUrl', 'is_read as isRead', 'created_at as createdAt'),
      this.db('notifications').where({ user_id: userId }).count({ total: '*' }),
      this.db('notifications').where({ user_id: userId, is_read: 0 }).count({ unread: '*' }),
    ]);
    return { items, total: Number(total), unread: Number(unread) };
  }
  async markRead(userId: number, id: number | 'all'): Promise<void> {
    const q = this.db('notifications').where({ user_id: userId, is_read: 0 });
    await (id === 'all' ? q : q.andWhere({ id })).update({ is_read: 1 });
  }
}
