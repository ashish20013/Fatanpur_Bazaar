'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AddressView, ServiceabilityResult } from '@fb/shared-types';
import { call, getPosition, savePrefs } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { SorryScreen } from '../area';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';
import { Badge, Skeleton } from '../ui';
import { VillageList, type PickResult } from '../VillagePicker';

/**
 * Middle of the header: "30–60 मिनट में डिलीवरी / 📍 <address>".
 *
 * One button, one sheet, one list. It used to be two: this sheet offered a "गाँव चुनें" button
 * that opened a second sheet holding the villages, so answering "where do you live?" cost two taps
 * and two screens, and the option for a village that is not on the list was buried at the bottom
 * of the second one. Now the villages are in this sheet, and "मेरा गाँव इसमें नहीं है" is the last
 * row of the same list — choose it and the request form opens.
 *
 * The green "add a new address" button that used to sit above the village list is gone on the
 * owner's instruction. It was a second way to say the same thing: the list below already ends in
 * "मेरा गाँव इसमें नहीं है", and the full address — house, landmark, phone — is collected at
 * checkout, where it is actually needed. Saved addresses are still managed from Profile → मेरे पते.
 *
 * ⚠️ Browsing is never blocked here (A8.4 §1): only checkout enforces the service area.
 */
export function AddressChip({
  lang,
  deliveryWindow,
  label,
  selectedId,
  isLoggedIn,
  supportPhone,
}: {
  lang: Lang;
  deliveryWindow: string;
  label: string | null;
  selectedId: number | null;
  isLoggedIn: boolean;
  supportPhone: string;
}): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<AddressView[] | null>(null);
  const [sorry, setSorry] = useState<ServiceabilityResult | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    if (!open || !isLoggedIn || list) return;
    call<AddressView[]>('/users/me/addresses')
      .then(setList)
      .catch(() => setList([]));
  }, [open, isLoggedIn, list]);

  function refresh(): void {
    start(() => router.refresh());
  }

  async function pickAddress(a: AddressView): Promise<void> {
    await savePrefs({ addressId: a.id, village: a.villageId ? { id: a.villageId, name: a.villageNameHi ?? a.villageName ?? '' } : undefined });
    setOpen(false);
    refresh();
  }

  async function onPicked(r: PickResult): Promise<void> {
    if (r.notListed) {
      /*
       * "My village isn't in the list."
       *
       * GPS is asked, because a good fix inside the zone means we can serve this person today and
       * should simply let them through. But a refusal or a weak fix must not send them back to the
       * list they already told us does not contain their village — that was a loop with no exit.
       * Anything short of "inside" opens the request form, which is where their phone number
       * becomes the shop's next expansion.
       */
      setOpen(false);
      const fix = await getPosition();
      // No fix (or a weak one) still asks the server, just without coordinates: its answer carries
      // the list of areas we DO serve, which is the useful half of the sorry screen. Inventing that
      // object here would show someone an empty "we deliver to:" list.
      const body = fix && fix.accuracyM <= 500 ? { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM } : {};
      const res = await call<ServiceabilityResult>('/service-area/check', { method: 'POST', body }).catch(() => null);
      if (res?.serviceable) {
        await savePrefs({ addressId: null });
        refresh();
        return;
      }
      if (res) setSorry(res);
      return;
    }
    if (r.check && !r.check.serviceable) setSorry(r.check);
    await savePrefs({ addressId: null });
    setOpen(false);
    refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group flex min-w-0 max-w-full flex-col items-start rounded-lg px-1.5 py-1 text-left hover:bg-em-900/30" aria-haspopup="dialog">
        <span className={`flex items-center gap-1 font-semibold text-au-300 ${lang === 'en' ? 'text-[11px] uppercase tracking-[0.08em]' : 'text-xs'}`}>
          <Icon name="scooter" size={14} /> {t.header.deliveryIn(deliveryWindow)}
        </span>
        <span className="flex min-w-0 max-w-full items-center gap-1 text-[15px] font-semibold leading-tight text-[#fffaf0]">
          <Icon name="map-pin" size={16} className="shrink-0 text-au-300" />
          <span className="truncate">{label ?? t.header.chooseAddress}</span>
          <Icon name="chevron-down" size={16} className="shrink-0 text-au-300 transition-transform duration-150 group-hover:translate-y-0.5" />
        </span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t.header.deliverTo} closeLabel={t.common.close}>
        {/* Only rendered when there is something in it. With the "add an address" button gone, a
            signed-out visitor was getting an empty white band above the village list. */}
        {isLoggedIn && (list === null || list.length > 0) ? (
          <div className="space-y-3 px-4 py-4">
            {list === null ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <ul className="space-y-2">
                {list.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={!a.isServiceable}
                      onClick={() => void pickAddress(a)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-150 ${selectedId === a.id ? 'border-em-600 bg-em-50' : 'border-line hover:border-em-300'} disabled:opacity-60`}
                    >
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${selectedId === a.id ? 'bg-em-700 text-white' : 'bg-au-50 text-em-700 ring-1 ring-au-200'}`}>
                        <Icon name={selectedId === a.id ? 'check' : 'home'} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-semibold text-ink">
                          {a.villageNameHi ?? a.villageName ?? a.areaText ?? ''} · {a.receiverName}
                        </span>
                        <span className="block truncate text-base text-ink-2">{[a.line1, a.landmark].filter(Boolean).join(', ')}</span>
                        {!a.isServiceable ? <Badge tone="danger">{t.checkout.notServiceable}</Badge> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <p className="border-t border-line bg-paper px-4 pb-1 pt-3 text-sm font-semibold uppercase tracking-wide text-ink-3">{t.area.picker}</p>
        <VillageList lang={lang} active={open} onPicked={(r) => void onPicked(r)} />
      </Sheet>
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
