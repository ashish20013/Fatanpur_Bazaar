/**
 * Calm colour family per top-level category — used by the product label tile and the category
 * medallions. Muted, desaturated tones (never neon) so a long page of them stays restful.
 * Keys are root-category slugs; anything new the admin adds gets a stable tone from its slug.
 */
export interface Tone {
  bg: string;
  fg: string;
}

const TONES: Record<string, Tone> = {
  kirana: { bg: '#f3ead6', fg: '#6b5220' },
  'fal-sabzi': { bg: '#e6eee0', fg: '#2e5b3a' },
  'fast-food': { bg: '#f4e5dc', fg: '#8a3d26' },
  mithai: { bg: '#f4e4e6', fg: '#86324a' },
  electronics: { bg: '#e3e9f0', fg: '#2d4a66' },
  beauty: { bg: '#ece5f1', fg: '#5a3d73' },
  kapde: { bg: '#e5e7f2', fg: '#37428a' },
  'joote-chappal': { bg: '#ece5dd', fg: '#5e4a3a' },
  kheti: { bg: '#e9ecd8', fg: '#4f5a1e' },
  'building-material': { bg: '#e9e6df', fg: '#4b4943' },
  'body-checkup': { bg: '#dfeeeb', fg: '#1f5e58' },
  doctor: { bg: '#e1ecf1', fg: '#22566e' },
  dawai: { bg: '#e2f0e8', fg: '#1f6446' },
  'bhada-gadi': { bg: '#f1e9d6', fg: '#6a5321' },
  'ghar-sewa': { bg: '#e5e9ec', fg: '#3b4a55' },
};
const FALLBACK: Tone[] = [
  { bg: '#e6eee0', fg: '#2e5b3a' },
  { bg: '#f3ead6', fg: '#6b5220' },
  { bg: '#e3e9f0', fg: '#2d4a66' },
  { bg: '#ece5f1', fg: '#5a3d73' },
];

export function toneFor(slug: string | null | undefined): Tone {
  if (!slug) return FALLBACK[0] as Tone;
  const t = TONES[slug];
  if (t) return t;
  return FALLBACK[hash(slug) % FALLBACK.length] as Tone;
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * The same tone, nudged a little, chosen from the product's own name.
 *
 * Sixteen vegetables sharing one family colour and one line icon made the grid read as a single
 * stamp repeated sixteen times — the surest way to make a shop look machine-made. Shifting each
 * tile's shade and the angle its light falls from breaks that up while keeping the family
 * recognisable. The shift is tiny (a few percent of lightness) and it is DERIVED from the name,
 * so a product's tile looks the same on every screen and after every deploy.
 */
export interface TileLook extends Tone {
  /** CSS background-image for the tile: a soft highlight offset per product. */
  gradient: string;
}

export function tileLook(family: string | null | undefined, seed: string): TileLook {
  const tone = toneFor(family);
  const h = hash(seed);
  // −4 … +4 percentage points of lightness, and a highlight that moves around the top-left.
  const lift = ((h >> 3) % 9) - 4;
  const x = 18 + ((h >> 7) % 5) * 7; // 18–46 %
  const y = 8 + ((h >> 11) % 4) * 6; // 8–26 %
  const bg = shiftLightness(tone.bg, lift);
  return { bg, fg: tone.fg, gradient: `radial-gradient(120% 90% at ${x}% ${y}%, #fffdf8 0%, ${bg} 70%)` };
}

/** #rrggbb → the same hue, `delta` percentage points lighter or darker. Clamped, never clipped. */
function shiftLightness(hex: string, delta: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = 1 + delta / 100;
  const ch = (shift: number): string => {
    const v = Math.round(Math.min(255, Math.max(0, ((n >> shift) & 0xff) * f)));
    return v.toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
