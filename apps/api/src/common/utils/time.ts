/** All business time is Asia/Kolkata (+05:30, no DST). */
const IST_OFFSET_MIN = 330;

export function istNow(d: Date = new Date()): Date {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60000);
}

/** YYYYMMDD in IST. */
export function istYmd(d: Date = new Date()): string {
  return istNow(d).toISOString().slice(0, 10).replace(/-/g, '');
}

/** YYYY-MM-DD in IST. */
export function istDate(d: Date = new Date()): string {
  return istNow(d).toISOString().slice(0, 10);
}

/** Minutes since IST midnight. */
export function istMinutes(d: Date = new Date()): number {
  const x = istNow(d);
  return x.getUTCHours() * 60 + x.getUTCMinutes();
}

/** "07:30" → 450 */
export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm.trim());
  if (!m) throw new Error(`Bad time: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToHhmm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Store open check; supports overnight windows (close < open). */
export function isOpenAt(nowMin: number, open: string, close: string): boolean {
  const o = hhmmToMinutes(open);
  const c = hhmmToMinutes(close);
  return o <= c ? nowMin >= o && nowMin < c : nowMin >= o || nowMin < c;
}

/** MySQL DATETIME string for "now" in IST (connection runs at +05:30). */
export function toSqlDateTime(d: Date): string {
  return istNow(d).toISOString().slice(0, 19).replace('T', ' ');
}
