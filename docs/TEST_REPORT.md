# TEST_REPORT.md
**Fatanpur Bazaar** · v3.0 · 8 September 2026
Status: **Phase 1 (schema + capacity) — 23 test chalaye, 23 pass.**
Phase 2 (application tests) code ke saath chalega.

---

## 0. Summary

| Phase | Tests | Pass | Fail | Status |
|---|---:|---:|---:|---|
| **1. Schema & data integrity** | 14 | 14 | 0 | ✅ done |
| **2. Capacity & performance** | 9 | 9 | 0 | ✅ done |
| 3. Authentication | 12 | — | — | ⏳ code ke baad |
| 4. Authorization / RBAC | 17 | — | — | ⏳ |
| 5. Orders & inventory | 16 | — | — | ⏳ |
| 6. Payments | 9 | — | — | ⏳ |
| 7. Live tracking | 14 | — | — | ⏳ |
| 8. Security | 11 | — | — | ⏳ |
| **Total planned** | **102** | **23** | **0** | |

Do cheezein **launch se pehle** verify honi hain aur abhi tak nahi hui hain:
🔴 **T-WS** Hostinger pe WebSocket transport · 🔴 **T-SMS** OTP delivery (DLT)

---

## 1. Phase 1 — Schema & data integrity ✅

Environment: MariaDB 10.11.14, utf8mb4_unicode_ci, InnoDB.

| # | Test | Expected | Result |
|---|---|---|---|
| DB-01 | Poora `schema.sql` import | 0 errors | ✅ **54 tables** |
| DB-02 | Foreign keys bane | sab valid | ✅ **53 FK** |
| DB-03 | Permissions seed | 31 permission | ✅ 31 |
| DB-04 | Role → permission mapping | ADMIN 31, SUPERVISOR 15, DELIVERY_BOY 1 | ✅ exact |
| DB-05 | Settings seed | 50+ | ✅ 52 |
| **SEC-01** | **`INSERT users` bina role column** | **role = CUSTOMER** | ✅ **CUSTOMER** |
| **SEC-02** | **SUPERVISOR ko `staff.create` default me** | **nahi milna chahiye** | ✅ `from_role=0, from_override=0` |
| SEC-03 | ADMIN ne `staff.create` grant kiya | milna chahiye | ✅ `granted=1` |
| DB-06 | Service order + booking (slot + completion OTP) | row bane | ✅ |
| DB-07 | Tracking session + sparse breadcrumbs | ping_count 12, persisted 2 | ✅ (70% write bachat) |
| DB-08 | Stale detection query (`>90s` = stale) | flag sahi | ✅ |
| **DB-09** | **Rider reject → dobara assign** | **dusra assignment bane** | ✅ 2 assignments (UNIQUE index hataya tha) |
| DB-10 | Hindi search — `alu*` FULLTEXT | "आलू" mile | ✅ (v2 me verify, v3 me same index) |
| DB-11 | Haversine SQL — Fatanpur→Raniganj | ~2.5 km | ✅ 2.56 km |

### ⚠️ DB-12 — UNSIGNED decrement (ye test ek asli bug se bacha raha hai)

```sql
UPDATE products SET sold_count = sold_count - 5;                    -- ❌ ERROR 1690
UPDATE products SET sold_count = GREATEST(0, sold_count - 5);       -- ❌ ERROR 1690 (bhi!)
UPDATE products SET sold_count = sold_count - LEAST(sold_count, 5); -- ✅ 0
UPDATE products SET sold_count = GREATEST(0, CAST(sold_count AS SIGNED) - 5); -- ✅ 0
```
| Pattern | Result |
|---|---|
| Seedha `col - n` | ✅ Fail hua (jaisa expected) |
| `GREATEST(0, col - n)` | ✅ **Ye bhi fail hua** — subtraction pehle evaluate hoti hai |
| `col - LEAST(col, n)` | ✅ Pass |
| `GREATEST(0, CAST(col AS SIGNED) - n)` | ✅ Pass |

> **Kyun important hai:** agar galat pattern likha gaya to **har order cancellation ka
> poora transaction fail hoga** — stock wapas nahi aayega, refund nahi hoga.
> Codebase me ek hi helper hoga: `decrementUnsigned()`.

---

## 2. Phase 2 — Capacity & performance ✅

Environment: Node 22.22, Next.js 15 (28 routes, `output:'standalone'`),
API process = Nest core + Express + Socket.IO + Knex + mysql2 + Helmet + Zod, MySQL se juda.

### 2.1 Memory

| # | Test | Result | Verdict |
|---|---|---:|---|
| CAP-01 | Next.js standalone — idle RSS | **110 MB** | ✅ |
| CAP-02 | Next.js standalone — 300 request ke baad | **120 MB** | ✅ leak nahi |
| CAP-03 | API process — idle RSS | **100 MB** | ✅ |
| CAP-04 | API — 500 request ke baad | **101.5 MB** | ✅ |
| CAP-05 | **API + 100 live WebSocket** | **103.6 MB (+2.1 MB)** | ✅ **~21 KB/socket** |
| CAP-06 | **`next build` peak (poora process tree)** | **849 MB**, 31 s | ⚠️ **bottleneck B1** |

### 2.2 Latency

