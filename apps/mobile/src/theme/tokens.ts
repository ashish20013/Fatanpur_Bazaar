/**
 * The SAME tokens as the website — copied value-for-value from
 * `apps/web/src/styles/globals.css` `:root`, which is the live site's source of truth.
 * The app and fatanpurbazaar.com must look like one product, so nothing here is "close to"
 * the site: if a value changes there, change it here and nowhere else.
 *
 * Palette: deep emerald + champagne gold on a warm ivory page (light only).
 */
export const colors = {
  // ── the green ramp ────────────────────────────────────────────────────────
  em950: '#0d2419',
  em900: '#123022',
  em800: '#1a4330', // logo dark
  band: '#1d4c35', // header band / hero
  em700: '#215e3d', // PRIMARY
  em600: '#29714a', // pressed
  em500: '#37885b',
  em300: '#a2c8b2',
  em200: '#cee3d6',
  em100: '#e8f2ea',
  em50: '#f4f9f5',

  // ── gold ──────────────────────────────────────────────────────────────────
  au800: '#6b5117', // gold text on ivory (AA)
  au700: '#86661f',
  au600: '#a8843a',
  au500: '#cba954', // logo
  au400: '#e2c578',
  au300: '#ecd598',
  au200: '#f2dfac', // logo light
  au100: '#f8eed2',
  au50: '#fcf7e8',

  // ── the whites ────────────────────────────────────────────────────────────
  paper: '#f8f6f2', // page — soft ivory, a shade off white
  paper2: '#f0ede6', // quiet bands and skeletons
  card: '#fffefc', // warmed a whisper so it sits on the same light as the page
  line: '#eae6de',
  line2: '#dbd5c9',
  ink: '#16261c',
  ink2: '#435248',
  ink3: '#5f6b62', // ≥ 4.5:1 on paper
  night: '#0e1512', // footer

  danger: '#b3261e',
  warn: '#9a6405',
  ok: '#1e7a45',
  info: '#1d6386',

  white: '#ffffff',

  // ── aliases kept so screens written against the old names keep compiling ──
  g950: '#0d2419',
  g900: '#123022',
  g800: '#1a4330',
  g700: '#215e3d',
  g600: '#29714a',
  g500: '#37885b',
  g200: '#cee3d6',
  g100: '#e8f2ea',
  g50: '#f4f9f5',
  a700: '#6b5117',
  a600: '#a8843a',
  a100: '#f8eed2',
  surface: '#f8f6f2',
} as const;

/** One radius family. Each step a little rounder than a plain box — site values exactly. */
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, full: 999 } as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

/**
 * The site's type scale (px). `body` is 16 and is the smallest size used for anything a
 * customer has to read — many of them are over 40 and reading Devanagari on a cheap screen.
 */
export const type = {
  xs: 12,
  sm: 13,
  base: 14, // meta text only
  body: 16,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 36,
} as const;

/** Font files live in android/app/src/main/assets/fonts — Android resolves them by file name. */
export const font = {
  body: 'Mukta-Regular',
  bodySemi: 'Mukta-SemiBold',
  /** "FB Display" = Marcellus (Latin) + Tiro Devanagari Hindi, merged into one file. */
  display: 'FBDisplay-Regular',
} as const;

export const layout = {
  headerH: 60,
  bottomNavH: 58,
  bagBarH: 72,
  tapTarget: 48,
  maxw: 1280,
} as const;

/**
 * Two layers, like the site: a hairline contact shadow that anchors the card to the page and a
 * wide soft one that lifts it. React Native gives us one shadow per view, so these take the
 * lifting layer and lean on Android elevation for the contact.
 */
export const shadow1 = {
  elevation: 1,
  shadowColor: '#14231a',
  shadowOpacity: 0.08,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
} as const;

export const shadow2 = {
  elevation: 3,
  shadowColor: '#14231a',
  shadowOpacity: 0.16,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
} as const;

/** Gold ring used on medallions and the bag bar — `--sh-gold`. */
export const shadowGold = {
  elevation: 2,
  shadowColor: '#6b5117',
  shadowOpacity: 0.3,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
} as const;
