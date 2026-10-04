import { randomBytes, randomInt, randomUUID } from 'node:crypto';

/** Referral code alphabet: A–Z + 2–9 without look-alikes 0 O 1 I L (A3 step 7). */
export const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function referralCode(len = 8): string {
  let s = '';
  for (let i = 0; i < len; i++) s += REFERRAL_ALPHABET[randomInt(0, REFERRAL_ALPHABET.length)];
  return s;
}

/** 6-digit login OTP — crypto.randomInt, never Math.random (SECURITY_AUDIT §2). */
export function loginOtp(): string {
  return String(randomInt(100000, 1000000));
}

/** 4-digit delivery / service completion code, zero-padded ("0042"). */
export function fourDigitCode(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

export function refreshToken(): string {
  return randomBytes(32).toString('hex');
}

export function uuid(): string {
  return randomUUID();
}

/** FB-YYYYMMDD-NNNN (A14 step 9). `ymd` in Asia/Kolkata. */
export function orderNumber(ymd: string, seq: number): string {
  return `FB-${ymd}-${String(seq).padStart(4, '0')}`;
}

/** Random 6 chars [a-z0-9] for image filenames. */
export function shortRandom(len = 6): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += a[randomInt(0, a.length)];
  return s;
}
