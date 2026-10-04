'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_PERMISSIONS, PERMISSIONS, type Role } from '@fb/shared-types';
import { call, errText } from '@/lib/client';
import { formatDate, rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Badge, buttonClass } from '../ui';
import { Icon } from '../icons';
import { TableWrap, Td, Th } from './table';

export interface StaffRow {
  id: number;
  name: string | null;
  phone: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED' | 'DELETED';
  lastLoginAt: string | null;
  employeeCode: string | null;
  vehicleType: string | null;
  isAvailable: 0 | 1;
  codInHand: string;
  totalDeliveries: number;
  ratingAvg: string;
  /** The owner. Exactly one row carries this, and it is the one row nobody may act on. */
  isGlobalAdmin?: 0 | 1 | boolean;
}

/**
 * A7 — staff banane/disable karne ka rasta.
 * ⚠️ Yahan se CUSTOMER nahi banta (schema me option hi nahi).
 * ⚠️ ADMIN tabhi ban sakta hai jab settings.allow_admin_creation ON ho.
 * ⚠️ Aakhri ACTIVE ADMIN disable nahi hota — API 409 deti hai, message यहीं दिखता है.
 */
export function StaffAdmin({ lang, rows, allowAdminCreation, viewerIsOwner }: { lang: Lang; rows: StaffRow[]; allowAdminCreation: boolean; viewerIsOwner: boolean }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [permFor, setPermFor] = useState<StaffRow | null>(null);
  const [form, setForm] = useState<{ phone: string; name: string; role: 'SUPERVISOR' | 'DELIVERY_BOY' | 'ADMIN'; employeeCode: string }>({
    phone: '',
    name: '',
    role: 'DELIVERY_BOY',
    employeeCode: '',
  });

  async function run(id: number | null, fn: () => Promise<void>): Promise<void> {
    setBusy(id);
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(null);
    }
  }

  const field = 'h-12 w-full rounded border border-line px-3 text-body';

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setAdding(!adding)} className={buttonClass('secondary', 'sm')}>
        {t.staff.createStaff}
      </button>

      {adding ? (
        <div className="fb-card space-y-2 p-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t.auth.name} className={field} />
          <input value={form.phone} inputMode="numeric" maxLength={10} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} placeholder={t.auth.phone} className={field} />
          <input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value.toUpperCase() })} placeholder="EMP-201" className={field} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })} aria-label={t.staff.role} className={field}>
            <option value="DELIVERY_BOY">DELIVERY_BOY</option>
            <option value="SUPERVISOR">SUPERVISOR</option>
            {/* Appointing an admin is the owner's alone, and even for him it needs the second
                switch on. Offering it to anyone else would just be a button whose save is refused. */}
            {viewerIsOwner ? (
              <option value="ADMIN" disabled={!allowAdminCreation}>
                ADMIN {allowAdminCreation ? '' : '(turn on allow_admin_creation in Settings)'}
              </option>
            ) : null}
          </select>
          <button
            type="button"
            disabled={busy === 0}
            className={buttonClass('primary', 'md')}
            onClick={() =>
              void run(0, async () => {
                await call('/admin/staff', {
                  method: 'POST',
                  body: { phone: form.phone, name: form.name.trim(), role: form.role, employeeCode: form.employeeCode.trim() || undefined },
                });
                setAdding(false);
                setForm({ phone: '', name: '', role: 'DELIVERY_BOY', employeeCode: '' });
              })
            }
          >
            {t.common.save}
          </button>
          <p className="text-sm text-ink-3">New staff log in with an OTP on their phone number — no password.</p>
        </div>
      ) : null}

      {err ? <p className="text-base font-semibold text-danger">{err}</p> : null}

      <TableWrap>
        <thead>
          <tr>
            <Th>{t.auth.name}</Th>
            <Th>{t.staff.role}</Th>
            <Th>{t.staff.status}</Th>
            <Th align="right">{t.staff.codInHand}</Th>
            <Th>Last login</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const owner = Boolean(Number(s.isGlobalAdmin ?? 0));
            // The owner's row is read-only for everyone, and an admin row is the owner's to touch.
            const actionable = !owner && (s.role !== 'ADMIN' || viewerIsOwner);
            return (
            <tr key={s.id}>
              <Td>
                <span className="font-semibold">{s.name ?? '—'}</span>
                <span className="block text-sm text-ink-3">
                  {s.phone} {s.employeeCode ? `· ${s.employeeCode}` : ''}
                </span>
              </Td>
              <Td>
                {s.role}
                {owner ? (
                  <Badge tone="warn">
                    <Icon name="crown" size={12} className="mr-1 inline" />
                    {t.staff.mainAdmin}
                  </Badge>
                ) : null}
              </Td>
              <Td>
                <Badge tone={s.status === 'ACTIVE' ? 'ok' : 'danger'}>{s.status}</Badge>
              </Td>
              <Td align="right">{s.role === 'DELIVERY_BOY' ? rupees(s.codInHand) : '—'}</Td>
              <Td>{s.lastLoginAt ? formatDate(s.lastLoginAt, lang) : '—'}</Td>
              <Td align="right">
                {!actionable ? (
                  <span className="text-sm text-ink-3">{owner ? t.staff.ownerRowNote : t.staff.ownerOnlyNote}</span>
                ) : (
                <div className="flex flex-wrap justify-end gap-1">
                  <button type="button" onClick={() => setPermFor(permFor?.id === s.id ? null : s)} className={buttonClass('ghost', 'sm')}>
                    {t.staff.permissions}
                  </button>
                  {s.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      disabled={busy === s.id}
                      className={buttonClass('secondary', 'sm')}
                      onClick={() => {
                        const reason = window.prompt(t.staff.disable);
                        if (reason && reason.length >= 3) void run(s.id, async () => call(`/admin/staff/${s.id}/disable`, { method: 'PATCH', body: { reason } }));
                      }}
                    >
                      {t.staff.disable}
                    </button>
                  ) : (
                    <button type="button" disabled={busy === s.id} className={buttonClass('primary', 'sm')} onClick={() => void run(s.id, async () => call(`/admin/staff/${s.id}/enable`, { method: 'PATCH', body: {} }))}>
                      {t.staff.enable}
                    </button>
                  )}
                  <button type="button" disabled={busy === s.id} className={buttonClass('ghost', 'sm')} onClick={() => void run(s.id, async () => call(`/admin/staff/${s.id}/revoke-sessions`, { method: 'POST', body: {} }))}>
                    {t.staff.revokeSessions}
                  </button>
                </div>
                )}
              </Td>
            </tr>
            );
          })}
        </tbody>
      </TableWrap>

      {permFor ? <PermissionEditor lang={lang} staff={permFor} canEdit={permFor.role !== 'ADMIN' || viewerIsOwner} onDone={() => setPermFor(null)} /> : null}
    </div>
  );
}

