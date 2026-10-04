import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import type { WalletTxnSource } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { AppError } from '../../common/errors';
import { fromPaise, toPaise, type Paise } from '../../common/utils/money';

/**
 * A22 — append-only ledger. `wallets.balance` is a read cache; the truth is SUM(transactions).
 * credit/debit REQUIRE a caller transaction and never BEGIN their own, so they compose with
 * order placement / cancellation atomically.
 */
@Injectable()
export class WalletService {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  private async lockWallet(trx: Knex.Transaction, userId: number): Promise<{ id: number; balance: Paise }> {
    let w = await trx('wallets').where({ user_id: userId }).forUpdate().first('id', 'balance');
    if (!w) {
      await trx.raw('INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0)', [userId]);
      w = await trx('wallets').where({ user_id: userId }).forUpdate().first('id', 'balance');
    }
    return { id: w.id as number, balance: toPaise(w.balance as string) };
  }

  async credit(trx: Knex.Transaction, userId: number, amount: Paise, source: WalletTxnSource, ref: string | null, note?: string, createdBy?: number | null): Promise<Paise> {
    if (amount <= 0) return (await this.lockWallet(trx, userId)).balance;
    const w = await this.lockWallet(trx, userId);
    const balanceAfter = w.balance + amount;
    await trx('wallets').where({ id: w.id }).update({ balance: fromPaise(balanceAfter) });
    await trx('wallet_transactions').insert({ wallet_id: w.id, type: 'CREDIT', source, amount: fromPaise(amount), balance_after: fromPaise(balanceAfter), reference_id: ref?.slice(0, 40) ?? null, note: note?.slice(0, 255) ?? null, created_by: createdBy ?? null });
    return balanceAfter;
  }

  async debit(trx: Knex.Transaction, userId: number, amount: Paise, source: WalletTxnSource, ref: string | null, note?: string, createdBy?: number | null): Promise<Paise> {
    if (amount <= 0) return (await this.lockWallet(trx, userId)).balance;
    const w = await this.lockWallet(trx, userId);
    if (w.balance < amount) throw new AppError('BUSINESS_RULE', { reason: 'वॉलेट में पर्याप्त पैसे नहीं हैं' });
    const balanceAfter = w.balance - amount;
    await trx('wallets').where({ id: w.id }).update({ balance: fromPaise(balanceAfter) });
    await trx('wallet_transactions').insert({ wallet_id: w.id, type: 'DEBIT', source, amount: fromPaise(amount), balance_after: fromPaise(balanceAfter), reference_id: ref?.slice(0, 40) ?? null, note: note?.slice(0, 255) ?? null, created_by: createdBy ?? null });
    return balanceAfter;
  }

  async balance(userId: number, trx?: Knex.Transaction): Promise<Paise> {
    const w = await (trx ?? this.db)('wallets').where({ user_id: userId }).first('balance');
    return w ? toPaise(w.balance) : 0;
  }

  async history(userId: number, page: number, perPage: number): Promise<{ balance: string; items: unknown[]; total: number }> {
    const w = await this.db('wallets').where({ user_id: userId }).first('id', 'balance');
    if (!w) return { balance: '0.00', items: [], total: 0 };
    const [items, [{ total }]] = await Promise.all([
      this.db('wallet_transactions').where({ wallet_id: w.id }).orderBy('id', 'desc').limit(perPage).offset((page - 1) * perPage)
        .select('id', 'type', 'source', 'amount', 'balance_after as balanceAfter', 'reference_id as reference', 'note', 'created_at as createdAt'),
      this.db('wallet_transactions').where({ wallet_id: w.id }).count({ total: '*' }),
    ]);
    return { balance: w.balance, items, total: Number(total) };
  }

  /** Nightly: SUM(ledger) vs cached balance. Mismatches are REPORTED, never silently fixed. */
  async reconcile(): Promise<{ walletId: number; userId: number; balance: string; ledger: string }[]> {
    const rows = (await this.db.raw(
      `SELECT w.id AS walletId, w.user_id AS userId, w.balance AS balance,
              COALESCE(SUM(CASE WHEN t.type = 'CREDIT' THEN t.amount ELSE -t.amount END), 0) AS ledger
         FROM wallets w LEFT JOIN wallet_transactions t ON t.wallet_id = w.id
        GROUP BY w.id, w.user_id, w.balance
       HAVING w.balance <> COALESCE(SUM(CASE WHEN t.type = 'CREDIT' THEN t.amount ELSE -t.amount END), 0)`,
    )) as [{ walletId: number; userId: number; balance: string; ledger: string }[]];
    return rows[0];
  }
}
