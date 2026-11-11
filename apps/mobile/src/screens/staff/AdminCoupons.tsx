import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Card, Check, Empty, Pill, Row } from '../../components/admin/AdminKit';

/**
 * ⚠️ GET /admin/coupons returns the coupons table rows as they are — snake_case, money as
 * strings, flags as 0/1. This screen read camelCase names and so showed "₹undefined" on every
 * line. The column names below are the table's, deliberately.
 */
export interface CouponRow {
  id: number;
  code: string;
  title: string | null;
  description: string | null;
  discount_type: 'FLAT' | 'PERCENT';
  discount_value: string;
  max_discount: string | null;
  min_order_value: string;
  usage_limit: number | null;
  used_count: number;
  per_user_limit: number;
  first_order_only: 0 | 1;
  applies_to: 'ALL' | 'PRODUCT' | 'SERVICE';
  starts_at: string;
  expires_at: string;
  is_active: 0 | 1;
}

/** The shop runs on IST, in the app and in the database alike (+05:30). */
const IST_OFFSET_MIN = 330;
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The server's coupon dates are `YYYY-MM-DD HH:MM:SS`, NOT ISO — `dt` in coupons.controller.ts
 * is a plain regex. Sending `.toISOString()` back was refused on `startsAt` with
 * VALIDATION_FAILED, so a coupon could not be switched at all.
 *
 * The row arrives as an ISO instant (JSON has no date type), and the server reads the string as
 * IST wall-clock, so the instant is shifted into IST before it is formatted — otherwise a coupon
 * created at 1 a.m. would walk back a day on every save.
 */
function sqlDateTime(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(raw)) return raw;
  const d = new Date(new Date(raw).getTime() + IST_OFFSET_MIN * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const day = (s: string | null): string => (s ? new Date(s.includes('T') ? s : s.replace(' ', 'T')).toLocaleDateString('en-IN') : '—');

/**
 * Coupons — A13's rules, read here and switched on or off.
 *
 * ⚠️ PUT /admin/coupons/:id validates a WHOLE coupon (CouponSchema: code, discountType,
 * discountValue, startsAt and expiresAt are all required). Sending `{ isActive }` on its own was
 * a 422 every time, so the switch did nothing. The whole coupon goes back with the one field
 * changed — which is also what the website's form does.
 *
 * Creating and editing a coupon stays on the website: the form has a dozen interacting rules
 * (percentage caps, per-customer limits, date windows) that belong on a screen with room.
 */
export default function AdminCouponsScreen(): React.JSX.Element {
  const [rows, setRows] = useState<CouponRow[] | null>(null);
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try {
      setRows(await api.get<CouponRow[]>('/admin/coupons'));
    } catch (e) {
      setErr(errText(e, true));
    }
  }, [setErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const setActive = (c: CouponRow, next: boolean): void => {
    const body = {
      code: c.code,
      title: c.title ?? undefined,
      description: c.description ?? undefined,
      discountType: c.discount_type,
      discountValue: c.discount_value,
      maxDiscount: c.max_discount,
      minOrderValue: c.min_order_value,
      usageLimit: c.usage_limit,
      perUserLimit: c.per_user_limit,
      firstOrderOnly: c.first_order_only === 1,
      appliesTo: c.applies_to,
      startsAt: sqlDateTime(c.starts_at),
      expiresAt: sqlDateTime(c.expires_at),
      isActive: next,
    };
    void run(String(c.id), () => api.put(`/admin/coupons/${c.id}`, body), next ? 'Coupon on' : 'Coupon off', () => void load());
  };

  return (
    <AdminScreen title="Coupons" err={err} ok={ok} loading={rows === null}>
      {rows && rows.length === 0 ? <Empty text="No coupons yet." /> : null}
      {rows?.map((c) => (
        <Card key={c.id}>
          <Row label="Code" value={c.code} strong />
          {c.title ? <Row label="Title" value={c.title} /> : null}
          <Row
            label="Discount"
            value={c.discount_type === 'FLAT' ? `₹${c.discount_value}` : `${c.discount_value}%${c.max_discount ? ` (max ₹${c.max_discount})` : ''}`}
            strong
          />
          <Row label="Min order" value={`₹${c.min_order_value}`} />
          <Row label="Used" value={`${c.used_count}${c.usage_limit ? ` / ${c.usage_limit}` : ''}`} />
          <Row label="Per customer" value={c.per_user_limit} />
          <Row label="Applies to" value={c.applies_to} />
          {c.first_order_only === 1 ? <Row label="Limit" value={<Pill text="First order only" tone="warn" />} /> : null}
          <Row label="Runs" value={`${day(c.starts_at)} → ${day(c.expires_at)}`} />
          <Check label="Active" checked={c.is_active === 1} disabled={busy === String(c.id)} onChange={(n) => setActive(c, n)} />
        </Card>
      ))}
    </AdminScreen>
  );
}
