import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { Log } from '../../common/logger';
import { istDate } from '../../common/utils/time';
import { CronService } from './cron.service';
import { QueueService } from './queue.service';
import { NotificationService } from '../notifications/notification.service';
import { WalletService } from '../wallet/wallet.service';
import { ServiceAreaService } from '../service-area/service-area.service';
import { CartService } from '../cart/cart.service';
import { InventoryService } from '../catalog/inventory.service';
import { ReviewsService } from '../reviews/reviews.service';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { TrackingService } from '../tracking/tracking.service';
import { DeliveryService } from '../delivery/delivery.service';
import { AdminService } from '../admin/admin.service';

/**
 * A26 schedule — one hPanel cron entry every 5 min runs `node cli.js cron`.
 * All times IST. Missed daily tasks catch up on the next tick (CronService.isDue).
 */
@Injectable()
export class SystemTasks implements OnModuleInit {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) private readonly env: Env,
    private readonly cron: CronService,
    private readonly queue: QueueService,
    private readonly notify: NotificationService,
    private readonly wallet: WalletService,
    private readonly sa: ServiceAreaService,
    private readonly cart: CartService,
    private readonly inventory: InventoryService,
    private readonly reviews: ReviewsService,
    private readonly rx: PrescriptionsService,
    private readonly tracking: TrackingService,
    private readonly delivery: DeliveryService,
    private readonly admin: AdminService,
  ) {}

  onModuleInit(): void {
    const c = this.cron;
    c.register({ name: 'queue:work', schedule: { every: true }, run: async () => JSON.stringify(await this.queue.work(50)) });
    c.register({ name: 'riders:offline-stale', schedule: { everyMinutes: 15 }, run: async () => `${await this.tracking.ridersOfflineStale()} riders off duty` });
    c.register({ name: 'tracking:auto-close', schedule: { everyMinutes: 15 }, run: async () => `${await this.tracking.autoClose()} sessions closed` });
    c.register({ name: 'cod:alerts', schedule: { everyMinutes: 60 }, run: async () => `${await this.delivery.codAlerts()} alerts` });
    c.register({ name: 'analytics:rollup', schedule: { dailyAt: '00:30' }, run: () => this.rollup() });
    c.register({ name: 'villages:rollup', schedule: { dailyAt: '00:45' }, run: async () => `${await this.sa.rollupOrderCounts()} villages` });
    c.register({ name: 'backup:db', schedule: { dailyAt: '01:00' }, run: () => this.backup() });
    c.register({ name: 'licenses:check', schedule: { dailyAt: '02:00' }, run: () => this.licenses() });
    c.register({ name: 'cleanup', schedule: { dailyAt: '02:30' }, run: () => this.cleanup() });
    c.register({ name: 'ratings:recompute', schedule: { dailyAt: '03:30' }, run: async () => void (await this.reviews.recomputeAll()) });
    c.register({ name: 'wallet:reconcile', schedule: { dailyAt: '04:00' }, run: () => this.reconcile() });
    c.register({ name: 'stock:digest', schedule: { dailyAt: '08:00' }, run: () => this.lowStockDigest() });
    c.register({ name: 'admin:weekly-digest', schedule: { weeklyMondayAt: '08:30' }, run: () => this.weeklyDigest() });
  }

  private async rollup(): Promise<string> {
    const y = istDate(new Date(Date.now() - 86400_000));
    await this.admin.rollup(y);
    await this.admin.rollup(istDate());
    return y;
  }

  /** mysqldump --single-transaction | gzip, 14 days kept. Args are fixed — no user input reaches spawn. */
  private async backup(): Promise<string> {
    const dir = join(this.env.STORAGE_PATH, 'backups');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, `db-${istDate()}.sql.gz`);
    await new Promise<void>((resolve, reject) => {
      const p = spawn('mysqldump', ['--single-transaction', '--quick', '--routines', '--no-tablespaces', '-h', this.env.DB_HOST, '-P', String(this.env.DB_PORT), '-u', this.env.DB_USER, this.env.DB_NAME], { env: { ...process.env, MYSQL_PWD: this.env.DB_PASSWORD }, stdio: ['ignore', 'pipe', 'pipe'] });
      const out = createWriteStream(file, { mode: 0o600 });
      p.stdout.pipe(createGzip()).pipe(out);
      let err = '';
      p.stderr.on('data', (d: Buffer) => (err += d.toString()));
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? out.on('finish', () => resolve()) : reject(new Error(`mysqldump exit ${code}: ${err.slice(0, 200)}`))));
    });
    for (const f of await readdir(dir)) {
      const full = join(dir, f);
      if (f.startsWith('db-') && Date.now() - (await stat(full)).mtimeMs > 14 * 86400_000) await unlink(full);
    }
    return file;
  }

  private async licenses(): Promise<string> {
    const rows = (await this.db('suppliers').where({ is_active: 1 }).whereNotNull('fssai_expiry').where('fssai_expiry', '<=', this.db.raw('DATE_ADD(CURDATE(), INTERVAL 15 DAY)')).select('name', 'fssai_expiry')) as { name: string; fssai_expiry: string }[];
    for (const r of rows) await this.notify.sendToRole('ADMIN', { type: 'license.expiry', title: 'लाइसेंस खत्म होने वाला है', body: `${r.name} का FSSAI ${String(r.fssai_expiry).slice(0, 10)} को खत्म`, channels: ['IN_APP', 'PUSH'], dedupeKey: `fssai:${r.name}:${String(r.fssai_expiry).slice(0, 10)}` });
    return `${rows.length} expiring`;
  }

  /** Retention (DATABASE_AUDIT §6). audit_logs, wallet_transactions, orders are NEVER touched. */
  private async cleanup(): Promise<string> {
    const del = async (table: string, where: string): Promise<number> => {
      const r = (await this.db.raw(`DELETE FROM ${table} WHERE ${where} LIMIT 20000`)) as [{ affectedRows: number }];
      return r[0].affectedRows;
    };
    const out: Record<string, number> = {
      otp: await del('otp_requests', 'created_at < NOW() - INTERVAL 7 DAY'),
      sessions: await del('auth_sessions', '(revoked_at IS NOT NULL OR expires_at < NOW()) AND COALESCE(revoked_at, expires_at) < NOW() - INTERVAL 30 DAY'),
      rate: await del('rate_limits', 'window_start < NOW() - INTERVAL 1 DAY'),
      idem: await del('order_idempotency', 'created_at < NOW() - INTERVAL 1 DAY'),
      locations: await del('delivery_locations', 'recorded_at < NOW() - INTERVAL 7 DAY'),
      search: await del('search_logs', 'created_at < NOW() - INTERVAL 90 DAY'),
      jobsDone: await del('jobs', 'done_at IS NOT NULL AND done_at < NOW() - INTERVAL 7 DAY'),
      jobsFailed: await del('jobs', 'failed_at IS NOT NULL AND failed_at < NOW() - INTERVAL 30 DAY'),
      webhooks: await del('webhook_events', 'created_at < NOW() - INTERVAL 90 DAY'),
      tracking: await del('tracking_sessions', 'is_live = 0 AND ended_at < NOW() - INTERVAL 90 DAY'),
      carts: await this.cart.cleanup(),
      rxFiles: await this.rx.purgeOld(),
    };
    return JSON.stringify(out);
  }

  /** Mismatch → URGENT alert. Never silently "fixed" (money). */
  private async reconcile(): Promise<string> {
    const bad = await this.wallet.reconcile();
    if (bad.length) {
      Log.error('wallet.reconcile_mismatch', { count: bad.length });
      await this.notify.sendToRole('ADMIN', { type: 'wallet.mismatch', title: '🚨 वॉलेट हिसाब में गड़बड़', body: `${bad.length} वॉलेट का बैलेंस लेन-देन से मेल नहीं खाता — तुरंत जाँचें।`, linkUrl: '/admin/audit', channels: ['IN_APP', 'PUSH'], dedupeKey: `wallet-mismatch:${istDate()}` });
    }
    return `${bad.length} mismatches`;
  }

  /** Low stock as ONE daily digest, not a push per item (A25). */
  private async lowStockDigest(): Promise<string> {
    const items = (await this.inventory.lowStock(50)) as { nameHi: string | null; name: string; stockQty: number }[];
    if (!items.length) return 'none';
    await this.notify.sendToPermission('inventory.manage', { type: 'stock.low', title: `कम स्टॉक: ${items.length} सामान`, body: items.slice(0, 8).map((i) => `${i.nameHi ?? i.name} (${i.stockQty})`).join(', '), linkUrl: '/admin/inventory', channels: ['IN_APP', 'PUSH'], dedupeKey: `lowstock:${istDate()}` });
    return `${items.length} low`;
  }

  private async weeklyDigest(): Promise<string> {
    const [s] = (await this.db('analytics_daily').where('stat_date', '>=', this.db.raw('CURDATE() - INTERVAL 7 DAY')).sum({ orders: 'orders_delivered', gmv: 'gmv' })) as { orders: number | null; gmv: string | null }[];
    const zero = (await this.db('search_logs').where('results_count', 0).where('created_at', '>', this.db.raw('NOW() - INTERVAL 7 DAY')).groupBy('query').orderByRaw('COUNT(*) DESC').limit(5).pluck('query')) as string[];
    const [{ stuck }] = (await this.db('payments').whereIn('status', ['AWAITING_VERIFICATION', 'REFUND_PENDING']).count({ stuck: '*' })) as { stuck: number }[];
    const [{ cod }] = (await this.db('staff_profiles').sum({ cod: 'cod_in_hand' })) as { cod: string | null }[];
    const body = `पिछले हफ्ते: ${Number(s?.orders ?? 0)} ऑर्डर, ₹${Number(s?.gmv ?? 0)} बिक्री। अटके भुगतान: ${stuck}। राइडर्स के पास नकद: ₹${Number(cod ?? 0)}। न मिले सामान: ${zero.join(', ') || '—'}`;
    await this.notify.sendToRole('ADMIN', { type: 'digest.weekly', title: 'हफ्ते का सार', body, linkUrl: '/admin', channels: ['IN_APP', 'PUSH'], dedupeKey: `digest:${istDate()}` });
    return body;
  }
}