| # | Target | Conc | p50 | p95 | max | Verdict |
|---|---|---:|---:|---:|---:|---|
| CAP-07 | Next.js pages | 10 | 9.0 ms | 22.9 ms | 23.6 ms | ✅ |
| CAP-07 | Next.js pages | 25 | 17.3 ms | 47.1 ms | 51.3 ms | ✅ |
| CAP-07 | Next.js pages | **50** | 27.9 ms | **65.8 ms** | 74.0 ms | ✅ |
| CAP-08 | API JSON + DB | 10 | 6.7 ms | 21.1 ms | 21.3 ms | ✅ |
| CAP-08 | API JSON + DB | **50** | 25.6 ms | **45.8 ms** | 53.1 ms | ✅ |

> Aapka asli peak ~10–15 concurrent hai. **50 concurrent pe bhi p95 66 ms** —
> zaroorat se 3–5 guna headroom already demonstrate ho chuka.

### 2.3 Disk / inodes

| # | Cheez | Size | Files | Verdict |
|---|---|---:|---:|---|
| CAP-09 | API `node_modules` (prod) | 46 MB | 6,923 | ✅ |
| CAP-09 | Web `node_modules` (dev) | 337 MB | 8,917 | (deploy nahi hota) |
| CAP-09 | Web `.next/standalone` (**deploy hota hai**) | 56 MB | **2,096** | ✅ 4× kam |

Do apps ka deployed footprint: **~18,000 inodes / 600,000 = 3%**. Bilkul theek.

### 2.4 Capacity verdict

| Scenario | RAM | Verdict |
|---|---:|---|
| Steady state (4 Node + MySQL + PHP + OS) | ~1,100 MB / 3,072 | ✅ 36% |
| Ek app build ho raha hai | ~1,950 MB | ✅ 64% |
| **Dono apps ek saath build** | **~2,800 MB** | 🚨 **91% — mat karna** |

**Final:** ✅ Dono apps surakshit chal sakti hain, **is shart pe ki build server pe na ho
(ya kabhi ek saath na ho)**. Poori math: `HOSTING_CAPACITY.md` §4.

---

## 3. Phase 3–8 — planned tests (code ke saath)

### 3.1 Authentication (12)
```
AUTH-01  Naya number → OTP → CUSTOMER account bana
AUTH-02  🔒 Registration me role:"ADMIN" bheja → role phir bhi CUSTOMER
AUTH-03  🔒 ?role=ADMIN query param → ignore
AUTH-04  Galat OTP → attempts ginti, 3 pe OTP consume
AUTH-05  Expire OTP → reject
AUTH-06  OTP brute force → 5 attempt pe 429 + Retry-After
AUTH-07  Resend cooldown 60 s enforce
AUTH-08  OTP kabhi response/log me nahi (grep se verify)
AUTH-09  Staff login (account maujood) → sahi dashboard
AUTH-10  🔒 Anjaan number staff login → staff account NAHI banta
AUTH-11  Refresh rotation: purana refresh dobara → poori chain revoke
AUTH-12  Disabled user ka valid access token → turant 403 (DB check)
```

### 3.2 Authorization (17) — `ROLE_PERMISSION_MATRIX.md` §9
```
RBAC-01..17  CUSTOMER→admin, CUSTOMER→dusre ka order (404), DELIVERY_BOY→staff API,
             DELIVERY_BOY→dusre rider ka assignment, SUPERVISOR→staff.create (403),
             SUPERVISOR+grant→200, SUPERVISOR→settings (403 grant ke baad bhi),
             token tampering→401, DB role downgrade→turant 403,
             ownership: address/cart/wallet/prescription
```

### 3.3 Orders & inventory (16)
```
ORD-01  COD order end-to-end: stock ghata, snapshot bana, payment row bana
ORD-02  🔒 Idempotency: same key 2 baar → ek hi order
ORD-03  Cancel → stock wapas, wallet refund, coupon usage rollback
ORD-04  🔒 Concurrent: stock=1, 2 order → exactly 1 pass
ORD-05  🔒 Concurrent: stock=10, 10 order qty=1 → 10 pass, stock=0, oversell nahi
ORD-06  Insufficient stock → saaf error, kuch bhi partially commit nahi
ORD-07  Out of service area → 422
ORD-08  Min order → 422
ORD-09  COD limit (unverified phone) → 422; delivered ke baad limit hat jaati hai
ORD-10  Invalid state transition (DELIVERED→PREPARING) → 409
ORD-11  Rider reject → order READY_FOR_PICKUP, dobara assign hota hai
ORD-12  Adjustment (taul): qty kam → stock wapas, total kam, refund
ORD-13  Adjustment: qty badhane ki koshish → error
ORD-14  Prescription gate: bina approval CONFIRMED nahi
ORD-15  Rx reject → order cancel + refund + stock restore
ORD-16  Service order: slot booking → technician assign → completion OTP → COMPLETED
```

### 3.4 Payments (9)
```
PAY-01  COD: delivery OTP verify pe hi PAID
PAY-02  UPI claim → AWAITING_VERIFICATION
PAY-03  🔒 Duplicate UTR → 409
PAY-04  🔒 SUPERVISOR verify karne ki koshish → 403 (sirf ADMIN)
PAY-05  ADMIN verify → PAID + customer notify
PAY-06  🔒 Prepaid order bina PAID → PICKED_UP block
PAY-07  AWAITING_VERIFICATION order cancel → REFUND_PENDING queue me
PAY-08  🔒 Client se paid:true → ignore
PAY-09  Webhook: duplicate event → ek hi baar process (webhook_events)
```

