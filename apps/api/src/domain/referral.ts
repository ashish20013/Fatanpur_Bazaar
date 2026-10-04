import { toPaise } from '../common/utils/money';

/** A22 referral reward gate — this is real money, every guard matters. */
export interface ReferralFacts {
  referral: { referrer_id: number; referred_id: number; reward_issued_at: Date | string | null; signup_ip: string | null } | null;
  customerId: number;
  deliveredCount: number;
  paymentStatus: string;
  payable: string; // final_grand_total ?? grand_total
  minOrder: string;
  phoneVerified: boolean;
  referrerSignupIp: string | null;
  sameAddress: boolean;
  rewardsToday: number;
  dailyCap: number;
}
export type ReferralDecision = { action: 'SKIP'; why: string } | { action: 'FLAG'; why: string } | { action: 'REWARD' };

export function decideReferral(f: ReferralFacts): ReferralDecision {
  const r = f.referral;
  if (!r || r.reward_issued_at) return { action: 'SKIP', why: 'no pending referral' };
  if (f.deliveredCount !== 1) return { action: 'SKIP', why: 'not first delivered order' };
  if (f.paymentStatus !== 'PAID') return { action: 'SKIP', why: 'payment not PAID' };
  if (toPaise(f.payable) < toPaise(f.minOrder)) return { action: 'SKIP', why: 'below referral_min_order' };
  if (!f.phoneVerified) return { action: 'SKIP', why: 'phone not verified' };
  if (r.referrer_id === f.customerId) return { action: 'SKIP', why: 'self referral' };
  if ((r.signup_ip && f.referrerSignupIp && r.signup_ip === f.referrerSignupIp) || f.sameAddress) return { action: 'FLAG', why: 'same ip/address' };
  if (f.rewardsToday >= f.dailyCap) return { action: 'FLAG', why: 'daily cap reached' };
  return { action: 'REWARD' };
}
