'use client';

import { useEffect, useState } from 'react';
import { useAreaBase } from './area-base';
import { useRouter } from 'next/navigation';
import { call, errText } from '@/lib/client';
import { PUBLIC_API_URL, SOCKET_PATH } from '@/lib/env';
import { minutesAgo, rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Badge, EmptyState, buttonClass } from '../ui';
import { TableWrap, Td, Th } from './table';

export interface BoardData {
  riders: { id: number; name: string | null; phone: string; onDuty: 0 | 1; codInHand: string; deliveries: number; activeJobs: number }[];
  ready: { orderNumber: string; status: string; village: string | null; total: string; placedAt: string; orderType: string }[];
  active: { id: number; status: string; orderNumber: string; orderStatus: string; village: string | null; rider: string | null; lat: string | null; lng: string | null; lastPingAt: string | null; isLive: 0 | 1 }[];
}

/** A18 — assignment MANUAL hai (2 rider pe auto-algorithm waste hai). Ek order pe ek hi active assignment. */
export function DeliveryBoard({ lang, board }: { lang: Lang; board: BoardData }): React.ReactNode {
  const base = useAreaBase();
  const t = dict(lang);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, number>>({});

  // Live monitor: the broadcast model means riders take orders on their own, so the board updates
  // itself as it happens — a new order drops in, a rider claims one, a status moves — without the
  // admin reloading. Socket when it connects, a 20 s poll when it cannot.
  useEffect(() => {
    let stopped = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let socket: { disconnect: () => void } | null = null;
    const refresh = (): void => router.refresh();
    async function connect(): Promise<void> {
      try {
        const { token } = await fetch('/api/socket-token', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((j: { data?: { token: string } }) => j.data ?? { token: '' });
        if (!token || stopped) return startPolling();
        const { io } = await import('socket.io-client');
        if (stopped) return;
        const s = io(PUBLIC_API_URL, { path: SOCKET_PATH, transports: ['websocket', 'polling'], auth: { token }, reconnectionAttempts: 5 });
        socket = s;
        s.on('pool.order.new', refresh);
        s.on('pool.order.gone', refresh);
        s.on('order.status.updated', refresh);
        s.on('delivery.assigned', refresh);
        s.on('connect_error', () => startPolling());
      } catch {
        startPolling();
      }
    }
    function startPolling(): void {
      if (poll || stopped) return;
      poll = setInterval(refresh, 20_000);
    }
    void connect();
    return () => {
      stopped = true;
      if (poll) clearInterval(poll);
      socket?.disconnect();
    };
  }, [router]);

  async function assign(orderNumber: string): Promise<void> {
    const riderId = pick[orderNumber];
    if (!riderId) return;
    setBusy(orderNumber);
    setErr(null);
    try {
      await call(`/admin/orders/${orderNumber}/assign`, { method: 'POST', body: { riderId } });
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(null);
    }
  }

  async function settle(riderId: number, amount: string): Promise<void> {
    const v = window.prompt(t.staff.settleCod, amount);
    if (!v) return;
    setBusy(`cod-${riderId}`);
    try {
      await call('/admin/cod/settle', { method: 'POST', body: { riderId, amount: v } });
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.staff.deliveryBoard}</h1>
      {err ? <p className="text-base text-danger">{err}</p> : null}

      <section>
        <h2 className="mb-1 text-lg">{t.staff.ridersOnDuty}</h2>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t.order.rider}</Th>
              <Th align="center">{t.staff.duty}</Th>
              <Th align="right">Active jobs</Th>
              <Th align="right">{t.staff.codInHand}</Th>
              <Th align="right">Total deliveries</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {board.riders.map((r) => (
              <tr key={r.id}>
                <Td>
                  {r.name ?? '—'}
                  <span className="block text-sm text-ink-3">{r.phone}</span>
                </Td>
                <Td align="center">
                  <Badge tone={r.onDuty ? 'ok' : 'muted'}>{r.onDuty ? t.staff.on : t.staff.off}</Badge>
                </Td>
                <Td align="right">{r.activeJobs}</Td>
                <Td align="right" className={Number(r.codInHand) > 3000 ? 'font-bold text-danger' : ''}>
                  {rupees(r.codInHand)}
                </Td>
                <Td align="right">{r.deliveries}</Td>
                <Td align="right">
                  {Number(r.codInHand) > 0 ? (
                    <button type="button" disabled={busy === `cod-${r.id}`} onClick={() => void settle(r.id, r.codInHand)} className={buttonClass('secondary', 'sm')}>
                      {t.staff.settleCod}
                    </button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      <section>
        <h2 className="mb-1 text-lg">Waiting for a rider (auto-sent to the pool)</h2>
        <p className="mb-2 text-sm text-ink-3">Riders get these automatically and pick them up themselves. Assign one by hand only if nobody takes it.</p>
        {board.ready.length ? (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t.order.number}</Th>
                <Th>{t.staff.status}</Th>
                <Th>{t.address.village}</Th>
                <Th>Waiting</Th>
                <Th align="right">{t.cart.grandTotal}</Th>
                <Th>{t.staff.assign}</Th>
              </tr>
            </thead>
            <tbody>
              {board.ready.map((o) => {
                const wait = minutesAgo(o.placedAt);
                const stuck = wait !== null && wait >= 5;
                return (
                <tr key={o.orderNumber} className={stuck ? 'bg-danger/5' : undefined}>
                  <Td>
                    <a href={`${base}/orders/${o.orderNumber}`} className="font-semibold">
                      {o.orderNumber}
                    </a>
                  </Td>
                  <Td>{o.status}</Td>
                  <Td>{o.village ?? '—'}</Td>
                  <Td>{wait !== null ? <Badge tone={stuck ? 'danger' : 'muted'}>{wait}m</Badge> : '—'}</Td>
                  <Td align="right">{rupees(o.total)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={t.staff.assign}
                        className="h-10 rounded border border-line px-2 text-base"
                        value={pick[o.orderNumber] ?? ''}
                        onChange={(e) => setPick({ ...pick, [o.orderNumber]: Number(e.target.value) })}
                      >
                        <option value="">—</option>
                        {board.riders.filter((r) => r.onDuty).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name ?? r.phone}
                          </option>
                        ))}
                      </select>
                      <button type="button" disabled={busy === o.orderNumber || !pick[o.orderNumber]} onClick={() => void assign(o.orderNumber)} className={buttonClass('primary', 'sm')}>
                        {t.staff.assign}
                      </button>
                    </div>
                  </Td>
                </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState icon="circle-check" title={t.staff.noRows} />
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg">On the way</h2>
        {board.active.length ? (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t.order.number}</Th>
                <Th>{t.order.rider}</Th>
                <Th>{t.staff.status}</Th>
                <Th>{t.order.live}</Th>
              </tr>
            </thead>
            <tbody>
              {board.active.map((a) => {
                const mins = minutesAgo(a.lastPingAt);
                // ⚠️ 90 s se purani location kabhi "live" nahi (A19)
                const stale = mins === null || mins >= 2;
                return (
                  <tr key={a.id}>
                    <Td>
                      <a href={`${base}/orders/${a.orderNumber}`} className="font-semibold">
                        {a.orderNumber}
                      </a>
                      <span className="block text-sm text-ink-3">{a.village ?? ''}</span>
                    </Td>
                    <Td>{a.rider ?? '—'}</Td>
                    <Td>{a.orderStatus}</Td>
                    <Td>
                      {stale ? <Badge tone="muted">{mins !== null ? t.order.stale(mins) : '—'}</Badge> : <Badge tone="ok">● {t.order.live}</Badge>}
                      {a.lat && a.lng ? (
                        <a className="ml-2 text-sm text-g-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`} target="_blank" rel="noopener noreferrer">
                          {t.staff.navigate}
                        </a>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState icon="scooter" title={t.staff.noRows} />
        )}
      </section>
    </div>
  );
}
