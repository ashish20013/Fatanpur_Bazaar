import type { ReactNode } from 'react';
import { PrescriptionUpload } from '@/components/PrescriptionUpload';
import { Badge, EmptyState } from '@/components/ui';
import { authed } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Rx {
  id: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  orderNumber: string | null;
  note: string | null;
  createdAt: string;
}

const TONE: Record<Rx['status'], 'ok' | 'warn' | 'danger' | 'muted'> = { APPROVED: 'ok', PENDING_REVIEW: 'warn', REJECTED: 'danger', EXPIRED: 'muted' };

export default async function PrescriptionsPage(): Promise<ReactNode> {
  const [lang, list] = await Promise.all([currentLang(), authed<Rx[]>('/prescriptions').catch(() => [] as Rx[])]);
  const t = dict(lang);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.account.prescriptions}</h1>
      <PrescriptionUpload lang={lang} />
      {list.length ? (
        <ul className="divide-y divide-line rounded border border-line bg-card">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3">
              <span>
                <span className="block text-base">#{r.id} {r.orderNumber ? `· ${r.orderNumber}` : ''}</span>
                <span className="block text-sm text-ink-3">{formatDate(r.createdAt, lang)}</span>
                {r.note ? <span className="block text-sm text-ink-2">{r.note}</span> : null}
              </span>
              <Badge tone={TONE[r.status]}>{r.status}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="file-text" title={t.account.prescriptions} body={t.checkout.rxNeeded} />
      )}
    </div>
  );
}
