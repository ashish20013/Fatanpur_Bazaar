import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { Role } from '@fb/shared-types';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';

export interface StaffRow {
  id: number; name: string | null; phone: string; role: Role;
  status: 'ACTIVE' | 'DISABLED' | 'DELETED'; lastLoginAt: string | null;
  employeeCode: string | null; vehicleType: string | null; isAvailable: 0 | 1;
  codInHand: string; totalDeliveries: number; ratingAvg: string;
  /** The owner. Exactly one row carries this, and it is the one row nobody may act on. */
  isGlobalAdmin?: 0 | 1 | boolean;
}

/**
 * Staff & access (A7). Creating staff is ADMIN-only and goes through POST /admin/staff —
 * ⚠️ never through the public registration path, which can only ever make a CUSTOMER.
 *
 * Disabling revokes every session server-side. The API refuses to disable the last active
 * admin and refuses to touch the owner's row; this screen does not try to re-implement those
 * rules, it just shows what the server answers.
 */
export default function AdminStaffScreen(): React.JSX.Element {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('DELIVERY_BOY');
  const [reason, setReason] = useState<Record<number, string>>({});
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try { setRows(await api.get<StaffRow[]>('/admin/staff')); }
    catch (e) { setErr(errText(e, true)); }
  }, [setErr]);

  useEffect(() => { void load(); }, [load]);

  const create = (): void => {
    const p = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(p)) { setErr('Enter a 10-digit mobile number starting 6–9'); return; }
    void run('create', () => api.post('/admin/staff', { name: name.trim(), phone: p, role }), 'Staff member added', () => {
      setName(''); setPhone(''); void load();
    });
  };

  /**
   * ⚠️ Disabling needs a REASON of at least 3 characters — `DisableSchema` in
   * apps/api/src/modules/staff/staff.schemas.ts. This used to send `{}`, so "Disable account"
   * failed every time with a validation error: a staff member who had left could not be shut out
   * from the phone at all. The website asks for the reason in a prompt; here it is a field on the
   * row, because the reason goes into the audit log and someone will read it later.
   *
   * Enabling takes no body, and the API refuses to disable the last ACTIVE admin (409) — that
   * message is shown as it comes back rather than second-guessed here.
   */
  const disable = (s: StaffRow): void => {
    const why = (reason[s.id] ?? '').trim();
    if (why.length < 3) {
      setErr('Write a short reason — it goes into the activity log.');
      return;
    }
    Alert.alert('Disable this account?', `${s.name ?? s.phone} will be signed out of every device immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable',
        style: 'destructive',
        onPress: () =>
          void run(String(s.id), () => api.patch(`/admin/staff/${s.id}/disable`, { reason: why }), 'Disabled', () => {
            setReason((p) => ({ ...p, [s.id]: '' }));
            void load();
          }),
      },
    ]);
  };

  const enable = (s: StaffRow): void => {
    void run(String(s.id), () => api.patch(`/admin/staff/${s.id}/enable`, {}), 'Enabled', () => void load());
  };

  return (
    <AdminScreen title="Staff & access" err={err} ok={ok} loading={rows === null}>
      <Card>
        <Row label="Add staff" value="Supervisor or delivery partner" strong />
        <Field label="Name"><TextField value={name} onChangeText={setName} placeholder="Full name" /></Field>
        <Field label="Mobile" hint="They sign in with this number and an OTP.">
          <TextField value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder="10 digits" keyboardType="number-pad" />
        </Field>
        <Field label="Role">
          <Btn label={role === 'DELIVERY_BOY' ? 'Delivery partner' : 'Supervisor'} tone="secondary" icon="users"
            onPress={() => setRole(role === 'DELIVERY_BOY' ? 'SUPERVISOR' : 'DELIVERY_BOY')} />
        </Field>
        <Btn label="Add staff member" onPress={create} busy={busy === 'create'} icon="user-plus" />
      </Card>

      {rows && rows.length === 0 ? <Empty text="No staff yet." /> : null}
      {rows?.map((s) => {
        const owner = s.isGlobalAdmin === 1 || s.isGlobalAdmin === true;
        return (
          <Card key={s.id}>
            <Row label="Name" value={s.name ?? '—'} strong />
            <Row label="Mobile" value={s.phone} />
            <Row label="Role" value={<Pill text={s.role} tone={s.role === 'ADMIN' ? 'info' : 'muted'} />} />
            <Row label="Status" value={<Pill text={s.status} tone={s.status === 'ACTIVE' ? 'ok' : 'danger'} />} />
            {s.employeeCode ? <Row label="Code" value={s.employeeCode} /> : null}
            {s.role === 'DELIVERY_BOY' ? (
              <>
                <Row label="Deliveries" value={s.totalDeliveries} />
                <Row label="Cash in hand" value={`₹${s.codInHand}`} strong />
              </>
            ) : null}
            <Row label="Last login" value={s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString('en-IN') : 'never'} />
            {owner ? <Row label="Note" value={<Pill text="Owner account — cannot be changed" tone="warn" />} /> : (
              <>
                {s.status === 'ACTIVE' ? (
                  <>
                    <Field label="Why are you disabling this account?" hint="Saved to the activity log.">
                      <TextField value={reason[s.id] ?? ''} onChangeText={(v) => setReason((p) => ({ ...p, [s.id]: v }))} placeholder="e.g. left the job" />
                    </Field>
                    <Btn label="Disable account" tone="danger" busy={busy === String(s.id)} onPress={() => disable(s)} />
                  </>
                ) : (
                  <Btn label="Enable account" busy={busy === String(s.id)} onPress={() => enable(s)} />
                )}
                <Btn label="Sign out of all devices" tone="secondary" icon="logout" busy={busy === `rv-${s.id}`}
                  onPress={() => void run(`rv-${s.id}`, () => api.post(`/admin/staff/${s.id}/revoke-sessions`, {}), 'Sessions revoked')} />
              </>
            )}
          </Card>
        );
      })}
    </AdminScreen>
  );
}
