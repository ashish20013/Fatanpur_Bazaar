import type { Knex } from 'knex';

/**
 * The ONLY way to decrement an UNSIGNED counter in this codebase (DATABASE_AUDIT §4.2).
 *
 *   col - n                 → ERROR 1690 when n > col
 *   GREATEST(0, col - n)    → ALSO ERROR 1690 (the subtraction is evaluated first!)
 *   col - LEAST(col, n)     → ✅ clamps at 0, works on MySQL 8 and MariaDB
 *
 * A wrong pattern here would make every order cancellation transaction fail.
 */
const IDENT = /^[a-z_][a-z0-9_]*$/;

export function decrementUnsignedSql(table: string, column: string, whereColumns: readonly string[]): string {
  for (const id of [table, column, ...whereColumns]) {
    if (!IDENT.test(id)) throw new Error(`Unsafe SQL identifier: ${id}`);
  }
  const where = whereColumns.map((c) => `\`${c}\` = ?`).join(' AND ');
  return `UPDATE \`${table}\` SET \`${column}\` = \`${column}\` - LEAST(\`${column}\`, ?) WHERE ${where}`;
}

export async function decrementUnsigned(
  trx: Knex | Knex.Transaction,
  table: string,
  column: string,
  amount: number,
  where: Record<string, string | number>,
): Promise<void> {
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`decrementUnsigned: bad amount ${amount}`);
  if (amount === 0) return;
  const cols = Object.keys(where);
  if (cols.length === 0) throw new Error('decrementUnsigned: WHERE is mandatory');
  await trx.raw(decrementUnsignedSql(table, column, cols), [amount, ...cols.map((c) => where[c])]);
}
