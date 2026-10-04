'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AssignmentView, AvailableOrder } from '@fb/shared-types';
import { call, errText } from '@/lib/client';
import { PUBLIC_API_URL, SOCKET_PATH } from '@/lib/env';
import { rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Badge, EmptyState, buttonClass } from '../ui';
import { Icon } from '../icons';

/**
 * Rider ka poora kaam ek screen me — broadcast model (Option A).
 *
 *  • सबसे ऊपर "उपलब्ध ऑर्डर" (pool): जो भी नया ऑर्डर आता है वो हर on-duty rider को यहाँ दिखता है।
 *    "मैं ले रहा हूँ" दबाने वाला पहला rider उसे ले लेता है — admin के बीच में आए बिना। (API race-safe है:
 *    दो rider एक साथ दबाएँ तो दूसरे को साफ़ 409 मिलता है।)
 *  • नीचे "मेरी डिलीवरी": जो ऑर्डर इस rider ने लिए हैं, उनका status वो खुद बदलता है
 *    (उठाया → रास्ते में → OTP से डिलीवर)।
 *  • Live: socket से नया ऑर्डर आते ही screen अपने आप refresh होती है और एक घंटी बजती है
 *    (फ़ोन के पहले touch के बाद — browser की autoplay नीति)। Socket न चले तो हर 20s पे खुद refresh।
 *  • हर फ़ैसला API पे होता है (A15 GATE-OTP/GATE-PAY-PICKUP) — UI सिर्फ़ button दिखाता है।
 */
const ASSIGNMENT_LABEL: Record<string, string> = { OFFERED: 'New — accept?', ACCEPTED: 'Accepted', PICKED_UP: 'On the way', DELIVERED: 'Delivered', REJECTED: 'Rejected', CANCELLED: 'Cancelled', FAILED: 'Failed' };

