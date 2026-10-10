'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PageMeta } from '@fb/shared-types';
import { call, errText } from '@/lib/client';
import { PUBLIC_API_URL } from '@/lib/env';
import { imageUrl, rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Pagination } from '../list';
import { Icon } from '../icons';
import { Badge, EmptyState, buttonClass } from '../ui';
import { TableWrap, Td, Th } from './table';

export interface AdminProductRow {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
  sku: string | null;
  itemType: 'PRODUCT' | 'SERVICE';
  price: string;
  mrp: string;
  stockQty: number;
  lowStockAt: number;
  isAvailable: 0 | 1;
  isFeatured: 0 | 1;
  category: string | null;
  supplier: string | null;
  image: string | null;
}

/**
 * Rozana ka kaam: daam aur stock badalna — inline, apne endpoints se (audit + inventory_logs ke saath).
 * Poora form, photos aur delete /admin/products/[id] pe hain; naya product /admin/products/new pe.
 */
export function ProductsAdmin({ lang, rows, meta, search }: { lang: Lang; rows: AdminProductRow[]; meta: PageMeta; search: string }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [q, setQ] = useState(search);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function patch(id: number, path: 'price' | 'stock', body: Record<string, unknown>): Promise<void> {
    setBusy(id);
    setErr(null);
    try {
      await call(`/admin/products/${id}/${path}`, { method: 'PATCH', body });
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link href="/admin/products/new" className={buttonClass('primary', 'sm')}>
          <Icon name="plus" size={18} /> New product
        </Link>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/admin/products?search=${encodeURIComponent(q.trim())}`);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.staff.search} aria-label={t.staff.search} className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-body" />
        <button type="submit" className={`shrink-0 ${buttonClass('secondary', 'md')}`}>
          {t.staff.search}
        </button>
      </form>

      {err ? <p className="text-base text-danger">{err}</p> : null}

      {rows.length ? (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>{t.staff.products}</Th>
                <Th align="right">{t.staff.price}</Th>
                <Th align="right">{t.staff.stock}</Th>
                <Th align="center">{t.staff.onOff}</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const img = imageUrl(p.image, PUBLIC_API_URL);
                return (
                  <tr key={p.id}>
                    <Td>
                      <span className="flex items-center gap-2">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt={p.nameHi ?? p.name} width={36} height={36} loading="lazy" className="h-9 w-9 rounded object-cover" />
                        ) : null}
                        <span>
                          <Link href={`/admin/products/${p.id}`} className="block font-semibold text-ink no-underline hover:text-em-700 hover:underline">
                            {p.nameHi ?? p.name}
                          </Link>
                          <span className="block text-sm text-ink-3">
                            {p.category ?? ''} {p.supplier ? `· ${p.supplier}` : ''}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td align="right">
                      <input
                        defaultValue={p.price}
                        inputMode="decimal"
                        aria-label={t.staff.setPrice}
                        disabled={busy === p.id}
                        onBlur={(e) => e.target.value !== p.price && void patch(p.id, 'price', { price: e.target.value })}
                        className="h-10 w-24 rounded border border-line px-2 text-right text-base"
                      />
                      <span className="block text-sm text-ink-3">MRP {rupees(p.mrp)}</span>
                    </Td>
                    <Td align="right">
                      {p.itemType === 'PRODUCT' ? (
                        <input
                          defaultValue={String(p.stockQty)}
                          inputMode="numeric"
                          aria-label={t.staff.setStock}
                          disabled={busy === p.id}
                          onBlur={(e) => Number(e.target.value) !== p.stockQty && void patch(p.id, 'stock', { set: Number(e.target.value), reason: 'MANUAL' })}
                          className={`h-10 w-20 rounded border px-2 text-right text-base ${p.stockQty <= p.lowStockAt ? 'border-a-600' : 'border-line'}`}
                        />
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td align="center">
                      <Badge tone={p.isAvailable ? 'ok' : 'muted'}>{p.isAvailable ? t.staff.on : t.staff.off}</Badge>
                    </Td>
                    <Td align="right">
                      <Link href={`/admin/products/${p.id}`} className={buttonClass('secondary', 'sm')} aria-label={`Edit ${p.name}`}>
                        <Icon name="pencil" size={16} /> Edit
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          <Pagination lang={lang} basePath="/admin/products" meta={meta} query={search ? `search=${encodeURIComponent(search)}` : ''} />
        </>
      ) : (
        <EmptyState
          icon="basket"
          title={t.staff.noRows}
          action={
            <Link href="/admin/products/new" className={buttonClass('primary', 'sm')}>
              <Icon name="plus" size={18} /> New product
            </Link>
          }
        />
      )}
    </div>
  );
}
