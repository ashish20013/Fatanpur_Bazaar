import type { ReactNode } from 'react';
import { TableWrap, Td, Th } from '@/components/admin/table';
import { Pagination } from '@/components/list';
import { EmptyState } from '@/components/ui';
import { apiPaged } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { accessToken, staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface AuditRow {
  id: number;
  actorId: number | null;
  actorRole: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const [lang, sp, token] = await Promise.all([staffLang(), searchParams, accessToken()]);
  const t = dict(lang);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { items, meta } = await apiPaged<AuditRow>(`/admin/audit-logs?page=${page}`, { token });
  if (!items.length) return <EmptyState icon="history" title={t.staff.noRows} />;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.audit}</h1>
      <TableWrap>
        <thead>
          <tr>
            <Th>{t.order.placedAt}</Th>
            <Th>Who</Th>
            <Th>Action</Th>
            <Th>Target</Th>
            <Th>IP</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <Td>{formatDate(a.createdAt, lang)}</Td>
              <Td>#{a.actorId ?? '—'} {a.actorRole ?? ''}</Td>
              <Td className="font-mono text-sm">{a.action}</Td>
              <Td>{a.entity ? `${a.entity}#${a.entityId ?? ''}` : '—'}</Td>
              <Td className="font-mono text-sm">{a.ipAddress ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Pagination lang={lang} basePath="/admin/audit" meta={meta} />
    </div>
  );
}
