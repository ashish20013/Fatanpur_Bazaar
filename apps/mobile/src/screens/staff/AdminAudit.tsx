import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Pill, Row } from '../../components/admin/AdminKit';

/** ⚠️ The server joins the actor's name in as `actor` and calls the address `ip`; it does not
 *  send `actorId` or `ipAddress`, so those printed "undefined" on every row. */
interface AuditRow {
  id: number;
  actor: string | null;
  actorRole: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
}

/**
 * Security / activity log (§12 item 9) — who changed what, and when. Read-only on purpose:
 * an audit trail that can be edited from the app is not an audit trail.
 */
export default function AdminAuditScreen(): React.JSX.Element {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const { err, setErr } = useAdminAction();

  const load = useCallback(async (p: number) => {
    try {
      const r = await api.paged<AuditRow>('/admin/audit-logs', { page: p });
      setRows((prev) => (p === 1 ? r.items : [...(prev ?? []), ...r.items]));
      setMore(r.meta.hasMore);
      setPage(p);
    } catch (e) {
      setErr(errText(e, true));
    }
  }, [setErr]);

  useEffect(() => { void load(1); }, [load]);

  return (
    <AdminScreen title="Security / activity log" err={err} loading={rows === null}>
      {rows && rows.length === 0 ? <Empty text="Nothing recorded yet." /> : null}
      {rows?.map((r) => (
        <Card key={r.id}>
          <Row label="Action" value={<Pill text={r.action} tone="info" />} />
          <Row label="By" value={r.actor ? `${r.actor} · ${r.actorRole ?? '—'}` : (r.actorRole ?? 'SYSTEM')} />
          {r.entity ? <Row label="On" value={`${r.entity}${r.entityId ? ` ${r.entityId}` : ''}`} /> : null}
          <Row label="When" value={new Date(r.createdAt).toLocaleString('en-IN')} />
          {r.ip ? <Row label="IP" value={r.ip} /> : null}
        </Card>
      ))}
      {more ? <Btn label="Load more" tone="secondary" onPress={() => void load(page + 1)} /> : null}
    </AdminScreen>
  );
}
