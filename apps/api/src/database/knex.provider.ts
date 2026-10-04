import knexFactory, { type Knex } from 'knex';
import type { Env } from '../config/env';

export const KNEX = Symbol('KNEX');

/**
 * Pool min 2 / max 8 (HOSTING_CAPACITY B4). Every new connection is pinned to +05:30 so
 * NOW(), DATETIME math and cron windows all agree with the app's Asia/Kolkata clock.
 * DECIMAL comes back as strings (mysql2 default) — money is parsed by utils/money, never float.
 */
export function createKnex(env: Pick<Env, 'DB_HOST' | 'DB_PORT' | 'DB_NAME' | 'DB_USER' | 'DB_PASSWORD' | 'DB_POOL_MIN' | 'DB_POOL_MAX'>, opts: { multipleStatements?: boolean } = {}): Knex {
  return knexFactory({
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      charset: 'utf8mb4',
      timezone: '+05:30',
      dateStrings: false,
      supportBigNumbers: true,
      bigNumberStrings: false,
      decimalNumbers: false,
      multipleStatements: opts.multipleStatements ?? false,
    },
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
      afterCreate: (conn: { query: (sql: string, cb: (err: Error | null) => void) => void }, done: (err: Error | null, c: unknown) => void) => {
        conn.query("SET time_zone = '+05:30'", (err) => done(err, conn));
      },
    },
    acquireConnectionTimeout: 10000,
  });
}