### 3.5 Live tracking (14) — `LIVE_TRACKING.md` §10
```
TRK-01..14  online, stale(90s), reconnect+snapshot, GPS unavailable, background,
            complete→stop, cancel→stop, 🔒 dusre order ka room, 🔒 dusre rider ki location,
            🔒 bina token connect, duplicate ts, <100m → DB write nahi, auto-close 120 min,
            WS block → polling fallback
```

### 3.6 Security (11)
```
SEC-10  SQL injection (10 payload) → sab parameterised
SEC-11  XSS stored (product name, review) → escaped
SEC-12  🔒 Prescription bina token → 403; expired token → 403; dusre user ka → 403
SEC-13  Upload: .php rename to .jpg → mime check pe reject
SEC-14  Upload: 10 MB file → 413
SEC-15  Rate limits sach me lagte hain (OTP, order, api)
SEC-16  Security headers maujood (curl -I)
SEC-17  Error response me stack trace nahi
SEC-18  CORS: unknown origin → block
SEC-19  Mass assignment: extra fields DTO se gir jaate hain
SEC-20  🔒 Aakhri ADMIN disable karne ki koshish → block
```

### 3.7 Load test (realistic, §33)
```
LOAD-01  200 visitors/day pattern (peak 15 concurrent) → p95 < 300 ms
LOAD-02  100 orders/day burst (10 order 1 min me) → koi fail nahi, stock sahi
LOAD-03  4 rider + 10 customer tracking, 30 min → memory stable
LOAD-04  Cron chalte waqt normal traffic → koi timeout nahi
```
⚠️ Millions of users ka test **nahi** kar rahe (instruction §33) — realistic scale hi test hoga.

---

## 4. Pending verifications (launch blockers)

| ID | Kya | Kaise | Kaun | Status |
|---|---|---|---|---|
| **T-WS** | Hostinger pe WebSocket chalta hai ya nahi | `HOSTING_CAPACITY.md` §6 ka script | deploy ke baad | 🔴 pending |
| **T-SMS** | OTP sach me pahunchta hai | DLT + provider + 5 real numbers pe test | DLT approval ke baad | 🔴 pending |
| T-PHP | Purani PHP site ka asli RAM | SSH: `ps aux --sort=-rss \| head -20` | kabhi bhi | 🟡 pending |
| T-RESTORE | Backup restore hota hai | Ek dump ko khali DB me restore | launch se pehle | 🟡 pending |

---

## 5. Reproduce karne ke commands

```bash
# Schema tests
mysql -e "DROP DATABASE IF EXISTS fb3; CREATE DATABASE fb3 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql fb3 < schema.sql
mysql fb3 -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='fb3';"   # 54
mysql fb3 -e "INSERT INTO users (phone,referral_code) VALUES ('919000000010','REF00010');
              SELECT role FROM users WHERE phone='919000000010';"                          # CUSTOMER

# Capacity
./peaktree.sh npx next build          # PEAK_TREE_RSS_MB=849
node loadtest.js                      # p50/p95 table
node socktest.js 100                  # +2.1 MB

# Application tests (code aane ke baad)
npm run test --workspace=apps/api           # unit + integration
npm run test:e2e --workspace=apps/api       # RBAC + orders + payments
npm run test:security                       # SEC-10..20
```

---

## 6. Integration suite — how to run

`apps/api/test/integration/` me ab 6 spec file hain jo `node:test` + real `AppModule`
(`test/helpers/app.ts` ke `createTestApp()` se boot) + ek real MySQL/MariaDB test DB
(`test/helpers/db.ts` — migrate once, `resetDb()` har test se pehle) ke against likhe gaye
hain. Koi mocking nahi — guards, interceptors, Knex transactions, Socket.IO gateway sab asli
chalte hain.

**Chalane ka tarika** (`apps/api/` se):
```bash
npm run test:int
```
Ye `tsc -p tsconfig.spec.json` → `scripts/copy-assets.mjs` → `node --test --test-concurrency=1
dist-spec/test/integration/*.spec.js` chalata hai. Ek test DB chahiye (`.env.test` ya env vars
se `DB_*`) — `test/helpers/env.ts` baaki sab (`JWT_SECRET` etc.) ke liye safe defaults khud bhar
deta hai.

⚠️ **Is sandbox me ye suite chalayi nahi ja saki** — no network, node_modules install nahi
the, MySQL/MariaDB install nahi tha. Har file bahut dhyan se asli `src/` source (method names,
column names, error codes, response shapes) padh kar likhi gayi hai, par CI / owner ki machine
pe pehli baar chalne par kuch chhote fixes lag sakte hain.

| File | Test-ID tags covered | Count |
|---|---|---:|
| `auth.spec.ts` | SEC (role-injection, enumeration) + AUTH (refresh rotation) | 7 |
| `rbac.spec.ts` | RBAC-01..17 (poora `ROLE_PERMISSION_MATRIX.md` §9 matrix) | 17 |
| `orders.spec.ts` | ORD-01..16 (placement, idempotency, concurrency, state machine, adjustment, rx-gate, service booking) | 14 |
| `payments.spec.ts` | PAY-01..09 (UPI claim, duplicate UTR, verify permission, prepaid-pickup gate, refund-pending, gateway webhook HMAC + idempotency) | 7 |
| `tracking.spec.ts` | TRK-01..14 (auth, room isolation, dedupe, persist-threshold, snapshot, session end) via `socket.io-client` | 7 |
| `misc.spec.ts` | RX (signed-URL access control) + JOB (A26 backoff/retry) | 6 |
| **Total** | | **58** |

