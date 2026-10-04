'use client';

import { useState } from 'react';
import type { AddressView, LocationMethod, ServiceabilityResult, VillageOption } from '@fb/shared-types';
import { call, ClientError, errText, getPosition, type GeoFix } from '@/lib/client';
import { BRAND } from '@/lib/env';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';
import { MapPicker } from './MapPicker';
import { buttonClass } from './ui';
import { VillagePicker, type PickResult } from './VillagePicker';

/**
 * The rural address form (owner's brief + A8.7). Order on purpose:
 *   1 गाँव (the real service-area gate, a picker — never free text first)
 *   2 घर / मोहल्ला · आने का रास्ता · लैंडमार्क · ज़िला · पिन
 *   3 सामान लेने वाला · पिता/पति/अभिभावक · मोबाइल · दूसरा मोबाइल · डिलीवरी वाले के लिए बात
 *   4 लोकेशन — compulsory, one of: phone GPS (if at the address) · pin on map · written route
 * ⚠️ An out-of-area address is still SAVED (A8.4 §2) — checkout is where it is blocked.
 */
export type { AddressView };

export interface AddressDefaults {
  receiverName?: string;
  phone?: string;
  district: string;
  pincode: string;
  requireLocation: boolean;
}

type Loc = { lat: number; lng: number; accuracyM: number; method: Exclude<LocationMethod, 'DESCRIBED'> } | null;

