/**
 * "2 × 500 ग्राम = 1 किलो" — what the buyer actually gets, in their own units. Display only.
 */
const UP: Record<string, [number, string, string]> = {
  ग्राम: [1000, 'किलो', 'kg'],
  g: [1000, 'kg', 'kg'],
  'मि.ली.': [1000, 'लीटर', 'L'],
  ml: [1000, 'L', 'L'],
};

export function multiplyUnit(unit: string, qty: number): string {
  const m = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(unit.trim());
  if (!m) return `${qty} × ${unit}`;
  const total = Number(m[1]) * qty;
  const label = m[2] as string;
  const up = UP[label];
  if (up && total >= up[0]) return `${trim(total / up[0])} ${up[1]}`;
  return `${trim(total)} ${label}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Money for display: string "25.00" × qty in integer paise (no float drift). */
export function lineTotal(price: string, qty: number): string {
  const paise = Math.round(Number(price) * 100) * qty;
  const r = (paise / 100).toFixed(2);
  return r.endsWith('.00') ? r.slice(0, -3) : r;
}
