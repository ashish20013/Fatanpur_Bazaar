import 'reflect-metadata';
import { loadEnv } from './config/env';

// A1: validate env BEFORE anything else is imported/initialised. Invalid env → exit(1).
const env = loadEnv();
process.env.TZ = env.TZ;

// Open the plain-language warning/error file before anything can warn, so the first problem of the
// run is in it too. (The structured JSON stream is unaffected.)
import { openProblemLog } from './common/problem-log';
const problemLog = openProblemLog(env.STORAGE_PATH);

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { LRUCache } from 'lru-cache';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Knex } from 'knex';
import { AppModule } from './app.module';
import { KNEX } from './database/knex.provider';
import { pendingMigrations, runMigrations } from './database/migrate';
import { Log } from './common/logger';
import { edgeInfo, edgeMiddleware } from './common/edge';
import { clientIp } from './common/types';

Log.level = env.LOG_LEVEL;

/** api:{ip} 300 / 5 min — in-memory (single API process); security buckets are DB-backed. */
function globalRateLimit(): (req: Request, res: Response, next: NextFunction) => void {
  const hits = new LRUCache<string, { n: number; reset: number }>({ max: 20000 });
  return (req, res, next) => {
    // The website rebuilding its own page cache is the shop's server, not a shopper: it is not
    // counted here. A shopper's request through the website is counted under the shopper's own
    // address. See common/edge.ts.
    const edge = edgeInfo(req);
    if (edge.trusted && !edge.clientIp) return next();
    const ip = clientIp(req);
    const now = Date.now();
    const cur = hits.get(ip);
    const e = !cur || cur.reset < now ? { n: 0, reset: now + 300_000 } : cur;
    e.n++;
    hits.set(ip, e);
    if (e.n > 300) {
      res.setHeader('Retry-After', String(Math.ceil((e.reset - now) / 1000)));
      res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'बहुत ज़्यादा कोशिश — थोड़ी देर बाद' } });
      return;
    }
    next();
  };
}

/** Public catalog reads are CDN/browser cacheable; everything else is private. */
function cacheHeaders(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') {
    if (/^\/v1\/service-area\/villages/.test(req.path)) res.setHeader('Cache-Control', 'public, max-age=3600');
    else if (/^\/v1\/(catalog|content)\//.test(req.path) && !req.headers.authorization) res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    else res.setHeader('Cache-Control', 'private, no-store');
  } else res.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * Keep the database and the code in step.
 *
 * A missing migration does not announce itself: the API starts, reports healthy, and then every
 * catalogue query dies on "Unknown column". The shopkeeper sees an empty shop and no reason for it.
 *
 * What happens next depends on where we are, because the right answer is different:
 *
 *  • DEVELOPMENT — just apply them. Pulling new code and then being told to run one more command
 *    before the app will start is a chore that gets forgotten, and forgetting it looks exactly
 *    like a broken site. Migrations here are additive-only and safe to re-run, so the dev server
 *    heals itself and says what it did.
 *
 *  • PRODUCTION — stop, and say which ones are missing. A live shop must never rewrite its own
 *    schema because someone restarted a process; that is the deploy's decision, taken once, with
 *    a backup behind it (DEPLOYMENT §7).
 *
 * Both paths use the same check as `db:migrate`, so the two can never disagree.
 */
async function assertSchemaCurrent(db: Knex): Promise<void> {
  const dir = join(__dirname, 'database', 'migrations');
  const pending = await pendingMigrations(db, dir);
  if (!pending.length) return;

  if (env.NODE_ENV === 'production') {
    process.stderr.write(
      [
        '❌ Database is behind the code — refusing to start.',
        `   Not yet applied: ${pending.join(', ')}`,
        '',
        '   Run this, then start the API again:',
        '     npm run db:migrate',
        '',
        '   डेटाबेस पुराना है। ऊपर वाली कमांड चलाइए, फिर API दोबारा चालू कीजिए।',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  process.stdout.write(`⏳ Database is behind — applying ${pending.length} migration(s): ${pending.join(', ')}\n`);
  const applied = await runMigrations(db, dir, (m) => process.stdout.write(`   ${m}\n`));
  process.stdout.write(`✅ Database brought up to date (${applied.join(', ')}). डेटाबेस अपने आप अपडेट हो गया.\n`);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bodyParser: false, logger: ['error', 'warn'] });
  await assertSchemaCurrent(app.get<Knex>(KNEX));
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  // First, before anything that keys on an address (the throttle below, the security buckets).
  app.use(edgeMiddleware(env.EDGE_SECRET));
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], imgSrc: ["'self'", 'data:'] } },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // product images are embedded by the web app
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    next();
  });
  // Public product/banner images (prescriptions live in /private and are NEVER served statically).
  const uploads = join(env.STORAGE_PATH, 'uploads');
  mkdirSync(uploads, { recursive: true });
  app.use('/uploads', express.static(uploads, { index: false, dotfiles: 'deny', immutable: true, maxAge: '30d', fallthrough: false, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));
  app.use(globalRateLimit());
  app.use(cookieParser());
  // Body limits: 1 MB JSON; multipart routes set their own (8 MB images / 5 MB prescriptions).
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: false });
  app.use(cacheHeaders);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || env.ALLOWED_ORIGINS.includes(origin)), // ⚠️ allowlist only, never '*'
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Guest-Key', 'X-Idempotency-Key', 'X-Device-Id', 'X-Platform'],
    maxAge: 600,
  });
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  /*
   * Bind the host explicitly.
   *
   * `listen(port)` on its own leaves the address to Node, which picks the IPv6 wildcard `::` when
   * it can. On Linux that quietly accepts IPv4 too; on Windows it does not always, and the result
   * is a server that prints "started" while every `http://127.0.0.1:3000` connection is refused —
   * which looks exactly like a crash and is nothing of the sort.
   *
   * `0.0.0.0` is every IPv4 interface, which is what both the Next.js server beside it and
   * Hostinger's proxy actually dial. HOST can override it for an unusual setup.
   */
  await app.listen(env.PORT, env.HOST);
  Log.info('api.started', { host: env.HOST, port: env.PORT, node: process.version, rssMb: Math.round(process.memoryUsage().rss / 1048576), problemLog });
}

// Last line of defence: a stray async error is logged, not allowed to kill a process that is
// serving everyone else (Hostinger restarts are slow and drop every live socket).
process.on('unhandledRejection', (e) => Log.error('process.unhandled_rejection', { err: e instanceof Error ? (e.stack ?? e.message) : String(e) }));

bootstrap().catch((e) => {
  Log.error('api.boot_failed', { err: String(e), stack: (e as Error).stack });
  process.exit(1);
});