export function AddressForm({
  lang,
  initial,
  defaults,
  onSaved,
  onCancel,
  onOutOfArea,
}: {
  lang: Lang;
  initial?: Partial<AddressView>;
  defaults: AddressDefaults;
  onSaved: (a: AddressView) => void;
  onCancel?: () => void;
  onOutOfArea?: (r: ServiceabilityResult) => void;
}): React.ReactNode {
  const t = dict(lang);
  const [village, setVillage] = useState<{ id: number | null; name: string; lat?: number | null; lng?: number | null } | null>(
    initial?.villageId ? { id: initial.villageId, name: (lang === 'hi' ? initial.villageNameHi : initial.villageName) ?? initial.villageName ?? '' } : null,
  );
  const [picker, setPicker] = useState(false);
  const [f, setF] = useState({
    line1: initial?.line1 ?? '',
    directions: initial?.directions ?? '',
    landmark: initial?.landmark ?? '',
    district: initial?.district ?? defaults.district,
    pincode: initial?.pincode ?? defaults.pincode,
    receiverName: initial?.receiverName ?? defaults.receiverName ?? '',
    guardianName: initial?.guardianName ?? '',
    phone: initial?.phone ?? defaults.phone ?? '',
    altPhone: initial?.altPhone ?? '',
    deliveryNote: initial?.deliveryNote ?? '',
  });
  const [loc, setLoc] = useState<Loc>(
    initial?.lat !== undefined && initial?.lat !== null && initial?.lng !== undefined && initial?.lng !== null
      ? { lat: initial.lat, lng: initial.lng, accuracyM: 0, method: initial.locationMethod === 'MAP_PIN' ? 'MAP_PIN' : 'GPS' }
      : null,
  );
  const [atHome, setAtHome] = useState<boolean | null>(loc ? true : null);
  // Owner's rule: the phone's own position is always recorded (for the admin and the rider),
  // even when the customer is ordering from somewhere else. It is never used as the drop point then.
  const [origin, setOrigin] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [map, setMap] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f, v: string): void => setF((p) => ({ ...p, [k]: v }));

  function onPicked(r: PickResult): void {
    setPicker(false);
    if (r.village) setVillage({ id: r.village.id, name: (lang === 'hi' ? r.village.nameHi : r.village.name) ?? r.village.name, lat: r.village.lat, lng: r.village.lng });
    if (r.check && !r.check.serviceable) onOutOfArea?.(r.check);
  }

  /**
   * `here` = the customer is standing where the goods should come. Either way we read the phone's
   * position once and keep it as the order's origin; only a good fix from "here" becomes the
   * delivery point (A8 rule 2 — a weak fix is ignored, it never blocks the order).
   */
  async function answerWhere(here: boolean): Promise<void> {
    setAtHome(here);
    setGpsBusy(true);
    setGpsNote(null);
    const fix: GeoFix | null = await getPosition(12000);
    setGpsBusy(false);
    if (!fix) {
      setGpsNote(t.loc.denied);
      return;
    }
    setOrigin({ lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM });
    if (!here) {
      setGpsNote(t.loc.originOnly);
      return;
    }
    if (fix.accuracyM > 500) {
      setGpsNote(t.loc.weak(fix.accuracyM));
      return;
    }
    setLoc({ lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, method: 'GPS' });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!village?.id) e.village = t.area.picker;
    if (f.line1.trim().length < 3) e.line1 = t.addr2.required(t.address.line1);
    if (!f.receiverName.trim()) e.receiverName = t.addr2.required(t.addr2.receiver);
    if (!f.guardianName.trim()) e.guardianName = t.addr2.required(t.addr2.guardian);
    if (!/^[6-9]\d{9}$/.test(f.phone)) e.phone = t.addr2.phoneWrong;
    if (f.altPhone && !/^[6-9]\d{9}$/.test(f.altPhone)) e.altPhone = t.addr2.phoneWrong;
    if (f.pincode && !/^[1-9]\d{5}$/.test(f.pincode)) e.pincode = t.addr2.pinWrong;
    if (atHome === null) e.loc = t.loc.needAnswer;
    else if (defaults.requireLocation && !loc && f.directions.trim().length < 10) e.loc = t.loc.need;
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  async function save(): Promise<void> {
    setErr(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body = {
        receiverName: f.receiverName.trim(),
        phone: f.phone,
        line1: f.line1.trim(),
        landmark: f.landmark.trim() || null,
        villageId: village?.id ?? null,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        accuracyM: loc?.accuracyM ?? null,
        locationMethod: loc ? loc.method : 'DESCRIBED',
        guardianName: f.guardianName.trim(),
        altPhone: f.altPhone || null,
        district: defaults.district,
        originLat: origin?.lat ?? null,
        originLng: origin?.lng ?? null,
        originAccuracyM: origin?.accuracyM ?? null,
        orderedFromHere: atHome,
        pincode: f.pincode || null,
        directions: f.directions.trim() || null,
        deliveryNote: f.deliveryNote.trim() || null,
        isDefault: true,
      };
      const saved = initial?.id
        ? await call<AddressView>(`/users/me/addresses/${initial.id}`, { method: 'PUT', body })
        : await call<AddressView>('/users/me/addresses', { method: 'POST', body });
      onSaved(saved);
    } catch (e) {
      if (e instanceof ClientError && e.field) setErrs((p) => ({ ...p, [e.field === 'directions' ? 'loc' : (e.field as string)]: errText(e, lang) }));
      setErr(errText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  const input = 'h-12 w-full rounded-xl border bg-card px-3.5 text-body text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 focus:border-em-600 focus:shadow-[0_0_0_3px_rgba(28,87,53,0.12)]';
  const cls = (k: string): string => `${input} ${errs[k] ? 'border-danger' : 'border-line-2'}`;
  const Label = ({ id, children, req }: { id: string; children: React.ReactNode; req?: boolean }): React.ReactNode => (
    <label htmlFor={id} className="mb-1.5 block text-base font-semibold text-ink">
      {children} {req ? <span className="text-danger">*</span> : <span className="text-sm font-normal text-ink-3">({t.common.optional})</span>}
    </label>
  );
  const Err = ({ k }: { k: string }): React.ReactNode => (errs[k] ? <p className="mt-1 text-sm font-semibold text-danger">{errs[k]}</p> : null);
  const Step = ({ n, title }: { n: number; title: string }): React.ReactNode => (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-em-700 text-sm font-bold text-au-200">{n}</span>
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  );
  const mapStart = village?.lat && village?.lng ? { lat: Number(village.lat), lng: Number(village.lng) } : { lat: BRAND.lat, lng: BRAND.lng };

  return (
    <div className="space-y-7">
      {/* 1 — village */}
      <section>
        <Step n={1} title={t.addr2.step1} />
        <button type="button" id="fb-village" onClick={() => setPicker(true)} className={`${cls('village')} flex items-center justify-between text-left`}>
          <span className={`flex items-center gap-2 ${village ? 'text-ink' : 'text-ink-3'}`}>
            <Icon name="map-pin" size={18} className="text-au-600" />
            {village?.name ?? t.area.picker}
          </span>
          <Icon name="chevron-down" size={18} className="text-ink-3" />
        </button>
        <p className="mt-1.5 text-sm text-ink-3">{t.addr2.villageHint}</p>
        <Err k="village" />
      </section>

      {/* 2 — house */}
      <section className="space-y-4">
        <Step n={2} title={t.addr2.step2} />
        <div>
          <Label id="fb-line1" req>
            {t.address.line1}
          </Label>
          <input id="fb-line1" value={f.line1} onChange={(e) => set('line1', e.target.value)} placeholder={t.address.line1Hint} className={cls('line1')} autoComplete="address-line1" />
          <Err k="line1" />
        </div>
        <div>
          <Label id="fb-dir">{t.addr2.directions}</Label>
          <textarea id="fb-dir" rows={2} value={f.directions} onChange={(e) => set('directions', e.target.value.slice(0, 500))} placeholder={t.addr2.directionsHint} className={`${cls('loc')} h-auto py-3`} />
        </div>
        <div>
          <Label id="fb-landmark">{t.address.landmark}</Label>
          <input id="fb-landmark" value={f.landmark} onChange={(e) => set('landmark', e.target.value)} placeholder={t.address.landmarkHint} className={cls('landmark')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fb-district" className="mb-1.5 block text-base font-semibold text-ink">
              {t.addr2.district} <span className="text-sm font-normal text-ink-3">({t.addr2.districtFixed})</span>
            </label>
            {/* One district for the whole service area — shown so the customer can see it, never typed. */}
            <p id="fb-district" className={`${input} flex items-center border-line bg-paper-2/60 text-ink-2`}>{defaults.district}</p>
          </div>
          <div>
            <Label id="fb-pin">{t.addr2.pincode}</Label>
            <input id="fb-pin" inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} placeholder="230301" className={cls('pincode')} autoComplete="postal-code" />
            <Err k="pincode" />
          </div>
        </div>
      </section>

      {/* 3 — people */}
      <section className="space-y-4">
        <Step n={3} title={t.addr2.step3} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label id="fb-name" req>
              {t.addr2.receiver}
            </Label>
            <input id="fb-name" value={f.receiverName} onChange={(e) => set('receiverName', e.target.value)} className={cls('receiverName')} autoComplete="name" />
            <Err k="receiverName" />
          </div>
          <div>
            <Label id="fb-guardian" req>
              {t.addr2.guardian}
            </Label>
            <input id="fb-guardian" value={f.guardianName} onChange={(e) => set('guardianName', e.target.value)} placeholder={t.addr2.guardianHint} className={cls('guardianName')} />
            <Err k="guardianName" />
          </div>
          <div>
            <Label id="fb-phone" req>
              {t.address.phone}
            </Label>
            <input id="fb-phone" type="tel" inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, ''))} placeholder="9876543210" className={cls('phone')} autoComplete="tel-national" />
            <Err k="phone" />
          </div>
          <div>
            <Label id="fb-alt">{t.addr2.altPhone}</Label>
            <input id="fb-alt" type="tel" inputMode="numeric" maxLength={10} value={f.altPhone} onChange={(e) => set('altPhone', e.target.value.replace(/\D/g, ''))} placeholder={t.addr2.altPhoneHint} className={cls('altPhone')} />
            <Err k="altPhone" />
          </div>
        </div>
        <div>
          <Label id="fb-note">{t.addr2.note}</Label>
          <input id="fb-note" value={f.deliveryNote} onChange={(e) => set('deliveryNote', e.target.value.slice(0, 300))} placeholder={t.addr2.noteHint} className={cls('deliveryNote')} />
        </div>
      </section>

      {/* 4 — location (compulsory: GPS / pin / written route) */}
      <section>
        <Step n={4} title={t.loc.title} />
        <div className={`rounded-2xl border p-4 ${errs.loc ? 'border-danger bg-[#fdf3f2]' : 'border-au-200 bg-au-50'}`}>
          {loc ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-body font-semibold text-ok">
                <Icon name="circle-check" size={20} /> {loc.method === 'MAP_PIN' ? t.loc.mapChosen : t.loc.taken(loc.accuracyM)}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
                  <Icon name="external-link" size={16} /> {t.loc.openMaps}
                </a>
                <button type="button" onClick={() => setLoc(null)} className={buttonClass('ghost', 'sm')}>
                  {t.loc.change}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-body font-semibold text-ink">{t.loc.q}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={gpsBusy} onClick={() => void answerWhere(true)} className={`h-auto min-h-12 rounded-xl border px-3 py-2 text-base font-semibold leading-snug ${atHome === true ? 'border-em-700 bg-em-700 text-white' : 'border-line-2 bg-card text-ink'}`}>
                  {t.loc.yes}
                </button>
                <button type="button" disabled={gpsBusy} onClick={() => void answerWhere(false)} className={`h-auto min-h-12 rounded-xl border px-3 py-2 text-base font-semibold leading-snug ${atHome === false ? 'border-em-700 bg-em-700 text-white' : 'border-line-2 bg-card text-ink'}`}>
                  {t.loc.no}
                </button>
              </div>
              {gpsBusy ? <p className="text-base text-ink-2">{t.loc.taking}</p> : null}
              {atHome === true && !gpsBusy ? (
                <button type="button" onClick={() => void answerWhere(true)} className={buttonClass('primary', 'md', true)}>
                  <Icon name="current-location" size={18} /> {t.loc.take}
                </button>
              ) : null}
              {origin ? <p className="text-sm text-ink-3">{t.loc.originSaved(origin.accuracyM)}</p> : null}
              {atHome !== null ? (
                <button type="button" onClick={() => setMap(true)} className={buttonClass(atHome ? 'secondary' : 'primary', 'md', true)}>
                  <Icon name="map-2" size={18} /> {t.loc.map}
                </button>
              ) : null}
              {gpsNote ? <p className="text-base text-ink-2">{gpsNote}</p> : null}
              {atHome !== null ? (
                <button type="button" onClick={() => document.getElementById('fb-dir')?.focus()} className="w-full text-center text-base font-semibold text-em-700 underline underline-offset-2">
                  {t.loc.describe}
                </button>
              ) : null}
            </div>
          )}
        </div>
        <Err k="loc" />
      </section>

      {err && !Object.keys(errs).length ? <p className="text-base font-semibold text-danger">{err}</p> : null}
      {Object.keys(errs).length ? <p className="text-base font-semibold text-danger">{Object.values(errs)[0]}</p> : null}

      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className={buttonClass('primary', 'lg', true)}>
          {busy ? t.common.saving : t.addr2.saveAndUse}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={buttonClass('ghost', 'lg')}>
            {t.common.cancel}
          </button>
        ) : null}
      </div>

      <VillagePicker lang={lang} allowNotListed={false} open={picker} onClose={() => setPicker(false)} onPicked={onPicked} remember={false} selectedId={village?.id ?? null} />
      <MapPicker
        lang={lang}
        open={map}
        onClose={() => setMap(false)}
        start={loc ?? mapStart}
        onPick={(p) => {
          setLoc({ lat: p.lat, lng: p.lng, accuracyM: 0, method: 'MAP_PIN' });
          setMap(false);
          setErrs((e) => {
            const { loc: _drop, ...rest } = e;
            void _drop;
            return rest;
          });
        }}
      />
    </div>
  );
}

export type { VillageOption };
