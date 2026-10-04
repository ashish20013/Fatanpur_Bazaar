'use client';

import { useState, type ReactNode } from 'react';
import { call } from '@/lib/client';
import { PUBLIC_API_URL } from '@/lib/env';
import { imageUrl } from '@/lib/format';
import { Icon } from '../icons';
import { Badge, EmptyState, buttonClass } from '../ui';
import { upload, useAdminAction } from './admin-client';
import { Check, Field, Notice, PanelTitle, inputCls } from './form-kit';

type Position = 'HOME_TOP' | 'HOME_MID' | 'CATEGORY';

/** Row exactly as GET /admin/banners returns it. */
export interface BannerRow {
  id: number;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  position: Position;
  sort_order: number;
  is_active: 0 | 1;
}

interface BannerForm {
  title: string;
  subtitle: string;
  linkUrl: string;
  position: Position;
  sortOrder: string;
  isActive: boolean;
  file: File | null;
}

const POSITION_LABEL: Record<Position, string> = { HOME_TOP: 'Home — top slider', HOME_MID: 'Home — middle strip', CATEGORY: 'Category pages' };
const MAX_BYTES = 8 * 1024 * 1024;
const EMPTY: BannerForm = { title: '', subtitle: '', linkUrl: '', position: 'HOME_TOP', sortOrder: '0', isActive: true, file: null };

function fromRow(b: BannerRow): BannerForm {
  return { title: b.title, subtitle: b.subtitle ?? '', linkUrl: b.link_url ?? '', position: b.position, sortOrder: String(b.sort_order), isActive: b.is_active === 1, file: null };
}

/** The API takes multipart (fields + optional `file`); it re-encodes the image server-side (A27). */
function toFormData(f: BannerForm, id: number | null): FormData {
  const fd = new FormData();
  if (id) fd.append('id', String(id));
  fd.append('title', f.title.trim());
  if (f.subtitle.trim()) fd.append('subtitle', f.subtitle.trim());
  if (f.linkUrl.trim()) fd.append('linkUrl', f.linkUrl.trim());
  fd.append('position', f.position);
  fd.append('sortOrder', String(Number(f.sortOrder) || 0));
  fd.append('isActive', f.isActive ? '1' : '0');
  if (f.file) fd.append('file', f.file);
  return fd;
}

function BannerEditor({ initial, busy, onSave, onCancel, isNew }: { initial: BannerForm; busy: boolean; onSave: (f: BannerForm) => void; onCancel: () => void; isNew: boolean }): React.ReactNode {
  const [f, setF] = useState<BannerForm>(initial);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const set = <K extends keyof BannerForm>(k: K, v: BannerForm[K]): void => setF((p) => ({ ...p, [k]: v }));
  const linkBad = f.linkUrl.trim() !== '' && !/^\/\S*$/.test(f.linkUrl.trim());
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!linkBad) onSave(f);
      }}
    >
      <Field label="Title">
        <input required minLength={2} maxLength={160} value={f.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Subtitle">
        <input maxLength={200} value={f.subtitle} onChange={(e) => set('subtitle', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Link (site path)" hint={linkBad ? 'Must be a path on this site, starting with / (e.g. /sabzi)' : 'Optional, e.g. /sabzi or /product/aloo-1-kg'}>
        <input maxLength={255} value={f.linkUrl} onChange={(e) => set('linkUrl', e.target.value)} className={`${inputCls} font-mono ${linkBad ? 'border-danger' : ''}`} placeholder="/sabzi" />
      </Field>
      <Field label="Placement">
        <select value={f.position} onChange={(e) => set('position', e.target.value as Position)} className={inputCls}>
          {(Object.keys(POSITION_LABEL) as Position[]).map((p) => (
            <option key={p} value={p}>
              {POSITION_LABEL[p]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Sort order">
        <input inputMode="numeric" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value.replace(/[^\d-]/g, ''))} className={inputCls} />
      </Field>
      <Field label={isNew ? 'Image (JPG, PNG or WebP, max 8 MB)' : 'Replace image (optional)'} hint={fileErr ?? 'Wide images work best (about 1200 × 400).'}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setFileErr(file && file.size > MAX_BYTES ? 'That file is larger than 8 MB.' : null);
            set('file', file && file.size <= MAX_BYTES ? file : null);
          }}
          className="block w-full text-base file:mr-3 file:h-10 file:rounded file:border file:border-line-2 file:bg-card file:px-3 file:font-semibold file:text-em-800"
        />
      </Field>
      <Check label="Active (shown on the website)" checked={f.isActive} onChange={(v) => set('isActive', v)} />
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className={buttonClass('ghost', 'sm')}>
          Cancel
        </button>
        <button type="submit" disabled={busy || linkBad} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save banner'}
        </button>
      </div>
    </form>
  );
}

function CopyPath({ value }: { value: string }): ReactNode {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="shrink-0 rounded border border-line px-2 py-0.5 text-[12px] font-semibold text-em-700 hover:bg-paper-2"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => { setDone(true); setTimeout(() => setDone(false), 1500); },
          () => undefined,
        );
      }}
    >
      {done ? 'Copied' : 'Copy path'}
    </button>
  );
}

