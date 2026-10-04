import { toPaise, type Paise } from '../common/utils/money';

/**
 * How much of a customer's money the shop is holding on one payment — the ONLY number a refund
 * may be worked out from. See migration 017 for why "owed" is the wrong one.
 *
 * Pure and synchronous on purpose: every path that gives money back (a cancellation, an
 * adjustment, the admin refund queue, a gateway refund, a UPI verified after the order shrank)
 * asks this one function, so they cannot drift apart again.
 */
export interface PaymentMoney {
  amount: string;
  amount_received?: string | null;
  refund_amount: string;
}

/** Rupees handed over. Rows paid before the column existed fall back to `amount` — see 017. */
export function receivedPaise(p: PaymentMoney): Paise {
  return p.amount_received !== null && p.amount_received !== undefined ? toPaise(p.amount_received) : toPaise(p.amount);
}

/** What the shop still holds: received minus everything already given back. Never negative. */
export function heldPaise(p: PaymentMoney): Paise {
  return Math.max(0, receivedPaise(p) - toPaise(p.refund_amount));
}

/**
 * How much of what the shop holds is MORE than the customer now owes — the amount to give back
 * when an order shrinks after it was paid for. Zero when he has not over-paid.
 */
export function excessPaise(p: PaymentMoney, owedNowPaise: Paise): Paise {
  return Math.max(0, heldPaise(p) - owedNowPaise);
}
