'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { call, errText } from '@/lib/client';
import { rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Badge, buttonClass } from '../ui';
import { TableWrap, Td, Th } from './table';

export interface VillageRow {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
  lat: string | number;
  lng: string | number;
  distanceKm: string | number | null;
  deliveryFee: string;
  minOrder: string;
  etaMinutes: number;
  isActive: 0 | 1 | boolean;
  isPopular: 0 | 1 | boolean;
  orderCount30d: number;
  aliases: string[];
}

const on = (v: VillageRow['isActive']): boolean => v === 1 || v === true;

/**
 * A8.10 — sabse zyada istemaal hone wali admin screen.
 * ⚠️ Gaon band karne se pehle warning: pichle 30 din ke order dikhte hain, tab confirm.
 * ⚠️ Zone badalne par is_active apne aap NAHI badalta (A8.6) — wo sirf suggestion deta hai.
 */
export function VillagesAdmin({ lang, rows }: { lang: Lang; rows: VillageRow[] }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [list, setList] = useState(rows);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aliasFor, setAliasFor] = useState<number | null>(null);
  const [alias, setAlias] = useState('');
  const [adding, setAdding] = useState(false);
  const [newV, setNewV] = useState({ name: '', nameHi: '', coords: '' });

  async function patch(v: VillageRow, body: Record<string, unknown>): Promise<void> {
    setBusyId(v.id);
    setErr(null);
    try {
      await call(`/admin/villages/${v.id}`, { method: 'PATCH', body });
      setList(list.map((x) => (x.id === v.id ? { ...x, ...(body as Partial<VillageRow>) } : x)));
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusyId(null);
    }
  }

  function toggle(v: VillageRow): void {
    const turningOff = on(v.isActive);
    if (turningOff && v.orderCount30d > 0) {
      const msg = `${t.staff.ordersIn30Days(v.orderCount30d, v.nameHi ?? v.name)}\n\n${t.common.confirm}?`;
      if (!window.confirm(msg)) return;
    }
    void patch(v, { isActive: !turningOff, confirm: true });
  }

  async function addAlias(v: VillageRow): Promise<void> {
    const a = alias.trim();
    if (a.length < 2) return;
    setBusyId(v.id);
    try {
      await call(`/admin/villages/${v.id}/aliases`, { method: 'POST', body: { alias: a, type: 'SPELLING' } });
      setList(list.map((x) => (x.id === v.id ? { ...x, aliases: [...x.aliases, a] } : x)));
      setAlias('');
      setAliasFor(null);
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusyId(null);
    }
  }

  async function createVillage(): Promise<void> {
    const [latS, lngS] = newV.coords.split(',').map((s) => s.trim());
    const lat = Number(latS);
    const lng = Number(lngS);
    if (!newV.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setErr('Name and Google Maps coordinates (lat, lng) are both required');
      return;
    }
    try {
      await call('/admin/villages', {
        method: 'POST',
        body: { name: newV.name.trim(), nameHi: newV.nameHi.trim() || undefined, lat, lng, isActive: true },
      });
      setAdding(false);
      setNewV({ name: '', nameHi: '', coords: '' });
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    }
  }

  const field = 'h-10 w-24 rounded border border-line px-2 text-base outline-none focus:border-g-600';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAdding(!adding)} className={buttonClass('secondary', 'sm')}>
          {t.staff.addVillage}
        </button>
        <Link href="/admin/area-requests" className={buttonClass('ghost', 'sm')}>
          {t.staff.areaRequests}
        </Link>
      </div>

      {adding ? (
        <div className="fb-card space-y-2 p-3">
          <input
            value={newV.name}
            onChange={(e) => setNewV({ ...newV, name: e.target.value })}
            placeholder="Village name (English)"
            className="h-12 w-full rounded border border-line px-3 text-body"
          />
          <input
            value={newV.nameHi}
            onChange={(e) => setNewV({ ...newV, nameHi: e.target.value })}
            placeholder="Village name (Hindi)"
            className="h-12 w-full rounded border border-line px-3 text-body"
          />
          <input
            value={newV.coords}
            onChange={(e) => setNewV({ ...newV, coords: e.target.value })}
            placeholder="Coordinates from Google Maps: 25.7420, 81.9540"
            className="h-12 w-full rounded border border-line px-3 text-body"
          />
          <button type="button" onClick={() => void createVillage()} className={buttonClass('primary', 'sm')}>
            {t.common.save}
          </button>
        </div>
      ) : null}

      {err ? <p className="text-base text-danger">{err}</p> : null}

      <TableWrap>
        <thead>
          <tr>
            <Th>{t.address.village}</Th>
            <Th align="right">{t.staff.distance}</Th>
            <Th align="right">{t.staff.orders30d}</Th>
            <Th align="right">{t.staff.fee}</Th>
            <Th align="right">{t.staff.eta}</Th>
            <Th>{t.staff.aliases}</Th>
            <Th align="center">{t.staff.onOff}</Th>
          </tr>
        </thead>
        <tbody>
          {/* A switched-off village is greyed by BACKGROUND, not by opacity: fading the whole row
              dropped its text to 3.1:1 against white, below the AA minimum. */}
          {list.map((v) => (
            <tr key={v.id} className={on(v.isActive) ? '' : 'bg-paper-2'}>
              <Td>
                <span className={`font-semibold${on(v.isActive) ? '' : ' text-ink-2'}`}>{v.nameHi ?? v.name}</span>
                <span className="block text-sm text-ink-3">{v.name}</span>
              </Td>
              <Td align="right">{v.distanceKm !== null ? `${Number(v.distanceKm).toFixed(1)} km` : '—'}</Td>
              <Td align="right" className="tabular-nums">
                {v.orderCount30d}
              </Td>
              <Td align="right">
                <input
                  className={field}
                  defaultValue={v.deliveryFee}
                  inputMode="decimal"
                  aria-label={t.staff.fee}
                  onBlur={(e) =>
                    e.target.value !== v.deliveryFee && void patch(v, { deliveryFee: e.target.value })
                  }
                />
                <span className="block text-sm text-ink-3">
                  {Number(v.deliveryFee) === 0 ? 'default' : rupees(v.deliveryFee)}
                </span>
              </Td>
              <Td align="right">
                <input
                  className={field}
                  defaultValue={String(v.etaMinutes)}
                  inputMode="numeric"
                  aria-label={t.staff.eta}
                  onBlur={(e) =>
                    Number(e.target.value) !== v.etaMinutes &&
                    void patch(v, { etaMinutes: Number(e.target.value) })
                  }
                />
              </Td>
              <Td>
                <div className="flex flex-wrap items-center gap-1">
                  {v.aliases.map((a) => (
                    <Badge key={a} tone="muted">
                      {a}
                    </Badge>
                  ))}
                  {aliasFor === v.id ? (
                    <span className="flex items-center gap-1">
                      <input
                        value={alias}
                        onChange={(e) => setAlias(e.target.value)}
                        className="h-9 w-28 rounded border border-line px-2 text-base"
                        aria-label={t.staff.aliases}
                      />
                      <button
                        type="button"
                        disabled={busyId === v.id}
                        onClick={() => void addAlias(v)}
                        className={buttonClass('secondary', 'sm')}
                      >
                        {t.common.save}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAliasFor(v.id)}
                      className="text-sm font-semibold text-g-700"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </Td>
              <Td align="center">
                <button
                  type="button"
                  disabled={busyId === v.id}
                  onClick={() => toggle(v)}
                  className={buttonClass(on(v.isActive) ? 'secondary' : 'primary', 'sm')}
                >
                  {on(v.isActive) ? t.staff.on : t.staff.off}
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