Pass/fail numbers yahan **jaanbujh kar nahi likhe gaye** — ye suite abhi tak kisi bhi machine
pe chalayi nahi gayi hai. Jab CI ya koi developer pehli baar chalaye, is section ke upar asli
`N passed / N failed` numbers ke saath ek Phase-3+ status table jodi jaani chahiye (Section 0
ke format me).

---

## 7. Build run — 12 September 2026 (asli numbers)

Ye section us run ka hai jisme poora monorepo likha gaya (P1–P14). Jo **sach me chala** wahi likha hai.

### 7.1 Jo chala aur pass hua ✅

| Suite | Command | Result |
|---|---|---:|
| shared-types (enums, order state machine, permissions, schema-sync) | `npm test --workspace=packages/shared-types` | **20 passed, 0 failed** |
| API unit (geo GEO-01..21, money, unsigned, coupon ×8, pricing, adjustment, permissions, jobs backoff, slots, ratings, referral, search, translit, ids, phone, token, time, mime sniff, sanitizer, zone validation, seed data) | `npm run test:unit --workspace=apps/api` | **71 passed, 0 failed** |
| **Total unit** | | **91 passed, 0 failed** |

Static checks (khud likhe gaye scripts se, poore repo par):

| Check | Scope | Result |
|---|---|---:|
| TypeScript **syntax** parse (`ts.createSourceFile`) | 323 files (api 145 · web 115 · mobile 57 · shared-types 6) | **0 errors** |
| Import resolution + named-export existence | apps/web, apps/api, apps/mobile | **0 unresolved** (api me 16 false positives: `export type { … }` form) |
| i18n key coverage — har `t.x.y` jo code me use hua | 295 keys | **hi/en dono me maujood, 0 missing, 0 extra** |
| `check:no-spread` (auth/users/staff me `...dto` ban) | script maujood, CI me chalti hai | — (npm install ke bina execute nahi hui) |

### 7.2 Jo is sandbox me **chal hi nahi saka** ⚠️

Iss environment me **npm registry aur apt dono organization policy se blocked the (403)** aur
MySQL/MariaDB install nahi tha. Isliye:

| Nahi chala | Kyun | Kab chalega |
|---|---|---|
| `npm install` | registry 403 | owner ki machine / CI — **sabse pehla kaam** |
| `tsc --noEmit`, `eslint` | node_modules nahi | `npm run lint` |
| `npm run test:int` (58 integration tests) | koi DB nahi | `DB_NAME=fb_test npm test` |
| `next build` + Lighthouse + performance budget (§13) | Next install nahi hua | `npm run build` ke baad measure |
| Playwright E2E + smoke (`apps/web/e2e/`) | browser + server nahi | `npm run test:e2e` |
| 100 concurrent socket memory test | server nahi chala | staging pe |
| Hostinger pe WebSocket transport (T-WS), SMS/DLT (T-SMS) | infra chahiye | NEXT-STEPS §3, §8 |

⚠️ **Isliye performance budget table (§13 of the build prompt) me abhi tak koi measured number nahi
bhara gaya hai.** Jo bhi number waha likha jayega wo `next build` + Lighthouse ke asli output se aana
chahiye — anuman se nahi.

### 7.3 Test inventory (jo likhe ja chuke hain)

| Layer | Files | Tests |
|---|---|---:|
| shared-types unit | 3 | 20 |
| API unit | 7 | 71 |
| API integration | 6 | 58 |
| Web E2E + smoke (Playwright) | 2 | 13 |
| **Total** | **18** | **162** |

---

## 8. Redesign run — 23 Sep 2026 (asli numbers, sandbox: Node 22, MariaDB 10.11)

Is baar sab kuch **sach me chala** (npm mirror + MariaDB install ho gaye). §7.2 ki "nahi chala" wali list ab purani hai.

### 8.1 Tests

| Suite | Command | Result |
|---|---|---|
| shared-types unit | `npm run test --workspace=packages/shared-types` | **23 / 23 pass** |
| API unit (incl. naya `sanitize.spec.ts`, 5 XSS cases) | `npm run test:unit --workspace=apps/api` | **76 / 76 pass** |
| API integration (real Nest app + MariaDB `fb_test`) | `npm run test:int --workspace=apps/api` | **64 / 64 pass** |
| Lint + typecheck (api + web + shared) | `npm run lint` | **0 errors, 0 warnings** |
| Production build | `npm run build` | **pass** |
| UI E2E (Playwright, real browser): guest → खरीदें → मात्रा → "बस इतना ही" → OTP login → checkout (COD) → order page timer → Admin: Preparing → Ready → Assign → Rider: Accept → Picked up → OTP → Completed → customer sees "सफलतापूर्वक डिलीवर हो गया" → bill page | scratch script | **pass**, 0 console errors |
| 320 px / 390 px horizontal scroll | screenshots (home, category, product, blog, area, faq, login, checkout, order) | `scrollWidth == viewport` har page pe |

Integration suite me is run me jo theek kiya: test helpers migrations ab multi-statement connection se chalate
hain; assign se pehle order ko `READY_FOR_PICKUP` tak le jaate hain (state machine ka asli niyam); dev-OTP log
10-digit number padhta hai; naye RBAC tests (supervisor sirf rider bana sake; admin ka DENY rider-manager
mita na sake; customer ko supervisor promote na kar sake); tracking: bina rider wale order par socket connect
se API crash na ho (asli bug mila aur fix hua — `TrackingService.snapshot`).

### 8.2 Performance budget (§13) — measured

