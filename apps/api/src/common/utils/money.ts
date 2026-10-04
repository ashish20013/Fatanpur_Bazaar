/**
 * Money = integer paise inside the app. DB stores DECIMAL(10,2); the API emits "25.00" strings.
 * JS floats never touch a rupee amount (BUILD_PROMPT §6) — parsing is done on the decimal
 * string itself, so "0.1 + 0.2" style errors cannot occur.
 */
export type Paise = number & { readonly __brand?: 'paise' };

const MONEY_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Parse "25", "25.5", "25.50", 25.5 (mysql2 may return DECIMAL as string) into paise. */
export function toPaise(value: string | number | null | undefined): Paise {
  if (value === null || value === undefined || value === '') return 0;
  const s = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const m = MONEY_RE.exec(s);
  if (!m) throw new Error(`Invalid money value: ${String(value)}`);
  const rupees = Number(m[2]);
  const frac = (m[3] ?? '0').padEnd(2, '0');
  const paise = rupees * 100 + Number(frac);
  if (!Number.isSafeInteger(paise)) throw new Error('Money value out of range');
  return m[1] ? -paise : paise;
}

/** Paise → "25.00" (API + DB representation). */
export function fromPaise(p: Paise): string {
  const neg = p < 0;
  const abs = Math.abs(Math.round(p));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

/**
 * unit price × quantity. Quantity may be fractional for weighed items (0.9 kg), so it is
 * scaled to milli-units first and the product rounded half-up to the nearest paisa.
 */
export function mulQty(unitPrice: Paise, qty: number | string): Paise {
  const milli = Math.round(Number(qty) * 1000);
  if (!Number.isFinite(milli) || milli < 0) throw new Error(`Invalid quantity: ${String(qty)}`);
  return Math.floor((unitPrice * milli + 500) / 1000);
}

/** value% of amount, rounded half-up to a whole paisa. `pct` may be "12.50". */
export function percentOf(amount: Paise, pct: number | string): Paise {
  const bp = toPaise(pct); // 12.50% → 1250 basis-points ×100
  return Math.floor((amount * bp + 5000) / 10000);
}

/** Round to whole rupees (coupon discounts are shown as whole rupees — A13 `round`). */
export function roundRupee(p: Paise): Paise {
  return Math.round(p / 100) * 100;
}

export function sum(values: readonly Paise[]): Paise {
  return values.reduce((a, b) => a + b, 0);
}
export const min = (a: Paise, b: Paise): Paise => (a < b ? a : b);
export const max = (a: Paise, b: Paise): Paise => (a > b ? a : b);

/** "₹245" / "₹245.50" for UI copy (Latin digits per design §9). */
export function formatInr(p: Paise): string {
  const s = fromPaise(p);
  return `₹${s.endsWith('.00') ? s.slice(0, -3) : s}`;
}
