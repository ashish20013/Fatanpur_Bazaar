import type { Config } from 'tailwindcss';

/**
 * Design tokens — the SAME values as the CSS variables in globals.css (kept as hex here so Tailwind's
 * opacity modifiers like `bg-em-900/40` work).
 *
 * Palette is taken from the logo: deep emerald (#1C5735 → #174429) + champagne gold
 * (#F2DFAC → #CBA954) on a warm, low-glare ivory page. Light only (`color-scheme: light`).
 * The old `g-*` / `a-*` names are kept as aliases so existing screens keep compiling.
 */
const em = {
  950: '#0b2618', 900: '#103220', 800: '#174429', 700: '#1c5735', 600: '#22693f',
  500: '#2e8050', 300: '#9bc3a8', 200: '#c9dfd0', 100: '#e4efe7', 50: '#f1f6f2',
};
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        em,
        g: em,
        au: {
          800: '#6b5117', 700: '#86661f', 600: '#a8843a', 500: '#cba954', 400: '#e2c578',
          300: '#ecd598', 200: '#f2dfac', 100: '#f8eed2', 50: '#fcf7e8',
        },
        a: { 700: '#6b5117', 600: '#a8843a', 100: '#f8eed2' },
        ink: { DEFAULT: '#16261c', 2: '#435248', 3: '#5f6b62' },
        paper: { DEFAULT: '#f7f5f0', 2: '#efece4' },
        surface: '#f7f5f0',
        card: '#ffffff',
        band: '#143b25',
        line: { DEFAULT: '#e7e3da', 2: '#d5cfc2' },
        night: '#0e1512',
        danger: '#b3261e',
        warn: '#9a6405',
        ok: '#1e7a45',
        info: '#1d6386',
      },
      borderRadius: { sm: 'var(--r-sm)', DEFAULT: 'var(--r)', lg: 'var(--r-lg)', full: 'var(--r-full)' },
      boxShadow: { 1: 'var(--sh-1)', 2: 'var(--sh-2)', 3: 'var(--sh-3)', gold: 'var(--sh-gold)' },
      spacing: { 4.5: '1.125rem', header: 'var(--header-h)', bottomnav: 'var(--bottomnav-h)' },
      maxWidth: { app: 'var(--maxw)' },
      fontFamily: {
        sans: ['Mukta', 'system-ui', 'Nirmala UI', 'Noto Sans Devanagari', 'sans-serif'],
        display: ['FB Display', 'Mukta', 'Georgia', 'serif'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.4' }], // 12
        sm: ['0.8125rem', { lineHeight: '1.45' }], // 13
        base: ['0.875rem', { lineHeight: '1.6' }], // 14 — meta text only
        body: ['1rem', { lineHeight: '1.65' }], // 16 — body (never smaller on mobile)
        lg: ['1.125rem', { lineHeight: '1.4' }], // 18
        xl: ['1.25rem', { lineHeight: '1.3' }], // 20
        '2xl': ['1.5rem', { lineHeight: '1.25' }], // 24
        '3xl': ['1.875rem', { lineHeight: '1.2' }], // 30
        '4xl': ['2.25rem', { lineHeight: '1.15' }], // 36
      },
      transitionDuration: { DEFAULT: '150ms' },
    },
  },
  plugins: [],
};

export default config;
