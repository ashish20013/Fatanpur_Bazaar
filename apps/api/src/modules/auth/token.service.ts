import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import type { Role } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { hmacSha256 } from '../../common/utils/hash';
import { refreshToken as newRefreshToken } from '../../common/utils/ids';
import { IdentityService } from '../identity/identity.service';

export const MAX_ACTIVE_SESSIONS = 5;
/** Parallel tabs may refresh with the same token a moment apart — not theft (see ASSUMPTIONS). */
export const REFRESH_RACE_GRACE_SEC = 20;

export interface DeviceInfo {
  deviceId?: string | null;
  platform: 'WEB' | 'ANDROID' | 'IOS';
  userAgent?: string | null;
  ip?: string | null;
}
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: number;
}

/** A4 — JWT access (15 min) + rotating opaque refresh token (30 d, only its HMAC is stored). */
@Injectable()
export class TokenService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
    private readonly identity: IdentityService,
  ) {}

  /** Peppered hash: a leaked DB alone can't be replayed without JWT_REFRESH_SECRET. */
  hashRefresh(token: string): string {
    return Buffer.from(hmacSha256(token, this.env.JWT_REFRESH_SECRET), 'base64url').toString('hex');
  }

  async issue(user: { id: number; role: Role }, device: DeviceInfo, trx?: Knex.Transaction): Promise<IssuedTokens> {
    const conn = trx ?? this.db;
    const refreshToken = newRefreshToken();
    const [sessionId] = await conn('auth_sessions').insert({
      user_id: user.id,
      refresh_token_hash: this.hashRefresh(refreshToken),
      device_id: device.deviceId ?? null,
      platform: device.platform,
      user_agent: device.userAgent?.slice(0, 255) ?? null,
      ip_address: device.ip ?? null,
      expires_at: conn.raw('DATE_ADD(NOW(), INTERVAL ? DAY)', [this.env.REFRESH_TOKEN_TTL_DAYS]),
    });
    await this.enforceSessionCap(user.id, conn);
    const accessToken = await this.signAccess(user, sessionId);
    return { accessToken, refreshToken, expiresIn: this.env.ACCESS_TOKEN_TTL_SEC, sessionId };
  }

  signAccess(user: { id: number; role: Role }, sessionId: number): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, role: user.role, sid: sessionId, jti: randomUUID(), typ: 'access' });
  }

  /** More than 5 live sessions → revoke the oldest. */
  private async enforceSessionCap(userId: number, conn: Knex | Knex.Transaction): Promise<void> {
    const live = (await conn('auth_sessions')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .where('expires_at', '>', conn.fn.now())
      .orderBy('id', 'desc')
      .pluck('id')) as number[];
    const extra = live.slice(MAX_ACTIVE_SESSIONS);
    if (extra.length) {
      await conn('auth_sessions').whereIn('id', extra).update({ revoked_at: conn.fn.now(), revoke_reason: 'session_cap' });
      this.identity.invalidateSessions(extra);
    }
  }

  async revokeSession(sessionId: number, userId: number, reason: string): Promise<void> {
    await this.db('auth_sessions').where({ id: sessionId, user_id: userId }).whereNull('revoked_at').update({ revoked_at: this.db.fn.now(), revoke_reason: reason });
    this.identity.invalidateSessions([sessionId]);
  }

  /**
   * The ids are read before the UPDATE so the guard's session cache can be dropped for exactly
   * those sessions. Without that, a revoke would only bite once the 30 s cache expired — too slow
   * for "log this rider out now" and for refresh-token theft.
   */
  async revokeAll(userId: number, reason: string, trx?: Knex.Transaction): Promise<number> {
    const conn = trx ?? this.db;
    const ids = (await conn('auth_sessions').where({ user_id: userId }).whereNull('revoked_at').pluck('id')) as number[];
    if (!ids.length) return 0;
    const n = await conn('auth_sessions').whereIn('id', ids).update({ revoked_at: conn.fn.now(), revoke_reason: reason });
    this.identity.invalidateSessions(ids);
    return n;
  }
}
