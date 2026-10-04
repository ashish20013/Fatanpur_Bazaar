'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { call, errText } from '@/lib/client';
import { formatDate, rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Badge, buttonClass } from '../ui';
import { TableWrap, Td, Th } from './table';

export interface CouponRow {
  id: number;
  code: string;
  title: string | null;
  discountType: 'FLAT' | 'PERCENT';
  discountValue: string;
  maxDiscount: string | null;
  minOrderValue: string;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  firstOrderOnly: 0 | 1;
  appliesTo: 'ALL' | 'PRODUCT' | 'SERVICE';
  startsAt: string;
  expiresAt: string;
  isActive: 0 | 1;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const plusDays = (n: number): string => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** A13 — coupon ka poora hisaab server pe hota hai; yahan sirf banana/band karna hai. */
export function CouponsAdmin({ lang, rows }: { lang: Lang; rows: CouponRow[] }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ code: '', title: '', discountType: 'FLAT' as 'FLAT' | 'PERCENT', discountValue: '50.00', maxDiscount: '', minOrderValue: '199.00', perUserLimit: 1, firstOrderOnly: true, startsAt: today(), expiresAt: plusDays(90) });
  const field = 'h-12 w-full rounded border border-line px-3 text-body';

  async function create(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      await call('/admin/coupons', {
        method: 'POST',
        body: {
          code: f.code.trim().toUpperCase(),
          title: f.title.trim() || undefined,
          discountType: f.discountType,
          discountValue: f.discountValue,
          maxDiscount: f.discountType === 'PERCENT' && f.maxDiscount ? f.maxDiscount : null,
          minOrderValue: f.minOrderValue,
          perUserLimit: f.perUserLimit,
          firstOrderOnly: f.firstOrderOnly,
          appliesTo: 'ALL',
          startsAt: f.startsAt,
          expiresAt: f.expiresAt,
          isActive: true,
        },
      });
      setAdding(false);
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: CouponRow): Promise<void> {
    setBusy(true);
    try {
      await call(`/admin/coupons/${c.id}`, { method: 'PUT', body: { ...c, isActive: !c.isActive, startsAt: c.startsAt.slice(0, 10), expiresAt: c.expiresAt.slice(0, 10) } });
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setAdding(!adding)} className={buttonClass('secondary', 'sm')}>
        + New coupon
      </button>

      {adding ? (
        <div className="fb-card grid gap-2 p-3 sm:grid-cols-2">
          <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="NAYA50" className={field} />
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="₹50 off on the first order" className={field} />
          <select value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value as 'FLAT' | 'PERCENT' })} aria-label="type" className={field}>
            <option value="FLAT">FLAT (₹)</option>
            <option value="PERCENT">PERCENT (%)</option>
          </select>
          <input value={f.discountValue} onChange={(e) => setF({ ...f, discountValue: e.target.value })} placeholder="50.00" className={field} />
          {f.discountType === 'PERCENT' ? <input value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} placeholder="Max discount ₹40.00" className={field} /> : null}
          <input value={f.minOrderValue} onChange={(e) => setF({ ...f, minOrderValue: e.target.value })} placeholder="Minimum order 199.00" className={field} />
          <input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} className={field} aria-label="starts" />
          <input type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} className={field} aria-label="expires" />
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" className="h-5 w-5" checked={f.firstOrderOnly} onChange={(e) => setF({ ...f, firstOrderOnly: e.target.checked })} />
            First order only
          </label>
          <button type="button" disabled={busy} onClick={() => void create()} className={buttonClass('primary', 'md')}>
            {t.common.save}
          </button>
        </div>
      ) : null}

      {err ? <p className="text-base text-danger">{err}</p> : null}

      <TableWrap>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Discount</Th>
            <Th align="right">Min order</Th>
            <Th align="right">Used</Th>
            <Th>Valid</Th>
            <Th align="center">{t.staff.onOff}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <Td>
                <span className="font-mono font-bold">{c.code}</span>
                <span className="block text-sm text-ink-3">{c.title ?? ''}</span>
              </Td>
              <Td>{c.discountType === 'FLAT' ? rupees(c.discountValue) : `${Number(c.discountValue)}%${c.maxDiscount ? ` (max ${rupees(c.maxDiscount)})` : ''}`}</Td>
              <Td align="right">{rupees(c.minOrderValue)}</Td>
              <Td align="right">
                {c.usedCount}
                {c.usageLimit ? ` / ${c.usageLimit}` : ''}
              </Td>
              <Td>
                {formatDate(c.startsAt, lang).split('·')[0]} → {formatDate(c.expiresAt, lang).split('·')[0]}
              </Td>
              <Td align="center">
                <button type="button" disabled={busy} onClick={() => void toggle(c)} className={buttonClass(c.isActive ? 'secondary' : 'primary', 'sm')}>
                  <Badge tone={c.isActive ? 'ok' : 'muted'}>{c.isActive ? t.staff.on : t.staff.off}</Badge>
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
