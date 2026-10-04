'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { call } from '@/lib/client';
import { PUBLIC_API_URL } from '@/lib/env';
import { imageUrl } from '@/lib/format';
import { Icon } from '../icons';
import { buttonClass } from '../ui';
import { upload, useAdminAction } from './admin-client';
import { Field, Notice, inputCls } from './form-kit';
import type { ProductImageRow } from './product-form-model';

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Photos: uploaded as-is, the API strips EXIF and makes 200/600/1200w WebP (A27). First photo = card image. */
export function ProductPhotos({ productId, images, defaultAlt }: { productId: number; images: ProductImageRow[]; defaultAlt: string }): ReactNode {
  const a = useAdminAction();
  const [alt, setAlt] = useState(defaultAlt);

  async function onFiles(list: FileList | null): Promise<void> {
    const files = Array.from(list ?? []);
    const bad = files.find((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) return a.setErr(`"${bad.name}" is not a JPG/PNG/WebP under 8 MB.`);
    for (const [i, file] of files.entries()) {
      const fd = new FormData();
      fd.append('file', file);
      if (alt.trim()) fd.append('alt', alt.trim().slice(0, 200));
      const r = await a.run('upload', () => upload(`/admin/products/${productId}/images`, fd), `${i + 1} of ${files.length} photo(s) uploaded.`);
      if (r === null) return;
    }
  }

  async function remove(img: ProductImageRow): Promise<void> {
    if (!window.confirm('Delete this photo? The files are removed from the server.')) return;
    await a.run(`del-${img.id}`, () => call(`/admin/product-images/${img.id}`, { method: 'DELETE' }), 'Photo deleted.');
  }

  return (
    <section className="fb-card space-y-3 p-4">
      <h2 className="text-lg font-semibold text-ink">Photos</h2>
      {images.length ? (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <li key={img.id} className="relative overflow-hidden rounded border border-line bg-paper">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(img.url_sm ?? img.url, PUBLIC_API_URL) ?? ''} alt={img.alt ?? ''} width={200} height={200} loading="lazy" className="aspect-square w-full object-cover" />
              {i === 0 ? <span className="absolute left-1 top-1 rounded-full bg-em-700 px-1.5 text-xs font-semibold text-white">Main</span> : null}
              <button type="button" disabled={a.busy === `del-${img.id}`} onClick={() => void remove(img)} aria-label="Delete photo" className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-card/90 text-danger shadow-1 hover:bg-card">
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded border border-dashed border-line-2 p-3 text-base text-ink-2">
          <Icon name="photo" size={20} className="text-ink-3" /> No photos yet — the site shows a placeholder.
        </p>
      )}
      <Field label="Photo description (alt text)">
        <input maxLength={200} value={alt} onChange={(e) => setAlt(e.target.value)} className={inputCls} />
      </Field>
      <label className={`${buttonClass('secondary', 'sm', true)} cursor-pointer ${a.busy === 'upload' ? 'pointer-events-none opacity-60' : ''}`}>
        <Icon name="photo" size={18} /> {a.busy === 'upload' ? 'Uploading…' : 'Upload photos'}
        <input type="file" accept={TYPES.join(',')} multiple className="sr-only" onChange={(e) => void onFiles(e.target.files).finally(() => (e.target.value = ''))} />
      </label>
      <p className="text-sm text-ink-3">JPG, PNG or WebP, up to 8 MB each. Square photos look best.</p>
      <Notice err={a.err} ok={a.ok} />
    </section>
  );
}

/** Stock correction goes through PATCH /stock so it lands in inventory_logs + audit, not the product form. */
export function ProductStock({ productId, stock, lowAt }: { productId: number; stock: number; lowAt: number }): ReactNode {
  const a = useAdminAction();
  const [qty, setQty] = useState(String(stock));
  const [reason, setReason] = useState<'RESTOCK' | 'MANUAL' | 'CORRECTION'>('RESTOCK');
  const [note, setNote] = useState('');

  async function save(): Promise<void> {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 0) return a.setErr('Stock must be a whole number, 0 or more.');
    await a.run('stock', () => call<{ before: number; after: number }>(`/admin/products/${productId}/stock`, { method: 'PATCH', body: { set: n, reason, note: note.trim() || undefined } }), (r) => `Stock changed from ${r.before} to ${r.after}.`);
  }

  return (
    <section className="fb-card space-y-3 p-4">
      <h2 className="text-lg font-semibold text-ink">Stock</h2>
      <p className="text-base text-ink-2">
        In stock now: <strong className={`tabular-nums ${stock <= lowAt ? 'text-warn' : 'text-ink'}`}>{stock}</strong>
        {stock <= lowAt ? ' · low' : ''}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Set stock to">
          <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </Field>
        <Field label="Reason">
          <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className={inputCls}>
            <option value="RESTOCK">New stock arrived</option>
            <option value="CORRECTION">Count correction</option>
            <option value="MANUAL">Other</option>
          </select>
        </Field>
      </div>
      <Field label="Note (optional)">
        <input maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </Field>
      <button type="button" disabled={a.busy === 'stock'} onClick={() => void save()} className={buttonClass('secondary', 'sm', true)}>
        {a.busy === 'stock' ? 'Saving…' : 'Update stock'}
      </button>
      <Notice err={a.err} ok={a.ok} />
    </section>
  );
}

/** Hard delete. Past orders keep their own snapshot of name/price, so history is safe. */
export function ProductDanger({ productId, name }: { productId: number; name: string }): ReactNode {
  const router = useRouter();
  const a = useAdminAction(false);

  async function remove(): Promise<void> {
    if (!window.confirm(`Delete "${name}" permanently? Photos are deleted too. Past orders are not affected.\n\nTip: to hide it temporarily, untick “Available for sale” instead.`)) return;
    const r = await a.run('delete', () => call<{ ok: true }>(`/admin/products/${productId}`, { method: 'DELETE' }));
    if (r) {
      router.push('/admin/products');
      router.refresh();
    }
  }

  return (
    <section className="space-y-2 rounded border border-[#f3c8c2] bg-card p-4">
      <h2 className="text-lg font-semibold text-danger">Delete product</h2>
      <p className="text-base text-ink-2">Removes it from the shop for good.</p>
      <button type="button" disabled={a.busy === 'delete'} onClick={() => void remove()} className={buttonClass('danger', 'sm')}>
        <Icon name="trash" size={16} /> {a.busy === 'delete' ? 'Deleting…' : 'Delete product'}
      </button>
      <Notice err={a.err} />
    </section>
  );
}
