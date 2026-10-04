import type { ReactNode } from 'react';
import { TableWrap, Td, Th } from '@/components/admin/table';
import { EmptyState } from '@/components/ui';
import { authed } from '@/lib/data';
import { formatDate, rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface HistoryRow {
  id: number;
  orderNumber: string;
  status: string;
  earning: string;
  codCollected: string;
  deliveredAt: string | null;
  village: string | null;
}

export default async function Page(): Promise<ReactNode> {
  const [lang, data] = await Promise.all([
    staffLang(),
    authed<{ items: HistoryRow[] } | HistoryRow[]>('/delivery/history').catch(() => [] as HistoryRow[]),
  ]);
  const t = dict(lang);
  const items = Array.isArray(data) ? data : (data.items ?? []);
  if (!items.length) return <EmptyState icon="package" title={t.staff.noRows} />;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.history}</h1>
      <TableWrap>
        <thead>
          <tr>
            <Th>{t.order.number}</Th>
            <Th>{t.address.village}</Th>
            <Th align="right">Earning</Th>
            <Th align="right">Cash collected</Th>
            <Th>When</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((h) => (
            <tr key={h.id}>
              <Td>{h.orderNumber}</Td>
              <Td>{h.village ?? '—'}</Td>
              <Td align="right">{rupees(h.earning)}</Td>
              <Td align="right">{rupees(h.codCollected)}</Td>
              <Td>{h.deliveredAt ? formatDate(h.deliveredAt, lang) : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
