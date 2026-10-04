/** Indian mobile: 10 digits starting 6–9. Stored as '91' + 10 digits. */
export const PHONE_RE = /^[6-9]\d{9}$/;

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return PHONE_RE.test(ten) ? `91${ten}` : null;
}

/** '919876543210' → '9876543210' */
export function localPhone(stored: string): string {
  return stored.startsWith('91') && stored.length === 12 ? stored.slice(2) : stored;
}

/** Audit/log form: 9876XXXX10 (SECURITY_AUDIT §8 — never a full phone in logs). */
export function maskPhone(stored: string | null | undefined): string {
  if (!stored) return '';
  const p = localPhone(stored);
  return p.length === 10 ? `${p.slice(0, 4)}XXXX${p.slice(8)}` : 'XXXX';
}
