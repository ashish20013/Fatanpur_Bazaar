import type { MoneyString } from '@fb/shared-types';

/**
 * ⚠️ Paisa kabhi JS float me nahi. Ye helpers sirf DISPLAY ke liye hain —
 * har hisaab server pe hota hai (A12) aur yahan sirf dikhaya jaata hai.
 */
export function rupees(amount: MoneyString | number | null | undefined): string {
  if (amount === null || amount === undefined) return '₹0';
  const s = typeof amount === 'number' ? amount.toFixed(2) : amount;
  const [intPart = '0', dec = '00'] = s.split('.');
  const grouped = groupIndian(intPart.replace(/^-/, ''));
  const sign = intPart.startsWith('-') ? '-' : '';
  return dec === '00' ? `₹${sign}${grouped}` : `₹${sign}${grouped}.${dec}`;
}

/** 1,23,456 — Indian grouping. */
function groupIndian(n: string): string {
  if (n.length <= 3) return n;
  const last3 = n.slice(-3);
  const rest = n.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

export function discountPercent(mrp: MoneyString, price: MoneyString): number {
  const m = Number(mrp);
  const p = Number(price);
  if (!Number.isFinite(m) || !Number.isFinite(p) || m <= 0 || p >= m) return 0;
  return Math.round(((m - p) / m) * 100);
}

/** "1 किलो", "500 ग्राम", "10 का पैक" — unit_value + unit ka saaf label. */
export function unitLabel(unit: string, unitValue: number | string, lang: 'hi' | 'en' = 'hi'): string {
  const v = Number(unitValue);
  const n = Number.isInteger(v) ? String(v) : String(v).replace(/0+$/, '').replace(/\.$/, '');
  const hiMap: Record<string, string> = { kg: 'किलो', g: 'ग्राम', l: 'लीटर', ml: 'मिली', piece: 'नग', pack: 'का पैक', dozen: 'दर्जन', bundle: 'गड्डी', visit: 'विज़िट' };
  const enMap: Record<string, string> = { kg: 'kg', g: 'g', l: 'L', ml: 'ml', piece: 'piece', pack: 'pack', dozen: 'dozen', bundle: 'bundle', visit: 'visit' };
  const label = (lang === 'hi' ? hiMap : enMap)[unit] ?? unit;
  return `${n} ${label}`;
}

/** Hindi date: 12 सितंबर 2026 · 4:05 शाम (Asia/Kolkata) */
const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

export function formatDate(iso: string | Date | null | undefined, lang: 'hi' | 'en' = 'hi'): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  const month = Number(get('month')) - 1;
  const time = `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase() === 'am' ? (lang === 'hi' ? 'सुबह' : 'am') : lang === 'hi' ? 'शाम' : 'pm'}`;
  const monthName = lang === 'hi' ? HI_MONTHS[month] : new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  return `${get('day')} ${monthName} ${get('year')} · ${time}`;
}

/** "2 मिनट पहले" — tracking ke stale label ke liye. */
export function minutesAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

export function km(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return `${Math.round(v * 10) / 10}`;
}

/** Image URL absolute banao (uploads API se serve hote hain). */
export function imageUrl(url: string | null | undefined, apiBase: string): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  /*
   * An upload is asked for on whatever host the visitor is already using.
   *
   * These used to be prefixed with NEXT_PUBLIC_API_URL, which is baked into the HTML at build
   * time as `http://localhost:3000`. On the shopkeeper's own PC that works. On his phone, opening
   * the site over the LAN, "localhost" means THE PHONE — so every category and product picture
   * on every mobile device was a broken-image box, while the desktop looked perfect.
   *
   * A relative path has no such ambiguity: the browser asks the host it is already talking to, and
   * `/uploads/*` is routed on to the API (next.config.js rewrites). Works on the PC, on a phone
   * over the LAN, and on the real domain, without anything being baked in.
   */
  const path = url.startsWith('/') ? url : `/${url}`;
  if (path.startsWith('/uploads/')) return path;
  return `${apiBase}${path}`;
}
