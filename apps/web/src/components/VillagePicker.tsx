'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ServiceabilityResult, VillageOption } from '@fb/shared-types';
import { call, getPosition, savePrefs } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { Skeleton } from './ui';

/**
 * A8.9 — the village picker (the real service-area gate). Rules:
 *  1. Only active villages (the API sends only those)
 *  2. Order: popular → order_count → distance (keep the API's order)
 *  3. Search: name + Hindi name + aliases, Devanagari ⇄ roman
 *  4. GPS only pins the nearest 3 on top — it NEVER selects by itself
 *  5. Chosen village kept 30 days in a cookie
 *  6. Only one village → no picker, set it directly
 *  7. Phone: bottom sheet, 48px rows, no autofocus on search (keyboard would hide the list)
 *
 * The list lives in `VillageList` on its own so it can sit inside another sheet. The header used to
 * open a sheet whose job was to offer a button that opened this sheet — two taps and two screens to
 * answer one question. Now the header embeds the list directly, and this wrapper is what the
 * address form uses, where a sheet of its own is still the right shape.
 */
export interface PickResult {
  village: VillageOption | null;
  check: ServiceabilityResult | null;
  /** true → "मेरा गाँव इसमें नहीं है" */
  notListed: boolean;
}

interface ListProps {
  lang: Lang;
  /** Don't fetch until the surface holding the list is actually on screen. */
  active: boolean;
  onPicked: (r: PickResult) => void;
  /** Address form: just return the choice, don't overwrite the header's village cookie. */
  remember?: boolean;
  selectedId?: number | null;
  /** The address form only accepts areas the shop serves; the homepage strip still captures leads. */
  allowNotListed?: boolean;
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, '');
}
function matches(v: VillageOption, q: string): boolean {
  if (!q) return true;
  const n = norm(q);
  return [v.name, v.nameHi ?? '', ...(v.aliases ?? [])].some((x) => norm(x).includes(n));
}

let cache: VillageOption[] | null = null;

export function VillageList({ lang, active, onPicked, remember = true, selectedId = null, allowNotListed = true }: ListProps): React.ReactNode {
  const t = dict(lang);
  const [villages, setVillages] = useState<VillageOption[] | null>(cache);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [nearest, setNearest] = useState<number[]>([]);

  useEffect(() => {
    if (!active || villages) return;
    let alive = true;
    // API shape: { villages: [...] } (older builds returned the bare array — accept both).
    call<{ villages?: VillageOption[] } | VillageOption[]>('/service-area/villages')
      .then((r) => {
        const rows = Array.isArray(r) ? r : (r.villages ?? []);
        cache = rows;
        if (alive) setVillages(rows);
      })
      .catch(() => alive && setVillages([]));
    return () => {
      alive = false;
    };
  }, [active, villages]);

  // Rule 6 — a single village: no point making anyone choose.
  useEffect(() => {
    const only = villages?.length === 1 ? villages[0] : undefined;
    if (active && only) void choose(only);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, villages]);

  const list = useMemo(() => {
    if (!villages) return [];
    const filtered = villages.filter((v) => matches(v, q));
    if (!nearest.length) return filtered;
    return [...filtered].sort((a, b) => nearest.indexOf(b.id) - nearest.indexOf(a.id));
  }, [villages, q, nearest]);

  async function findByGps(): Promise<void> {
    setBusy(true);
    setGpsNote(null);
    const fix = await getPosition();
    setBusy(false);
    if (!fix) return setGpsNote(t.area.gpsDenied);
    if (fix.accuracyM > 500) return setGpsNote(t.area.gpsWeak); // rule: bad GPS never blocks
    const near = (villages ?? [])
      .filter((v) => v.lat !== null && v.lng !== null)
      .map((v) => ({ id: v.id, d: Math.hypot((Number(v.lat) - fix.lat) * 111, (Number(v.lng) - fix.lng) * 101) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.id);
    setNearest(near.reverse());
    setGpsNote(t.area.nearest);
  }

  async function choose(v: VillageOption): Promise<void> {
    setBusy(true);
    try {
      const check = await call<ServiceabilityResult>('/service-area/check', { method: 'POST', body: { villageId: v.id } }).catch(() => null);
      if (remember) await savePrefs({ village: { id: v.id, name: v.nameHi ?? v.name } });
      onPicked({ village: v, check, notListed: false });
    } finally {
      setBusy(false);
    }
  }

  const name = (v: VillageOption): string => (lang === 'hi' ? (v.nameHi ?? v.name) : v.name);

  return (
    <>
      <div className="space-y-2 px-4 pb-2 pt-3">
        {(villages?.length ?? 0) >= 8 ? (
          <label className="flex h-12 items-center gap-2 rounded-full border border-line-2 bg-paper px-4 focus-within:border-au-500">
            <Icon name="search" size={18} className="text-ink-3" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.area.searchPlaceholder}
              aria-label={t.area.searchPlaceholder}
              className="h-full min-w-0 flex-1 bg-transparent text-body outline-none"
            />
          </label>
        ) : null}
        <button type="button" onClick={() => void findByGps()} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-em-300 bg-em-50 text-base font-semibold text-em-800">
          <Icon name="current-location" size={18} /> {t.area.useGps}
        </button>
        {gpsNote ? <p className="text-center text-base text-ink-2">{gpsNote}</p> : null}
      </div>

      <ul className="border-t border-line">
        {villages === null ? (
          <li className="space-y-2 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </li>
        ) : (
          list.map((v) => {
            const chosen = selectedId === v.id;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void choose(v)}
                  className={`flex min-h-[56px] w-full items-center gap-3 border-b border-line px-5 text-left transition-colors duration-150 hover:bg-em-50 ${chosen ? 'bg-em-50' : ''}`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${nearest.includes(v.id) || chosen ? 'bg-em-700 text-white' : 'bg-au-50 text-em-700 ring-1 ring-au-200'}`}>
                    <Icon name={chosen ? 'check' : 'map-pin'} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-ink">{name(v)}</span>
                    <span className="block text-sm text-ink-3">{lang === 'hi' ? v.name : (v.nameHi ?? '')}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-3">{v.distanceKm !== null ? t.area.distanceKm(v.distanceKm) : ''}</span>
                </button>
              </li>
            );
          })
        )}
        {allowNotListed ? (
          <li>
            {/* Always last and styled apart, so it reads as "none of the above" rather than as one
                more village. Choosing it leads to the request form — never to a dead end. */}
            <button
              type="button"
              onClick={() => onPicked({ village: null, check: null, notListed: true })}
              className="flex min-h-[56px] w-full items-center gap-3 px-5 text-left text-body text-ink-2 hover:bg-paper-2"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-line-2">
                <Icon name="plus" size={16} />
              </span>
              {t.area.notListed}
            </button>
          </li>
        ) : null}
      </ul>
    </>
  );
}

interface Props extends Omit<ListProps, 'active'> {
  open: boolean;
  onClose: () => void;
  title?: string;
}

/** The standalone sheet — used by the address form, where the list is the whole screen. */
export function VillagePicker({ lang, open, onClose, onPicked, title, remember = true, selectedId = null, allowNotListed = true }: Props): React.ReactNode {
  const t = dict(lang);
  return (
    <Sheet open={open} onClose={onClose} title={title ?? t.area.picker} closeLabel={t.common.close}>
      <VillageList lang={lang} active={open} onPicked={onPicked} remember={remember} selectedId={selectedId} allowNotListed={allowNotListed} />
    </Sheet>
  );
}