/**
 * A6 — what this person can reach, ticked one by one.
 *
 * Two things were wrong here before and both could lose the owner's work. It opened with every box
 * empty and then saved a full replacement, so pressing Save without touching anything wiped every
 * grant that person already had. And it refused to open at all for an ADMIN ("already has every
 * permission") — true when ADMIN meant the owner, and exactly the screen the owner now needs to
 * decide what his second admin can do.
 *
 * So it loads the current list first and shows it ticked. What you see is what he has; what you
 * save is what he will have.
 */
function PermissionEditor({ lang, staff, canEdit, onDone }: { lang: Lang; staff: StaffRow; canEdit: boolean; onDone: () => void }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [grants, setGrants] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setGrants(null);
    setErr(null);
    call<{ effective?: string[] }>(`/admin/staff/${staff.id}`)
      .then((d) => {
        if (!live) return;
        const on = new Set(d.effective ?? []);
        setGrants(Object.fromEntries(ALL_PERMISSIONS.map((c) => [c, on.has(c)])));
      })
      .catch((e) => live && setErr(errText(e, lang)));
    return () => {
      live = false;
    };
  }, [staff.id, lang]);

  if (!canEdit) return <p className="text-base text-ink-2">{t.staff.ownerOnlyNote}</p>;
  if (grants === null) return <p className="text-base text-ink-3">{err ?? t.common.loading}</p>;

  // Grouped, because thirty-five monospace codes in one block is a list nobody reads carefully —
  // and this is the screen where reading carefully is the whole job.
  const groups = new Map<string, typeof PERMISSIONS[number][]>();
  for (const p of PERMISSIONS) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);

  return (
    <div className="fb-card space-y-3 p-3">
      <h2 className="text-lg">
        {t.staff.permissions} — {staff.name ?? staff.phone}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...groups.entries()].map(([group, list]) => (
          <div key={group}>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-3">{group}</p>
            <div className="space-y-1">
              {list.map((p) => (
                <label key={p.code} className="flex items-start gap-2 text-base">
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={grants[p.code] ?? false} onChange={(e) => setGrants({ ...grants, [p.code]: e.target.checked })} />
                  <span>
                    <span className="block leading-tight">{lang === 'hi' ? p.labelHi : p.labelEn}</span>
                    <span className="block font-mono text-xs text-ink-3">
                      {p.code}
                      {p.dangerous ? ' ⚠' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-ink-3">{t.staff.grantNote}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          className={buttonClass('primary', 'sm')}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await call(`/admin/staff/${staff.id}/permissions`, { method: 'PUT', body: { grants: ALL_PERMISSIONS.map((code) => ({ code, granted: grants[code] ?? false })) } });
              onDone();
              router.refresh();
            } catch (e) {
              setErr(errText(e, lang));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t.common.save}
        </button>
        <button type="button" onClick={onDone} className={buttonClass('ghost', 'sm')}>
          {t.common.cancel}
        </button>
      </div>
      {err ? <p className="text-base text-danger">{err}</p> : null}
    </div>
  );
}
