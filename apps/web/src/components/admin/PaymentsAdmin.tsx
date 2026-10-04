'use client';

import { useState } from 'react';
import { useAreaBase } from './area-base';
import { useRouter } from 'next/navigation';
import { call, errText } from '@/lib/client';
import { formatDate, rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Badge, EmptyState, buttonClass } from '../ui';
import { TableWrap, Td, Th } from './table';

export interface PayRow {
  id: number;
  method: string;
  status: string;
  amount: string;
  amountFinal: string | null;
  utr: string | null;
  claimedAt: string | null;
  orderNumber: string;
  orderStatus: string;
  customer: string;
  placedAt: string;
  /** Refund rows only: the most that may go back (received − already refunded). */
  held?: string;
}

export interface PendingPayments {
  awaiting: PayRow[];
  stuck: PayRow[];
  refunds: PayRow[];
}

export function PaymentsAdmin({ lang, data, canVerify }: { lang: Lang; data: PendingPayments; canVerify: boolean }): React.ReactNode {
  const base = useAreaBase();
  const t = dict(lang);
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(id: number, path: string, body: Record<string, unknown> = {}): Promise<void> {
    setBusy(id);
    setErr(null);
    try {
      await call(`/payments/${id}/${path}`, { method: 'POST', body });
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(null);
    }
  }

  function Section({ title, rows, kind }: { title: string; rows: PayRow[]; kind: 'awaiting' | 'stuck' | 'refunds' }): React.ReactNode {
    if (!rows.length) return <EmptyState icon="circle-check" title={`${title} — ${t.staff.noRows}`} />;
    return (
      <section>
        <h2 className="mb-1 text-lg">{title}</h2>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t.order.number}</Th>
              <Th>{t.auth.name}</Th>
              <Th align="right">{t.cart.grandTotal}</Th>
              <Th>UTR</Th>
              <Th>{t.staff.status}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={`${kind}-${p.id}`}>
                <Td>
                  <a href={`${base}/orders/${p.orderNumber}`} className="font-semibold">
                    {p.orderNumber}
                  </a>
                  <span className="block text-sm text-ink-3">{formatDate(p.claimedAt ?? p.placedAt, lang)}</span>
                </Td>
                <Td>{p.customer}</Td>
                <Td align="right" className="fb-price">{rupees(p.amountFinal ?? p.amount)}</Td>
                <Td className="font-mono text-sm">{p.utr ?? '—'}</Td>
                <Td>
                  <Badge tone={p.status === 'REFUND_PENDING' ? 'danger' : 'warn'}>{p.status}</Badge>
                </Td>
                <Td align="right">
                  <div className="flex flex-wrap justify-end gap-1">
                    {kind === 'awaiting' && canVerify ? (
                      <>
                        <button type="button" disabled={busy === p.id} onClick={() => void act(p.id, 'verify')} className={buttonClass('primary', 'sm')}>
                          {t.staff.verify}
                        </button>
                        <button
                          type="button"
                          disabled={busy === p.id}
                          onClick={() => {
                            const reason = window.prompt(t.staff.reject);
                            if (reason) void act(p.id, 'reject', { reason });
                          }}
                          className={buttonClass('secondary', 'sm')}
                        >
                          {t.staff.reject}
                        </button>
                      </>
                    ) : null}
                    {kind === 'refunds' && canVerify ? <RefundControls row={p} busy={busy === p.id} onRefund={(body) => act(p.id, 'refund', body)} /> : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {!canVerify ? <p className="rounded bg-a-100 px-3 py-2 text-base text-a-700">Only an admin can verify payments.</p> : null}
      {err ? <p className="text-base text-danger">{err}</p> : null}
      <Section title="UTR received — to verify" rows={data.awaiting} kind="awaiting" />
      <Section title="Delivered but payment pending" rows={data.stuck} kind="stuck" />
      <Section title="Refunds pending" rows={data.refunds} kind="refunds" />
    </div>
  );
}

/**
 * One refund row: how much (pre-filled with what the shop holds — a returned order may need less)
 * and where it goes. The server refuses more than it holds, so a typo cannot overpay.
 */
function RefundControls({ row, busy, onRefund }: { row: PayRow; busy: boolean; onRefund: (body: Record<string, unknown>) => Promise<void> }): React.ReactNode {
  const max = row.held ?? row.amountFinal ?? row.amount;
  const [amount, setAmount] = useState(max);
  const valid = /^\d{1,7}(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && Number(amount) <= Number(max);
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <label className="sr-only" htmlFor={`refund-${row.id}`}>Refund amount (max ₹{max})</label>
      <input
        id={`refund-${row.id}`}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.trim())}
        className="h-9 w-24 rounded border border-line px-2 text-right tabular-nums"
        aria-describedby={`refund-max-${row.id}`}
      />
      <span id={`refund-max-${row.id}`} className="text-sm text-ink-3">max ₹{max}</span>
      <button type="button" disabled={busy || !valid} onClick={() => void onRefund({ method: 'WALLET', amount })} className={buttonClass('primary', 'sm')}>
        To wallet
      </button>
      <button
        type="button"
        disabled={busy || !valid}
        onClick={() => {
          const reference = window.prompt('UPI reference / UTR of the money you sent back');
          if (reference && reference.trim()) void onRefund({ method: 'UPI_MANUAL', amount, reference: reference.trim().slice(0, 80) });
        }}
        className={buttonClass('secondary', 'sm')}
      >
        Sent by UPI
      </button>
    </div>
  );
}
