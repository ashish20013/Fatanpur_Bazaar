'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ServiceabilityResult } from '@fb/shared-types';
import { call, getPosition } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { buttonClass } from './ui';
import { VillagePicker, type PickResult } from './VillagePicker';
import { Icon } from './icons';

/**
 * A8.4 §1 — homepage/ pehli visit ka SOFT check. ⚠️ Browsing kabhi block nahi hoti:
 * yahan sirf batate hain ki hum aapke area me hain ya nahi. Rok sirf checkout pe (A8.4 §3).
 */
export function AreaStrip({
  lang,
  initialVillage,
  supportPhone,
}: {
  lang: Lang;
  initialVillage: { id: number; name: string } | null;
  supportPhone: string;
}): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [village, setVillage] = useState(initialVillage);
  const [check, setCheck] = useState<ServiceabilityResult | null>(null);
  const [open, setOpen] = useState(false);
  const [sorry, setSorry] = useState<ServiceabilityResult | null>(null);

  async function onPicked(r: PickResult): Promise<void> {
    setOpen(false);
    if (r.notListed) {
      // A8.3 — list me nahi: GPS se validate karo, par kharab GPS pe block mat karo.
      const fix = await getPosition();
      if (!fix || fix.accuracyM > 500) {
        setOpen(true);
        return;
      }
      const res = await call<ServiceabilityResult>('/service-area/check', {
        method: 'POST',
        body: { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM },
      });
      setCheck(res);
      if (!res.serviceable) setSorry(res);
      return;
    }
    if (r.village) {
      setVillage({ id: r.village.id, name: r.village.nameHi ?? r.village.name });
      setCheck(r.check);
      if (r.check && !r.check.serviceable) setSorry(r.check);
      router.refresh();
    }
  }

  const serving = check?.serviceable ?? Boolean(village);
  const eta = check?.etaMinutes ?? 45;

  return (
    <>
      <div className={`w-full ${serving ? 'bg-g-50' : 'bg-a-100'} border-b border-line`}>
        <div className="fb-container flex min-h-9 items-center justify-between gap-2 py-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-base font-semibold text-ink-2"
          >
            <Icon name="map-pin" size={16} className="text-au-600" />
            <span>{village ? t.area.serving(village.name, eta) : t.area.pick}</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm font-semibold text-g-700 underline underline-offset-2"
          >
            {t.area.change}
          </button>
        </div>
      </div>

      <VillagePicker
        lang={lang}
        open={open}
        onClose={() => setOpen(false)}
        onPicked={(r) => void onPicked(r)}
      />
      {sorry ? (
        <SorryScreen
          lang={lang}
          result={sorry}
          supportPhone={supportPhone}
          onClose={() => setSorry(null)}
          onPickAnother={() => {
            setSorry(null);
            setOpen(true);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * A8.5 — "Sorry" dead-end nahi, lead form hai: kaunse area serve karte hain +
 * number chhodne ka option (yahi agli expansion ki list hai).
 */
export function SorryScreen({
  lang,
  result,
  supportPhone,
  onClose,
  onPickAnother,
  source = 'HOMEPAGE',
}: {
  lang: Lang;
  result: ServiceabilityResult | null;
  supportPhone: string;
  onClose: () => void;
  onPickAnother?: () => void;
  source?: 'HOMEPAGE' | 'CHECKOUT' | 'ADDRESS';
}): React.ReactNode {
  const t = dict(lang);
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const served = result?.servedAreas ?? [];

  async function submit(): Promise<void> {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setErr(t.auth.phoneHint);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await call('/service-area/request', {
        method: 'POST',
        body: { phone, areaText: area || undefined, source, distanceKm: result?.distanceKm ?? undefined },
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center fb-backdrop bg-em-950/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t.sorry.title}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto fb-sheet rounded-t-[22px] bg-card shadow-3 sm:rounded-[22px]">
        <div className="space-y-1 px-4 pb-3 pt-5 text-center">
          <span className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full bg-au-50 text-au-700 ring-1 ring-au-200" aria-hidden="true">
            <Icon name="scooter" size={28} />
          </span>
          <h2 className="fb-display text-2xl">{t.sorry.title}</h2>
          <p className="text-base text-ink-2">{t.sorry.body(result?.distanceKm ?? null)}</p>
        </div>

        {served.length ? (
          <div className="border-t border-line px-4 py-3">
            <p className="text-base font-semibold">{t.sorry.weServe}</p>
            <p className="text-base text-ink-2">
              {served.slice(0, 8).join(' · ')}
              {served.length > 8 ? ` ${t.sorry.more(served.length - 8)}` : ''}
            </p>
            {onPickAnother ? (
              <button
                type="button"
                onClick={onPickAnother}
                className={`${buttonClass('secondary', 'sm')} mt-2`}
              >
                {t.sorry.otherAddress}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="border-t border-line px-4 py-3">
          {done ? (
            <p className="text-base font-semibold text-ok">{t.sorry.leadDone}</p>
          ) : (
            <>
              <p className="text-base font-semibold">{t.sorry.leadTitle}</p>
              <p className="mb-2 text-base text-ink-2">{t.sorry.leadBody}</p>
              <div className="flex flex-col gap-2">
                <input
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="9876543210"
                  aria-label={t.address.phone}
                  className="h-12 w-full rounded border border-line px-3 text-body outline-none focus:border-g-600"
                />
                <input
                  value={area}
                  onChange={(e) => setArea(e.target.value.slice(0, 120))}
                  placeholder={t.address.village}
                  aria-label={t.address.village}
                  className="h-12 w-full rounded border border-line px-3 text-body outline-none focus:border-g-600"
                />
                {err ? <p className="text-base text-danger">{err}</p> : null}
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  className={buttonClass('primary', 'md', true)}
                >
                  {t.sorry.leadCta}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <a href={`tel:+91${supportPhone}`} className="text-base font-semibold text-g-700">
            <Icon name="phone" size={16} className="mr-1 inline" /> {t.sorry.orCall(supportPhone)}
          </a>
          <button type="button" onClick={onClose} className="fb-tap px-2 text-base text-ink-2">
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}
