import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { KNEX } from '../../database/knex.provider';
import { Log } from '../../common/logger';
import { onJobFailure } from '../../domain/jobs-backoff';

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * DB queue (A26). push() may be called inside a business transaction so the job only exists if
 * the business change committed. work() is driven by the 5-minute cron and by the API process
 * opportunistically (drainSoon) so pushes go out within seconds, not minutes.
 */
@Injectable()
export class QueueService {
  private readonly handlers = new Map<string, JobHandler>();
  private draining = false;
  private drainTimer: NodeJS.Timeout | null = null;
  readonly workerId = `${hostname().slice(0, 20)}:${process.pid}:${randomBytes(3).toString('hex')}`.slice(0, 40);

  constructor(@Inject(KNEX) private readonly db: Knex) {}

  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  async push(type: string, payload: Record<string, unknown>, opts: { delaySec?: number; priority?: number; maxAttempts?: number; trx?: Knex.Transaction } = {}): Promise<void> {
    const conn = opts.trx ?? this.db;
    await conn('jobs').insert({
      type,
      payload: JSON.stringify(payload),
      priority: opts.priority ?? 5,
      max_attempts: opts.maxAttempts ?? 5,
      run_after: conn.raw('DATE_ADD(NOW(), INTERVAL ? SECOND)', [opts.delaySec ?? 0]),
    });
    if (!opts.trx && !opts.delaySec) this.drainSoon();
  }

  /** Debounced in-process drain for immediate jobs (no daemon — piggybacks on the API process). */
  drainSoon(delayMs = 250): void {
    if (process.env.NODE_ENV === 'test' && process.env.QUEUE_INLINE !== '1') return;
    if (this.drainTimer) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      void this.work(10).catch((e) => Log.error('queue.drain_failed', { err: String(e) }));
    }, delayMs);
    this.drainTimer.unref();
  }

  /** Claim-one-at-a-time loop. Returns number of jobs processed. */
  async work(maxSec = 50): Promise<{ done: number; failed: number }> {
    if (this.draining) return { done: 0, failed: 0 };
    this.draining = true;
    const deadline = Date.now() + maxSec * 1000;
    let done = 0;
    let failed = 0;
    try {
      while (Date.now() < deadline) {
        const job = await this.claim();
        if (!job) break;
        const ok = await this.runOne(job);
     if (ok) { done++; } else { failed++; }
      }
    } finally {
      this.draining = false;
    }
    return { done, failed };
  }

  private async claim(): Promise<{ id: number; type: string; payload: unknown; attempts: number; max_attempts: number } | null> {
    const claimed = await this.db.raw(
      `UPDATE jobs SET locked_at = NOW(), locked_by = ?
        WHERE done_at IS NULL AND failed_at IS NULL AND run_after <= NOW()
          AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL 5 MINUTE)
        ORDER BY priority, id LIMIT 1`,
      [this.workerId],
    );
    const affected = (claimed as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
    if (!affected) return null;
    const job = await this.db('jobs')
      .where({ locked_by: this.workerId })
      .whereNotNull('locked_at')
      .whereNull('done_at')
      .whereNull('failed_at')
      .orderBy('id')
      .first('id', 'type', 'payload', 'attempts', 'max_attempts');
    return job ?? null;
  }

  private async runOne(job: { id: number; type: string; payload: unknown; attempts: number; max_attempts: number }): Promise<boolean> {
    const handler = this.handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(parseJson(job.payload));
      await this.db('jobs').where({ id: job.id }).update({ done_at: this.db.fn.now(), locked_at: null, locked_by: null });
      return true;
    } catch (e) {
      const out = onJobFailure(job.attempts, job.max_attempts);
      // ⚠️ release the claim (locked_by = NULL) — otherwise this worker re-grabs it at once
      await this.db('jobs')
        .where({ id: job.id })
        .update({
          attempts: out.attempts,
          last_error: String(e instanceof Error ? e.message : e).slice(0, 500),
          ...out.release,
          ...(out.failed ? { failed_at: this.db.fn.now() } : { run_after: this.db.raw('DATE_ADD(NOW(), INTERVAL ? MINUTE)', [out.retryAfterMinutes]) }),
        });
      if (out.failed) Log.error('job.failed', { id: job.id, type: job.type, err: String(e) });
      else Log.warn('job.retry', { id: job.id, type: job.type, attempts: out.attempts });
      return false;
    }
  }
}

/** MySQL returns JSON columns parsed; MariaDB (JSON = LONGTEXT alias) returns a string. */
export function parseJson<T = Record<string, unknown>>(v: unknown): T {
  if (v === null || v === undefined) return {} as T;
  if (typeof v === 'string') return JSON.parse(v) as T;
  if (Buffer.isBuffer(v)) return JSON.parse(v.toString('utf8')) as T;
  return v as T;
}
