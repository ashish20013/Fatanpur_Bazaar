/**
 * Copied from apps/web/src/lib/tones.ts so a category wears the same colour in the app as it
 * does on the site. The web file's `tileLook` gradient is left out — React Native has no CSS
 * gradients — but `toneFor` and its hashing are byte-for-byte the site's, so a slug that is
 * sand-coloured on fatanpurbazaar.com is sand-coloured here too.
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
