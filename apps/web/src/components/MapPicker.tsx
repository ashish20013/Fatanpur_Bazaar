'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';
import { Sheet } from './Sheet';

/**
 * "Pin on the map" for customers who are NOT at the delivery address right now.
 * A deliberately tiny slippy map (OpenStreetMap tiles, no library, ~0 KB extra JS): the pin stays
 * in the centre, the customer drags the map under it — the easiest gesture on a phone.
 * Tiles © OpenStreetMap contributors (attribution shown, as the tile policy requires).
 */
const TILE = 256;
const MIN_Z = 11;
const MAX_Z = 19;

function project(lat: number, lng: number, z: number): { x: number; y: number } {
  const w = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * w, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * w };
}
function unproject(x: number, y: number, z: number): { lat: number; lng: number } {
  const w = TILE * 2 ** z;
  const lng = (x / w) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / w;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng };
}

export function MapPicker({
  lang,
  open,
  onClose,
  onPick,
  start,
}: {
  lang: Lang;
  open: boolean;
  onClose: () => void;
  onPick: (p: { lat: number; lng: number }) => void;
  start: { lat: number; lng: number };
}): React.ReactNode {
  const t = dict(lang);
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(16);
  const [c, setC] = useState(() => project(start.lat, start.lng, 16));
  const [size, setSize] = useState({ w: 360, h: 360 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setZ(16);
    setC(project(start.lat, start.lng, 16));
  }, [open, start.lat, start.lng]);

  useEffect(() => {
    if (!open || !box.current) return;
    const el = box.current;
    const measure = (): void => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const zoom = useCallback(
    (dz: number): void => {
      const nz = Math.max(MIN_Z, Math.min(MAX_Z, z + dz));
      if (nz === z) return;
      const f = 2 ** (nz - z);
      setC((p) => ({ x: p.x * f, y: p.y * f }));
      setZ(nz);
    },
    [z],
  );

  const x0 = c.x - size.w / 2;
  const y0 = c.y - size.h / 2;
  const tiles: { key: string; src: string; left: number; top: number }[] = [];
  const n = 2 ** z;
  for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + size.w) / TILE); tx++) {
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + size.h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      tiles.push({ key: `${z}/${tx}/${ty}`, src: `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`, left: tx * TILE - x0, top: ty * TILE - y0 });
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.loc.map}
      closeLabel={t.common.close}
      wide
      footer={
        <button
          type="button"
          onClick={() => {
            const p = unproject(c.x, c.y, z);
            onPick({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 });
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded bg-em-700 text-body font-semibold text-white"
        >
          <Icon name="check" size={18} /> {t.loc.mapDone}
        </button>
      }
    >
      <p className="px-5 pt-3 text-base text-ink-2">{t.loc.mapHint}</p>
      <div className="p-3">
        <div
          ref={box}
          className="relative h-[52dvh] min-h-[280px] touch-none select-none overflow-hidden rounded-xl bg-[#e8e4da] ring-1 ring-line"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setC({ x: d.cx - (e.clientX - d.x), y: d.cy - (e.clientY - d.y) });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => zoom(e.deltaY < 0 ? 1 : -1)}
        >
          {tiles.map((tl) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={tl.key} src={tl.src} alt="" width={TILE} height={TILE} draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: tl.left, top: tl.top, width: TILE, height: TILE }} />
          ))}
          {/* the pin: its tip marks the centre */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-danger drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)]">
            <svg width="40" height="48" viewBox="0 0 40 48" aria-hidden="true">
              <path d="M20 47C20 47 36 29.5 36 18A16 16 0 1 0 4 18c0 11.5 16 29 16 29Z" fill="#b3261e" stroke="#fff" strokeWidth="2.5" />
              <circle cx="20" cy="18" r="6" fill="#fff" />
            </svg>
          </div>
          <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg bg-card shadow-2 ring-1 ring-line">
            <button type="button" onClick={() => zoom(1)} aria-label={t.loc.zoomIn} className="grid h-11 w-11 place-items-center border-b border-line text-ink">
              <Icon name="plus" size={20} />
            </button>
            <button type="button" onClick={() => zoom(-1)} aria-label={t.loc.zoomOut} className="grid h-11 w-11 place-items-center text-ink">
              <Icon name="minus" size={20} />
            </button>
          </div>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="absolute bottom-1 right-1 rounded bg-white/85 px-1.5 text-[10px] text-ink-2 no-underline">
            {t.loc.attribution}
          </a>
        </div>
      </div>
    </Sheet>
  );
}
