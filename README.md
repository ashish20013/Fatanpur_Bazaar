# फतनपुर बाज़ार — Fatanpur Bazaar

Single-store e-commerce + delivery platform for **Fatanpur Bazaar, Raniganj, Pratapgarh (UP) — 230301**.
One monorepo: **NestJS API + Next.js website + React Native app**, sharing one set of types.

- Service area: **6 km**, village-first (a village on the active list always wins over GPS).
- Payments: **COD + UPI direct (HDFC)**; a gateway driver exists but ships **off**.
- Users: rural customers, Android 9–13, 2–4 GB RAM, often 3G, **Hindi primary + English**.

---

> **Upgrading an existing install to the Sept 2026 redesign?** Follow the ⭐ section at the top of
> `NEXT-STEPS.md` (migrate → seed → `cli.js set-role` → delete 3 old files). Decisions are in
> `ASSUMPTIONS.md` §G, measured results in `docs/TEST_REPORT.md` §8.

## 1. Local setup — 5 commands

```bash
# 0) Prerequisites: Node.js 24 LTS, MySQL 8 or MariaDB 10.4+ running locally
npm install                                   # 1. install the whole workspace
cp apps/api/.env.example apps/api/.env        # 2. fill DB_*, and 3 secrets (see below)
cp apps/web/.env.example apps/web/.env.local  #    web needs only URLs
npm run build:api                             # 3. build shared types + API
npm run db:migrate && npm run db:seed -- --demo   # 4. schema + catalog + demo data
npm run dev:api   # 5a. API  → http://localhost:3000
npm run dev:web   # 5b. web  → http://localhost:3001   (second terminal)
```

### Migrations apply themselves in development

Pulling new code often brings a new `NNN_*.sql`. In **development** the API applies any pending
migration at boot and prints what it did — so `npm run dev:api` after a `git pull` just works, and
the watcher's restarts keep working too. Additive-only migrations make that safe, and a re-run is
a no-op.

In **production** it does the opposite: it refuses to start and names the missing migrations. A
live shop must never rewrite its own schema because a process restarted — that is the deploy's
decision, taken once, with a backup behind it (DEPLOYMENT §7).

Every root script builds `packages/shared-types` first, so step 3 is really only there to fail
fast on a bad `.env`. If you ever see a wall of

```
error TS2305: Module '"@fb/shared-types"' has no exported member 'SomeType'
```

it means that package's `dist/` is older than its `src/` — the API reads the BUILT types, not the
source. `npm run build:types` fixes it in one command, and the root scripts now run it for you.

Generate the three secrets (they must all be different, 32+ chars):

```bash
for k in JWT_SECRET JWT_REFRESH_SECRET APP_SECRET; do echo "$k=$(openssl rand -hex 32)"; done
```

Create the first admin (one time, needs `SETUP_TOKEN` set in `.env`):

```bash
npm run seed:admin -- --phone=9616038670 --name="Ashish"
```

Then log in at `http://localhost:3001/login` with that number. In development `SMS_DRIVER=null`, so the
OTP is **not** sent by SMS and **never** returned in the response — it is written to
`apps/api/storage/logs/otp-dev.log`.

---

## 2. What is where

```
fatanpur-bazaar/
├── apps/
│   ├── api/      NestJS 11 · Knex + mysql2 · Socket.IO · cron/queue in the same process
│   ├── web/      Next.js 15 App Router · SSR + ISR · BFF auth (httpOnly cookies)
│   └── mobile/   React Native · one app, role-based navigation
├── packages/
│   ├── shared-types/   enums, 34 permissions, order state machine, API contracts, error catalog
│   └── config/         shared tsconfig + eslint policy rules
├── docs/         the locked specs (architecture, RBAC, security, tracking, API, schema.sql …)
└── .github/workflows/deploy.yml
```

**One rule that keeps the three apps honest:** every status, role, permission and API shape lives in
`packages/shared-types`. Change a status in the backend and the frontend stops compiling — a compile
error instead of a runtime bug.

### API layout

```
src/
├── common/      guards · decorators · interceptors · filters · utils (money, geo, unsigned, hash…)
├── config/      Zod env validation — wrong env ⇒ the app refuses to start
├── database/    migrations (001_init.sql = the real schema) · seeds · knex provider (pool 2–8)
└── modules/     auth users staff permissions catalog inventory cart orders payments delivery
                 tracking services prescriptions notifications coupons referrals reviews wallet
                 content admin audit jobs service-area
```

