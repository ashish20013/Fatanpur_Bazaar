import { join } from 'node:path';
import type { Knex } from 'knex';
import { createKnex } from '../../src/database/knex.provider';
import { runMigrations } from '../../src/database/migrate';
import type { ICacheProvider } from '../../src/common/cache/cache.provider';

let migrated = false;

/**
 * Applies every migrations/NNN_*.sql once per test process (idempotent — schema_migrations).
 * The app's own pool runs with multipleStatements OFF (safer), but a migration file is a batch of
 * statements, so migrations get a short-lived connection of their own — exactly like `cli.js migrate`.
 */
export async function ensureMigrated(_db: Knex): Promise<void> {
  if (migrated) return;
  const e = process.env;
  const mig = createKnex(
    { DB_HOST: e.DB_HOST ?? '127.0.0.1', DB_PORT: Number(e.DB_PORT ?? 3306), DB_NAME: e.DB_NAME ?? 'fb_test', DB_USER: e.DB_USER ?? 'fb', DB_PASSWORD: e.DB_PASSWORD ?? '', DB_POOL_MIN: 1, DB_POOL_MAX: 1 },
    { multipleStatements: true },
  );
  try {
    await runMigrations(mig, join(__dirname, '..', '..', 'src', 'database', 'migrations'));
  } finally {
    await mig.destroy();
  }
  migrated = true;
}

/**
 * Tables whose rows are seed data (migrations) or process-local bookkeeping, never test fixtures —
 * truncating them would force every spec to re-seed 34 permissions / 57 settings / the default
 * 6 km zone by hand. Fixtures live in everything else and are wiped before every test.
 */
const KEEP_TABLES = new Set(['schema_migrations', 'settings', 'permissions', 'role_permissions', 'service_zones', 'cron_state']);

async function tableNames(db: Knex, dbName: string): Promise<string[]> {
  const rows = (await db('information_schema.tables').where({ table_schema: dbName }).pluck('table_name')) as string[];
  return rows;
}

/**
 * Reset-between-tests (BUILD_PROMPT §15: "har test se pehle truncate+seed"). Also re-applies a
 * small set of baseline settings so tests never depend on the wall-clock (store hours) or on
 * verticals the owner ships OFF by default (SERVICE/PHARMACY) — and clears the whole in-process
 * cache (SettingsService/ServiceAreaService/CatalogService/IdentityService all share one LRU;
 * delPrefix('') matches every key since every key starts with '').
 *
 * ⚠️ DELETE, not TRUNCATE: TrackingService/TrackingGateway keep plain in-process Maps keyed by
 * `delivery_assignments.id` (live position, throttle/dedupe state, socket-cap bookkeeping) that
 * are NOT part of ICacheProvider, so `cache.delPrefix('')` cannot clear them. TRUNCATE resets
 * AUTO_INCREMENT, so the very next test's first assignment would be handed the same id as a
 * previous test's — and inherit that stale in-memory throttle/dedupe state (tracking.spec.ts's
 * "first ping always persists" and "duplicate ts" tests would then depend on execution order).
 * DELETE never resets the counter, so ids are unique for the lifetime of the process.
 */
export async function resetDb(db: Knex, cache: ICacheProvider, dbName: string): Promise<void> {
  await ensureMigrated(db);
  const tables = await tableNames(db, dbName);
  await db.raw('SET FOREIGN_KEY_CHECKS=0');
  for (const t of tables) {
    if (KEEP_TABLES.has(t)) continue;
    await db.raw(`DELETE FROM \`${t}\``);
  }
  await db.raw('SET FOREIGN_KEY_CHECKS=1');
  await applyBaselineSettings(db);
  cache.delPrefix('');
}

async function applyBaselineSettings(db: Knex): Promise<void> {
  const changes: Record<string, string> = {
    // Store/service "open" 24x7 so quote/order tests never depend on the wall-clock IST hour.
    store_open_time: '00:00',
    store_close_time: '23:59',
    service_open_time: '00:00',
    service_close_time: '23:59',
    // Every vertical ON — day-1-OFF verticals (PHARMACY/AGRI_INPUT/SERVICE) are exercised by the
    // rx-gate and service-booking tests, which would otherwise see PRODUCT_UNAVAILABLE (Compliance
    // kill-switch), not the behaviour under test.
    vertical_VEGETABLES_enabled: '1',
    vertical_FRUITS_enabled: '1',
    vertical_GROCERY_enabled: '1',
    vertical_PHARMACY_enabled: '1',
    vertical_AGRI_INPUT_enabled: '1',
    vertical_SERVICE_enabled: '1',
    cod_enabled: '1',
    upi_enabled: '1',
    upi_vpa: 'fatanpurbazaar@hdfcbank',
    gateway_enabled: '0',
    allow_admin_creation: '1', // RBAC tests exercise ADMIN-creates-ADMIN explicitly
  };
  for (const [key, value] of Object.entries(changes)) {
    await db('settings').where({ key }).update({ value });
  }
}