| Metric | Target | Hard fail | Measured | |
|---|---|---|---|---|
| Homepage HTML (gzip) | ≤ 35 KB | 50 KB | **40.3 KB** (14 categories × 8 items) | ⚠️ between target and hard-fail |
| First Load JS (homepage) | ≤ 110 KB | 150 KB | **128 KB** (shared 102 KB) | ⚠️ |
| CSS (gzip) | ≤ 20 KB | 30 KB | **10.7 KB** | ✅ |
| Category page HTML (gzip) | — | — | 22.7 KB | |
| Product page HTML (gzip) | — | — | 15.9 KB | |
| API p95, 50 concurrent (home/products/search/villages mix, 500 req) | ≤ 150 ms | 400 ms | **p50 19 ms, p95 176 ms** (sandbox) | ⚠️ |
| API process RSS | ≤ 150 MB | 250 MB | **117 MB** after load | ✅ |
| Next.js process RSS | ≤ 150 MB | 250 MB | **~180 MB** steady, ~225 MB under 20 concurrent home renders (with `--max-old-space-size=160`) | ⚠️ |
| Icon sprite | — | — | 28.9 KB once, cached 1 year | |

Ye numbers sandbox ke hain (shared CPU); Hostinger pe dobara naapein. Home page ko aur halka karna ho to
agla kadam: public pages ko ISR (static) banana — iske liye bhasha URL me (`/en/...`) le jaani hogi.

### 8.3 Security review (redesign)

Alag review agent ne naya code padha. Mila aur **theek kiya**: (High) `sanitizeHtml` me adhure tag se stored XSS
→ tokeniser se dobara likha + purane rows `seed` me dobara saaf; (Med) rider-manager admin ke permission
overrides mita sakta tha → sirf rider-safe rows badalte hain + "jo tumhare paas nahi wo de nahi sakte";
(Med) web pe CSP / security headers nahi the → `next.config.js` me CSP, XFO, nosniff, Referrer, Permissions,
HSTS; (Low) supervisor customer ko rider bana sakta tha → band; (Low) `/api/prefs` CSRF → header check;
(Low) `?next=` array se 500 → theek; (Low) `@RequireAnyPermission` ab class-level permission ke *saath* lagta hai.

---

## 9. Second redesign round — 23 Sep 2026 (categories, address rules, plain background)

| Suite | Result |
|---|---|
| shared-types unit | **23 / 23 pass** |
| API unit | **76 / 76 pass** |
| API integration (real Nest app + MariaDB) | **64 / 64 pass** |
| `npm run lint` (api + web + shared) | **0 errors, 0 warnings** |
| `next build` | **pass** |
| Browser check (Playwright, 390 px): home, category, medicine list, prescription detail, birthday, seeds, video-consultation, address form save | pass, no console errors, no horizontal scroll |

Measured after the change (20 categories, 4 items each on the home page):

| Metric | Target | Hard fail | Measured |
|---|---|---|---|
| Homepage HTML (gzip) | ≤ 35 KB | 50 KB | **42.1 KB** |
| Category page HTML (gzip) | — | — | kirana 24.3 KB · dawai 25.7 KB · birthday 19.6 KB |
| First Load JS (homepage) | ≤ 110 KB | 150 KB | **129 KB** |
| CSS (gzip) | ≤ 20 KB | 30 KB | **10.6 KB** |

Data seeded: 5 new root categories (birthday, patakha, pashu-doctor, beej-bhandar, doctor-consult),
10 new suppliers with a mediator note, 176 new items/services — 38 medicines (9 prescription-only),
31 seeds/fertilisers, 23 fireworks & Diwali goods (11 flagged regulated), 20 birthday items,
28 health tests, 8 vet visits, 6 video consultations, 9 hire vehicles, and more fast food and sweets.
Re-running `cli.js seed` adds 0 of everything.

---

## 10. Third round — 26 Sep 2026 (global admin, footer, Cashfree, first-screen density)

Sandbox: Node 22, MariaDB 10.11, Chromium 1194. Servers rebuilt and restarted before every
measurement — a screenshot taken straight after a restart is not proof that the new build is what
answered.

| Suite | Result |
|---|---|
| API unit (`npm run test:unit`) | **121 / 121 pass** |
| API integration, real Nest app + MariaDB (`npm run test:int`) | **79 / 79 pass** |
| Feature harness part 1 — public, auth, RBAC, address, cart, quote | **46 / 46 pass** |
| Feature harness part 2 — order lifecycle, delivery, COD, review | **35 / 35 pass** |
| Feature harness part 3 — UPI, cancel, adjustment, Rx, services, tracking | **28 / 28 pass** |
| Feature harness part 4 — admin catalog, zones, villages, staff, settings, content | **53 / 53 pass** |
| Resilience (API down, slow DB, bad payloads) | **7 / 7 pass** |
| axe-core WCAG 2.1 A/AA — 12 pages × 2 widths | **0 violating nodes** |
| Horizontal overflow at 320 / 360 / 390 / 768 / 1280 | **none** |
| SEO sweep — 15 pages, sitemap, robots, JSON-LD | **0 warnings**, 417 sitemap URLs, no private path leaked |
| `npm run lint` (api + web + shared) | **0 errors** (5 pre-existing warnings in test files) |
| `next build` / `tsc --noEmit` | **pass** |

New tests written this round (27 unit + 13 integration):