export function RiderPanel({ lang, assignments, pool = [], onDuty, showPool = true }: { lang: Lang; assignments: AssignmentView[]; pool?: AvailableOrder[]; onDuty: boolean; showPool?: boolean }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [otp, setOtp] = useState<Record<number, string>>({});
  const [duty, setDuty] = useState(onDuty);
  const audioRef = useRef<AudioContext | null>(null);

  /*
   * The alert ring. A browser will not make a sound until the person has tapped something, so the
   * AudioContext is created (or resumed) on the first action the rider takes — toggling duty or
   * claiming — and only then can a new-order chime play. No audio file: a short two-note beep is
   * synthesised, so it costs nothing to load on a 2 GB phone. Vibration too, where supported.
   */
  const unlockSound = useCallback((): void => {
    try {
      type WithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
      if (!Ctor) return;
      if (!audioRef.current) audioRef.current = new Ctor();
      void audioRef.current.resume();
    } catch {
      /* audio not available — the visual update is enough */
    }
  }, []);

  const ring = useCallback((): void => {
    const ctx = audioRef.current;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* no vibration API */
    }
    if (!ctx || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      for (const [i, freq] of [880, 1320].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = now + i * 0.22;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.22);
      }
    } catch {
      /* best effort */
    }
  }, []);

  // Live pool: refresh on any pool/order event; ring on a NEW pool order. Falls back to 20 s polling.
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
        s.on('pool.order.new', () => {
          ring();
          refresh();
        });
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
  }, [router, ring]);

  async function claim(orderNumber: string): Promise<void> {
    unlockSound();
    setBusy(`claim-${orderNumber}`);
    setErr(null);
    try {
      await call(`/delivery/claim/${orderNumber}`, { method: 'POST' });
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
      router.refresh(); // someone else likely took it — show the fresh pool
    } finally {
      setBusy(null);
    }
  }

  async function act(id: number, path: string, body: Record<string, unknown> = {}): Promise<void> {
    setBusy(`a-${id}`);
    setErr(null);
    try {
      await call(`/delivery/assignments/${id}/${path}`, { method: 'POST', body });
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(null);
    }
  }

  async function toggleDuty(): Promise<void> {
    unlockSound();
    setBusy('duty');
    try {
      await call('/delivery/duty', { method: 'POST', body: { available: !duty } });
      setDuty(!duty);
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="fb-card flex items-center justify-between p-3">
        <span className="flex items-center gap-2 text-body font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${duty ? 'bg-ok' : 'bg-ink-3'}`} />
          {duty ? t.staff.dutyOn : t.staff.dutyOff}
        </span>
        <button type="button" disabled={busy === 'duty'} onClick={() => void toggleDuty()} className={buttonClass(duty ? 'secondary' : 'primary', 'md')}>
          {duty ? t.staff.dutyOff : t.staff.dutyOn}
        </button>
      </div>

      {err ? <p className="text-base font-semibold text-danger">{err}</p> : null}

      {/* ───────── उपलब्ध ऑर्डर (pool) ───────── */}
      {showPool ? (
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {t.staff.pool} {pool.length ? <span className="ml-1 rounded-full bg-em-700 px-2 text-sm font-bold text-white">{pool.length}</span> : null}
          </h2>
        </div>

        {!duty ? (
          <div className="fb-card p-4 text-base text-ink-2">{t.staff.dutyOffPoolHint}</div>
        ) : pool.length === 0 ? (
          <EmptyState icon="scooter" title={t.staff.poolEmpty} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {pool.map((o) => {
              const waitMin = Math.floor(o.waitingSec / 60);
              const urgent = waitMin >= 5;
              return (
                <li key={o.orderNumber} className={`fb-card space-y-2 p-4 ${urgent ? 'ring-2 ring-danger' : 'ring-1 ring-au-500/30'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-bold">{o.orderNumber}</span>
                    <Badge tone={urgent ? 'danger' : 'warn'}>{t.staff.waitMins(waitMin)}</Badge>
                  </div>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-ink-2">
                    {o.village ? <span className="font-semibold text-ink">{o.village}</span> : null}
                    {o.distanceKm !== null ? <span>{t.staff.kmAway(o.distanceKm)}</span> : null}
                    <span>{t.staff.itemsN(o.itemCount)}</span>
                    <span>~{o.etaMinutes}m</span>
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    {Number(o.collectAmount) > 0 ? (
                      <span className="rounded bg-a-100 px-2.5 py-1 text-base font-bold text-a-700">
                        <Icon name="cash-banknote" size={16} className="mr-1 inline" /> {t.staff.collectCash(o.collectAmount)}
                      </span>
                    ) : (
                      <span className="rounded bg-g-100 px-2.5 py-1 text-base text-ok">{t.staff.alreadyPaid}</span>
                    )}
                    <span className="shrink-0 text-sm text-ink-3">{t.staff.earningLabel}: {rupees(o.earning)}</span>
                  </div>
                  <button type="button" disabled={busy === `claim-${o.orderNumber}`} onClick={() => void claim(o.orderNumber)} className={buttonClass('primary', 'md', true)}>
                    {busy === `claim-${o.orderNumber}` ? '…' : t.staff.claim}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      ) : null}

      {/* ───────── मेरी डिलीवरी ───────── */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t.staff.myDeliveries}</h2>
        {assignments.length === 0 ? <EmptyState icon="scooter" title={t.staff.noRows} /> : null}

        {assignments.map((a) => {
          const maps = a.customer.mapsUrl ?? (a.customer.lat && a.customer.lng ? `https://www.google.com/maps/dir/?api=1&destination=${a.customer.lat},${a.customer.lng}` : null);
          const c = a.customer;
          const isDelivery = a.jobType !== 'SERVICE_VISIT';
          return (
            <article key={a.id} data-order={a.orderNumber} className="fb-card space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold">{a.orderNumber}</h3>
                <Badge tone={a.status === 'PICKED_UP' ? 'info' : a.status === 'ACCEPTED' ? 'ok' : 'warn'}>{ASSIGNMENT_LABEL[a.status] ?? a.status}</Badge>
              </div>

              <p className="text-base">
                {a.customer.name} ·{' '}
                <a href={`tel:+91${a.customer.phone}`} className="font-semibold text-em-700">
                  <Icon name="phone" size={16} className="mr-1 inline" /> {a.customer.phone}
                </a>
              </p>
              <p className="text-base text-ink-2">{[c.line1, c.landmark, c.village, c.district, c.pincode].filter(Boolean).join(', ')}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-base">
                {c.guardianName ? (<><dt className="text-ink-3">Father / guardian</dt><dd>{c.guardianName}</dd></>) : null}
                {c.directions ? (<><dt className="text-ink-3">Route</dt><dd>{c.directions}</dd></>) : null}
                {c.deliveryNote ? (<><dt className="text-ink-3">Note</dt><dd className="font-semibold text-au-800">{c.deliveryNote}</dd></>) : null}
                {c.orderedFromHere === false ? (<><dt className="text-ink-3">Ordered from</dt><dd className="font-semibold text-au-800">Elsewhere — go by the address, not the phone pin</dd></>) : null}
                {c.altPhone ? (<><dt className="text-ink-3">Other phone</dt><dd><a href={`tel:+91${c.altPhone}`} className="font-semibold text-em-700">{c.altPhone}</a></dd></>) : null}
              </dl>

              <ul className="text-base text-ink-2">
                {a.items.map((i, idx) => (
                  <li key={`${a.id}-${idx}`}>
                    {i.name} — {i.unit} × {i.quantity}
                  </li>
                ))}
              </ul>

              {Number(a.collectAmount) > 0 ? (
                <p className="rounded bg-a-100 px-3 py-2 text-body font-bold text-a-700"><Icon name="cash-banknote" size={18} className="mr-1 inline" /> {t.staff.collectCash(a.collectAmount)}</p>
              ) : (
                <p className="rounded bg-g-100 px-3 py-2 text-base text-ok">{t.staff.alreadyPaid}</p>
              )}
              <p className="text-sm text-ink-3">{t.staff.earningLabel}: {rupees(a.earning)}</p>

              <div className="flex flex-wrap gap-2">
                {maps ? (
                  <a href={maps} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
                    <Icon name="navigation" size={16} className="mr-1 inline" /> {t.staff.navigate}
                  </a>
                ) : null}

                {a.status === 'OFFERED' ? (
                  <>
                    <button type="button" disabled={busy === `a-${a.id}`} onClick={() => void act(a.id, 'accept')} className={buttonClass('primary', 'sm')}>
                      {t.staff.accept}
                    </button>
                    <button
                      type="button"
                      disabled={busy === `a-${a.id}`}
                      onClick={() => {
                        const reason = window.prompt(t.staff.rejectJob);
                        if (reason) void act(a.id, 'reject', { reason });
                      }}
                      className={buttonClass('secondary', 'sm')}
                    >
                      {t.staff.rejectJob}
                    </button>
                  </>
                ) : null}

                {a.status === 'ACCEPTED' ? (
                  <button type="button" disabled={busy === `a-${a.id}`} onClick={() => void act(a.id, isDelivery ? 'pickup' : 'start')} className={buttonClass('primary', 'sm')}>
                    {isDelivery ? t.staff.pickup : t.staff.startWork}
                  </button>
                ) : null}

                {a.status === 'PICKED_UP' ? (
                  <>
                    {/* "रास्ते में निकला" — optional, customer ko dikhane ke liye; abhi PICKED_UP par hi hota hai */}
                    {isDelivery && a.orderStatus === 'PICKED_UP' ? (
                      <button type="button" disabled={busy === `a-${a.id}`} onClick={() => void act(a.id, 'start')} className={buttonClass('secondary', 'sm')}>
                        <Icon name="scooter" size={16} className="mr-1 inline" /> {t.staff.onTheWay}
                      </button>
                    ) : null}
                    <input
                      inputMode="numeric"
                      maxLength={4}
                      value={otp[a.id] ?? ''}
                      onChange={(e) => setOtp({ ...otp, [a.id]: e.target.value.replace(/\D/g, '') })}
                      placeholder="0000"
                      aria-label={t.staff.askOtp}
                      className="h-12 w-24 rounded border border-line px-3 text-center text-lg tracking-[0.3em]"
                    />
                    <button type="button" disabled={busy === `a-${a.id}` || (otp[a.id] ?? '').length !== 4} onClick={() => void act(a.id, 'complete', { otp: otp[a.id] })} className={buttonClass('primary', 'sm')}>
                      {t.staff.complete}
                    </button>
                    <button
                      type="button"
                      disabled={busy === `a-${a.id}`}
                      onClick={() => {
                        const reason = window.prompt(t.staff.failed);
                        if (reason) void act(a.id, 'fail', { reason });
                      }}
                      className={buttonClass('danger', 'sm')}
                    >
                      {t.staff.failed}
                    </button>
                    <p className="w-full text-sm text-ink-3">{t.staff.askOtp}</p>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
