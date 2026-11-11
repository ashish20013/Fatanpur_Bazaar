import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';
import { font, space, type as t } from '../../theme/tokens';
import { Text } from 'react-native';

/** Mirrors apps/web/src/components/admin/PaymentsAdmin.tsx (GET /admin/payments/pending). */
interface PayRow {
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
interface PendingPayments {
  awaiting: PayRow[];
  stuck: PayRow[];
  refunds: PayRow[];
}

/**
 * Payments & finance — A17's daily page. Three queues: UPI claims waiting to be checked,
 * payments stuck on an order that already moved, and refunds the shop still owes.
 *
 * ⚠️ Verifying a payment is ADMIN-only on the server (`payments.verify`): the money lands in
 * the owner's own HDFC account, so whoever cannot see that account cannot mark it received.
 * This screen only offers the action; the API is what enforces it.
 */
export default function AdminPaymentsScreen(): React.JSX.Element {
  const [data, setData] = useState<PendingPayments | null>(null);
  const [reason, setReason] = useState<Record<number, string>>({});
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try {
      setData(await api.get<PendingPayments>('/admin/payments/pending'));
    } catch (e) {
      setErr(errText(e, true));
    }
  }, [setErr]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * ⚠️ Each of these three takes a different body, and two of them were being sent the wrong one:
   *   verify → no body
   *   reject → { reason (3+ chars), action: 'CONVERT_COD' | 'CANCEL' }   ← `action` was missing
   *   refund → { method: 'WALLET' | 'UPI_MANUAL', reference?, amount? }  ← was sent empty
   * So rejecting and refunding both failed validation every time: a customer who had actually
   * sent the money and then cancelled sat in the "refund owed" queue with no way to clear it
   * from the phone.
   */
  const verify = (p: PayRow): void => {
    void run(`verify-${p.id}`, () => api.post(`/payments/${p.id}/verify`), 'Payment verified', () => void load());
  };

  /** A17: a rejected UPI claim either becomes a cash-on-delivery order, or the order is cancelled. */
  const reject = (p: PayRow, action: 'CONVERT_COD' | 'CANCEL'): void => {
    const why = (reason[p.id] ?? '').trim();
    if (why.length < 3) {
      setErr('Write a short reason — the customer and the activity log both see this.');
      return;
    }
    void run(`reject-${p.id}`, () => api.post(`/payments/${p.id}/reject`, { reason: why, action }),
      action === 'CONVERT_COD' ? 'Switched to cash on delivery' : 'Payment rejected and order cancelled',
      () => {
        setReason((s2) => ({ ...s2, [p.id]: '' }));
        void load();
      });
  };

  /**
   * Money back into the customer's wallet — the only refund route that completes on a phone.
   * Handing the cash back over UPI is a bank transfer the owner does himself, and is recorded on
   * the website with its reference number.
   */
  const refund = (p: PayRow): void => {
    void run(`refund-${p.id}`, () => api.post(`/payments/${p.id}/refund`, { method: 'WALLET' }), 'Refunded to the wallet', () => void load());
  };

  const section = (title: string, rows: PayRow[], kind: 'awaiting' | 'stuck' | 'refunds'): React.JSX.Element => (
    <View style={{ gap: space[2] }}>
      <Text style={{ fontFamily: font.bodySemi, fontSize: t.base }}>
        {title} ({rows.length})
      </Text>
      {rows.length === 0 ? <Empty text="Nothing here — good." /> : null}
      {rows.map((p) => (
        <Card key={`${kind}-${p.id}`}>
          <Row label="Order" value={p.orderNumber} strong />
          <Row label="Customer" value={p.customer} />
          <Row label="Amount" value={`₹${p.amountFinal ?? p.amount}`} strong />
          <Row label="Method" value={p.method} />
          <Row label="Payment" value={<Pill text={p.status} tone={p.status === 'PAID' ? 'ok' : 'warn'} />} />
          <Row label="Order status" value={p.orderStatus} />
          {p.utr ? <Row label="UTR" value={p.utr} /> : null}
          {p.held ? <Row label="Refundable" value={`₹${p.held}`} strong /> : null}
          {kind === 'awaiting' ? (
            <>
              <Btn label="Mark received" onPress={() => verify(p)} busy={busy === `verify-${p.id}`} icon="circle-check" />
              <Field label="If the money did not arrive" hint="The customer is told this, and it goes into the activity log.">
                <TextField value={reason[p.id] ?? ''} onChangeText={(v) => setReason((s2) => ({ ...s2, [p.id]: v }))} placeholder="e.g. no payment found against this UTR" />
              </Field>
              <Btn label="Switch to cash on delivery" tone="secondary" icon="cash" onPress={() => reject(p, 'CONVERT_COD')} busy={busy === `reject-${p.id}`} />
              <Btn label="Reject and cancel the order" tone="danger" onPress={() => reject(p, 'CANCEL')} busy={busy === `reject-${p.id}`} />
            </>
          ) : null}
          {kind === 'refunds' ? (
            <Btn label="Refund to wallet" onPress={() => refund(p)} busy={busy === `refund-${p.id}`} icon="wallet" />
          ) : null}
        </Card>
      ))}
    </View>
  );

  return (
    <AdminScreen title="Payments & finance" err={err} ok={ok} loading={data === null}>
      {data ? (
        <View style={{ gap: space[5] }}>
          {section('Waiting to be checked', data.awaiting, 'awaiting')}
          {section('Stuck payments', data.stuck, 'stuck')}
          {section('Refunds owed', data.refunds, 'refunds')}
        </View>
      ) : null}
    </AdminScreen>
  );
}
