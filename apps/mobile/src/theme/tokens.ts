/**
 * Mirrors apps/web design tokens (BUILD_PROMPT §9) so the app and the site feel like one
 * product. Kept as plain JS objects (no styled-system) — low-end devices, small bundle.
 */
export const colors = {
  g950: '#062018',
  g900: '#0c3323',
  g800: '#11492f',
  g700: '#166b3c', // primary — buttons, links, active states
  g600: '#1e8449', // pressed/hover equivalent
  g500: '#2fa35f', // success / in-stock
  g200: '#bfe3cc',
  g100: '#e6f4ea',
  g50: '#f2f9f4',
  a700: '#a9660b',
  a600: '#c97a0e',
  a100: '#fdf2dc', // offers / discount ribbons — used sparingly
  ink: '#12211a',
  ink2: '#48584f',
  ink3: '#7a8a80',
  surface: '#f6f8f6', // screen background — never pure white (glare on cheap screens)
  card: '#ffffff',
  line: '#dee7e1',
  danger: '#c0392b',
  warn: '#c97a0e',
  ok: '#1e8449',
  info: '#1e6f8c',
  white: '#ffffff',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const type = { xs: 12, sm: 13, base: 14, md: 16, lg: 18, xl: 20, xxl: 24, xxxl: 30, display: 36 } as const;

export const layout = {
  headerH: 56,
  bottomNavH: 58,
  tapTarget: 48, // §9 non-negotiable: every touch target ≥48dp
} as const;

/** Shadows are cheap on Android (elevation) — keep both for iOS parity if ever needed. */
export const shadow1 = {
  elevation: 1,
  shadowColor: '#0c3323',
  shadowOpacity: 0.06,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
} as const;
export const shadow2 = {
  elevation: 3,
  shadowColor: '#0c3323',
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
} as const;
