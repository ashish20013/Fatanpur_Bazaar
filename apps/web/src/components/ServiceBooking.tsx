'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { call, errText } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';
import { buttonClass, Skeleton } from './ui';

interface Slot {
  start: string;
  end: string;
  capacity: number;
  available: boolean;
}

/** Pick a day (today + 6) and a free slot → straight to checkout for this one service. */
export function ServiceBooking({ lang, slug }: { lang: Lang; slug: string }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const days = useMemo(() => {
    const out: { iso: string; label: string; sub: string }[] = [];
    const fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
    const dd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 86400_000);
      out.push({ iso: dd.format(d), label: i === 0 ? (lang === 'hi' ? 'आज' : 'Today') : i === 1 ? (lang === 'hi' ? 'कल' : 'Tomorrow') : fmt.format(d), sub: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) });
    }
    return out;
  }, [lang]);
  const [day, setDay] = useState(days[0]?.iso ?? '');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSlots(null);
    setPick(null);
    call<Slot[]>(`/catalog/services/${slug}/slots?date=${day}`)
      .then(setSlots)
      .catch((e) => {
        setSlots([]);
        setErr(errText(e, lang));
      });
  }, [day, slug, lang]);

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-card p-4">
      <p className="flex items-center gap-2 text-body font-semibold">
        <Icon name="calendar" size={18} className="text-au-600" /> {t.service.bookNow}
      </p>
      <div className="fb-scroll-x -mx-1 flex gap-2 px-1">
        {days.map((d) => (
          <button key={d.iso} type="button" onClick={() => setDay(d.iso)} className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border text-sm ${day === d.iso ? 'border-em-700 bg-em-700 text-white' : 'border-line-2 bg-card text-ink-2'}`}>
            <span className="font-semibold">{d.label}</span>
            <span className="text-xs opacity-80">{d.sub}</span>
          </button>
        ))}
      </div>
      {slots === null ? (
        <Skeleton className="h-24 w-full" />
      ) : slots.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots.map((s) => (
            <button key={s.start} type="button" disabled={!s.available} onClick={() => setPick(s.start)} className={`h-12 rounded-xl border text-base tabular-nums ${pick === s.start ? 'border-em-700 bg-em-50 font-semibold text-em-800 ring-1 ring-em-700' : 'border-line-2'} disabled:cursor-not-allowed disabled:opacity-40`}>
              {s.start} – {s.end}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-base text-ink-3">{err ?? (lang === 'hi' ? 'इस दिन कोई समय खाली नहीं — दूसरा दिन चुनें' : 'No free slot this day — pick another day')}</p>
      )}
      <button type="button" disabled={!pick} onClick={() => pick && router.push(`/checkout?service=${slug}&date=${day}&slot=${pick}`)} className={buttonClass('primary', 'lg', true)}>
        {t.buy.book} <Icon name="arrow-right" size={18} />
      </button>
    </div>
  );
}
