import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';

/**
 * Exactly what GET /admin/customers returns — no more.
 *
 * ⚠️ This screen first asked for `orders`, `spent` and `lastOrderAt`, and showed "₹undefined"
 * on every row, because the API sends none of them: it counts delivered orders as
 * `deliveredOrders` and has no spend or last-order column (admin.service.ts). The website's own
 * Customers table has the same mismatch and prints a blank orders column — worth fixing there,
 * but the fix in the app is to read the fields that exist.
 */
interface CustomerRow {
  id: number;
  name: string | null;
  phone: string;
  status: 'ACTIVE' | 'DISABLED' | 'DELETED';
  phoneVerified: 0 | 1;
  createdAt: string;
  deliveredOrders: number;
}

const day = (iso: string): string => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Customers — read-only, the same list the website shows: look someone up by name or mobile. */
export default function AdminCustomersScreen(): React.JSX.Element {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const { err, setErr } = useAdminAction();

  const load = useCallback(
    async (search = '', p = 1) => {
      try {
        // ⚠️ The server reads `q`; `search` was ignored, so the box never filtered anything.
        const r = await api.paged<CustomerRow>('/admin/customers', { q: search || undefined, page: p });
        setRows(r.items);
        setHasMore(r.meta.hasMore);
        setPage(p);
      } catch (e) {
        setErr(errText(e, true));
      }
    },
    [setErr],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminScreen title="Customers" err={err} loading={rows === null}>
      <Field label="Search">
        <TextField value={q} onChangeText={setQ} placeholder="Name or mobile" />
      </Field>
      <Btn label="Search" tone="secondary" icon="search" onPress={() => void load(q, 1)} />
      {rows && rows.length === 0 ? <Empty text="No customers matched." /> : null}
      {rows?.map((c) => (
        <Card key={c.id}>
          <Row label="Name" value={c.name ?? '—'} strong />
          <Row label="Mobile" value={c.phone} />
          <Row label="Delivered orders" value={c.deliveredOrders} />
          <Row label="Joined" value={day(c.createdAt)} />
          <Row label="Status" value={<Pill text={c.status} tone={c.status === 'ACTIVE' ? 'ok' : 'danger'} />} />
          <Row label="Phone verified" value={<Pill text={c.phoneVerified === 1 ? 'Yes' : 'No'} tone={c.phoneVerified === 1 ? 'ok' : 'warn'} />} />
        </Card>
      ))}
      {hasMore ? <Btn label="Load more" tone="secondary" icon="chevron-down" onPress={() => void load(q, page + 1)} /> : null}
    </AdminScreen>
  );
}
