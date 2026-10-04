import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Knex } from 'knex';

/**
 * Tiny SQL migration runner: applies migrations/NNN_*.sql in order, once each, recorded in
 * schema_migrations. Migrations are additive only (DEPLOYMENT §7) so rollback never breaks the DB.
 * `db` must be created with multipleStatements: true.
 */

/**
 * MySQL errors that mean "this change is already here".
 *
 * A migration file is many statements, and MySQL does not roll DDL back. If statement seven fails,
 * statements one to six are already in the database but the file is not recorded as applied — and
 * the next run dies on "Duplicate column" while the real problem hides behind it. The shop is then
 * stuck: every catalogue query 500s and `db:migrate` refuses to move. Treating "already exists" as
 * success lets a half-applied file finish, which is the whole point of additive-only migrations.
 */
const ALREADY_THERE = new Set([
  1050, // ER_TABLE_EXISTS_ERROR
  1060, // ER_DUP_FIELDNAME
  1061, // ER_DUP_KEYNAME
  1091, // ER_CANT_DROP_FIELD_OR_KEY (IF EXISTS not supported everywhere)
  1826, // ER_FK_DUP_NAME
  1022, // ER_DUP_KEY
  // ER_DUP_ENTRY. Safe *because of what these files contain*: migrations only insert reference
  // data (permissions, settings, seed categories), never a customer's order or payment, so a
  // duplicate key here means the row is already seeded. If a future migration ever inserts
  // business rows, it must guard them itself — do not rely on this line.
  1062,
]);

/**
 * Split a migration file into statements.
 *
 * Quote-aware on purpose: these files carry Hindi content ("भुगतान बाकी; अभी नहीं"), and a naive
 * split on ";" would cut a string in half and feed the tail to the server as SQL.
 */
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i] as string;
    if (quote) {
      buf += c;
      if (c === '\\' && quote !== '`') {
        // Backslash escapes the next character inside '…' and "…" (not inside `…`).
        buf += sql[i + 1] ?? '';
        i++;
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      buf += c;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-' && (sql[i + 2] === ' ' || sql[i + 2] === '\n' || sql[i + 2] === undefined)) {
      while (i < sql.length && sql[i] !== '\n') i++;
      buf += '\n';
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (c === ';') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function migrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
}

/** Versions on disk that the database has not recorded yet. */
export async function pendingMigrations(db: Knex, dir: string): Promise<string[]> {
  const has = await db.schema.hasTable('schema_migrations');
  if (!has) return migrationFiles(dir).map((f) => f.replace(/\.sql$/, ''));
  const done = new Set<string>((await db('schema_migrations').select('version')).map((r: { version: string }) => r.version));
  return migrationFiles(dir)
    .map((f) => f.replace(/\.sql$/, ''))
    .filter((v) => !done.has(v));
}

export async function runMigrations(db: Knex, dir: string, log: (m: string) => void = () => undefined): Promise<string[]> {
  await db.raw(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  );
  const done = new Set<string>((await db('schema_migrations').select('version')).map((r: { version: string }) => r.version));
  const applied: string[] = [];
  for (const f of migrationFiles(dir)) {
    const version = f.replace(/\.sql$/, '');
    if (done.has(version)) continue;
    log(`→ applying ${f}`);
    const statements = splitSql(readFileSync(join(dir, f), 'utf8'));
    let skipped = 0;
    for (const stmt of statements) {
      try {
        await db.raw(stmt);
      } catch (e) {
        const errno = (e as { errno?: number }).errno;
        if (errno !== undefined && ALREADY_THERE.has(errno)) {
          skipped++;
          continue;
        }
        // Say which statement failed. "Unknown column" 400 lines into a file is otherwise a hunt.
        const head = stmt.replace(/\s+/g, ' ').slice(0, 120);
        throw new Error(`${f}: ${(e as Error).message}\n  in statement: ${head}${stmt.length > 120 ? '…' : ''}`);
      }
    }
    // 001_init records itself; later files may not — make it idempotent.
    await db.raw('INSERT IGNORE INTO schema_migrations (version) VALUES (?)', [version]);
    log(`  ${statements.length - skipped} statements applied${skipped ? `, ${skipped} already present` : ''}`);
    applied.push(version);
  }
  return applied;
}
