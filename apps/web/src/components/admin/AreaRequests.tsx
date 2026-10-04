'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { call, errText } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { EmptyState, buttonClass } from '../ui';
import { TableWrap, Td, Th } from './table';

export interface RequestGroup {
  villageGuess: string | null;
  requests: number;
  lastAt: string | null;
  lat: number | string | null;
  lng: number | string | null;
}

/**
 * A8.11 — "3 log Antu se maang rahe hain" → ek click me Antu chalu.
 * Yahi list agli expansion decide karti hai.
 */
export function AreaRequests({ lang, groups }: { lang: Lang; groups: RequestGroup[] }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!groups.length) return <EmptyState icon="map-pin" title={t.staff.noRows} body="No requests from new areas yet." />;

  async function activate(g: RequestGroup): Promise<void> {
    if (!g.villageGuess) return;
    setBusy(g.villageGuess);
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { villageGuess: g.villageGuess };
      if (g.lat !== null && g.lng !== null) {
        body.lat = Number(g.lat);
        body.lng = Number(g.lng);
      }
      const r = await call<{ villageId: number; created: boolean; requestsServed: number }>('/admin/service-area/requests/activate', { method: 'POST', body });
      setMsg(`${g.villageGuess}: ${r.created ? 'village created' : 'village switched on'} · ${r.requestsServed} requests served`);
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {msg ? <p className="text-base text-ok">{msg}</p> : null}
      {err ? <p className="text-base text-danger">{err}</p> : null}
      <TableWrap>
        <thead>
          <tr>
            <Th>{t.address.village}</Th>
            <Th align="right">Requests</Th>
            <Th>Last request</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.villageGuess ?? 'unknown'}>
              <Td>{g.villageGuess ?? '—'}</Td>
              <Td align="right" className="tabular-nums font-semibold">{g.requests}</Td>
              <Td>{g.lastAt ? String(g.lastAt).slice(0, 10) : '—'}</Td>
              <Td align="right">
                <button type="button" disabled={busy === g.villageGuess || !g.villageGuess} onClick={() => void activate(g)} className={buttonClass('primary', 'sm')}>
                  {t.staff.activateVillage}
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <p className="text-base text-ink-2">
        ⚠️ Before switching a village on, check it lies inside your {t.staff.serviceArea} — the distance is computed automatically; widen the {t.staff.serviceArea} if needed.
      </p>
    </div>
  );
}