- `test/unit/global-admin.spec.ts` — the owner bypasses everything; a scoped admin with no grants
  holds nothing; `role_permissions` (seeded with every code for ADMIN) cannot leak in; a deny beats
  a grant; `settings.manage` is grantable to a second ADMIN but never to a SUPERVISOR; a stale flag
  on a downgraded row grants no bypass.
- `test/unit/secretbox.spec.ts` — a sealed gateway key is not readable in a database dump; the same
  value seals differently each time; a wrong `APP_SECRET` returns null rather than rubbish; a
  tampered ciphertext fails the auth tag; a hand-pasted plain key still works. Plus the Cashfree
  webhook signature: the timestamp is part of what is signed, it is computed on the raw body, a
  replay an hour old is refused, and ₹245.50 reads as 24550 paise.
- `test/integration/global-admin.spec.ts` — through real HTTP: a scoped admin is refused
  `/admin/settings` and granted it the moment the owner ticks it; he cannot appoint an admin even
  holding `staff.create`; he cannot disable the owner or revoke his sessions; nobody can disable the
  owner, himself included; a gateway secret is never readable through the API, is stored encrypted,
  and saving the mask back does not wipe it.

Three earlier assertions were updated rather than worked around, because the rule they described
genuinely changed: disabling or demoting the owner is now refused outright (403) instead of being
caught by the "last active admin" row count (409). The count still applies, and is now exercised on
a scoped admin. The end state asserted is the same one that matters: the account stays ACTIVE.

### Performance budget (measured, home page with 20 categories)

| Metric | Target | Hard fail | Measured |
|---|---|---|---|
| Homepage HTML (gzip) | ≤ 35 KB | 50 KB | **46.0 KB** ⚠️ over target, under hard fail |
| Category page HTML (gzip) | — | — | kirana 27.0 KB · dawai 28.5 KB · birthday 21.6 KB |
| First Load JS (homepage) | ≤ 110 KB | 150 KB | **132 KB** ⚠️ over target, under hard fail |
| CSS (gzip) | ≤ 20 KB | 30 KB | **11.2 KB** ✅ |
| First-paint images (390 px) | — | — | 7 requests, 150 KB |

⚠️ **The homepage HTML target is still not met, and it is worth being plain about why.** Twenty
root categories on one page is the owner's own layout decision, and each one costs markup. Going
from four items per category to six — needed so a phone lands on three columns and more than one
row — pushed the page from 42 KB to **55 KB**, past the hard fail. Two changes brought it back to
46 KB without touching what the customer lands on:

1. Six items in the first row, four in every row below it (`homeSections(lang, 6, 4)`). Each row
   scrolls sideways anyway, so nothing visible on the first screen changed.
2. One Buy control per card instead of two. The card used to render a compact control for phones
   and a full-width one for wider screens, hiding whichever did not apply — identical on screen,
   and on a client component that meant a second full copy of every product's data in the
   hydration payload, for a button nobody could see.

Getting under 35 KB from here means fewer categories on the home page, which is the owner's call,
not a code change.

### First-screen density (the round's main request)

Measured on a 390 × 844 phone viewport, home page, first paint:

```
{"viewport":844,"tilesTouchingScreen":9,"tilesFullyVisible":6,"rowsOnScreen":3,"cardW":115,"cardH":197,"overflow":false}
```

Three columns, two complete rows and a third beginning — with the product name, unit, price and
struck-through MRP all legible, and no horizontal scroll at 320 px.

---

## 11. Fourth round — 26 Sep 2026 (labelled Buy button, no discount display, full rows)

The owner's three changes, and one of them moves the performance numbers, so the honest version:

| Metric | Target | Hard fail | Before | After |
|---|---|---|---|---|
| Homepage HTML (gzip) | ≤ 35 KB | 50 KB | 46.0 KB | **49.4 KB** ⚠️ |
| First-screen product tiles (390 px) | — | — | 6 visible, 3 rows | **6 visible, 2 full rows** |
| Card height (390 px) | — | — | 197 px | 238 px |

What changed and why the page grew:

1. **"खरीदें" on every card at every width.** The round "+" that phones were getting is gone. The
   owner is right about his customers: a bare plus is a convention learnt from other apps, and many
   of these people are placing their first online order. The button is 34 px tall on a phone (40 px
   from `sm` up) so three cards still fit across and two complete rows still fit down a 390 × 844
   screen. It is still rendered **once** per card — never a compact copy plus a hidden wide one.
2. **No discount ribbon, no struck-through MRP.** One price on the card: what the customer pays.
3. **Six items in every row, not six then four.** The grid is three columns on a phone and six on a
   wide screen, so six is the only count that fills both. Four left two empty columns at 1280 px,
   which reads as a shop that has run out. Category grids went `3 → 4 → 5 → 6` columns for the same
   reason (24 a page divides by three, four and six).

Changes (2) and (3) pull in opposite directions: six-everywhere costs about 6 KB gzipped across
twenty categories, and dropping the ribbon and MRP gave about 3 KB back. The rest came from taking
the product name **out of the placeholder tile** — it was printed inside the tile in Hindi, again
underneath in Latin, and a third time in bold in the card body immediately below. The card body's
copy is the one that matters; the other two were kilobytes spent saying the same word twice, half
an inch higher up. The tile on a product page keeps its label, because there the picture is the page.

⚠️ **49.4 KB leaves only 600 bytes before the hard fail.** What costs it is twenty root categories
× six products on one page, and that is the owner's own layout. The remaining levers are his:
fewer categories above the fold, or a "और दिखाएँ" button that loads the lower rows on demand.

### Suites after the change

