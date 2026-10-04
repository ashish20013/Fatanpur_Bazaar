import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { closeSync, openSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { Log } from '../../common/logger';

export interface CronTask {
  name: string;
  /** 'every' = each 5-min tick; minutes = interval; daily = IST "HH:MM"; weekly = Monday "HH:MM". */
  schedule: { every: true } | { everyMinutes: number } | { dailyAt: string } | { weeklyMondayAt: string };
  run: () => Promise<string | void>;
}

/**
 * A26 dispatcher — ONE hPanel cron entry (every 5 min) runs `node cli.js cron`, which calls tick().
 * Last-run per task lives in cron_state (not settings). A lock file prevents overlap; a missed
 * daily task is caught up on the next tick after its time.
 */
@Injectable()
export class CronService {
  private readonly tasks: CronTask[] = [];
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) private readonly env: Env,
  ) {}

  register(task: CronTask): void {
    this.tasks.push(task);
  }
  list(): string[] {
    return this.tasks.map((t) => t.name);
  }

  async tick(now = new Date()): Promise<Record<string, string>> {
    const lock = join(this.env.STORAGE_PATH, 'cron.lock');
    if (!this.acquireLock(lock)) {
      Log.warn('cron.skipped_locked');
      return { _: 'locked' };
    }
    const results: Record<string, string> = {};
    try {
      const state = new Map<string, Date | null>(
        ((await this.db('cron_state').select('task', 'last_run_at')) as { task: string; last_run_at: Date | null }[]).map((r) => [r.task, r.last_run_at]),
      );
      for (const t of this.tasks) {
        if (!isDue(t, state.get(t.name) ?? null, now)) continue;
        results[t.name] = await this.runTask(t);
      }
    } finally {
      try { unlinkSync(lock); } catch (e) { Log.warn('cron.unlock_failed', { err: String(e) }); }
    }
    return results;
  }

  async runTask(t: CronTask): Promise<string> {
    const t0 = Date.now();
    await this.db.raw('INSERT IGNORE INTO cron_state (task) VALUES (?)', [t.name]);
    try {
      const note = (await t.run()) ?? 'ok';
      await this.db('cron_state').where({ task: t.name }).update({ last_run_at: this.db.fn.now(), last_ok_at: this.db.fn.now(), last_error: null, run_count: this.db.raw('run_count + 1') });
      Log.info('cron.task_ok', { task: t.name, ms: Date.now() - t0, note });
      return note;
    } catch (e) {
      Log.error('cron.task_failed', { task: t.name, err: String(e) });
      // last_run_at still advances so a permanently failing task doesn't run every 5 min — it alerts instead.
      await this.db('cron_state').where({ task: t.name }).update({ last_run_at: this.db.fn.now(), last_error: String(e).slice(0, 500), run_count: this.db.raw('run_count + 1') });
      return `FAILED: ${String(e)}`;
    }
  }

  private acquireLock(path: string): boolean {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch {
      // Stale lock (crashed run) older than 15 min → take over.
      try {
        if (Date.now() - statSync(path).mtimeMs > 15 * 60_000) {
          unlinkSync(path);
          return this.acquireLock(path);
        }
      } catch (e) {
        Log.warn('cron.lock_check_failed', { err: String(e) });
      }
      return false;
    }
  }
}

const IST = 330 * 60_000;
/** Pure due-check (exported for tests). */
export function isDue(t: CronTask, last: Date | null, now: Date): boolean {
  const s = t.schedule;
  if ('every' in s) return true;
  if ('everyMinutes' in s) return !last || now.getTime() - last.getTime() >= s.everyMinutes * 60_000 - 30_000;
  const [hh, mm] = ('dailyAt' in s ? s.dailyAt : s.weeklyMondayAt).split(':').map(Number);
  const nowIst = new Date(now.getTime() + IST);
  const todayTarget = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate(), hh, mm) - IST;
  if ('weeklyMondayAt' in s && nowIst.getUTCDay() !== 1) return false;
  if (now.getTime() < todayTarget) return false; // not yet today
  return !last || last.getTime() < todayTarget; // not yet run since today's slot → run (catch-up)
}