Modules inject other modules' **services**, never their repositories.

---

## 3. Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev:api` / `npm run dev:web` | watch mode |
| `npm run lint` | eslint + `tsc --noEmit` in every workspace |
| `npm test` | shared-types tests + API unit tests + API integration tests (needs a DB) |
| `npm run test:unit` | pure unit tests only (no DB needed) |
| `npm run test:e2e` | Playwright E2E against a running web+API |
| `npm run db:migrate` | run `001_init.sql` + later migrations. **In development you rarely need it — `dev:api` applies pending migrations itself** (see below); in production it is a deliberate deploy step |
| `npm run db:seed` | catalog, villages, content (idempotent). `-- --demo` adds demo users/orders |
| `npm run seed:admin -- --phone=… --name=…` | first ADMIN only; refuses if one exists |
| `npm run check:no-spread` | fails the build if `...dto` sneaks into auth/users/staff |
| `node apps/api/dist/cli.js cron` | the single cron entry (see §5) |

---

## 4. Testing

```bash
npm run test:unit          # geo, money, coupons, pricing, state machine, permissions, seeds …
npm test                   # + integration (AUTH, RBAC, ORD incl. concurrency, PAY, TRK, RX, JOB)
npm run test:e2e           # Playwright: guest → cart → OTP login → COD order → admin → rider
```

Integration tests need a throwaway database. They truncate and re-seed between blocks, so point them
at a test DB, never at production:

```bash
DB_NAME=fb_test NODE_ENV=test npm test
```

For E2E, run the API with a fixed OTP so the test can log in:

```bash
SMS_DRIVER=null FB_TEST_OTP=123456 npm run dev:api    # then: npm run test:e2e
```

---

## 5. Production notes (Hostinger shared, measured — see `docs/HOSTING_CAPACITY.md`)

- `apps/web` builds with `output: 'standalone'` — deploy `.next/standalone`, never `node_modules`.
- `NODE_OPTIONS=--max-old-space-size=384` for the API, `--max-old-space-size=160` for the web process (measured, TEST_REPORT §8.2); **never two `next build` at once**.
- Icons live in one sprite: after adding icon data to `apps/web/src/components/icon-data.ts`, run `npm run icons --workspace=apps/web`.
- DB pool is capped at 8 per API app (2 apps × 8 = 16 < the 50-connection limit).
- No background workers. One cron entry every 5 minutes drains the `jobs` table:

```
*/5 * * * * cd ~/domains/api.example.com/public_html && node cli.js cron >> ~/logs/cron.log 2>&1
```

- Deploy is `.github/workflows/deploy.yml`: test → build API → build web (serial) → rsync → migrate →
  `touch tmp/restart.txt`. The previous release is kept as `public_html.prev` for a one-command rollback.

---

## 6. The rules this codebase will not break

1. **Public registration creates CUSTOMER only** — enforced in four layers (DB default, DTO without a
   `role` field, a literal `role: 'CUSTOMER'` in the service, and a separate `POST /admin/staff` path).
2. **The village list wins.** A customer whose village is active is served even if GPS says 6.3 km;
   bad GPS (accuracy > 500 m) never blocks anyone — it just asks for the village.
3. **Money is integer paise or DECIMAL strings.** Never a JS float.
4. **UNSIGNED counters** are decremented as `col - LEAST(col, n)` through one helper.
5. **Tokens never touch localStorage.** Web keeps them in httpOnly cookies (BFF), mobile in Keychain.
6. **Another user's resource returns 404**, not 403 — existence is not leaked.
7. **OTPs are never in a response, a production log, or an error message.**
8. Stack traces and SQL errors never reach a client; customers see a Hindi message and a reference code.

---

## 7. Documentation

| File | For whom |
| --- | --- |
| `ADMIN-GUIDE-HINDI.md` | दुकान चलाने वाले के लिए — पूरा हिंदी में |
| `NEXT-STEPS.md` | launch से पहले owner को क्या-क्या करना है |
| `ASSUMPTIONS.md` | जो कुछ मान कर बनाया गया (और क्यों) |
| `docs/` | locked specs: architecture, RBAC, security, live tracking, API, DB audit, hosting, deployment |
| `docs/TEST_REPORT.md` | test plan and current status |
