import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui';
import { authed } from '@/lib/data';
import { formatDate, rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Txn {
  id: number;
  type: 'CREDIT' | 'DEBIT';
  source: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  createdAt: string;
}

export default async function WalletPage(): Promise<ReactNode> {
  const [lang, wallet] = await Promise.all([
    currentLang(),
    authed<{ balance: string; items: Txn[] }>('/users/me/wallet').catch(() => ({ balance: '0.00', items: [] as Txn[] })),
  ]);
  const t = dict(lang);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.account.wallet}</h1>
      <div className="fb-card p-4">
        <p className="text-base text-ink-3">{t.account.balance}</p>
        <p className="fb-price text-3xl">{rupees(wallet.balance)}</p>
      </div>
      {wallet.items.length ? (
        <ul className="divide-y divide-line rounded border border-line bg-card">
          {wallet.items.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block text-base">{x.note ?? x.source}</span>
                <span className="block text-sm text-ink-3">{formatDate(x.createdAt, lang)}</span>
              </span>
              <span className={`fb-price ${x.type === 'CREDIT' ? 'text-ok' : 'text-ink'}`}>
                {x.type === 'CREDIT' ? '+' : '−'} {rupees(x.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="wallet" title={t.account.wallet} body={t.account.balance} />
      )}
    </div>
  );
}
