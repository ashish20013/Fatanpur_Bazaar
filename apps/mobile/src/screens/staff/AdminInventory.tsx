import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';

interface LowStockRow {
  id: number;
  name: string;
  nameHi: string | null;
  stockQty: number;
  lowStockAt: number;
  category: string | null;
}

/**
 * Inventory — the "what is about to run out" list (GET /admin/inventory/low-stock), with the
 * one action that matters on a phone: set the new count after a delivery arrives.
 *
 * Stock goes through PATCH /admin/products/:id/stock so the move is written to inventory_logs,
 * never by editing the product row. ⚠️ That endpoint takes `{ set }` (or `{ delta }`) and a
 * reason from RESTOCK | MANUAL | CORRECTION — it was being sent `{ stockQty }`, which the schema
 * refuses ("set या delta ज़रूरी है"), so every save on this screen failed.
 */
export default function AdminInventoryScreen(): React.JSX.Element {
  const [rows, setRows] = useState<LowStockRow[] | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try {
      setRows(await api.get<LowStockRow[]>('/admin/inventory/low-stock'));
    } catch (e) {
      setErr(errText(e, true));
    }
  }, [setErr]);

  useEffect(() => { void load(); }, [load]);

  const save = (r: LowStockRow): void => {
    const n = Number(qty[r.id]);
    if (!Number.isInteger(n) || n < 0) { setErr('Enter a whole number, 0 or more'); return; }
    void run(String(r.id), () => api.patch(`/admin/products/${r.id}/stock`, { set: n, reason: 'RESTOCK' }), 'Stock updated', () => {
      setQty((p) => ({ ...p, [r.id]: '' }));
      void load();
    });
  };

  return (
    <AdminScreen title="Inventory / stock" err={err} ok={ok} loading={rows === null}>
      {rows && rows.length === 0 ? <Empty text="Nothing is low on stock." /> : null}
      {rows?.map((r) => (
        <Card key={r.id}>
          <Row label="Item" value={r.nameHi ?? r.name} strong />
          {r.category ? <Row label="Category" value={r.category} /> : null}
          <Row label="In stock" value={<Pill text={String(r.stockQty)} tone={r.stockQty === 0 ? 'danger' : 'warn'} />} />
          <Row label="Low at" value={r.lowStockAt} />
          <Field label="Set new count">
            <TextField value={qty[r.id] ?? ''} onChangeText={(v) => setQty((p) => ({ ...p, [r.id]: v }))} placeholder="e.g. 24" keyboardType="number-pad" />
          </Field>
          <Btn label="Save stock" onPress={() => save(r)} busy={busy === String(r.id)} icon="box" />
        </Card>
      ))}
    </AdminScreen>
  );
}
