'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { PERMISSIONS, RIDER_GRANTABLE_PERMISSIONS, type Permission } from '@fb/shared-types';
import { call } from '@/lib/client';
import { formatDate, rupees } from '@/lib/format';
import { Icon } from '../icons';
import { Badge, EmptyState, buttonClass } from '../ui';
import { useAdminAction } from './admin-client';
import { Check, Field, Notice, PanelTitle, inputCls } from './form-kit';
import type { StaffRow } from './StaffAdmin';
import { TableWrap, Td, Th } from './table';

type Vehicle = 'BIKE' | 'SCOOTER' | 'CYCLE' | 'OTHER';
interface RiderForm {
  name: string;
  phone: string;
  vehicleType: Vehicle;
  vehicleNumber: string;
  permissions: Permission[];
}
const EMPTY: RiderForm = { name: '', phone: '', vehicleType: 'BIKE', vehicleNumber: '', permissions: [] };
const permLabel = (code: Permission): string => PERMISSIONS.find((p) => p.code === code)?.labelEn ?? code;

function CreateRider({ grantable, busy, onSave, onCancel }: { grantable: Permission[]; busy: boolean; onSave: (f: RiderForm) => void; onCancel: () => void }): ReactNode {
  const [f, setF] = useState<RiderForm>(EMPTY);
  const phoneOk = /^[6-9]\d{9}$/.test(f.phone);
  const toggle = (p: Permission, on: boolean): void => setF((x) => ({ ...x, permissions: on ? [...x.permissions, p] : x.permissions.filter((c) => c !== p) }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (phoneOk) onSave(f);
      }}
    >
      <Field label="Full name">
        <input required minLength={2} maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} autoComplete="off" />
      </Field>
      <Field label="Mobile number" hint={f.phone && !phoneOk ? '10 digits, starting with 6–9' : 'They log in with this number and an OTP.'}>
        <input required inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} className={`${inputCls} tabular-nums`} placeholder="98XXXXXXXX" />
      </Field>
      <Field label="Vehicle">
        <select value={f.vehicleType} onChange={(e) => setF({ ...f, vehicleType: e.target.value as Vehicle })} className={inputCls}>
          <option value="BIKE">Motorbike</option>
          <option value="SCOOTER">Scooter</option>
          <option value="CYCLE">Cycle</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>
      <Field label="Vehicle number (optional)">
        <input maxLength={20} value={f.vehicleNumber} onChange={(e) => setF({ ...f, vehicleNumber: e.target.value.toUpperCase() })} className={`${inputCls} font-mono`} placeholder="UP72 AB 1234" />
      </Field>
      {grantable.length ? (
        <div className="sm:col-span-2">
          <p className="text-sm font-semibold text-ink-2">Extra access</p>
          {grantable.map((p) => (
            <Check key={p} label={permLabel(p)} checked={f.permissions.includes(p)} onChange={(on) => toggle(p, on)} />
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className={buttonClass('ghost', 'sm')}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !phoneOk} className={buttonClass('primary', 'sm')}>
          {busy ? 'Creating…' : 'Create delivery partner'}
        </button>
      </div>
    </form>
  );
}

function DisableForm({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: (reason: string) => void; onCancel: () => void }): ReactNode {
  const [reason, setReason] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(reason.trim());
      }}
    >
      <Field label="Reason for disabling (kept in the activity log)">
        <input required minLength={3} maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} sm:w-96`} placeholder="Left the job" />
      </Field>
      <button type="button" onClick={onCancel} className={buttonClass('ghost', 'sm')}>
        Cancel
      </button>
      <button type="submit" disabled={busy || reason.trim().length < 3} className={buttonClass('danger', 'sm')}>
        {busy ? 'Disabling…' : 'Disable and log out'}
      </button>
    </form>
  );
}

function RiderRow({ r, busy, onDisable, onEnable }: { r: StaffRow; busy: boolean; onDisable: () => void; onEnable: () => void }): ReactNode {
  const active = r.status === 'ACTIVE';
  return (
    <tr className={active ? '' : 'bg-paper/60'}>
      <Td>
        <span className="block font-semibold">{r.name ?? '—'}</span>
        <span className="block font-mono text-sm text-ink-3">{r.employeeCode ?? ''}</span>
      </Td>
      <Td>
        <a href={`tel:+91${r.phone}`} className="font-semibold tabular-nums text-em-700">
          {r.phone}
        </a>
      </Td>
      <Td className="text-sm">{r.vehicleType ?? '—'}</Td>
      <Td align="center">
        <Badge tone={active ? 'ok' : 'danger'}>{active ? 'Active' : 'Disabled'}</Badge>
        {active ? <span className="mt-0.5 block text-sm text-ink-3">{r.isAvailable ? 'On duty' : 'Off duty'}</span> : null}
      </Td>
      <Td align="right">{r.totalDeliveries}</Td>
      <Td align="right" className={Number(r.codInHand) > 3000 ? 'font-semibold text-warn' : ''}>
        {rupees(r.codInHand)}
      </Td>
      <Td className="text-sm">{r.lastLoginAt ? formatDate(r.lastLoginAt, 'en') : 'Never'}</Td>
      <Td align="right">
        {active ? (
          <button type="button" disabled={busy} onClick={onDisable} className={buttonClass('ghost', 'sm')}>
            <Icon name="user-off" size={16} className="text-danger" /> Disable
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={onEnable} className={buttonClass('secondary', 'sm')}>
            <Icon name="user-check" size={16} /> Enable
          </button>
        )}
      </Td>
    </tr>
  );
}

/**
 * Delivery partners (DELIVERY_BOY) for a SUPERVISOR with staff.manage_riders (and ADMIN).
 * ⚠️ The API enforces the limits: rider-only, and only RIDER_GRANTABLE_PERMISSIONS the actor holds.
 */
export function RidersAdmin({ rows, actorPermissions, isAdmin }: { rows: StaffRow[]; actorPermissions: Permission[]; isAdmin: boolean }): ReactNode {
  const a = useAdminAction();
  const [adding, setAdding] = useState(false);
  const [disableId, setDisableId] = useState<number | null>(null);
  const grantable = RIDER_GRANTABLE_PERMISSIONS.filter((p) => isAdmin || actorPermissions.includes(p));

  async function create(f: RiderForm): Promise<void> {
    const body = { name: f.name.trim(), phone: f.phone, role: 'DELIVERY_BOY', vehicleType: f.vehicleType, vehicleNumber: f.vehicleNumber.trim() || undefined, permissions: f.permissions.length ? f.permissions : undefined };
    const r = await a.run('create', () => call('/admin/staff', { method: 'POST', body }), `${f.name.trim()} added. They can now log in with ${f.phone} and an OTP.`);
    if (r !== null) setAdding(false);
  }

  async function disable(r: StaffRow, reason: string): Promise<void> {
    const ok = await a.run(`row-${r.id}`, () => call(`/admin/staff/${r.id}/disable`, { method: 'PATCH', body: { reason } }), `${r.name ?? r.phone} was disabled and logged out everywhere.`);
    if (ok !== null) setDisableId(null);
  }

  async function enable(r: StaffRow): Promise<void> {
    if (!window.confirm(`Enable ${r.name ?? r.phone} again?`)) return;
    await a.run(`row-${r.id}`, () => call(`/admin/staff/${r.id}/enable`, { method: 'PATCH', body: {} }), `${r.name ?? r.phone} is active again.`);
  }

  const activeCount = rows.filter((r) => r.status === 'ACTIVE').length;
  return (
    <div className="space-y-4">
      <PanelTitle
        action={
          <button type="button" onClick={() => setAdding(!adding)} className={buttonClass(adding ? 'ghost' : 'primary', 'sm')}>
            <Icon name={adding ? 'x' : 'user-plus'} size={18} /> {adding ? 'Close' : 'Add delivery partner'}
          </button>
        }
      >
        {activeCount} active · {rows.length - activeCount} disabled
      </PanelTitle>
      <Notice err={a.err} ok={a.ok} />
      {adding ? (
        <div className="fb-card p-4">
          <CreateRider grantable={grantable} busy={a.busy === 'create'} onSave={(f) => void create(f)} onCancel={() => setAdding(false)} />
        </div>
      ) : null}
      {rows.length ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Vehicle</Th>
              <Th align="center">Status</Th>
              <Th align="right">Deliveries</Th>
              <Th align="right">Cash in hand</Th>
              <Th>Last login</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <RiderRow r={r} busy={a.busy === `row-${r.id}`} onDisable={() => setDisableId(disableId === r.id ? null : r.id)} onEnable={() => void enable(r)} />
                {disableId === r.id ? (
                  <tr>
                    <td colSpan={8} className="border-b border-line bg-paper/50 p-3">
                      <DisableForm busy={a.busy === `row-${r.id}`} onConfirm={(reason) => void disable(r, reason)} onCancel={() => setDisableId(null)} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <div className="fb-card">
          <EmptyState icon="motorbike" title="No delivery partners yet" body="Add a delivery partner with their mobile number. They log in with an OTP — no password needed." />
        </div>
      )}
    </div>
  );
}
