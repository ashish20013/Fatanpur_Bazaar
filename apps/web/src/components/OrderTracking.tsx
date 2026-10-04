'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderStatus, TrackingSnapshot } from '@fb/shared-types';
import { call } from '@/lib/client';
import { PUBLIC_API_URL, SOCKET_PATH } from '@/lib/env';
import { minutesAgo } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';
import { Badge } from './ui';

/**
 * A19/A20 — live tracking. Niyam:
 *  • Client kabhi room nahi maangta; server hi join karata hai.
 *  • 90 s se purani location KABHI "live" nahi — marker grey + "आखिरी अपडेट N मिनट पहले".
 *  • Socket na chale (purana Android, kharab network) to 20 s ka polling fallback.
 */
const STALE_MS = 90_000;

interface Live {
  lat: number | null;
  lng: number | null;
  at: string | null;
  status: OrderStatus;
  labelHi: string;
  rider: { name: string | null; phone: string } | null;
  etaMinutes: number | null;
}

export function OrderTracking({ lang, orderNumber, initial }: { lang: Lang; orderNumber: string; initial: TrackingSnapshot | null }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [live, setLive] = useState<Live | null>(
    initial ? { lat: initial.lat, lng: initial.lng, at: initial.lastPingAt, status: initial.status, labelHi: initial.labelHi, rider: initial.rider, etaMinutes: initial.etaMinutes } : null,
  );
  const [now, setNow] = useState(() => Date.now());
  const socketRef = useRef<{ disconnect: () => void } | null>(null);

  // Har 15 s pe sirf "kitna purana" dobara ginte hain (koi network call nahi).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let stopped = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    async function connect(): Promise<void> {
      try {
        const { token } = await (await fetch('/api/socket-token', { credentials: 'same-origin' })).json().then((j: { data?: { token: string } }) => j.data ?? { token: '' });
        if (!token || stopped) return startPolling();
        const { io } = await import('socket.io-client');
        // The page may have been left while the library was loading — the cleanup has already
        // run, so a socket opened now would live on and keep refreshing a page nobody is on.
        if (stopped) return;
        const socket = io(PUBLIC_API_URL, {
          path: SOCKET_PATH,
          transports: ['websocket', 'polling'],
          auth: { token },
          reconnectionAttempts: 5,
        });
        socketRef.current = socket;
        socket.on('tracking.snapshot', (s: TrackingSnapshot) => {
          if (s.orderNumber !== orderNumber) return;
          setLive({ lat: s.lat, lng: s.lng, at: s.lastPingAt, status: s.status, labelHi: s.labelHi, rider: s.rider, etaMinutes: s.etaMinutes });
          setNow(Date.now());
        });
        socket.on('delivery.location.updated', (e: { orderNumber: string; lat: number; lng: number; at: string }) => {
          if (e.orderNumber !== orderNumber) return;
          setLive((p) => (p ? { ...p, lat: e.lat, lng: e.lng, at: e.at } : p));
          setNow(Date.now());
        });
        socket.on('order.status.updated', (e: { orderNumber: string; status: OrderStatus; labelHi: string }) => {
          if (e.orderNumber !== orderNumber) return;
          setLive((p) => (p ? { ...p, status: e.status, labelHi: e.labelHi } : p));
          router.refresh();
        });
        socket.on('connect_error', () => startPolling());
      } catch {
        startPolling();
      }
    }

    function startPolling(): void {
      if (poll || stopped) return;
      poll = setInterval(async () => {
        try {
          const s = await call<TrackingSnapshot>(`/orders/${orderNumber}/track`);
          setLive({ lat: s.lat, lng: s.lng, at: s.lastPingAt, status: s.status, labelHi: s.labelHi, rider: s.rider, etaMinutes: s.etaMinutes });
          setNow(Date.now());
        } catch {
          /* network hiccup — agli baar phir koshish */
        }
      }, 20_000);
    }

    void connect();
    return () => {
      stopped = true;
      if (poll) clearInterval(poll);
      socketRef.current?.disconnect();
    };
  }, [orderNumber, router]);

  if (!live) return null;
  const ageMs = live.at ? now - new Date(live.at).getTime() : Number.POSITIVE_INFINITY;
  const stale = !live.at || ageMs > STALE_MS;
  const mins = minutesAgo(live.at);

  return (
    <section className="fb-card space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="fb-display text-xl">{live.labelHi}</h2>
        {/* ⚠️ Purani location kabhi "live" nahi dikhti */}
        {stale ? <Badge tone="muted">{mins !== null ? t.order.stale(mins) : t.common.loading}</Badge> : <Badge tone="ok">● {t.order.live}</Badge>}
      </div>

      {live.lat !== null && live.lng !== null ? (
        <div className={`rounded border border-line p-3 ${stale ? 'bg-paper-2 text-ink-2' : ''}`}>
          <p className="text-base text-ink-2">
            <Icon name="scooter" size={16} className="mr-1 inline text-em-700" />{live.lat.toFixed(4)}, {live.lng.toFixed(4)}
          </p>
          <a
            className="text-base font-semibold text-em-700 underline"
            href={`https://www.google.com/maps/search/?api=1&query=${live.lat},${live.lng}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.order.track}
          </a>
        </div>
      ) : null}

      {live.rider ? (
        <p className="text-base">
          {t.order.rider}: <span className="font-semibold">{live.rider.name ?? '—'}</span>{' '}
          <a className="font-semibold text-em-700" href={`tel:+91${live.rider.phone}`}>
            <Icon name="phone" size={15} className="inline" /> {t.order.callRider}
          </a>
        </p>
      ) : null}
      {live.etaMinutes !== null ? <p className="text-base text-ink-2">{t.checkout.eta(live.etaMinutes)}</p> : null}
    </section>
  );
}
