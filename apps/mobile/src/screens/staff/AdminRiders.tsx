import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';
import type { StaffRow } from './AdminStaff';

/**
 * Delivery partners — the rider half of the staff list, plus the one money job that happens
 * every evening: taking the day's cash off a rider (POST /admin/cod/settle).
 *
 * ⚠️ Settling COD must never debit the rider's wallet — that money was never credited there
 * (A17). It reduces `cod_in_hand` and writes a cod_settlements row, which is what this
 * endpoint does.
 */
export default function AdminRidersScreen(): React.JSX.Element {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [amt, setAmt] = useState<Record<number, string>>({});
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try {
      const all = await api.get<StaffRow[]>('/admin/staff');
      setRows(all.filter((s) => s.role === 'DELIVERY_BOY'));
    } catch (e) { setErr(errText(e, true)); }
  }, [setErr]);

  useEffect(() => { void load(); }, [load]);

  const settle = (r: StaffRow): void => {
    const n = Number(amt[r.id]);
    if (!Number.isFinite(n) || n <= 0) { setErr('Enter the amount you are taking'); return; }
    if (n > Number(r.codInHand)) { setErr(`That is more than the ₹${r.codInHand} this partner is holding`); return; }
    void run(String(r.id), () => api.post('/admin/cod/settle', { riderId: r.id, amount: n.toFixed(2) }), 'Cash recorded', () => {
      setAmt((p) => ({ ...p, [r.id]: '' })); void load();
    });
  };

  return (
    <AdminScreen title="Delivery partners" err={err} ok={ok} loading={rows === null}>
      {rows && rows.length === 0 ? <Empty text="No delivery partners yet." /> : null}
      {rows?.map((r) => (
        <Card key={r.id}>
          <Row label="Name" value={r.name ?? r.phone} strong />
          <Row label="Mobile" value={r.phone} />
          <Row label="On duty" value={<Pill text={r.isAvailable === 1 ? 'Yes' : 'No'} tone={r.isAvailable === 1 ? 'ok' : 'muted'} />} />
          <Row label="Deliveries" value={r.totalDeliveries} />
          <Row label="Rating" value={r.ratingAvg} />
          <Row label="Cash in hand" value={`₹${r.codInHand}`} strong />
          <Field label="Cash received (₹)" hint="Record what you have actually taken from them.">
            <TextField value={amt[r.id] ?? ''} onChangeText={(v) => setAmt((p) => ({ ...p, [r.id]: v }))} placeholder={r.codInHand} keyboardType="decimal-pad" />
          </Field>
          <Btn label="Record cash" onPress={() => settle(r)} busy={busy === String(r.id)} icon="cash-banknote" />
        </Card>
      ))}
    </AdminScreen>
  );
}