function BannerCard({ b, busy, onEdit, onDelete }: { b: BannerRow; busy: boolean; onEdit: () => void; onDelete: () => void }): ReactNode {
  const img = imageUrl(b.image_url, PUBLIC_API_URL);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="aspect-[3/1] w-full shrink-0 overflow-hidden rounded border border-line bg-paper sm:w-60">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={b.title} width={240} height={80} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-ink-3">
            <Icon name="photo" size={28} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{b.title}</p>
        {b.subtitle ? <p className="text-base text-ink-2">{b.subtitle}</p> : null}
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <Badge tone={b.is_active ? 'ok' : 'muted'}>{b.is_active ? 'On' : 'Off'}</Badge>
          <span>{POSITION_LABEL[b.position]}</span>
          <span>· sort {b.sort_order}</span>
          {b.link_url ? <span className="font-mono">→ {b.link_url}</span> : null}
        </p>
        {/* The strip under the header takes an image PATH in Settings, and this is the only place
            an uploaded image's path is ever visible. Showing it (and letting it be copied) saves
            the shopkeeper from guessing where his upload landed. */}
        {b.image_url ? (
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-3">
            <code className="truncate rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[12px]">{b.image_url}</code>
            <CopyPath value={b.image_url} />
          </p>
        ) : null}
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={onEdit} className={buttonClass('secondary', 'sm')}>
          <Icon name="pencil" size={16} /> Edit
        </button>
        <button type="button" disabled={busy} onClick={onDelete} className={buttonClass('ghost', 'sm')} aria-label={`Delete ${b.title}`}>
          <Icon name="trash" size={16} className="text-danger" />
        </button>
      </div>
    </div>
  );
}

/** Home/category banners. Images are uploaded here and resized to WebP on the server. */
export function BannersAdmin({ rows }: { rows: BannerRow[] }): React.ReactNode {
  const a = useAdminAction();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  async function save(id: number | null, f: BannerForm): Promise<void> {
    const r = await a.run(id ? `save-${id}` : 'create', () => upload<{ id: number }>('/admin/banners', toFormData(f, id)), id ? 'Banner saved.' : 'Banner created.');
    if (r) {
      setAdding(false);
      setEditId(null);
    }
  }

  async function remove(b: BannerRow): Promise<void> {
    if (!window.confirm(`Delete the banner "${b.title}"? Its image is deleted too.`)) return;
    await a.run(`del-${b.id}`, () => call(`/admin/banners/${b.id}`, { method: 'DELETE' }), 'Banner deleted.');
  }

  return (
    <div className="space-y-4">
      <PanelTitle
        action={
          <button type="button" onClick={() => setAdding(!adding)} className={buttonClass(adding ? 'ghost' : 'primary', 'sm')}>
            <Icon name={adding ? 'x' : 'plus'} size={18} /> {adding ? 'Close' : 'New banner'}
          </button>
        }
      >
        {rows.length} banners
      </PanelTitle>
      <Notice err={a.err} ok={a.ok} />
      {adding ? (
        <div className="fb-card p-4">
          <BannerEditor initial={EMPTY} isNew busy={a.busy === 'create'} onSave={(f) => void save(null, f)} onCancel={() => setAdding(false)} />
        </div>
      ) : null}
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((b) => (
            <li key={b.id} className="fb-card p-3">
              <BannerCard b={b} busy={a.busy === `del-${b.id}`} onEdit={() => setEditId(editId === b.id ? null : b.id)} onDelete={() => void remove(b)} />
              {editId === b.id ? (
                <div className="mt-3 border-t border-line pt-3">
                  <BannerEditor initial={fromRow(b)} isNew={false} busy={a.busy === `save-${b.id}`} onSave={(f) => void save(b.id, f)} onCancel={() => setEditId(null)} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="fb-card">
          <EmptyState icon="speakerphone" title="No banners yet" body="Banners appear on the home page. Add one for an offer or a new category." />
        </div>
      )}
    </div>
  );
}
