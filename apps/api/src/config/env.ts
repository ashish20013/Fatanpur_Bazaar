import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * A1 — boot-time env validation. Any missing/placeholder secret → process.exit(1) with a clear
 * message. Silently running on defaults is not allowed (SECURITY_AUDIT §10).
 */
const PLACEHOLDER = /^(change[-_ ]?me|secret|password|xxx+|<.*>|test|default)$/i;
const secret = (name: string): z.ZodEffects<z.ZodString> =>
  z
    .string({ required_error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters (use: openssl rand -hex 32)`)
    .refine((v) => !PLACEHOLDER.test(v), `${name} looks like a placeholder`);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive().default(3000),
    /* Which interface to listen on. 0.0.0.0 = every IPv4 address, which is what the web app
       and the hosting proxy dial. Left to Node it may bind IPv6-only and refuse them. */
    HOST: z.string().min(1).default('0.0.0.0'),
    APP_NAME: z.string().default('Fatanpur Bazaar'),
    APP_URL: z.string().url(),
    API_URL: z.string().url(),
    ALLOWED_ORIGINS: z
      .string()
      .min(1)
      .transform((s) =>
        s
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      )
      .refine((list) => !list.includes('*'), "ALLOWED_ORIGINS must be an allowlist — '*' is forbidden"),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string(),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
    // ⚠️ 2 apps × 8 = 16 < 50 MySQL connections per user on Hostinger (HOSTING_CAPACITY B4)
    DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(8),

    JWT_SECRET: secret('JWT_SECRET'),
    JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
    APP_SECRET: secret('APP_SECRET'),
    ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    COOKIE_DOMAIN: z.string().optional(),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    /*
     * The handshake between the website server and this API. See common/edge.ts for why it has
     * to exist: without it every shopper reaches the API as the website's own address and they all
     * share one rate-limit bucket. Optional while developing (everything is one machine anyway);
     * required on the live shop, enforced below.
     */
    EDGE_SECRET: z.string().min(32, 'EDGE_SECRET must be at least 32 characters (use: openssl rand -hex 32)').optional(),

    /* 'minimoth' owns the whole challenge (it generates, delivers by WhatsApp-then-SMS, and
       verifies); the other two are couriers for a code we mint. settings.otp_driver overrides
       this at runtime so the shopkeeper can switch without a redeploy. */
    SMS_DRIVER: z.enum(['null', 'fast2sms', 'msg91', 'minimoth']).default('null'),
    MINIMOTH_API_KEY: z.string().min(10).optional(),
    SMS_API_KEY: z.string().optional(),
    SMS_SENDER_ID: z.string().optional(),
    SMS_TEMPLATE_ID: z.string().optional(),

    FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default('mailto:support@fatanpurbazaar.com'),

    MAP_PROVIDER: z.enum(['osm', 'google']).default('osm'),
    MAP_API_KEY: z.string().optional(),

    STORAGE_PATH: z.string().min(1),
    PUBLIC_UPLOAD_URL: z.string().default('/uploads'),
    UPLOAD_MAX_MB: z.coerce.number().positive().max(20).default(8),

    SOCKET_PATH: z.string().default('/socket'),
    SOCKET_TRANSPORTS: z
      .string()
      .default('websocket,polling')
      .transform((s) =>
        s
          .split(',')
          .map((t) => t.trim())
          .filter((t): t is 'websocket' | 'polling' => t === 'websocket' || t === 'polling'),
      ),
    SOCKET_PING_INTERVAL: z.coerce.number().int().positive().default(25000),
    SOCKET_MAX_HTTP_BUFFER: z.coerce.number().int().positive().default(8192),

    TZ: z.literal('Asia/Kolkata', {
      errorMap: () => ({ message: 'TZ must be Asia/Kolkata (app + DB both run at +05:30)' }),
    }),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    /* Browser errors POSTed to /_client-error land in storage/logs/problems.log. Handy while
       testing, off in production unless deliberately switched on: it is an anonymous endpoint
       that writes to disk, so it should not be open by default on a live shop. */
    /* ⚠️ Not z.coerce.boolean(): that makes the string "false" true, because every non-empty
       string is truthy. Spelled out instead, and defaulting to on only outside production. */
    CLIENT_ERROR_LOG: z
      .enum(['0', '1', 'true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === '1' || v === 'true')),
    SETUP_TOKEN: z.string().optional(),
    GIT_COMMIT: z.string().default('dev'),
  })
  .superRefine((e, ctx) => {
    if (new Set([e.JWT_SECRET, e.JWT_REFRESH_SECRET, e.APP_SECRET]).size !== 3) {
      ctx.addIssue({
        code: 'custom',
        message: 'JWT_SECRET, JWT_REFRESH_SECRET and APP_SECRET must all be different',
      });
    }
    if (e.NODE_ENV === 'production' && (e.SMS_DRIVER === 'fast2sms' || e.SMS_DRIVER === 'msg91') && !e.SMS_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'SMS_API_KEY is required when SMS_DRIVER is fast2sms or msg91' });
    }
    if (e.SMS_DRIVER === 'minimoth' && !e.MINIMOTH_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'MINIMOTH_API_KEY is required when SMS_DRIVER is minimoth' });
    }
    // Without it the live shop rate-limits every customer as one person: the tenth OTP in fifteen
    // minutes would be refused for everybody. That is a launch-day outage, so it is a boot error.
    if (e.NODE_ENV === 'production' && !e.EDGE_SECRET) {
      ctx.addIssue({ code: 'custom', message: 'EDGE_SECRET is required in production — set the SAME value in the website\'s .env (openssl rand -hex 32)' });
    }
    if (e.EDGE_SECRET && [e.JWT_SECRET, e.JWT_REFRESH_SECRET, e.APP_SECRET].includes(e.EDGE_SECRET)) {
      ctx.addIssue({ code: 'custom', message: 'EDGE_SECRET must be different from the JWT and APP secrets' });
    }
  })
  .transform((e) => ({
    ...e,
    // Unset means "on while developing and testing, off on the live shop". Setting it either way
    // in .env always wins, so the shopkeeper can turn it on during a real-world test.
    CLIENT_ERROR_LOG: e.CLIENT_ERROR_LOG ?? e.NODE_ENV !== 'production',
  }));

export type Env = z.infer<typeof schema>;

export function parseEnv(
  source: NodeJS.ProcessEnv,
): { ok: true; env: Env } | { ok: false; errors: string[] } {
  /*
   * An empty line in .env means "not set", not "set to an empty string".
   *
   * `FOO=` arrives from dotenv as `''`, and `z.string().optional()` only forgives `undefined` — so
   * a key the shopkeeper deliberately left blank crashed the server at boot with a validation
   * error about a value he never typed. He hit exactly this on CLIENT_ERROR_LOG, and every other
   * optional key here (MINIMOTH_API_KEY, SMS_API_KEY, VAPID_*, SETUP_TOKEN …) had the same
   * landmine waiting.
   *
   * Dropping the blanks before validation fixes all of them at once, and matches what anyone
   * editing a .env file expects. A key that is genuinely required still fails, because it is
   * missing either way.
   */
  const filled: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'string' && v.trim() === '') continue;
    filled[k] = v;
  }
  const r = schema.safeParse(filled);
  if (r.success) return { ok: true, env: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`) };
}

