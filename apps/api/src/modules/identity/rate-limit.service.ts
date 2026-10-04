import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { AppError } from '../../common/errors';

/**
 * DB-backed fixed-window limiter (SECURITY_AUDIT §5) — survives restarts, no Redis.
 * hit() increments and throws 429 RATE_LIMITED (+ Retry-After) when over the limit.
 */
@Injectable()
export class RateLimitService {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  async hit(bucket: string, limit: number, windowSec: number, trx?: Knex.Transaction): Promise<{ hits: number; retryAfterSec: number }> {
    const conn = trx ?? this.db;
    const nowSec = Math.floor(Date.now() / 1000);
    const windowStartSec = nowSec - (nowSec % windowSec);
    const windowStart = new Date(windowStartSec * 1000);
    await conn.raw(
      'INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1',
      [bucket.slice(0, 140), windowStart],
    );
    const row = (await conn('rate_limits').where({ bucket: bucket.slice(0, 140), window_start: windowStart }).first('hits')) as { hits: number } | undefined;
    const hits = row?.hits ?? 1;
    const retryAfterSec = windowStartSec + windowSec - nowSec;
    if (hits > limit) {
      throw new AppError('RATE_LIMITED', { n: Math.max(1, Math.ceil(retryAfterSec / 60)) }, { headers: { 'Retry-After': String(retryAfterSec) } });
    }
    return { hits, retryAfterSec };
  }

  /** Read-only peek (no increment). */
  async count(bucket: string, windowSec: number): Promise<number> {
    const nowSec = Math.floor(Date.now() / 1000);
    const windowStart = new Date((nowSec - (nowSec % windowSec)) * 1000);
    const row = (await this.db('rate_limits').where({ bucket: bucket.slice(0, 140), window_start: windowStart }).first('hits')) as { hits: number } | undefined;
    return row?.hits ?? 0;
  }
}