unit **121/121** · integration **79/79** · feature harness 46 + 35 + 28 + 53 · resilience **7/7** ·
axe-core **0 violating nodes** (12 pages × 2 widths) · no horizontal overflow at 320–1280 px ·
SEO 15 pages, 0 warnings · lint 0 errors · `next build` + `tsc --noEmit` pass.

⚠️ Running all five feature harnesses back to back trips the shared per-IP OTP limit
(`otp:send:ip` — 10 per 15 minutes) and the next suite fails with 429s that look like real
breakage. Restart the API (the limiter also keeps an in-process copy, so clearing the
`rate_limits` table alone is not enough) and run the suite again.

### Also in this round

- **Login options relabelled** to the owner's words: "स्टाफ़ के रूप में लॉगिन करें" /
  "ग्राहक के रूप में लॉगिन करें". ⚠️ The question is still asked **after** the OTP, never before.
  Deciding from the phone number alone would answer a question no stranger should be able to ask
  the shop — type a number, see whether the staff option appears, and you have learnt who works
  here. A2 requires the send and verify replies to be identical for a known and an unknown number
  for exactly this reason.
- **The green "add a new address" button is gone** from the header's address sheet. The village
  list below it already ends in "मेरा गाँव इसमें नहीं है", and the full address — house, landmark,
  phone — is collected at checkout where it is actually needed. Saved addresses are still managed
  from Profile → मेरे पते. The empty white band that the removal left above the list for a
  signed-out visitor is gone too.

---

## 12. Fifth round — 26 Sep 2026 (compact card, thin chrome, image limits, full workflow)

### The whole shop, walked once, as the four people who use it

`/tmp/e2e/flow.mjs` — a new harness that is not a unit test. It walks the path an order actually
takes, in order, through the real HTTP API, and asserts outcomes rather than status codes: is the
rider's phone buzzing, does the job appear on his list, does the stock go down, does the cash land
on the right ledger.

**70 checks, 70 pass.** In order:

1. A brand-new number signs up by OTP → created as CUSTOMER, never staff; signing in again reuses
   the same account rather than making a second one.
2. Owner (8576891104) signs in → `isGlobalAdmin: true`, all 35 permissions, sent to `/admin`.
3. Second admin (9616038670) signs in → `isGlobalAdmin: false`, a subset of permissions, and
   **refused** `/admin/settings`.
4. Delivery partner (9889353665) signs in → sent to `/delivery`, and **refused** both
   `/admin/staff` and `/admin/orders`.
5. Customer saves an address inside the 6 km zone, adds two of an in-stock item, gets a server-side
   quote with a real ETA, and a seeded coupon takes money off while a made-up code is refused in
   Hindi.
6. He places a COD order → CONFIRMED immediately, order number `FB-YYYYMMDD-NNNN`, stock down by
   exactly two, bag emptied, shop notified.
7. Owner sees it on his list, opens it, gets a map link to the customer's pin, marks it packing and
   then ready.
8. Owner assigns the rider → **the rider is notified on his phone**, the job appears on his list
   with the customer's name, phone, house, landmark, what is in the bag, how much cash to collect,
   what he earns, and a **navigation** link (`/maps/dir/`, not a pin).
9. ⚠️ The rider is **not** told the four-digit code — the customer is the only one who can see it.
10. Rider accepts, marks picked up (customer notified), tries a wrong code → refused with the
    tries-remaining message; the right code completes it.
11. Order DELIVERED and PAID, the code is destroyed so it can never be replayed, the cash is on the
    rider's COD ledger, his earning is credited to his wallet, the customer is notified, and his
    phone is marked verified so the first-order COD limit stops applying.
12. Owner settles the cash → the rider's `cod_in_hand` goes to zero while his earnings wallet is
    untouched (that money was never credited there — A17).
13. Customer reviews what he bought; a second review of the same thing is refused 409.
14. Referral: a friend signs up with his code, the link is recorded, and ⚠️ **nothing is paid out**
    until the friend's own first order is actually delivered and paid.

Four things the harness itself got wrong on the first run were fixed in the harness, not the code,
because the API was right each time: the address needs `lat`/`lng` (not `latitude`/`longitude`),
the quote needs its `items`, the idempotency key must be a UUID, and the status route is `PATCH`.

### Image upload limits (`IMAGE_RULES` in shared-types)

| | max file | dimensions | shape |
|---|---|---|---|
| Product | 3 MB | 600×600 – 2500×2500 | square ±8% |
| Category | 3 MB | 600×600 – 2500×2500 | square ±8% |
| Banner | 4 MB | 1200×400 – 3600×1200 | 3:1 ±12% |

Checked in the **browser before the file is uploaded** — a raw 12-megapixel phone photo is refused
in milliseconds instead of after a minute of 3G — and again on the **server**, which is the check
that counts, since anyone can post straight to the endpoint. Every message says what is wrong and
what to do about it. 9 unit tests (`test/unit/image-rules.spec.ts`), including one that proves each
rule's own minimum passes its own shape test — a rule nobody can satisfy is worse than no rule.

### UI

- Product card: name and price on **one row**, price hard right, unit and supplier on the next.
  Card height 238 px → **226 px**, so the picture keeps more of the card than the text does.
- Footer: one line, smallest type on the site, the e-mail as the link behind the words. Not sticky
  — it appears when someone reaches the bottom.
- Sticky strip: **41 px**, call-to-order with the number, an app button, and a close. ⚠️ Not
  `leading-none` — Devanagari hangs matras above and below the line, and at line-height 1 the strip
  cropped them ("कॉल करके" came out as "काल करक").

