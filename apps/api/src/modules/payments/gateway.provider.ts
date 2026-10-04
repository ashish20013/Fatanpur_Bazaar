import { createHmac } from 'node:crypto';
import { safeEqual } from '../../common/utils/hash';

/** IPaymentProvider — gateway code is ready but OFF (settings.gateway_enabled = 0). */
export interface WebhookEvent {
  eventId: string;
  type: 'captured' | 'failed' | 'refunded' | 'other';
  orderNumber: string | null;
  gatewayPaymentId: string | null;
  amountPaise: number | null;
}
export interface IPaymentProvider {
  readonly name: string;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(rawBody: Buffer): WebhookEvent;
  refund(gatewayPaymentId: string, amountPaise: number): Promise<string>;
}

/** Razorpay-style: X-Razorpay-Signature = HMAC-SHA256(rawBody, webhook secret), hex. */
export class RazorpayProvider implements IPaymentProvider {
  readonly name = 'razorpay';
  constructor(private readonly webhookSecret: string | undefined, private readonly keyId?: string, private readonly keySecret?: string) {}

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const sig = headers['x-razorpay-signature'];
    if (!this.webhookSecret || typeof sig !== 'string') return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeEqual(expected, sig); // timing-safe
  }

  parseWebhook(rawBody: Buffer): WebhookEvent {
    const j = JSON.parse(rawBody.toString('utf8')) as { id?: string; event?: string; payload?: { payment?: { entity?: { id?: string; amount?: number; notes?: { order_number?: string } } } } };
    const p = j.payload?.payment?.entity;
    const type = j.event === 'payment.captured' ? 'captured' : j.event === 'payment.failed' ? 'failed' : j.event === 'refund.processed' ? 'refunded' : 'other';
    return { eventId: String(j.id ?? `${j.event}:${p?.id}`), type, orderNumber: p?.notes?.order_number ?? null, gatewayPaymentId: p?.id ?? null, amountPaise: typeof p?.amount === 'number' ? p.amount : null };
  }

  async refund(gatewayPaymentId: string, amountPaise: number): Promise<string> {
    if (!this.keyId || !this.keySecret) throw new Error('gateway keys not configured');
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(gatewayPaymentId)}/refund`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`refund failed ${res.status}`);
    return ((await res.json()) as { id: string }).id;
  }
}

/**
 * Cashfree — the gateway this shop is actually applying for.
 *
 * Every credential comes from the settings table, not from .env, because the owner will be handed
 * them by Cashfree weeks after the site is live and will type them into Admin → Payments from his
 * phone. The two that matter are stored encrypted (common/utils/secretbox) and this class is
 * constructed per request with freshly decrypted values, so switching the gateway on, or pasting a
 * corrected key, takes effect on the next request with no deploy and no restart.
 *
 * ⚠️ Their webhook signature is NOT a plain HMAC of the body.
 *
 * It is Base64(HMAC-SHA256(`${timestamp}.${rawBody}`, secret)), where the timestamp is a separate
 * header, and it must be computed on the RAW bytes — before any JSON parse, because re-serialising
 * changes whitespace and key order and the signature stops matching for reasons nobody can see in
 * a log. Get either detail wrong and one of two things happens: every genuine payment is rejected,
 * or, far worse, verification is skipped and anyone who knows an order number can post "paid" to
 * this endpoint and have goods delivered for free.
 */
export class CashfreeProvider implements IPaymentProvider {
  readonly name = 'cashfree';
  constructor(
    private readonly webhookSecret: string | undefined,
    private readonly appId?: string,
    private readonly secretKey?: string,
    private readonly mode: 'TEST' | 'PROD' = 'TEST',
  ) {}

  private base(): string {
    return this.mode === 'PROD' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const sig = headers['x-webhook-signature'];
    const ts = headers['x-webhook-timestamp'];
    if (!this.webhookSecret || typeof sig !== 'string' || typeof ts !== 'string') return false;
    /*
     * Reject anything older than five minutes. Without it a signature stays valid forever, so a
     * webhook captured once (a proxy log, a misconfigured relay) can be replayed to re-confirm a
     * refunded order. The duplicate-event table stops an exact repeat; this stops a stale one.
     */
    const age = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(age) || age > 300) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(`${ts}.${rawBody.toString('utf8')}`).digest('base64');
    return safeEqual(expected, sig); // timing-safe
  }

  parseWebhook(rawBody: Buffer): WebhookEvent {
    const j = JSON.parse(rawBody.toString('utf8')) as {
      type?: string;
      event_time?: string;
      data?: { order?: { order_id?: string; order_amount?: number }; payment?: { cf_payment_id?: string | number; payment_status?: string; payment_amount?: number } };
    };
    const order = j.data?.order;
    const payment = j.data?.payment;
    const status = String(payment?.payment_status ?? '').toUpperCase();
    const type: WebhookEvent['type'] =
      j.type === 'PAYMENT_SUCCESS_WEBHOOK' || status === 'SUCCESS' ? 'captured' :
      j.type === 'PAYMENT_FAILED_WEBHOOK' || status === 'FAILED' || status === 'USER_DROPPED' ? 'failed' :
      j.type === 'REFUND_STATUS_WEBHOOK' ? 'refunded' : 'other';
    const paymentId = payment?.cf_payment_id === undefined || payment.cf_payment_id === null ? null : String(payment.cf_payment_id);
    // Their events carry no id of their own, so the payment id (or the order, for a drop-off with
    // no payment yet) is what makes a repeat detectable in webhook_events.
    const eventId = `${j.type ?? 'event'}:${paymentId ?? order?.order_id ?? j.event_time ?? ''}`;
    const rupees = payment?.payment_amount ?? order?.order_amount ?? null;
    return {
      eventId,
      type,
      // We send our own order number as their order_id, so it comes straight back.
      orderNumber: order?.order_id ?? null,
      gatewayPaymentId: paymentId,
      // ⚠️ Cashfree talks in rupees (a decimal), not paise. Rounding here rather than trusting a
      // float keeps a ₹245.10 order from ever reading as 24509 paise.
      amountPaise: typeof rupees === 'number' ? Math.round(rupees * 100) : null,
    };
  }

  async refund(gatewayPaymentId: string, amountPaise: number): Promise<string> {
    if (!this.appId || !this.secretKey) throw new Error('gateway keys not configured');
    // Their refund endpoint is keyed by OUR order id, and cf_payment_id identifies which payment
    // inside it — so the caller passes "<orderNumber>:<cfPaymentId>" and we split it here.
    const [orderId, cfPaymentId] = gatewayPaymentId.includes(':') ? gatewayPaymentId.split(':') : [gatewayPaymentId, gatewayPaymentId];
    const refundId = `rf-${cfPaymentId}-${Date.now()}`;
    const res = await fetch(`${this.base()}/orders/${encodeURIComponent(orderId)}/refunds`, {
      method: 'POST',
      headers: { 'x-client-id': this.appId, 'x-client-secret': this.secretKey, 'x-api-version': '2023-08-01', 'content-type': 'application/json' },
      body: JSON.stringify({ refund_amount: Number((amountPaise / 100).toFixed(2)), refund_id: refundId, refund_note: 'Order cancelled' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`cashfree refund failed ${res.status}`);
    const body = (await res.json()) as { refund_id?: string; cf_refund_id?: string | number };
    return String(body.refund_id ?? body.cf_refund_id ?? refundId);
  }

  /** Create a payment session. The customer is sent to Cashfree's checkout with this token. */
  async createOrder(input: { orderNumber: string; amountPaise: number; customerId: string; phone10: string; name: string | null; returnUrl: string | null }): Promise<{ paymentSessionId: string; cfOrderId: string }> {
    if (!this.appId || !this.secretKey) throw new Error('gateway keys not configured');
    const res = await fetch(`${this.base()}/orders`, {
      method: 'POST',
      headers: { 'x-client-id': this.appId, 'x-client-secret': this.secretKey, 'x-api-version': '2023-08-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        order_id: input.orderNumber,
        order_amount: Number((input.amountPaise / 100).toFixed(2)),
        order_currency: 'INR',
        customer_details: {
          customer_id: input.customerId,
          customer_phone: input.phone10,
          customer_name: input.name ?? undefined,
        },
        order_meta: input.returnUrl ? { return_url: input.returnUrl } : undefined,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { payment_session_id?: string; cf_order_id?: string | number; message?: string };
    if (!res.ok || !body.payment_session_id) throw new Error(`cashfree order failed ${res.status}${body.message ? `: ${body.message}` : ''}`);
    return { paymentSessionId: body.payment_session_id, cfOrderId: String(body.cf_order_id ?? input.orderNumber) };
  }
}
