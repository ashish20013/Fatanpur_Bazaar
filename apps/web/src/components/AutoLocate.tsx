'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ServiceabilityResult, VillageOption } from '@fb/shared-types';
import { call, getPosition, savePrefs } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { buttonClass } from './ui';
import { VillagePicker, type PickResult } from './VillagePicker';

const ASKED = 'fb_autolocate';

/**
 * First visit: find where the customer is, then ask him to confirm it.
 *
 * Choosing a village from a list is the single biggest thing standing between a first-time visitor
 * and a price with a delivery time on it. So the site asks the phone first and does the lookup
 * itself; the customer's only job is to say yes — or "no, somewhere else", because a phone in your
 * pocket knows where YOU are, not where you want the flour delivered. Ordering for parents in the
 * next village is normal here, so the answer is asked for, never assumed.
 *
 * ⚠️ The browser's own permission prompt cannot be skipped by any website — that is the browser's
 * rule, not ours. What we can control is that we ask once, at the moment it makes sense, and never
 * nag: a refusal, a weak fix or no GPS at all leaves browsing completely untouched (A8.3 rule 2),
 * with the header chip still there for anyone who wants to set it by hand.
 */
export function AutoLocate({ lang, hasAddress }: { lang: Lang; hasAddress: boolean }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [found, setFound] = useState<{ village: VillageOption; check: ServiceabilityResult | null } | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hasAddress) return;
    // Once per browser session. Asking again on every page would be the nagging we are avoiding.
    try {
      if (sessionStorage.getItem(ASKED)) return;
      sessionStorage.setItem(ASKED, '1');
    } catch {
      return; // private mode with storage blocked — better to stay quiet than to ask repeatedly
    }
    let alive = true;
    void (async () => {
      const fix = await getPosition();
      // A8.3 rule 2: a weak fix means "we don't know", never "you are outside".
      if (!alive || !fix || fix.accuracyM > 500) return;
      const [list, check] = await Promise.all([
        call<{ villages?: VillageOption[] } | VillageOption[]>(`/service-area/villages?lat=${fix.lat}&lng=${fix.lng}`).catch(() => null),
        call<ServiceabilityResult>('/service-area/check', { method: 'POST', body: { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM } }).catch(() => null),
      ]);
      if (!alive) return;
      const villages = Array.isArray(list) ? list : (list?.villages ?? []);
      const nearest = villages[0];
      if (!nearest) return;
      // Outside the area: don't confirm a village he cannot order to — open the picker instead,
      // so he can choose the address he actually wants delivery at.
      if (check && !check.serviceable) {
        setPicker(true);
        return;
      }
      setFound({ village: nearest, check });
    })();
    return () => {
      alive = false;
    };
  }, [hasAddress]);

  async function accept(): Promise<void> {
    if (!found) return;
    setBusy(true);
    await savePrefs({ village: { id: found.village.id, name: found.village.nameHi ?? found.village.name } });
    setFound(null);
    setBusy(false);
    router.refresh();
  }

  async function onPicked(r: PickResult): Promise<void> {
    setPicker(false);
    if (r.village) {
      await savePrefs({ village: { id: r.village.id, name: r.village.nameHi ?? r.village.name } });
      router.refresh();
    }
  }

  const name = found ? (found.village.nameHi ?? found.village.name) : '';

  return (
    <>
      <Sheet open={Boolean(found)} onClose={() => setFound(null)} title={t.area.autoTitle} closeLabel={t.common.close}>
        <div className="space-y-4 px-5 py-5">
          <p className="flex items-start gap-2 text-body text-ink-2">
            <Icon name="map-pin" size={20} className="mt-0.5 shrink-0 text-au-600" />
            <span>{t.area.autoBody(name)}</span>
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" disabled={busy} onClick={() => void accept()} className={buttonClass('primary', 'lg', true)}>
              {t.area.autoYes}
            </button>
            <button
              type="button"
              onClick={() => {
                setFound(null);
                setPicker(true);
              }}
              className={buttonClass('secondary', 'md', true)}
            >
              {t.area.autoNo}
            </button>
          </div>
        </div>
      </Sheet>
      <VillagePicker lang={lang} open={picker} onClose={() => setPicker(false)} onPicked={(r) => void onPicked(r)} />
    </>
  );
}