### Suites

lint 0 errors · unit **130/130** · integration **79/79** · workflow **70/70** · feature harness
46 + 35 + 28 + 53 · resilience **7/7** · axe-core **0 violating nodes** (12 pages × 2 widths) · no
horizontal overflow 320–1280 px · SEO 15 pages 0 warnings · home HTML **48.7 KB** gzip.

⚠️ Two false alarms during this sweep, both caused by a server being down rather than by the code,
and both worth writing down because they look exactly like real bugs:
- "the website returns no security headers" — the web server had stopped. With it running, CSP,
  X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy are all present.
- "eight pages have no `<title>`" — the API had stopped, so `generateMetadata` had nothing to build
  a title from and the pages rendered an error shell. With the API up, every title is correct.

**Always check that both servers answer before believing a sweep.**

### AI footprint

`grep -riE "claude|anthropic|chatgpt|openai|copilot|gpt-[0-9]|ai-generated"` across every `.ts`,
`.tsx`, `.css`, `.sql`, `.json`, `.js` and `.yml` in the repo, plus the built `.next` bundle:
**nothing**. The only matches anywhere are in two local helper documents written for the owner —
`CATEGORY-IMAGE-PROMPT.md` (how to generate the four missing category pictures) and one line of
`NEXT-STEPS.md` about Bing Webmaster Tools. Neither is deployed or reachable from the site.

## 13. Sixth round — 1 Oct 2026 (banner strip, staff choice, money audit, edge handshake, launch kit)

### What changed, and what proves it

| Area | Change | Proof |
|---|---|---|
| Banner strip | 320×50-shaped strip above the products (6.4 : 1), first slide holds 5 s, admin on/off + seconds (`home_banner_enabled`, `home_banner_seconds`). Upload rule now 640×100 – 1920×300, 6.4 : 1 ±12 % | `banner.mjs` **13/13**; `image-rules.spec.ts` |
| First screen | rail 147 → 103 px so the strip costs nothing: **6 tiles fully visible**, 2 rows × 3 at 390×844 | `firstscreen.mjs` |
| Staff choice at login | only after OTP; staff numbers get two choices, everyone else goes straight in | `roles.mjs`, `features.mjs` |
| Delivery code | `delivery.assigned` with the code goes **only** to `user:{customer}`; rider and ops rooms get the event without it | `otpleak.mjs` **8/8** |
| Scoped admin | role change needs `staff.manage`; promoting a customer needs `staff.create`; scoped admin's status changes need the matching order permission | `global-admin.spec.ts`, `scoped-admin-transitions.spec.ts` (8) |
| Refund maths | new `payments.amount_received` (migration 017); every refund = received − already refunded, never owed − refunded | `refund-money.spec.ts` (13), `refunds.mjs` **14/14** |
| Adjustment | coupon re-worked with the original rule on the new total; wallet money the smaller order no longer needs goes back to the wallet; a PAID order's excess is credited | same |
| Double order | user row locked first in the placement transaction; the same product twice in one request refused | `orders.spec.ts` |
| ₹0 order placed as UPI | settled at once as WALLET/PAID/CONFIRMED (was left in PENDING_PAYMENT for the auto-cancel) | `money-edges.spec.ts` |
| Cancelled service booking | `sold_count` taken back (services keep no stock but are ranked by it) | `money-edges.spec.ts` |
| DELIVERED → RETURNED | a PAID order goes to the refund queue (REFUND_PENDING + admin push); nothing paid automatically; partial refund allowed, more than held refused | `money-edges.spec.ts` |
| Edge handshake | website ↔ API share `EDGE_SECRET`; API rate-limits each shopper by his own address, forged headers ignored | `edge.mjs` **6/6** |
| Session | parallel-tab refresh → 409 `REFRESH_RACE`, never logs out; replay after 20 s → whole chain revoked; BFF blocks traversal, 2 MB body → 413 | `session.mjs` **12/12**, `features.mjs` |
| Web lows | tracking socket not opened after the page was left; area FAQ JSON-LD = the 6 shown; empty bag has an `<h1>`; app/public error pages + Hindi 404 | a11y, seo |
| Launch kit | `scripts/make-release.mjs` → `release/fatanpur-api.zip` (shared-types vendored as `file:`) + `release/fatanpur-web.zip` (flat standalone, entry `server.js`); CI uses the same script | both zips unpacked in a clean folder and started: API `/v1/health` up, web `/`, `/cart`, CSS, robots, manifest 200 |

### Suites (all against a freshly built API + web, both servers checked up first)

lint 0 errors · unit **151/151** · integration **85/85** · `workflow` **43/43** · `flow` **70/70** ·
`money` **18/18** · `refunds` **14/14** · `edge` **6/6** · `session` **12/12** · `otpleak` **8/8** ·
`banner` **13/13** · `features` **46/46** · `orders` **35/35** · `rest` **28/28** · `adminfx` **53/53** ·
`resil` **7/7** · axe-core **0 violating nodes** (12 pages × 2 widths) · no horizontal overflow
320–1280 px · SEO 15 pages 0 warnings · home HTML **49.0 KB** gzip (hard fail 50) · first paint 10
images / 169 KB on phone.

⚠️ One harness assertion was out of date, not the code: `features.mjs` still expected an immediate
refresh-token replay to be 401. Since the parallel-tab fix it is 409 inside the 20 s window (no
tokens handed out) and 401 + full revocation after it — the harness now checks both.