let cached: Env | null = null;
/**
 * Read apps/api/.env into process.env, without overwriting anything already set.
 *
 * `dev` used to be the only script that loaded it (`node -r dotenv/config`), so `migrate`, `seed`
 * and `cron` all died with "Invalid environment — refusing to start" listing thirteen variables
 * that were sitting right there in the file. Loading it here means every entry point behaves the
 * same, whichever way it is launched. A real environment variable still wins, so hosting panels
 * and CI keep control.
 */
let envFileFound = false;

function loadDotEnv(): void {
  // src/config → dist/config at runtime; the file lives at the app root either way.
  const file = join(__dirname, '..', '..', '.env');
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return; // No .env is normal in production, where the panel sets real variables.
  }
  envFileFound = true;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    // A quoted value may legitimately contain '#' or spaces — an unquoted one may not.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    process.env[key] = value;
  }
}

export function loadEnv(): Env {
  if (cached) return cached;
  loadDotEnv();
  const r = parseEnv(process.env);
  if (!r.ok) {
    const hint = envFileFound
      ? ''
      : '\n  ⚠️  apps/api/.env नहीं मिली — पहले `cp apps/api/.env.example apps/api/.env` कीजिए और उसे भरिए.\n     (no apps/api/.env found — copy .env.example to .env and fill it in)\n';
    console.error('\n❌ Invalid environment — refusing to start:\n  - ' + r.errors.join('\n  - ') + '\n' + hint);
    process.exit(1);
  }
  cached = r.env;
  return cached;
}
