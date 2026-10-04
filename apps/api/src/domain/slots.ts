import { hhmmToMinutes, minutesToHhmm } from '../common/utils/time';

/** A24 service slots for a day. Past slots today are hidden; capacity 0 → disabled ("भरा हुआ"). */
export interface SlotView {
  start: string;
  end: string;
  capacity: number;
  available: boolean;
  labelHi: string;
}
export function buildSlots(opts: {
  open: string;
  close: string;
  slotMinutes: number;
  technicians: number;
  bookedByStart: Record<string, number>;
  isToday: boolean;
  nowMinutes: number;
}): SlotView[] {
  const o = hhmmToMinutes(opts.open);
  const c = hhmmToMinutes(opts.close);
  const out: SlotView[] = [];
  for (let s = o; s + opts.slotMinutes <= c; s += opts.slotMinutes) {
    if (opts.isToday && s <= opts.nowMinutes) continue;
    const start = minutesToHhmm(s);
    const end = minutesToHhmm(s + opts.slotMinutes);
    const capacity = Math.max(0, opts.technicians - (opts.bookedByStart[start] ?? 0));
    out.push({ start, end, capacity, available: capacity > 0, labelHi: capacity > 0 ? `${start} – ${end}` : `${start} – ${end} (भरा हुआ)` });
  }
  return out;
}
