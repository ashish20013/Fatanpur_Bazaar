'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { call, errText, ClientError } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { Badge, buttonClass } from '../ui';

/**
 * A8.6 — service-area editor.
 * ⚠️ Yahan jaanbujh kar koi map SDK nahi hai: MapLibre + OSM tiles ka matlab hai extra bundle
 * aur har page load pe tiles — jabki asli kaam do tarah se ho jaata hai:
 *   (a) centre + radius (default 6 km) — live preview batata hai kaunse gaon andar/bahar hain
 *   (b) "GeoJSON paste" (documented fallback) — owner geojson.io pe boundary kheenchta hai, yahan paste
 * Baad me MapLibre editor isi component me jod sakte hain; API contract wahi rahega.
 */
export interface ZoneRow {
  id: number;
  name: string;
  mode: 'RADIUS' | 'POLYGON';
  centerLat: string | number | null;
  centerLng: string | number | null;
  radiusKm: string | number | null;
  polygonGeojson?: unknown;
  deliveryFee: string;
  minOrder: string;
  etaMinutes: number;
  priority: number;
  isActive: 0 | 1 | boolean;
}

interface Impact {
  inside: { id: number; name: string; distanceKm: number | null }[];
  goingOut: { id: number; name: string }[];
  customersAffected: number;
}

export function ZoneEditor({ lang, zone }: { lang: Lang; zone: ZoneRow }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [mode, setMode] = useState<'RADIUS' | 'POLYGON'>(zone.mode);
  const [centerLat, setCenterLat] = useState(String(zone.centerLat ?? '25.7420'));
  const [centerLng, setCenterLng] = useState(String(zone.centerLng ?? '81.9540'));
  const [radiusKm, setRadiusKm] = useState(Number(zone.radiusKm ?? 6));
  const [geojson, setGeojson] = useState(zone.polygonGeojson ? JSON.stringify(zone.polygonGeojson) : '');
  const [fee, setFee] = useState(zone.deliveryFee);
  const [minOrder, setMinOrder] = useState(zone.minOrder);
  const [eta, setEta] = useState(zone.etaMinutes);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function body(confirm = false): Record<string, unknown> {
    let polygon: unknown = null;
    if (mode === 'POLYGON' && geojson.trim()) {
      try {
        const parsed = JSON.parse(geojson) as { type?: string; coordinates?: unknown; geometry?: { type: string; coordinates: unknown } };
        // geojson.io ek Feature deta hai — uske andar se geometry nikal lo
        polygon = parsed.type === 'Polygon' ? parsed : parsed.geometry ?? null;
      } catch {
        polygon = null;
      }
    }
    return {
      name: zone.name,
      mode,
      centerLat: Number(centerLat),
      centerLng: Number(centerLng),
      radiusKm: mode === 'RADIUS' ? radiusKm : null,
      polygon,
      deliveryFee: fee,
      minOrder,
      etaMinutes: eta,
      priority: zone.priority,
      ...(confirm ? { confirm: true } : {}),
    };
  }

  async function preview(): Promise<void> {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      setImpact(await call<Impact>(`/admin/service-area/zones/${zone.id}/preview`, { method: 'POST', body: body() }));
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  async function save(confirm = false): Promise<void> {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await call(`/admin/service-area/zones/${zone.id}`, { method: 'PUT', body: body(confirm) });
      setMsg(t.staff.saved);
      router.refresh();
    } catch (e) {
      if (e instanceof ClientError && e.code === 'CONFIRM_REQUIRED') {
        // ⚠️ A8.6(e) — pehle batao kaunse gaon bahar ho rahe hain, tabhi confirm lo
        const data = e.data as { goingOut?: { name: string }[]; customersAffected?: number } | undefined;
        const names = (data?.goingOut ?? []).map((g) => g.name).join(', ');
        const ok = window.confirm(`${t.staff.willDropOut(names)}\n${e.message}\n\n${t.staff.confirmChange}?`);
        if (ok) return void save(true);
        setErr(e.message);
      } else {
        setErr(errText(e, lang));
      }
    } finally {
      setBusy(false);
    }
  }

  const field = 'h-12 w-full rounded border border-line px-3 text-body outline-none focus:border-g-600';

  return (
    <div className="space-y-4">
      <div className="fb-card space-y-3 p-3">
        <div className="flex gap-2">
          {(['RADIUS', 'POLYGON'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={buttonClass(mode === m ? 'primary' : 'secondary', 'sm')}>
              {m === 'RADIUS' ? 'Circle (radius)' : 'Hand-drawn (polygon)'}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-base font-semibold">{t.staff.zoneCenter} — latitude</span>
            <input value={centerLat} onChange={(e) => setCenterLat(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-base font-semibold">{t.staff.zoneCenter} — longitude</span>
            <input value={centerLng} onChange={(e) => setCenterLng(e.target.value)} inputMode="decimal" className={field} />
          </label>
        </div>
        <p className="text-sm text-ink-3">Long-press the shop in Google Maps → copy the coordinates → paste here.</p>

        {mode === 'RADIUS' ? (
          <label className="block">
            <span className="mb-1 block text-base font-semibold">
              {t.staff.zoneRadius}: <span className="tabular-nums">{radiusKm}</span>
            </span>
            <input type="range" min={1} max={15} step={0.5} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="h-12 w-full" />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-base font-semibold">{t.staff.geojsonPaste}</span>
            <textarea value={geojson} onChange={(e) => setGeojson(e.target.value)} rows={5} className="w-full rounded border border-line p-3 font-mono text-sm" placeholder='{"type":"Polygon","coordinates":[[[81.95,25.74], ... ]]}' />
            <span className="mt-1 block text-sm text-ink-3">
              Draw the boundary on geojson.io → copy → paste here. ⚠️ GeoJSON uses [lng, lat], not [lat, lng].
            </span>
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-base font-semibold">{t.staff.fee}</span>
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-base font-semibold">{t.cart.minOrder('')}</span>
            <input value={minOrder} onChange={(e) => setMinOrder(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-base font-semibold">{t.staff.eta}</span>
            <input value={eta} onChange={(e) => setEta(Number(e.target.value) || 0)} inputMode="numeric" className={field} />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void preview()} className={buttonClass('secondary', 'md')}>
            {t.staff.zonePreview}
          </button>
          <button type="button" disabled={busy} onClick={() => void save(false)} className={buttonClass('primary', 'md')}>
            {t.staff.zoneSave}
          </button>
        </div>
        {msg ? <p className="text-base text-ok">{msg}</p> : null}
        {err ? <p className="text-base text-danger">{err}</p> : null}
      </div>

      {impact ? (
        <div className="fb-card space-y-2 p-3">
          <p className="text-body font-semibold">{t.staff.insideVillages(impact.inside.length)}</p>
          <ul className="flex flex-wrap gap-2">
            {impact.inside.map((v) => (
              <li key={v.id}>
                <Badge tone="ok">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-ok align-middle" aria-hidden="true" />{v.name}
                  {v.distanceKm !== null ? ` · ${v.distanceKm.toFixed(1)} km` : ''}
                </Badge>
              </li>
            ))}
          </ul>
          {impact.goingOut.length ? (
            <>
              <p className="text-body font-semibold text-danger">{t.staff.willDropOut(impact.goingOut.map((g) => g.name).join(', '))}</p>
              <p className="text-base text-ink-2">{impact.customersAffected} customers will be affected</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
