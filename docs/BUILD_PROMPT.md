# FATANPUR BAZAAR — A-to-Z BUILD PROMPT (Cowork ke liye)

**Kaise use karna hai**

1. Cowork me **nayi chat** kholo
2. Neeche `===PROMPT START===` se `===PROMPT END===` tak ka poora text copy karke paste karo
3. Usi message me **ye files attach karo**:
   - `schema.sql` (zaroori)
   - `docs/` folder ki 9 files (zaroori — inme poora design tay hai)
4. Bhejo. Ye ek continuous build hai — beech me rukega nahi.

**Bhejne se pehle 5 minute ka kaam** — prompt ke Section 1 me `<<< >>>` wale placeholders bhar do
(exact coordinates, gaon ki list, UPI ID, phone). Ye 5 minute build ko bahut behtar banate hain.

---

===PROMPT START===

# BUILD: Fatanpur Bazaar — production e-commerce + delivery platform

Tum is project ke **lead full-stack engineer** ho. Ek production-grade platform banana hai:
**ek NestJS backend + ek Next.js website + ek React Native app**, teeno ek monorepo me.

## Attached files — inhe PEHLE padho, phir kaam shuru karo

| File                        | Kya hai                                         | Authority                                                                  |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| `schema.sql`                | 54 tables, MariaDB pe test kiya hua             | **Single source of truth.** Column todna mana; nayi table add kar sakte ho |
| `FINAL_ARCHITECTURE.md`     | Stack, topology, module layout                  | **LOCKED**                                                                 |
| `ROLE_PERMISSION_MATRIX.md` | RBAC, staff lifecycle, 31 permissions           | **LOCKED — security ka core**                                              |
| `SECURITY_AUDIT.md`         | Auth, uploads, payments, secrets                | **LOCKED**                                                                 |
| `LIVE_TRACKING.md`          | Socket.IO design, location pipeline, edge cases | **LOCKED**                                                                 |
| `API_DOCUMENTATION.md`      | Har endpoint ka contract + error codes          | **LOCKED**                                                                 |
| `DATABASE_AUDIT.md`         | Schema ka reasoning + UNSIGNED gotcha           | Reference                                                                  |
| `HOSTING_CAPACITY.md`       | Naape gaye limits                               | Reference                                                                  |
| `DEPLOYMENT.md`             | Hostinger deploy + CI                           | Reference                                                                  |
| `TEST_REPORT.md`            | 102 planned tests                               | **Inhe pass karna hai**                                                    |

⚠️ In documents me jo tay ho chuka hai use **dobara design mat karo**. Agar koi cheez galat lage
to bol do aur `ASSUMPTIONS.md` me likh do — par chup-chaap badal mat dena.

---

## 0. KAAM KARNE KA TARIKA — sabse important section

1. **Ek continuous run.** Section 17 me 14 phases hain. Har phase ke baad "continue?" **mat** poochna — agle pe chale jao.
2. Har phase ke end me **khud verify karo**: `npm run lint`, `npm run build`, us phase ke tests. Fail ho to wahin fix karo, tabhi aage badho.
3. Har phase ke baad ek line ka status do: `P4 done — 18 files, 26 tests pass`.
4. Rukna sirf tab jab koi cheez sach me contradictory ho. Warna best assumption lo, `ASSUMPTIONS.md` me likho, aage badho.
5. **Sandbox me sach me chalao.** MySQL nahi hai to `apt-get update -qq && apt-get install -y -qq mariadb-server && mysqld_safe &`. Node 24 use karo. Screenshot/output dekhe bina "done" mat bolna.
6. Lambi commentary mat likho. Code likho, test karo, chalo.

---

## 1. BUSINESS — ye numbers bharo

```
Brand           Fatanpur Bazaar (फतनपुर बाज़ार)
Address         Fatanpur Bazaar, Raniganj, Pratapgarh, Uttar Pradesh — 230301
Coordinates     <<< Google Maps se exact lat,lng — abhi 25.7420, 81.9540 approximate hai >>>
Service area    **6 km** — `service_zones` table me (RADIUS ya POLYGON), admin map
                editor se badalne layak. Iske bahar wale ko saaf "sorry" (A8 dekho)
Support phone   <<< 9616038670 >>>        WhatsApp  <<< 9616038670 >>>
UPI (HDFC)      <<< 8576891104@ybl >>>   Payee name: Ashish Yadav
Villages        <<< 8–15 gaon ke naam (Hindi + English) jo 6 km me aate hain- Fhatnapu, Nathka poora, Suwansa, Udacha, Patahatiya kala, Patahatiya khurd, koyam, Kothra, Geetanagar, Gura, Ramapur, Asapur, churhati,  >>>
```

|                  |                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Visitors         | 50–100/day normal, ~200/day peak                                                                          |
| Orders           | 50–100/day max                                                                                            |
| Staff Day 1      | 1 ADMIN, 1 SUPERVISOR, 2 DELIVERY_BOY (**hard-code mat karna** — DB me kitne bhi)                         |
| Model            | **Single store** — saara saman admin list karta hai                                                       |
| Suppliers        | Product page pe "Sharma Kirana se" dikhega. **Supplier ka koi login/dashboard NAHI**                      |
| Catalog          | Sabzi · phal · kirana · dawai (license ke baad) · kheti ka saman · **services**                           |
| **Meat/chicken** | **Scope se bahar** — mat banana                                                                           |
| Payment          | **COD + UPI direct (HDFC)**. Gateway ka code ready par `gateway_enabled=0`                                |
| Users            | Gaon ke log. Android 9–13, 2–4 GB RAM, kabhi 3G, Hindi primary, kaafi log pehli baar online order karenge |

**Ye aakhri line har design decision drive karti hai.** Bhaari animation, bada bundle, complex UI — sab reject.

### Verticals (admin se on/off — `settings.vertical_X_enabled`)

Day 1 ON: `VEGETABLES`, `FRUITS`, `GROCERY`
Day 1 OFF (code banega, license ke baad ON): `PHARMACY`, `AGRI_INPUT`, `SERVICE`

Vertical OFF hai to uski har cheez site se **poori tarah gayab** — nav, home, category list, search, suggest, sitemap, JSON-LD, direct URL (404). Ye `Compliance` service ke ek hi helper se aana chahiye, har jagah copy-paste nahi.

---

## 2. ROLES — aur wo ek rule jo kabhi nahi tootna chahiye

```
CUSTOMER      → koi bhi bana sakta hai (phone + OTP)
ADMIN         → sirf CLI bootstrap ya dusra ADMIN
SUPERVISOR    → sirf ADMIN
DELIVERY_BOY  → sirf ADMIN

PUBLIC REGISTRATION = CUSTOMER ONLY. Hamesha. Bina apvaad ke.
Koi bhi apna role khud nahi badal sakta.
```

**Char layer me enforce karo** (`ROLE_PERMISSION_MATRIX.md` §0):

1. DB: `role ENUM(...) DEFAULT 'CUSTOMER'` — registration INSERT me role column likha hi nahi jaata
2. DTO: `RegisterDto` me `role` field **hai hi nahi** + `ValidationPipe({whitelist:true})`
3. Service: `role: Role.CUSTOMER` **literal**. ⚠️ `...dto` spread karna **mana hai**
4. Staff banane ka alag rasta: `POST /admin/staff` + `@Roles('ADMIN')` + `@RequirePermission('staff.create')` + audit

**Do aur guard:** 5. `settings.allow_admin_creation` default **OFF** — ADMIN hone ke baad bhi naya ADMIN banane ke liye ek aur switch 6. **Aakhri ACTIVE ADMIN** ko disable ya downgrade karna blocked (khud ko lock out hone se bachav)

⚠️ **JWT me role hai, par har request pe DB se dobara padha jaata hai** (30 s cache). Admin ne abhi kisi ko disable kiya ho to uska purana token 15 min tak nahi chalna chahiye.

Permissions: 31, `schema.sql` me seeded. Resolution:

```
ADMIN → sab (bypass)
warna → role_permissions ∪ {user_permissions granted=1} − {user_permissions granted=0}
```

---

## 3. STACK — LOCKED

| Layer      | Choice                                                                              |
| ---------- | ----------------------------------------------------------------------------------- |
| Backend    | **NestJS 11**, modular monolith, TypeScript strict                                  |
| Runtime    | **Node.js 24 LTS**                                                                  |
| DB         | **MySQL 8 / MariaDB 10.4+** (dono pe chale)                                         |
| DB access  | **Knex + mysql2** (raw SQL jahan zaroori)                                           |
| Website    | **Next.js 15** App Router (SSR + ISR)                                               |
| Realtime   | **Socket.IO 4** (`transports: ['websocket','polling']`)                             |
| Mobile     | **React Native** — ek app, role-based navigation                                    |
| Push       | **FCM** (mobile) + **Web Push VAPID** (website), ek `NotificationService` ke peeche |
| Auth       | Phone + OTP → JWT access 15 min + rotating refresh 30 din (DB me hashed)            |
| Validation | **Zod** (`nestjs-zod` ya custom pipe)                                               |
| Maps       | `IMapProvider` interface — default OSM/MapLibre, Google drop-in                     |
| Cache      | In-process LRU (`ICacheProvider` interface)                                         |

### BILKUL NAHI

❌ PHP ❌ Prisma/TypeORM (Knex hi) ❌ Redis ❌ Docker/K8s ❌ microservices ❌ alag Express server ❌ BullMQ ❌ GraphQL ❌ Elasticsearch ❌ alag admin/rider/customer app ❌ Tailwind ke alawa koi UI kit (shadcn/ui components chalenge) ❌ Moment.js ❌ localStorage me token

**Prisma kyun nahi:** query engine binary ~15–20 MB per instance × 4 processes = fokat ka RAM aur inodes. Aur hume `FOR UPDATE` + UNSIGNED-safe raw SQL waise bhi likhni hai.

---

## 4. CONSTRAINTS — ye naape gaye hain, maane hue nahi

Hostinger shared: **3072 MB RAM · 2 cores · 120 processes · 600k inodes · Node.js websites: 5**
Ispe pehle se: `gstbillgenerator.com` (PHP) + 2 static sites. **Aur ek doosra e-commerce app bhi aayega** (alag business, 20–50 users/day) — matlab kul **4 Node processes**.

Naapa gaya (`HOSTING_CAPACITY.md`):

```
Next.js standalone (28 routes)     110 MB idle → 120 MB load pe
API + Socket.IO + MySQL pool       100 MB
API + 100 live WebSockets          103.6 MB   (+2.1 MB → ~21 KB/socket)
50 concurrent requests             p95 66 ms
next build peak (process tree)     849 MB  ⚠️
Web .next/standalone deploy        56 MB / 2,096 files
```

**Iska matlab code pe kya asar:**

- `next.config.js` me **`output: 'standalone'`** — deploy me poora node_modules kabhi nahi
- `NODE_OPTIONS=--max-old-space-size=384` per process
- **DB pool `max: 8`** per API app (2 apps × 8 = 16 < 50 limit) — explicitly set karo
- Koi background worker/daemon nahi. Cron ek entry, jobs table drain karti hai
- Har list query paginated (default 24 public, 50 admin). `SELECT *` sirf single-row-by-id me
- N+1 query kahin nahi — har listing me image/supplier ek hi JOIN/subquery se

---

## 5. MONOREPO

```
fatanpur-bazaar/
├── apps/
│   ├── api/       # NestJS
│   ├── web/       # Next.js
│   └── mobile/    # React Native
├── packages/
│   ├── shared-types/   # DTO, enums, order state machine — TEENO jagah SAME source
│   └── config/         # eslint, tsconfig base
├── docs/               # attached 9 files yahan rakho
├── .github/workflows/deploy.yml
└── package.json        # npm workspaces (Turborepo/Nx nahi)
```

`packages/shared-types` sabse zyada value deta hai: `OrderStatus`, `Role`, `Permission`, API
response types teeno apps ek jagah se import karte hain. Backend me status badla aur frontend
update nahi hua → **compile error**, runtime bug nahi.

### Backend structure

```
apps/api/src/
├── main.ts                 # helmet, CORS allowlist, ValidationPipe, graceful shutdown
├── common/
│   ├── guards/             # JwtAuthGuard RolesGuard PermissionsGuard OwnershipGuard
│   ├── decorators/         # @Public @Roles @RequirePermission @Owns @CurrentUser
│   ├── interceptors/       # Transform(envelope) Audit Logging
│   ├── filters/            # AllExceptionsFilter — stack trace kabhi bahar nahi
│   └── utils/              # money.ts geo.ts phone.ts hash.ts ids.ts unsigned.ts
├── config/                 # Zod env validation — galat env = app start hi na ho
├── database/
│   ├── knex.provider.ts    # pool min 2 max 8, timezone '+05:30'
│   ├── migrations/  seeds/  repositories/
├── modules/
│   auth users staff permissions catalog inventory cart orders payments
│   delivery tracking services prescriptions notifications coupons referrals
│   reviews wallet content admin audit jobs
```

**Niyam:** module dusre ka **service** inject karte hain, repository nahi. Cross-module DB access mana.

### Request lifecycle

```
helmet → CORS(allowlist) → body limit(1MB / upload 8MB) → rate limit
 → JwtAuthGuard      (token valid? user ACTIVE? role DB se)
 → RolesGuard        (@Roles)
 → PermissionsGuard  (@RequirePermission)
 → OwnershipGuard    (@Owns — resource fetch karke controller me inject, TOCTOU se bachav)
 → ZodValidationPipe (whitelist: extra fields gir jaate hain)
 → Controller (patla) → Service (logic) → Repository (SQL)
 → TransformInterceptor {ok, data, meta} → AuditInterceptor → AllExceptionsFilter
```

---

## 6. DATABASE

`schema.sql` attached — **57 tables, 54 FK, 34 permissions, 57 settings.** Isko
`apps/api/src/database/migrations/001_init.sql` bana do + Knex migration runner.

### ⚠️ UNSIGNED counter ghataane ka niyam (ye asli DB pe test kiya gaya hai)

```sql
UPDATE products SET sold_count = sold_count - 5;                     -- ❌ ERROR 1690
UPDATE products SET sold_count = GREATEST(0, sold_count - 5);        -- ❌ YE BHI FAIL
UPDATE products SET sold_count = sold_count - LEAST(sold_count, 5);  -- ✅
```

`GREATEST` isliye fail hota hai kyunki subtraction pehle evaluate hoti hai. Agar ye galat likha
to **har order cancellation ka poora transaction fail hoga**. Ek hi helper banao:
`decrementUnsigned(trx, table, column, amount, where)` — aur poore codebase me wahi use ho.

Aur (dono MySQL 8 + MariaDB pe chalna hai):
❌ `FOR SHARE` (MariaDB syntax error — `LOCK IN SHARE MODE`) ❌ `utf8mb4_0900_*` collation
❌ functional index ❌ JSON ke andar query — poora JSON JS me decode karo
✅ `FOR UPDATE`, `ON DUPLICATE KEY UPDATE`, `UPDATE ... ORDER BY LIMIT`, FULLTEXT, CTE

Timezone: app + DB dono `Asia/Kolkata`. Knex connection pe `SET time_zone='+05:30'`.
Paisa: `DECIMAL(10,2)` DB me, code me **integer paise** ya `decimal.js`. **JS float se paisa kabhi nahi.**

---

## 7. ALGORITHMS — line by line

> Exact logic implement karni hai. Har algorithm ka test bhi (Section 16).

### A1 — Config validation (boot pe)

```
Zod schema se saare env validate karo. Missing ya default value → process.exit(1)
with saaf message. Chup-chaap default se chalna mana.
Zaroori: DB_*, JWT_SECRET, JWT_REFRESH_SECRET, APP_SECRET (teeno alag, 32+ bytes),
ALLOWED_ORIGINS, STORAGE_PATH, TZ
```

### A2 — OTP send `POST /auth/otp/send`

```
INPUT { phone, purpose }
1. Zod: 10 digit, [6-9] se start. normalized = '91' + phone
2. RateLimit: otp:send:{phone} 3/15min  AND  otp:send:ip:{ip} 10/15min → 429 + Retry-After
3. Resend cooldown: last OTP < 60 s → 429 "1 मिनट बाद दोबारा भेजें"
4. purpose='STAFF_LOGIN' → user exist karta hai aur role != CUSTOMER? nahi to
   ⚠️ staff account BANANA NAHI — 401. (Customer flow se wo CUSTOMER bana sakta hai.)
5. otp = crypto.randomInt(100000, 999999)      ← Math.random() KABHI NAHI
6. code_hash = argon2/bcrypt hash
7. INSERT otp_requests {phone, code_hash, purpose, channel, expires_at: +5min, ip}
8. driver = settings.otp_driver ('null' | 'fast2sms' | 'msg91')
   'null' → dev me app/storage/logs/otp-dev.log me likho (response me KABHI nahi)
   warna → provider call (10 s timeout). Fail → OTP consume + 502
9. return { sent: true, expiresIn: 300, resendAfter: 60 }
⚠️ Response registered/unregistered dono case me IDENTICAL ho (enumeration).
   Timing bhi constant — dummy hash compare karo.
⚠️ OTP kabhi response me, log me (prod), ya error message me nahi.
```

### A3 — OTP verify + register `POST /auth/otp/verify`

```
INPUT { phone, otp, name?, referralCode? }        ⚠️ role field hai hi nahi
1. RateLimit otp:verify:{phone} 5/15min
2. row = latest otp_requests WHERE phone AND consumed_at IS NULL
3. !row → 400 OTP_INVALID | expired → 400 OTP_EXPIRED
4. attempts >= 3 → consume + 400 OTP_TOO_MANY
5. !verify(otp, row.code_hash) → attempts+1, 400 "OTP गलत है। {n} कोशिश बची हैं।"
6. UPDATE consumed_at = NOW()                     ← replay rok diya
7. TRANSACTION:
     user = SELECT ... WHERE phone FOR UPDATE
     IF !user:
       referralCode = unique 8 char [A-Z2-9] (0,O,1,I,L hataao), 5 retry
       INSERT users { phone, name, role: Role.CUSTOMER,   ← LITERAL. spread nahi.
                      status: ACTIVE, phone_verified: 1, referral_code }
       INSERT wallets { user_id }
       IF input.referralCode → INSERT referrals {referrer_id, referred_id, signup_ip}
       (reward abhi nahi — A22)
     ELSE:
       status != ACTIVE → 403 ACCOUNT_DISABLED
       UPDATE last_login_at, phone_verified=1
8. Session banao (A4) → return { user, accessToken, expiresIn, redirect: roleHome, isNewUser }
roleHome: CUSTOMER=/mera ADMIN=/admin SUPERVISOR=/supervisor DELIVERY_BOY=/delivery
```

### A4 — JWT + refresh rotation

```
issue(user, deviceInfo):
  accessToken  = JWT { sub, role, jti }, 15 min, JWT_SECRET
  refreshToken = randomBytes(32).hex()
  INSERT auth_sessions { user_id, refresh_token_hash: sha256(refresh),
                         device_id, platform, user_agent, ip, expires_at: +30d }
  Web    → refresh httpOnly+Secure+SameSite=Lax cookie; access response body me (memory me rakhna)
  Mobile → dono response me; app Keychain/EncryptedSharedPreferences me rakhta hai
  ⚠️ localStorage me KABHI nahi
  User ke 5 se zyada active session → sabse purana revoke

refresh(token):
  hash = sha256(token); s = SELECT WHERE refresh_token_hash = hash
  !s → 401
  s.revoked_at IS NOT NULL → ⚠️ REUSE DETECTED: us user ke SAARE sessions revoke
                              + audit log + admin alert → 401
  expired → 401
  user status != ACTIVE → revoke → 403
  ROTATE: purana revoke (revoke_reason='rotated'), naya issue
```

### A5 — Guards

```
JwtAuthGuard:
  @Public() → skip
  Bearer token verify (signature + exp) → 401
  ⚠️ user = SELECT id, role, status FROM users WHERE id = payload.sub   ← DB se, 30s cache
  !user || status != ACTIVE → 403
  req.user = { id, role, permissions: await resolve(user) }

RolesGuard:        @Roles(...) me user.role nahi → 403
PermissionsGuard:  role==='ADMIN' → pass. warna user.permissions me code nahi → 403
OwnershipGuard(@Owns('order'|'address'|'cart'|'prescription'|'assignment')):
  resource DB se laao → owner check → ⚠️ fail pe 404 (403 nahi — existence leak na ho)
  → req.resource me inject (controller dobara fetch NA kare)
```

### A6 — Permission resolution

```
resolve(user):
  ADMIN → all 31
  base = SELECT permission_code FROM role_permissions WHERE role = user.role
  ovr  = SELECT permission_code, granted FROM user_permissions WHERE user_id = user.id
  return (base ∪ granted=1) − (granted=0)
Cache 30 s per user. permissions.change pe turant invalidate.
```

### A7 — Staff creation `POST /admin/staff`

```
@Roles('ADMIN') @RequirePermission('staff.create')
1. role IN (SUPERVISOR, DELIVERY_BOY, ADMIN). CUSTOMER yahan se nahi banta.
2. role==='ADMIN' → settings.allow_admin_creation must be ON, warna 403
3. Phone exists?
     CUSTOMER hai → promote allowed: role update + saare sessions revoke + audit
                    (cart/orders/wallet history rehti hai)
     already staff → 409
4. TRANSACTION: INSERT users {role, created_by} + staff_profiles {employee_code unique}
5. permissions[] diye ho → sirf wahi grant kar sakte ho jo actor ke paas khud hain
6. audit_logs: staff.create (before=null, after={phone, role, permissions})
7. Notify staff: "phone se OTP login karein"

DISABLE: status='DISABLED' + saare auth_sessions revoke + audit
  ⚠️ Active delivery hai → 409 "pehle reassign karo"
  ⚠️ Aakhri ACTIVE ADMIN → 409 "system me kam se kam ek admin zaroori hai"
```

### A8 — SERVICE AREA / DELIVERY BOUNDARY (6 km) — **poora section dhyan se padho**

Owner ka sabse zaroori business rule: **6 km ke bahar wale ko saaf "sorry" bolna hai** —
par bina apne hi customer ko galti se block kiye. Rural India me GPS bharosemand nahi hota,
isliye design 3 layer ka hai.

#### A8.1 — Boundary kaise store hoti hai

```
service_zones table:
  mode='RADIUS'  → center_lat, center_lng, radius_km       (default: Fatanpur, 6 km)
  mode='POLYGON' → polygon_geojson { "type":"Polygon",
                                     "coordinates":[[[lng,lat],...,[lng,lat]]] }
     ⚠️ GeoJSON me [lng, lat] hota hai — [lat, lng] NAHI. Ye sabse common galti hai;
        save karte waqt validate karo.
     ⚠️ Ring closed ho (pehla point == aakhri point)
     bbox_* columns save ke waqt compute karo (sasta pre-filter)
  Multiple zone allowed — priority ASC me match. Inner zone (0–3 km free delivery) aur
  outer (3–6 km ₹20) baad me chahiye to bina code badle ban jaayenge.
```

#### A8.2 — Geo functions (`Domain/Geo`) — ye test ho chuke hain, aise hi likho

```ts
const R = 6371; const rad = (d: number) => d * Math.PI / 180;

haversineKm(a, b):
  dLat = rad(b.lat - a.lat); dLng = rad(b.lng - a.lng)
  h = sin(dLat/2)² + cos(rad(a.lat))·cos(rad(b.lat))·sin(dLng/2)²
  return R · 2 · atan2(√h, √(1-h))

// Ray casting. ring = [[lng,lat],...]. 6 km ke area pe planar treat karna theek hai.
pointInPolygon(pt, ring):
  inside = false
  for (i = 0, j = ring.length - 1; i < ring.length; j = i++):
    xi=ring[i][0]; yi=ring[i][1]; xj=ring[j][0]; yj=ring[j][1]
    intersect = ((yi > pt.lat) !== (yj > pt.lat)) &&
                (pt.lng < (xj-xi) * (pt.lat-yi) / (yj-yi) + xi)
    if (intersect) inside = !inside
  return inside

circleToPolygon(center, radiusKm, points=64):   // map pe circle → editable polygon
  latR = radiusKm / 110.574
  lngR = radiusKm / (111.320 · cos(rad(center.lat)))
  ring[i] = [center.lng + lngR·cos(t), center.lat + latR·sin(t)],  t = i/points · 2π
  aakhri point = pehla point (closed ring)

zoneContains(zone, pt):
  RADIUS  → haversineKm(zone.center, pt) <= zone.radius_km
  POLYGON → pehle bbox (sasta): pt bbox ke bahar → false turant
            phir pointInPolygon(pt, ring)

findZone(pt): SELECT * FROM service_zones WHERE is_active=1 ORDER BY priority ASC
              → pehla jo zoneContains() pass kare, warna null
```

#### A8.3 — ⚠️ DECISION MATRIX — asli logic yahi hai

**Owner ka tay kiya hua flow: पहले गाँव चुनो → फिर validate करो.**
Matlab village **primary gate** hai, GPS/zone sirf **doosri jaanch** hai — ulta nahi.

```
        ┌─────────────────────────────────┐
        │  1. गाँव चुनें  (हमेशा पहला कदम)   │
        └───────────┬─────────────────────┘
                    │
        ┌───────────┴───────────┐
        │ list me hai?          │
     हाँ │                       │ नहीं / "मेरा गाँव नहीं है"
        ▼                       ▼
  ┌───────────┐        ┌──────────────────────┐
  │ is_active?│        │ 2. GPS से VALIDATE   │
  └──┬─────┬──┘        │   (accuracy ≤ 500 m) │
  हाँ│     │नहीं        └────┬────────────┬────┘
     ▼     ▼                 │ andar      │ bahar / GPS नहीं
  ✅ SERVE  ❌ Sorry          ▼            ▼
  (GPS की कोई              ✅ SERVE     ❌ Sorry + नंबर लो
   ज़रूरत नहीं)           + admin flag  (या village picker दिखाओ
                          "नया क्षेत्र"    अगर GPS ही नहीं मिला)
```

`checkServiceability({ villageId, lat, lng, accuracyM })` → `{ serviceable, method, zone, reason }`

| Village list me?       | GPS?                         | Zone ke andar? | Faisla                                    | method             |
| ---------------------- | ---------------------------- | -------------- | ----------------------------------------- | ------------------ |
| Haan, `is_active=1`    | koi bhi                      | koi bhi        | ✅ **SERVE**                              | `VILLAGE`          |
| Haan par `is_active=0` | —                            | —              | ❌ Sorry                                  | `VILLAGE`          |
| Nahi / "koi aur"       | accuracy ≤ 500 m             | Andar          | ✅ SERVE + **admin flag** ("naya area")   | `POLYGON`/`RADIUS` |
| Nahi / "koi aur"       | accuracy ≤ 500 m             | Bahar          | ❌ **Sorry** + lead capture               | `POLYGON`/`RADIUS` |
| Nahi / "koi aur"       | GPS nahi ya accuracy > 500 m | —              | ⚠️ **Block MAT karo** — "अपना गाँव चुनें" | `UNKNOWN`          |

```
⚠️ TEEN NIYAM JO KABHI NAHI TOOTNE:

1. VILLAGE LIST HAMESHA JEETTI HAI.
   Customer ne apna gaon chuna aur wo active list me hai → order lena hai, chahe GPS
   "6.3 km" bole. Kyunki gaon ki boundary circle se match nahi karti, aur ghar ke andar
   se liya gaya GPS 1–2 km drift karta hai. Sirf GPS pe block karoge to aap apne hi
   customer ko mana kar denge — aur usko pata bhi nahi chalega kyun.

2. KHARAB GPS PE KABHI BLOCK NAHI.
   accuracy > settings.gps_accuracy_threshold_m (500) → GPS IGNORE karo aur village
   picker mandatory kar do. "Location nahi mili" ka matlab "aap bahar hain" nahi hota.

3. BAHAR WALE KO DEAD-END MAT DO.
   Har "sorry" ke saath: kaunse area serve karte ho + number chhodne ka option.
   Ye `service_area_requests` me jaata hai — yahi aapki agli expansion ki list hai.
```

#### A8.4 — Check kahan lagta hai (3 jagah, teenon ka alag behaviour)

```
1. HOMEPAGE / pehli visit — SOFT (browsing KABHI block nahi)
   Location strip: "📍 अपना क्षेत्र चुनें" → village picker ya "मेरी लोकेशन लें"
   Andar → "✅ रानीगंज · लगभग 45 मिनट में डिलीवरी"  (--g-100 bg)
   Bahar → "अभी हम आपके क्षेत्र में डिलीवरी नहीं करते" + [हमें बताएं]
   ⚠️ Browsing band MAT karo — SEO ke liye aur future customer ke liye. Cart me daalne
      bhi do. Rok SIRF checkout pe.
   Chuna hua area 30 din cookie me (`fb_area`)

2. ADDRESS SAVE — WARN, par save hone do
   distance_km, is_serviceable, zone_id, check_method, gps_accuracy_m sab store karo
   !serviceable → save ho jaata hai par: address card pe laal badge "यहाँ डिलीवरी नहीं",
   checkout pe wo address disabled, toast "यह पता हमारे 6 किमी क्षेत्र से बाहर है"
   ⚠️ Save block karoge to poora form dobara bharna padega — aadmi chhod ke chala jaayega.

3. CHECKOUT — HARD BLOCK, aur `/orders/quote` **aur** `POST /orders` DONO me
   ⚠️ Dono jagah zaroori hai — quote aur order ke beech customer address badal sakta hai
   422 { code:'OUT_OF_SERVICE_AREA',
         message:'माफ़ करें — अभी हम {area} तक डिलीवरी नहीं करते',
         data:{ servedAreas:[top 8 village names], distanceKm:8.4,
                nearestServedKm:2.1, canRequest:true } }
```

#### A8.5 — "Sorry" screen — ye dead-end nahi, lead form hai

```
┌────────────────────────────────────────┐
│              🛵                         │
│   माफ़ करें — अभी यहाँ डिलीवरी नहीं         │
│                                        │
│   हम अभी फतनपुर बाज़ार से 6 किमी तक ही     │
│   सामान पहुँचाते हैं। आपका पता लगभग        │
│   8.4 किमी दूर है।                       │
├────────────────────────────────────────┤
│   हम इन जगहों पर डिलीवरी करते हैं:        │
│   फतनपुर बाज़ार · रानीगंज · [+6 और]       │
│   [ दूसरा पता चुनें ]                     │
├────────────────────────────────────────┤
│   आपके क्षेत्र में आना चाहते हैं?          │
│   अपना नंबर छोड़ें — जब हम वहाँ पहुँचेंगे    │
│   तो सबसे पहले आपको बताएंगे।              │
│   [ 9876543210 ]  [ मुझे बताएं ]          │
├────────────────────────────────────────┤
│   या फ़ोन पर ऑर्डर करें: 📞 {support}     │
└────────────────────────────────────────┘
```

Submit → `POST /service-area/request` → `service_area_requests`
(user_id?, phone, area_text, village_guess, lat, lng, distance_km, source)
RateLimit `area_request:{ip}` 5/day
Admin `/admin/service-area/requests` → GROUP BY village_guess ORDER BY count DESC
**Yahi decide karta hai ki agla zone kahan banega.**

#### A8.6 — Admin map editor (`/admin/service-area`) — "map me set karna"

```
@RequirePermission('service_area.manage')
Map: MapLibre GL + OSM tiles (lazy load, sirf isi page pe)

  • Center marker (draggable) — drag karke store ka exact center set
  • Radius slider 1–15 km (default 6) — circle live update
  • Toggle: [ गोल दायरा ] [ हाथ से बनाया (Polygon) ]
      Polygon mode: map pe click se point, drag se move, right-click se delete
      "गोल दायरे से शुरू करें" → circleToPolygon(center, radius, 64) se pre-fill,
      phir usko sadak/gaon ke hisaab se kheench lo
  • Saare villages map pe dot: 🟢 andar · 🔴 bahar (live update)
  • Panel: "इस दायरे में 9 गाँव आते हैं" + distance ke saath list
  • Zone fields: delivery_fee, min_order, eta_minutes, priority
  • [ सेव करें ] → validate → save → audit_logs (before/after geojson)

⚠️ SAVE SE PEHLE VALIDATE (warna galti se business band ho sakta hai):
  a. Polygon me kam se kam 3 point
  b. Self-intersecting → reject ("रेखाएं आपस में कट रही हैं")
  c. ⚠️ Store ka center zone ke ANDAR ho ("दुकान ही दायरे से बाहर है")
  d. Area 0.5–500 km² ke beech (typo se poora India select na ho jaye)
  e. ⚠️ Kitne ACTIVE village bahar ho rahe hain? >0 → confirm maango:
       "इस बदलाव से 3 गाँव बाहर हो जाएंगे: रामपुर, अंतू, सांगीपुर।
        वहाँ के 42 ग्राहक ऑर्डर नहीं कर पाएंगे। पक्का?"
  f. Pehle se chal rahe active orders zone ke bahar ho gaye → unhe block MAT karo

Save pe: bbox recompute · villages ka is_active auto-suggest (admin confirm kare) ·
  cache invalidate · audit log

FALLBACK (agar map editor me time lage — P12 me): "GeoJSON paste karein" textarea.
  Owner geojson.io pe boundary kheenchta hai → copy → paste → save.
  20 line ka kaam, aur din 1 se chalta hai.
```

#### A8.7 — Address form (rural reality ke hisaab se)

```
⚠️ Field ORDER yahi rakhna:
  1. गाँव / क्षेत्र *    → **village picker (A8.9)** — sirf active, search + alias,
                          "मेरा गाँव इसमें नहीं है" aakhri option
                          ← YE PEHLA FIELD HAI. 90% case yahin decide ho jaata hai,
                            aur yahi service-area ka asli gate hai.
  2. घर / मोहल्ला *     → "वार्ड 4, हनुमान मंदिर के पास"
  3. लैंडमार्क          → optional par strongly encourage — gaon me yahi asli pata hai
  4. मोबाइल *          → डिलीवरी के लिए
  5. [ 📍 मेरी लोकेशन लें ] → optional GPS. Milne pe chhota map + "पिन ठीक करें"
                           accuracy > 500 m → "लोकेशन साफ़ नहीं मिली", GPS ignore

"मेरा गाँव इसमें नहीं है" → area_text + GPS strongly suggest
  GPS andar → allow + admin flag ("naya area: {text}")
  GPS bahar ya nahi mila → A8.5 sorry screen + lead capture
```

#### A8.8 — ETA aur fee

```
zone = findZone(pt) ?? village fallback
delivery_fee = zone?.delivery_fee ?? village.delivery_fee ?? settings.delivery_fee
min_order    = zone?.min_order ?? village.min_order ?? settings.min_order
eta_minutes  = distance != null ? prep(20) + ceil(distance × 4) + 10
                                : (zone?.eta_minutes ?? village.eta_minutes ?? 45)
⚠️ distance NULL ho sakta hai (GPS nahi diya) — NULL arithmetic se "ETA: " khaali
   kabhi mat dikhana. Fallback hamesha.
```

#### A8.9 — Village picker — **ye is poore feature ka sabse zaroori UI hai**

Village primary gate hai, isliye picker ko dropdown samajh kar halke me mat lena.
Ye ek component hai jo homepage, address form, aur mobile app teeno me use hota hai.

```
┌──────────────────────────────────────┐
│  अपना गाँव चुनें                       │
│  ┌────────────────────────────────┐  │
│  │ 🔍  गाँव का नाम लिखें...         │  │  ← 8+ gaon hon tabhi search box
│  └────────────────────────────────┘  │
│  [ 📍 मेरी लोकेशन से ढूंढें ]           │  ← GPS se nearest 3 sabse upar
├──────────────────────────────────────┤
│  ● फतनपुर बाज़ार          0.0 किमी     │  ← is_popular / order_count DESC
│  ● रानीगंज                2.6 किमी     │
│  ● भगेसर                  3.4 किमी     │
│  ● कटरा                   3.8 किमी     │
│    …                                  │
├──────────────────────────────────────┤
│  ○ मेरा गाँव इसमें नहीं है              │  ← hamesha aakhri, alag styling
└──────────────────────────────────────┘
```

**Niyam:**

```
1. SIRF is_active=1 wale gaon dikhao. Inactive gaon list me aaye hi nahi —
   warna customer chunega aur checkout pe reject hoga. Wo sabse bura experience hai.
2. Order: is_popular DESC, order_count DESC, distance_km ASC
   (jo gaon sabse zyada order deta hai wo sabse upar — bina soche mil jaaye)
3. SEARCH: naam + name_hi + `village_aliases` teeno me match karo,
   accent/case-insensitive, aur Devanagari↔roman dono taraf
   "rani" → रानीगंज · "रानी" → रानीगंज · "Rani Ganj" → रानीगंज (alias)
   "Rampur Purwa" → रामपुर (HAMLET alias)
4. GPS button: permission maango → nearest 3 gaon upar pin karo, par
   ⚠️ apne aap select MAT karo — customer hi confirm kare. GPS galat ho sakta hai.
5. Chuna hua gaon 30 din cookie/localStorage me (`fb_village`) — agli baar pehle se bhara ho
6. Ek hi gaon ho to picker mat dikhao — seedha wahi set kar do
7. Mobile: bottom sheet, 48px rows, search box pe autofocus mat karo
   (keyboard khulne se list chhup jaati hai, aur gaon me log scroll karna
    type karne se zyada aasan paate hain)
8. "मेरा गाँव इसमें नहीं है" → A8.5 ka flow (GPS validate → allow ya sorry+lead)
```

**API:** `GET /service-area/villages` → `[{id, name, nameHi, distanceKm, etaMinutes,
deliveryFee, isPopular}]` — public, 1 ghanta cache, sirf active.

#### A8.10 — Admin: gaon manage karna (`/admin/villages`)

```
@RequirePermission('villages.manage')   — SUPERVISOR ko bhi milta hai (rozana ka kaam hai)

Table: नाम · दूरी · ऑर्डर (30 दिन) · डिलीवरी फीस · ETA · चालू/बंद · कार्रवाई
Har row me:
  - चालू/बंद toggle  ⚠️ Band karne se pehle warning:
      "रानीगंज में पिछले 30 दिन में 18 ऑर्डर आए हैं। बंद करने पर वहाँ के ग्राहक
       ऑर्डर नहीं कर पाएंगे। बंद करें?"
  - दूरी auto-compute (center se haversine) — admin manually bhi override kar sakta hai
  - per-village delivery_fee / min_order / eta_minutes (0 = settings ka default)
  - उपनाम (aliases): "+ जोड़ें" — spelling variants aur tole
  - SEO: intro_html (area landing page ke liye)

Upar do button:
  [ + नया गाँव ]  — naam + "Google Maps se coordinates paste karein" + zone auto-detect
  [ क्षेत्र अनुरोध देखें ]  — service_area_requests, gaon-wise count
     ⚠️ Yahan se seedha "इस गाँव को चालू करें" ho sake — 3 log Antu se maang rahe hain
        to ek click me Antu add ho jaaye

⚠️ Zone badalne pe (A8.6) villages ka is_active apne aap MAT badlo —
   suggest karo, admin confirm kare. Warna ek slider khiskane se business band ho jaayega.
```

#### A8.11 — Village-wise report (admin dashboard)

```
Nightly cron `villages:rollup`:
  UPDATE villages v SET order_count = (
    SELECT COUNT(*) FROM orders o JOIN addresses a ON a.id = o.address_id
    WHERE a.village_id = v.id AND o.placed_at > NOW() - INTERVAL 30 DAY
      AND o.status IN ('DELIVERED','COMPLETED'))

Admin ko ye teen list chahiye:
  1. सबसे ज़्यादा ऑर्डर वाले गाँव  → yahan stock/rider badhao
  2. 0 ऑर्डर वाले चालू गाँव        → shayad wahan koi jaanta hi nahi — marketing
  3. सबसे ज़्यादा अनुरोध वाले बंद गाँव → **agla expansion yahi hai**
```

#### A8.12 — Tests (GEO-01..16, sab pass hone chahiye)

```
GEO-01  haversine: Fatanpur→Raniganj ≈ 2.5 km (±0.3)
GEO-02  RADIUS: 5.9 km andar · 6.1 km bahar
GEO-03  POLYGON: circleToPolygon(6km) ring closed; center andar; 6.5 km bahar
GEO-04  POLYGON: custom non-circular polygon — andar aur bahar dono
GEO-05  bbox pre-filter door ka point polygon test se pehle reject kare
GEO-06  ⚠️ Village active list me PAR GPS 6.3 km → SERVE (village jeetti hai)
GEO-07  ⚠️ Village list me nahi + accuracy 800 m → block NAHI, village picker dikhe
GEO-08  Village list me nahi + accurate GPS + bahar → 422 OUT_OF_SERVICE_AREA
GEO-09  Village list me nahi + accurate GPS + andar → allow + admin flag
GEO-10  Bahar wala address save ho jaye par checkout pe disabled dikhe
GEO-11  Quote 422 de AUR POST /orders bhi 422 de (dono jagah check)
GEO-12  Sorry screen se number submit → service_area_requests row bane
GEO-13  Admin: self-intersecting polygon reject
GEO-14  Admin: store center zone ke bahar ho to reject
GEO-15  Admin: zone chhota karne pe "3 gaon bahar" confirm maange
GEO-16  Zone badalne pe chal rahe active orders block na hon
GEO-17  Picker me is_active=0 gaon dikhe hi nahi
GEO-18  Alias search: "rani" / "रानी" / "Rani Ganj" teeno → रानीगंज mile
GEO-19  Hamlet alias: "Rampur Purwa" → रामपुर mile
GEO-20  Picker order: is_popular DESC, order_count DESC, distance ASC
GEO-21  GPS button nearest 3 upar laaye par apne aap SELECT na kare
GEO-22  Admin gaon band kare jisme 30 din me order hain → confirm maange
GEO-23  villages:rollup cron order_count sahi bhare
GEO-24  Area request se "is gaon ko chalu karein" ek click me kaam kare
```

### A9 — Catalog query (ek hi builder, har jagah)

```
listProducts(filters, page, perPage=24):
  SELECT p.id, p.name, p.name_hi, p.slug, p.item_type, p.unit, p.unit_value,
         p.mrp, p.price, p.stock_qty, p.is_available, p.prescription_required,
         p.rating_avg, p.rating_count,
         s.name AS supplier_name, s.show_on_product,
         (SELECT url_sm FROM product_images WHERE product_id=p.id ORDER BY sort_order LIMIT 1) AS img
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  WHERE p.is_available = 1
    AND c.vertical IN (:enabledVerticals)     ← Compliance.enabledVerticals()
    AND c.is_active = 1
    [+ filters]
  ORDER BY is_featured DESC, sold_count DESC, id DESC
  ⚠️ Listing me `p.stock_qty > 0` bhi lagao.
  ⚠️ PAR product DETAIL page 200 hi rahega jab stock 0 ho — inStock:false +
     JSON-LD OutOfStock + "आने पर बताएं" + 3 alternatives.
     404 sirf tab jab product delete ho ya vertical OFF ho (tab 410 behtar).
     Warna stock 0 hote hi Google index churn hota hai — aur SEO aapki sabse badi asset hai.
```

### A10 — Search

```
1. q trim, 2..60 chars. RateLimit search:{ip} 120/5min
2. Synonym expansion: har term → SELECT maps_to FROM search_synonyms WHERE term=?
   "alu" → "aloo potato आलू"
3. FULLTEXT (fast path):
   MATCH(p.name, p.name_hi, p.search_text) AGAINST (:bool IN BOOLEAN MODE)
   bool = har term (>=3 char) ko '+term*'
4. results < 3 OR koi term < 3 char (Devanagari me aam hai) →
   LIKE fallback: name/name_hi/search_text LIKE %q%  → merge + dedupe by id
5. INSERT search_logs {query, results_count, user_id}
6. Zero results → "क्या आप यह ढूंढ रहे हैं?" (top 6 popular) + "हमें बताएं" button
   → contact_messages me demand entry (ye aapka agla stock list hai)

product save pe search_text banao:
  lower(name) + name_hi + brand + category + admin keywords + transliteration
  "आलू aloo alu aalu potato"  ← ye ek line search ko 10x behtar banati hai
```

### A11 — Cart (server-side, web+mobile same)

```
GET /cart:
  cart = user ? by user_id : by X-Guest-Key header (uuid)
  Har item pe LIVE recheck: price, stock, is_available, vertical enabled
  Mismatch → warnings[] { code: PRICE_CHANGED | STOCK_LOW | UNAVAILABLE | VERTICAL_OFF }
  needs_prescription = koi bhi item prescription_required
POST /cart/items { productId, quantity, slotDate?, slotStart? }
  quantity > max_qty_per_order → 422
  item_type='SERVICE' → slot zaroori (A26 se validate)
  ON DUPLICATE KEY UPDATE quantity (unique cart_id+product_id)
POST /cart/merge (login ke turant baad):
  guest cart ke items user cart me daalo (quantity max lo, cap lagao), guest cart delete
Cart 7 din purana → cron cleanup
```

### A12 — Pricing quote `POST /orders/quote` — **SERVER ONLY**

```
⚠️ Client se aaye kisi price/total pe kabhi bharosa nahi. Sab dobara compute.

1. address = WHERE id AND user_id (warna 404)
2. Geo check (A8) fail → 422 OUT_OF_SERVICE_AREA
3. Store open? settings.store_open_time/close_time → warna 422 (+ agli open time batao)
4. village = address.village
   min_order = village.min_order > 0 ? village.min_order : settings.min_order
5. items_total = 0; needs_rx = false
   Ek hi IN query se saare products laao (loop me query MAT karna)
   FOR EACH: !available → 422 · stock < qty → 422 STOCK_INSUFFICIENT ("सिर्फ {n} बचे")
             qty > max_qty_per_order → 422
             items_total += Money.mul(p.price, qty)      ← DB ka price
6. items_total < min_order → 422 MIN_ORDER_NOT_MET
7. delivery_fee = village.delivery_fee > 0 ? village.delivery_fee : settings.delivery_fee
   items_total >= settings.free_delivery_above → 0
   order_type=SERVICE → delivery_fee = 0, visiting_charge = product.visiting_charge
8. discount = coupon ? A13 : 0
9. payable = MAX(0, items_total + delivery_fee + visiting_charge − discount)
10. wallet_used = useWallet ? MIN(wallet.balance, payable) : 0
11. grand_total = payable − wallet_used
12. TRUST GATE:
    delivered = COUNT(orders WHERE customer_id AND status IN (DELIVERED, COMPLETED))
    IF !phone_verified AND delivered < settings.trust_orders_needed
       AND method='COD' AND grand_total > settings.cod_unverified_limit
    → 422 "पहले ऑर्डर पर ₹{limit} तक ही कैश ऑन डिलीवरी — या UPI से भुगतान करें"
13. eta_minutes = prep(20) + ceil(distance × 4) + 10   ya  village.eta_minutes
14. RETURN { itemsTotal, deliveryFee, visitingCharge, discount, walletUsed,
             grandTotal, needsPrescription, etaMinutes, breakdown[], warnings[] }
```

### A13 — Coupon

```
c = WHERE code = UPPER(TRIM(code))
!c → "कूपन कोड गलत है" · !is_active → "अभी चालू नहीं" · now < starts_at · now > expires_at
applies_to != 'ALL' && != order type → "यह कूपन इस पर नहीं चलेगा"
items_total < min_order_value → "₹{n} से ऊपर के ऑर्डर पर"
usage_limit && used_count >= limit → "कूपन खत्म"
first_order_only && !isFirstOrder → "सिर्फ पहले ऑर्डर पर"
COUNT(coupon_usages WHERE coupon_id, user_id) >= per_user_limit → "पहले इस्तेमाल कर चुके हैं"
discount = FLAT ? value : MIN(items_total × value/100, max_discount ?? ∞)
return round(MIN(discount, items_total))     ← delivery fee pe discount nahi
```

### A14 — Order placement `POST /orders`

```
INPUT { addressId, items[], couponCode?, useWallet, paymentMethod, prescriptionId?,
        note?, orderType, slot? }   + header X-Idempotency-Key
1. userId auth se (client se KABHI nahi)
2. RateLimit order:place:{userId} 6/60min
3. IDEMPOTENCY — ⚠️ SELECT-then-INSERT racy hai, ULTA karo:
   TRY   INSERT order_idempotency (user_id, idem_key)
   CATCH duplicate → row padho:
           order_id NOT NULL → us order ka response wapas do (naya order nahi)
           order_id NULL     → 409 "आपका पिछला ऑर्डर अभी बन रहा है"
4. quote = A12  (koi bhi error → 422 with Hindi message)
5. PRESCRIPTION GATE (agar quote.needsPrescription):
   !prescriptionId → 422 PRESCRIPTION_REQUIRED
   rx = WHERE id AND user_id → !rx → 404
   rx.order_id NOT NULL → 422 "यह पर्ची पहले इस्तेमाल हो चुकी है"
   rx.status='REJECTED' → 422 · expired → 422
   ⚠️ rx.status yaad rakho — step 8 me kaam aayega
6. paymentMethod validate: COD→cod_enabled, UPI→upi_enabled && upi_vpa set

7. === TRANSACTION START ===
8. FOR EACH item (product_id ASC order me — deadlock se bachav):
     SELECT stock_qty FROM products WHERE id=? FOR UPDATE
     item_type='PRODUCT' AND stock < qty → ROLLBACK 422
     UPDATE products SET stock_qty = stock_qty - qty, sold_count = sold_count + qty
     INSERT inventory_logs {change_qty: -qty, qty_after, reason:'ORDER', reference}
     (SERVICE items ka stock nahi hota — skip)
9. order_number = 'FB-' + YYYYMMDD + '-' + pad(todayCount+1, 4)
   duplicate key pe 3 retry (race safe)
10. INSERT orders {
      order_number, customer_id, address_id, order_type,
      status: (method === 'COD' ? 'CONFIRMED' : 'PENDING_PAYMENT'),   ← ⚠️ COD seedha CONFIRMED
      items_total, delivery_fee, visiting_charge, discount, wallet_used, grand_total,
      payment_method, payment_status: 'PENDING',
      ship_name, ship_phone, ship_line1, ship_landmark, ship_village, ship_lat, ship_lng,
      distance_km, coupon_id, requires_prescription,
      prescription_status: !needsRx ? 'NONE'
                          : (rx.status === 'APPROVED' ? 'APPROVED' : 'PENDING_REVIEW'),
      ⚠️ pehle se APPROVED rx ko dobara review queue me MAT bhejna — warna order
         kabhi confirm nahi hoga aur auto-cancel use maar dega
      customer_note, eta_minutes }
11. FOR EACH item: INSERT order_items { ...SNAPSHOT: product_name, name_hi, supplier_name,
      image_url (step 8 ki hi query se — loop me alag query nahi), unit, unit_value,
      unit_price, mrp, tax_rate, quantity, line_total, prescription_required, item_type }
12. INSERT order_status_logs {to_status, changed_by}
13. rx → UPDATE prescriptions SET order_id
14. wallet_used > 0 → wallet FOR UPDATE, balance check, debit + wallet_transactions
15. coupon → INSERT coupon_usages + UPDATE coupons SET used_count = used_count + 1
16. INSERT payments {order_id, method, status:'PENDING', amount: grand_total,
                     upi_vpa: method==='UPI' ? settings.upi_vpa : null}
17. orderType='SERVICE' → INSERT service_bookings {scheduled_date, slot_start, slot_end,
      visiting_charge, completion_otp: pad(randomInt(0,9999),4)}
18. UPDATE order_idempotency SET order_id
19. Cart clear
20. === COMMIT ===

21. Side-effects (transaction ke BAHAR — fail ho to order fail na ho), queue me:
    socket → ops:orders "ops.order.new"
    notify staff (orders.view_all wale): FCM + in-app
    notify customer: "ऑर्डर मिल गया — {orderNumber}"
    needsRx && status PENDING_REVIEW → notify prescriptions.review wale staff
22. RETURN { orderNumber, status, grandTotal, paymentMethod,
             upi: method==='UPI' ? {intentUrl, qrUrl, vpa, amount} : null,
             etaMinutes, redirect }
```

### A15 — Order state machine

```
DELIVERY : PENDING_PAYMENT → CONFIRMED → PREPARING → READY_FOR_PICKUP
                           → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
SERVICE  : PENDING_PAYMENT → CONFIRMED → SCHEDULED → ASSIGNED → IN_PROGRESS → COMPLETED
Har state se → CANCELLED (permission ke saath)
PENDING_PAYMENT → PAYMENT_FAILED     ASSIGNED/PICKED_UP/OUT_FOR_DELIVERY → DELIVERY_FAILED
CONFIRMED → REJECTED (staff)         DELIVERED → RETURNED (admin)
Terminal: DELIVERED COMPLETED CANCELLED REJECTED PAYMENT_FAILED DELIVERY_FAILED RETURNED

PERMISSIONS:
  CUSTOMER     → CANCELLED, sirf PENDING_PAYMENT | CONFIRMED me, apna order
  DELIVERY_BOY → PICKED_UP, OUT_FOR_DELIVERY, DELIVERED, IN_PROGRESS, COMPLETED, DELIVERY_FAILED
                 — sirf apne active assignment pe
  SUPERVISOR   → orders.update_status + orders.cancel
  ADMIN        → koi bhi (audit ke saath)

changeStatus(orderNumber, newStatus, actor, extra?):
1. TRANSACTION; order = SELECT FOR UPDATE
2. newStatus NOT IN allowed[order.status][order.order_type] → 409 INVALID_STATE_TRANSITION
3. Role + permission check → 403
4. Ownership check (customer_id / assignment.rider_id) → 403
5. ⚠️ GATE-RX: newStatus=CONFIRMED AND requires_prescription
      AND prescription_status != 'APPROVED' → 409 PRESCRIPTION_PENDING
6. ⚠️ GATE-PAY-CONFIRM: method != COD AND payment_status IN (PENDING, AWAITING_VERIFICATION)
      AND grand_total > settings.upi_auto_accept_limit → 409 PAYMENT_NOT_VERIFIED
7. ⚠️ GATE-PAY-PICKUP: newStatus=PICKED_UP AND settings.prepaid_required_before_pickup
      AND method != COD AND payment_status != 'PAID' → 409
      (admin do me se ek kare: payment verify, ya order COD me convert)
8. ⚠️ GATE-OTP: newStatus IN (DELIVERED, COMPLETED) AND actor is DELIVERY_BOY:
      a = assignment FOR UPDATE
      a.otp_attempts >= 3 → 429 + admin alert
      extra.otp !== a.delivery_otp → otp_attempts+1, COMMIT, 400 DELIVERY_OTP_INVALID
        "OTP गलत है। ग्राहक से ऑर्डर पेज का 4 अंक का कोड पूछें। {n} कोशिश बची हैं।"
      match → a.otp_verified_at = NOW(), delivery_otp = NULL
      (ADMIN override → OTP skip, par audit me reason mandatory)
9. UPDATE orders SET status + matching timestamp:
   CONFIRMED→confirmed_at  PREPARING→preparing_at  READY_FOR_PICKUP→ready_at
   ASSIGNED→assigned_at  PICKED_UP→picked_up_at  OUT_FOR_DELIVERY→out_for_delivery_at
   DELIVERED→delivered_at  COMPLETED→completed_at  CANCELLED/REJECTED→cancelled_at
10. INSERT order_status_logs {from, to, changed_by, actor_role, note}

11. IF terminal-negative (CANCELLED | REJECTED | PAYMENT_FAILED | DELIVERY_FAILED):
    FOR EACH order_item WHERE product_id NOT NULL AND is_removed=0 AND item_type='PRODUCT':
      qty = final_quantity ?? quantity
      UPDATE products SET stock_qty = stock_qty + qty,
                          sold_count = sold_count - LEAST(sold_count, qty)   ← ⚠️ UNSIGNED
      INSERT inventory_logs {reason:'CANCEL'}
    wallet_used > 0 → Wallet.credit(customer, wallet_used, 'ORDER_REFUND')
    REFUND payment_status ke hisaab se:
      'PAID' + GATEWAY → driver refund → REFUNDED
      'PAID' + UPI/COD → Wallet.credit(customer, paid) → REFUNDED
      'AWAITING_VERIFICATION' → ⚠️ customer ne paisa SACH ME bheja hai:
            payments.status = 'REFUND_PENDING'; orders.payment_status = 'REFUND_PENDING'
            → admin ke "रिफंड बाकी" queue me + URGENT notify
      'PENDING' → kuch nahi
    coupon → DELETE coupon_usages; UPDATE coupons SET used_count = used_count - LEAST(used_count,1)
    active assignment → CANCELLED + rider notify + tracking session end

12. IF DELIVERED | COMPLETED:
    collected = final_grand_total ?? grand_total
    assignment → DELIVERED, cod_collected = method==='COD' ? collected : 0
    staff_profiles: total_deliveries + 1, cod_in_hand += (COD ? collected : 0)
    Wallet.credit(rider, assignment.earning, 'RIDER_EARNING')
    method='COD' → payments {PAID, paid_at, amount_final}; orders.payment_status='PAID'
    ⚠️ customer.phone_verified = 0 → set 1
       (saman ghar pahuncha, dukaan ne baat ki — is context me yahi verification hai;
        isse COD limit sirf pehle order tak lagti hai)
    Referral.check(customer, order)              [A22]
    Tracking session end (end_reason='DELIVERED')
    Queue: 30 min baad review request notification
13. COMMIT → socket broadcast + notifications (queue me) → audit log

Hindi labels:
  PENDING_PAYMENT "भुगतान बाकी"  CONFIRMED "ऑर्डर पक्का हुआ"  PREPARING "सामान तैयार हो रहा है"
  READY_FOR_PICKUP "पिकअप के लिए तैयार"  ASSIGNED "डिलीवरी पार्टनर तय हुआ"
  PICKED_UP "सामान उठा लिया"  OUT_FOR_DELIVERY "रास्ते में है"  DELIVERED "डिलीवर हो गया"
  SCHEDULED "समय तय हुआ"  IN_PROGRESS "काम चल रहा है"  COMPLETED "काम पूरा हुआ"
  CANCELLED "रद्द"  REJECTED "मना कर दिया"  DELIVERY_FAILED "डिलीवरी नहीं हो पाई"
```

### A16 — Order adjustment (taul/stock) — sabzi ki rozana hakikat

```
"1 किलो आलू तौला तो 900 ग्राम निकला" · "टमाटर खत्म हो गया, बाकी भेज रहे हैं"
WHO: orders.adjust permission. Sirf CONFIRMED | PREPARING me. settings.order_adjust_enabled

POST /admin/orders/:no/adjust { items: [{itemId, finalQuantity, remove?, note?}] }
1. TRANSACTION; order FOR UPDATE; state + permission check
2. FOR EACH:
   finalQuantity > quantity → 422 "मात्रा बढ़ा नहीं सकते — नया ऑर्डर करवाएं"
   remove → is_removed=1, final_quantity=0, final_line_total=0
   warna final_line_total = unit_price × finalQuantity
   returned = quantity − finalQuantity
   UPDATE products SET stock_qty = stock_qty + returned,
                       sold_count = sold_count - LEAST(sold_count, returned)
   INSERT inventory_logs {reason:'ADJUSTMENT'}
3. Sab items removed → poora order CANCELLED (A15), adjustment nahi
4. new_items_total = Σ (final_line_total ?? line_total) of non-removed
   ⚠️ Coupon dobara validate — naya total min_order se neeche gaya to discount 0 (customer ko batao)
   ⚠️ Delivery fee KABHI NAHI BADHEGI (chahe free_delivery_above se neeche chala jaye) —
      ye jaanbujh kar customer ke favour me hai
   new_grand = MAX(0, new_items_total + delivery_fee + visiting − discount − wallet_used)
5. UPDATE orders {final_items_total, final_grand_total, adjusted_at/by, adjustment_note}
   UPDATE payments SET amount_final
6. payment_status='PAID' && new_grand < grand_total → diff wapas (gateway partial refund
   ya Wallet.credit). COD → rider bas kam paisa lega.
7. COMMIT → socket + push: "आपके ऑर्डर में बदलाव: टमाटर उपलब्ध नहीं था। नया कुल ₹{n} (पहले ₹{m})"
8. Customer ko 5 min ka cancel window (agar PICKED_UP nahi hua)
⚠️ Rider app, bill, COD collection — sab jagah `final_grand_total ?? grand_total`.
   Ek jagah bhi purana total dikha to rider galat paisa lega.
```

### A17 — Payments

```
Driver interface: IPaymentProvider { create, verify, refund }

--- COD ---
create: kuch nahi. DELIVERED pe PAID (A15 §12).
Admin "COD जमा": ⚠️ rider ke WALLET se debit MAT karna — wo paisa wahan kabhi credit hi nahi hua.
  TRANSACTION: staff_profiles FOR UPDATE; amount > cod_in_hand → 422
    UPDATE cod_in_hand -= amount; INSERT cod_settlements {balance_after, received_by, reference}
  (wallet_transactions 'PAYOUT' sirf tab jab rider ki KAMAI cash me di jaaye)
  Admin alert jab kisi rider ka cod_in_hand > ₹3000 ya 3 din purana ho

--- UPI (HDFC direct, 0% fee) ---
create: intent = `upi://pay?pa={vpa}&pn={payee}&am={amount}&cu=INR&tn={orderNumber}`
  Mobile → intent button (GPay/PhonePe/Paytm khulta hai)
  Desktop → QR (server-side generate) + VPA copy button
  Screen: amount bada, "भुगतान के बाद UTR नंबर डालें"
claim POST /payments/upi/claim { orderNumber, utr, screenshot? }:
  ownership check · utr 10–22 alnum · duplicate → 409 (unique index)
  payments {status:'AWAITING_VERIFICATION', upi_utr, upi_claimed_at}
  orders.payment_status = 'AWAITING_VERIFICATION'
  notify ADMIN (shopkeeper nahi — usko sirf info)
verify: ⚠️ SIRF `payments.verify` permission (default me ADMIN only)
  Kyun: paisa platform ke HDFC me aata hai — jo dekh hi nahi sakta wo verify na kare
  → PAID + verified_by + audit → notify customer "भुगतान मिल गया ✓"
reject: FAILED + reason → COD me convert ka option ya cancel+refund

--- GATEWAY (code ready, settings se OFF) ---
webhook POST /webhooks/payment/:driver:
  1. raw body (parse se PEHLE) → HMAC → timingSafeEqual → fail 400 + security log
  2. INSERT webhook_events (provider, event_id) — duplicate key → already processed, return 200
  3. captured → payments PAID (idempotent) · failed → PAYMENT_FAILED + A15
  4. HAMESHA 200 return karo (warna gateway retry karta rahega)

ADMIN REPORT (roz dekhne layak): "अटके हुए भुगतान" —
  payment_status IN (PENDING, AWAITING_VERIFICATION) AND status IN (DELIVERED, PICKED_UP)
  + saare REFUND_PENDING. Ye page khaali hona chahiye.
```

### A18 — Delivery assignment

```
Phase 1 me ADMIN/SUPERVISOR MANUAL (2 rider pe auto-algorithm likhna waste hai).

POST /admin/orders/:no/assign { riderId }   @RequirePermission('delivery.assign')
1. TRANSACTION
2. ⚠️ Ek order pe ek hi ACTIVE assignment (DB me unique nahi hai — reject ke baad dobara
   assign karna hota hai). Code me check:
   SELECT id FROM delivery_assignments
    WHERE order_id=? AND status IN ('OFFERED','ACCEPTED','PICKED_UP') FOR UPDATE
   mila → 409 "इस ऑर्डर पर पहले से डिलीवरी पार्टनर लगा है"
3. rider: role DELIVERY_BOY, status ACTIVE, staff_profiles.is_available
4. INSERT delivery_assignments {order_id, rider_id, job_type, status:'OFFERED',
     earning: settings.rider_per_delivery,
     delivery_otp: pad(crypto.randomInt(0,9999), 4)}
5. changeStatus(order, ASSIGNED, actor)
6. COMMIT → FCM push rider ko + socket `delivery.assigned`
   ⚠️ OTP sirf `order:{no}` room me (customer), `ops:*` me kabhi nahi

Rider accept → ACCEPTED (2 min me na kare → admin alert)
Rider reject → REJECTED + reason; order wapas READY_FOR_PICKUP; admin alert.
               Purani row history me rehti hai, nayi assign ho sakti hai.
Pickup → PICKED_UP (GATE-PAY-PICKUP lagega)
Deliver → customer se 4-digit OTP → A15 GATE-OTP

⚠️ delivery_otp JAANBUJH KAR plain text hai — customer ko dikhana bhi hai aur compare
   bhi karna hai. Short-lived, per-assignment, delivery ke baad NULL.
   Ye §SECURITY ke "OTP hamesha hash" niyam ka declared exception hai.
   Customer ko OTP dikhta hai: order page pe bada + PICKED_UP hone pe push me.
```

### A19 — Location pipeline (§LIVE_TRACKING.md poora padho)

```
Rider app: watchPosition, har 15 s, SIRF jab assignment ACCEPTED | PICKED_UP
socket.emit('delivery.location', {assignmentId, lat, lng, accuracy, speed, ts})

Server (TrackingGateway):
1. AUTH      socket.data.user maujood? role DELIVERY_BOY?
2. OWNERSHIP ye assignment isi rider ka? active hai? (30 s cache)
3. SANITY    lat 6–38 N, lng 68–98 E · accuracy > 200 m → "kamzor signal" flag
             ts 2 min se purana → discard (purana buffer)
4. THROTTLE  pichle accept se < 10 s → drop
5. DEDUPE    (assignmentId, ts) last 50 — same ts dobara → drop
6. MEMORY    in-process Map me last position       ← "live" ka source yahi hai
7. BROADCAST io.to(`order:{no}`) + io.to('ops:delivery') → 'delivery.location.updated'
8. PERSIST   ⚠️ SIRF in me se koi shart poori ho:
             (a) pichle DB point se > 100 m (settings.tracking_persist_meters)
             (b) pichle DB write ko 60 s ho gaye
             (c) pehla ping ya status change
             → INSERT delivery_locations
             Har 30 s: UPDATE tracking_sessions {last_lat, last_lng, last_ping_at, ping_count}

Bachat: 80 ping (20 min delivery) → 160 writes ki jagah ~48 writes (−70%)

STALE: last_ping_at > 90 s (settings.tracking_stale_seconds) → isStale: true
  ⚠️ UI: marker grey + "आखिरी अपडेट 4 मिनट पहले". PURANI LOCATION KABHI "LIVE" NAHI.
3 min ping nahi → session is_live=0 + customer ko "संपर्क टूट गया" + supervisor alert
120 min (tracking_auto_end_min) baad cron auto-close
```

### A20 — Socket.IO auth + rooms

```
io.use(async (socket, next) => {
  token = socket.handshake.auth?.token        ← query string me NAHI
  !token → next(Error('UNAUTHORIZED'))
  payload = jwt.verify(token)
  user = await users.findActiveById(payload.sub)     ⚠️ DB se — token se nahi
  !user || status != ACTIVE → next(Error('UNAUTHORIZED'))
  socket.data.user = { id, role, perms }
  next()
})

⚠️ CLIENT KABHI ROOM NAHI MAANG SAKTA. Connect ke baad SERVER join karta hai:
  sab           → user:{id}
  CUSTOMER      → order:{no} har active order ka
  DELIVERY_BOY  → delivery:{assignmentId} + order:{no} har active assignment ka
  perms.delivery.track → ops:delivery
  perms.orders.view_all → ops:orders
Naya order/assignment bane → SERVER us user ke socket ko room me daalta hai
  (io.in(`user:${id}`).socketsJoin(`order:${no}`))

⚠️ `socket.on('join', r => socket.join(r))` jaisa code KABHI mat likhna —
   ek line me koi bhi kisi ka bhi order track kar lega.

Client → server: SIRF ek event `delivery.location` (DELIVERY_BOY only, A19 ke checks ke saath)
  Baaki kuch bhi emit ho → ignore + audit warning; 3 baar pe disconnect
Ek user max 3 concurrent socket (4th pe sabse purana disconnect)
Reconnect pe: server `tracking.snapshot` bhejta hai (poora current state)
```

### A21 — Prescriptions

```
UPLOAD POST /prescriptions (multipart):
1. Auth CUSTOMER. RateLimit upload:{user} 10/day. Size <= 5 MB
2. MIME `file-type` se ASLI content dekh kar (extension pe bharosa nahi):
   image/jpeg, image/png, image/webp, application/pdf
3. Image → sharp se RE-ENCODE (EXIF strip, embedded payload nahi bachta)
   PDF → magic bytes + size; inline KABHI serve nahi
4. Filename server-generated UUID. User ka naam path me kabhi nahi
5. Store: {STORAGE_PATH}/private/rx/{userId}/{uuid}.{ext}   ← webroot ke BAAHAR
6. INSERT prescriptions {status:'PENDING_REVIEW'} → notify prescriptions.review wale staff

SERVE GET /files/rx/:token
  token = base64url({rxId, uid, exp}) + '.' + hmac_sha256(payload, APP_SECRET)
  1. hmac timing-safe verify → 403
  2. exp <= 10 min → 403
  3. ⚠️ AUR DOBARA authorization check (token purana ho par access beech me chhin gaya ho)
     Access: owner · ADMIN · `prescriptions.review` permission wala staff. Bas.
  4. Headers: private, no-store, nosniff, Content-Disposition: attachment
  5. audit_logs: prescription.view (kaun, kab, kaunsi)

REVIEW POST /prescriptions/:id/review { decision, note }
  @RequirePermission('prescriptions.review')
  status != PENDING_REVIEW → 409
  APPROVED → expires_at = +30d; order.prescription_status='APPROVED'; notify staff+customer
  REJECTED → order.prescription_status='REJECTED';
             changeStatus(order, CANCELLED, actor, note)   → A15 §11 (refund + restock)
  audit log

RETENTION: cron — settings.rx_retention_days (365) se purani files DELETE,
  row rehti hai `purged_at` ke saath. Privacy page pe likha ho.
```

### A22 — Wallet + Referral

```
Wallet ek append-only ledger hai. `balance` sirf fast read ke liye — sach transactions ka sum hai.
credit/debit(trx, userId, amount, source, ref):
  wallet FOR UPDATE → newBalance → UPDATE + INSERT wallet_transactions {balance_after}
  debit me pehle balance >= amount check
⚠️ Parent transaction ke andar call ho sake — apna BEGIN mat karna (Knex trx pass karo)
Daily cron reconciliation: SUM(ledger) vs balance mismatch → admin URGENT alert
  ⚠️ Chup-chaap fix KABHI mat karna

Referral.check(userId, order):   // DELIVERED/COMPLETED pe
  ⚠️ Ye asli paisa hai — bina guards ke fake account se ₹50 chhapna aasan hai
  1. ref = referrals WHERE referred_id AND reward_issued_at IS NULL → nahi to return
  2. COUNT(delivered orders) != 1 → return          (sirf PEHLE order pe)
  3. order.payment_status != 'PAID' → return        (paisa sach me aaya ho)
  4. (final_grand_total ?? grand_total) < settings.referral_min_order → return
  5. customer.phone_verified = 0 → return
  6. ref.referrer_id == userId → return
     referrer aur referred ka signup_ip ya address same → is_flagged=1, admin approve kare
  7. Aaj ke rewards >= settings.referral_daily_cap → skip + flag
  8. TRANSACTION: Wallet.credit(referrer, amount, 'REFERRAL_REWARD') + reward_issued_at
  9. notify referrer
```

### A23 — Reviews

```
ELIGIBILITY: order.status IN (DELIVERED, COMPLETED) AND order.customer_id = you
  AND delivered_at > NOW() - 30 days
  PRODUCT review sirf us order ke item ka (is_removed=0)
  RIDER review sirf usi rider ka
  DB: UNIQUE (order_id, target_type, target_id) → duplicate impossible → 409
comment 0-1000 chars, HTML strip, link mile → is_flagged=1
Aggregate turant (incremental):
  rating_avg = (rating_avg*rating_count + r) / (rating_count+1); rating_count+1
Nightly `ratings:recompute` cron poora dobara ginta hai (hidden/flagged theek karne ke liye)
⚠️ JSON-LD me aggregateRating TABHI jab rating_count >= 1 aur wahi number page pe dikhe.
   Fake/khaali aggregateRating = Google penalty.
Review request notification: DELIVERED ke 30 min baad, ek hi baar
```

### A24 — Services (booking)

```
SLOTS GET /catalog/services/:slug/slots?date=
  settings.service_open_time..close_time, settings.service_slot_minutes (120) ke slots
  Har slot: kitne technician free hain (staff_profiles.is_available − us slot ki bookings)
  Aaj ka slot jo already nikal gaya → mat dikhao
  capacity 0 → slot disabled ("भरा हुआ")

BOOK: cart item me slot_date + slot_start → order (A14, orderType='SERVICE')
  → service_bookings row (completion_otp ke saath)
  Order status: CONFIRMED → SCHEDULED
ASSIGN: technician (DELIVERY_BOY ya SUPERVISOR) → ASSIGNED → FCM push
START: technician "काम शुरू" → IN_PROGRESS + started_at
       (tracking session bhi start — customer dekh sakta hai ki banda aa raha hai)
QUOTE-BASED kaam (is_quote_based=1): technician final_amount daalta hai
  → customer ko approve karna padta hai (push + in-app) → tabhi COMPLETED
COMPLETE: customer se completion_otp → COMPLETED + completed_at + payment settle
RESCHEDULE: customer/staff, max 2 baar (reschedule_count), 2 ghante pehle tak
```

### A25 — Notifications

```
Notify.send(userId, type, title, body, linkUrl, data, channels[], dedupeKey?)
1. INSERT notifications (dedupe_key unique per user → duplicate chup-chaap skip)  ⚠️ §29
2. PUSH channel → Queue 'push.send'
   Mobile: FCM (device_tokens WHERE is_active) — INVALID_TOKEN/NOT_REGISTERED → is_active=0
   Web: Web Push VAPID (push_subscriptions) — 404/410 → delete row
3. SMS channel → Queue 'sms.send' (driver != null tabhi)
Ek hi `INotificationProvider` interface ke peeche FCM aur WebPush dono.

Matrix:
  order.placed        → staff (orders.view_all) PUSH+IN_APP; customer IN_APP
  order.confirmed     → customer PUSH
  order.preparing     → customer IN_APP
  order.ready         → staff (delivery.assign) IN_APP
  delivery.assigned   → rider PUSH; customer PUSH (+ delivery OTP)
  order.picked_up     → customer PUSH "आपका सामान रास्ते में है"
  order.delivered     → customer PUSH  (+30 min baad review request)
  order.cancelled     → customer + staff PUSH
  payment.claimed     → ADMIN PUSH
  payment.verified    → customer PUSH
  rx.pending          → prescriptions.review staff PUSH
  rx.reviewed         → customer PUSH
  service.scheduled   → customer + technician PUSH
  stock.low           → inventory.manage staff, DAILY DIGEST (har item pe nahi)
  cod.high            → ADMIN (rider cod_in_hand > 3000)

Permission maango: pehla order SUCCESS hone ke baad soft-ask
  ("ऑर्डर की जानकारी पाने के लिए सूचनाएं चालू करें" [चालू करें] [बाद में])
  Page load pe KABHI nahi. "बाद में" pe 7 din chup.
```

### A26 — Jobs + cron

```
Queue.push(type, payload, delaySec?, priority?)
Queue.work(maxSec=50):
  claim: UPDATE jobs SET locked_at=NOW(), locked_by=:w
         WHERE done_at IS NULL AND failed_at IS NULL AND run_after<=NOW()
           AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL 5 MINUTE)
         ORDER BY priority, id LIMIT 1
  job = SELECT WHERE locked_by=:w AND locked_at IS NOT NULL AND done_at IS NULL ORDER BY id LIMIT 1
  ok    → done_at, locked_by=NULL, locked_at=NULL
  fail  → attempts+1; >= max → failed_at + admin alert
          warna run_after = NOW() + POW(2, attempts) MINUTE, locked_at=NULL, ⚠️ locked_by=NULL
  ⚠️ locked_by clear na kiya to wahi failed job baar baar uthegi, ek hi run me saare
     retries kha jayegi, backoff kabhi nahi lagega, peeche ke push/SMS bhookhe rahenge

@Cron('*/5 * * * *') dispatcher — har task ka last-run `cron_state` TABLE me
  (⚠️ settings me NAHI — warna har 5 min settings badalti aur cache flush hota)
every run   : queue:work
every run   : orders:auto-cancel
              WHERE status='PENDING_PAYMENT'
                AND placed_at < NOW() - INTERVAL settings.order_auto_cancel_min MINUTE
                AND NOT (requires_prescription=1 AND prescription_status='PENDING_REVIEW')
                AND payment_status <> 'AWAITING_VERIFICATION'
              ⚠️ Rx-pending orders ko yahan se BAHAR rakho — warna har dawai ka order
                 30 min me mar jayega. Unke liye settings.rx_pending_timeout_hours (24)
              ⚠️ AWAITING_VERIFICATION bhi bahar — customer ne paisa bhej diya hai
every 15min : riders:offline-stale (last_ping 30 min nahi → is_available=0)
              tracking:auto-close (120 min purani live sessions)
daily 00:30 : analytics:rollup
daily 01:00 : backup:db (mysqldump --single-transaction | gzip, 14 din rakho)
daily 02:00 : licenses:check (supplier FSSAI expiry — 15 din pehle warning)
daily 02:30 : cleanup (otp 7d, sessions expired 30d, rate_limits 1d, idempotency 1d,
              delivery_locations 7d, search_logs 90d, jobs done 7d, webhook_events 90d,
              carts 7d, prescriptions files > rx_retention_days)
daily 03:00 : sitemap:build
daily 03:30 : ratings:recompute
daily 04:00 : wallet:reconcile (mismatch → URGENT alert, chup-chaap fix nahi)
weekly Mon  : admin digest (orders, GMV, zero-result searches, low stock,
              atke hue payments, rider cod_in_hand)
⚠️ Lock file se overlapping run roko. Cron miss ho jaye to catch-up ho.
```

### A27 — Images

```
Upload: max 8 MB, real mime, dimensions <= 6000px
sharp: EXIF strip → resize → WebP q82
  product: 200w (grid), 600w (detail), 1200w (zoom)   supplier logo: 120w
  banner: 1200w + 600w
Filename: {slug}-{random6}-{width}.webp → uploads/products/{yyyy}/{mm}/
  (date folders — ek folder me hazaar files nahi)
DB me url, url_sm, width, height (⚠️ CLS zero ke liye zaroori)
Delete pe file bhi delete (orphan files disk khaate hain)
⚠️ Request time pe KABHI resize nahi
Frontend: next/image ya <img srcset> + width/height + loading="lazy" + decoding="async"
  LCP image: priority / fetchpriority="high"
```

---

## 8. WEBSITE (Next.js) — ek site, role se dashboard

```
apps/web/src/app/
├── (public)/                    # SSR + ISR (revalidate 60), indexed
│   page.tsx · [vertical]/page.tsx (/sabzi /phal /kirana /dawai /kheti /sewa)
│   category/[slug] · product/[slug] · service/[slug] · area/[slug]
│   khoj · blog · blog/[slug] · (legal)/{privacy,terms,refund,shipping,about,contact,faq}
│   sitemap.ts · robots.ts · manifest.ts
├── (auth)/login/                # phone → OTP
└── (app)/                       # noindex
    layout.tsx                   # server-side: session → role → sahi shell + redirect
    mera/ · admin/ · supervisor/ · delivery/
```

**Login ke baad:** backend `{user, role}` → server-side redirect
CUSTOMER→`/mera` ADMIN→`/admin` SUPERVISOR→`/supervisor` DELIVERY_BOY→`/delivery`
⚠️ Ye **sirf UX** hai — asli suraksha backend guards me hai.

**Token:** refresh **httpOnly+Secure+SameSite=Lax cookie** me. Access memory me.
Server components cookie se refresh karke API call karte hain. ⚠️ localStorage me KABHI nahi.

### Screens

```
CUSTOMER    Home · Categories · Product listing · Search · Product detail · Service detail
            Cart · Checkout · Address management · Orders · Order detail · Live tracking
            Wallet · Prescriptions · Notifications · Profile
ADMIN       Dashboard · Orders · Products · Categories · Suppliers · Inventory · Customers
            Staff · Permissions · Delivery board · COD settlement · Payments (verify)
            Refund queue · Coupons · Reports · Content (blog/pages/FAQ) · Settings · Audit logs
            **Villages (A8.10 — सबसे ज़्यादा इस्तेमाल होने वाली स्क्रीन)** · **Service area (map editor — A8.6)** · **Area requests (expansion list — A8.11)**
SUPERVISOR  Dashboard · Orders · Delivery board · Inventory · Customers (view) · Reports
            (sirf jo permissions me hai — UI permission se render ho)
DELIVERY    Dashboard · Assigned deliveries · Order detail · Customer info · Navigate
            Start delivery · Live location · Complete (OTP) · History · Earnings
```

---

## 9. DESIGN SYSTEM — "premium" ka matlab yahan kya hai

**Feel:** taaza, saaf, bharosemand. Fatanpur ke haat ki energy + platform ka bharosa.
Startup-y gradient soup nahi. Boldness sirf do jagah: **product photo aur price**.

Premium lagne ke asli lever (inhe follow karoge to premium lagega):

1. Consistent spacing rhythm (4px scale, kabhi random 13px nahi)
2. Ek hi radius family, ek hi shadow family
3. Ek screen pe sirf 3 type sizes
4. Generous whitespace, kam borders
5. Har interactive element ka hover/active/focus/disabled state
6. **Skeleton loaders, spinner nahi**
7. **Koi layout shift nahi** (har image pe width/height)
8. 150 ms se lambi koi animation nahi

### Tokens (Tailwind config me + CSS variables)

```css
--g-950: #062018;
--g-900: #0c3323;
--g-800: #11492f;
--g-700: #166b3c; /* PRIMARY — buttons, links, active nav */
--g-600: #1e8449; /* hover */
--g-500: #2fa35f; /* success, in-stock */
--g-200: #bfe3cc;
--g-100: #e6f4ea;
--g-50: #f2f9f4;
--a-700: #a9660b;
--a-600: #c97a0e;
--a-100: #fdf2dc; /* offers/discount — kam use */
--ink: #12211a;
--ink-2: #48584f;
--ink-3: #7a8a80;
--surface: #f6f8f6; /* page bg — pure white nahi, saste screens pe glare kam */
--card: #ffffff;
--line: #dee7e1;
--danger: #c0392b;
--warn: #c97a0e;
--ok: #1e8449;
--info: #1e6f8c;
--r-sm: 8px --r: 12px --r-lg: 16px --r-full: 999px --sh-1: 0 1px 2px
  rgba(12, 51, 35, 0.06) --sh-2: 0 2px 8px rgba(12, 51, 35, 0.08) space: 4 8 12
  16 20 24 32 40 48 64 type: 12 13 14 16 18 20 24 30 36 (base 16)
  --header-h: 56px --bottomnav-h: 58px --maxw: 1280px;
```

Rules: page bg hamesha `--surface`. Green sirf primary action aur brand moment pe.
Har text/bg pair WCAG AA (4.5:1). **Dark mode mat banao**, par `color-scheme: light` declare karo.

### Typography

**Mukta** (Latin + Devanagari), weights 400/600/700, **self-hosted woff2** (Google CDN nahi).
`next/font/local`. `unicode-range` se Latin aur Devanagari alag. Sirf 400 preload.
Base 16px, mobile pe kabhi 14 se chhota body nahi (users me kaafi 40+ hain).
Headings 600/700 lh 1.2 · body 400 lh 1.65 · **price `tabular-nums`, weight 700**.
ALL CAPS labels nahi. Heading me ek word alag color nahi.

### Layout

```
Mobile (<768):
┌──────────────────────────────┐
│ लोगो  फतनपुर बाज़ार    [🔍][👤] │ sticky 56px
│ 📍 रानीगंज · 6 किमी तक डिलीवरी │ 36px, --g-50
├──────────────────────────────┤
│ [सब्ज़ी][फल][किराना][दवाई][सेवा] │ chips, h-scroll, snap
├──────────────────────────────┤
│   product grid: 2 columns     │ gap 12
├──────────────────────────────┤
│ [🛒 3 items · ₹245  देखें]     │ floating cart bar
│ [🏠][🔍][🛒][📦][👤]           │ bottom nav 58px + safe-area
└──────────────────────────────┘
Tablet 768–1023: 3-col, bottom nav ON
Desktop ≥1024: sidebar (verticals+categories) + 4-col grid, bottom nav OFF
```

**Non-negotiable:** tap target 48×48 · **320px pe koi horizontal scroll nahi** ·
product page pe mobile me sticky "कार्ट में डालें" bar · forms single column ·
`env(safe-area-inset-bottom)` · har image pe width+height.

### Product card

```
┌─────────────────┐
│  [image 1:1]    │ lazy, WebP, aspect-ratio box
│  [17% छूट]      │ ribbon agar mrp > price
├─────────────────┤
│ आलू             │ 15px/600, 2-line clamp
│ 1 किलो           │ 13px --ink-3
│ ₹25  ₹̶3̶0̶       │ 18px/700 + strike 13px
│ शर्मा किराना से   │ 11px --ink-3   ← supplier (show_on_product hone pe)
│ [कार्ट में डालें] │ full-width 40px → cart me hone pe qty-stepper
└─────────────────┘
```

### Components (shadcn/ui base + apne)

button (primary/secondary/ghost/danger × sm/md/lg + loading) · input/select/textarea (48px,
label upar, error neeche) · chip · badge · card · product-card · qty-stepper · sheet
(bottom mobile / modal desktop) · toast (aria-live) · tabs · accordion · table (admin,
overflow wrapper) · pagination · **empty-state** (icon + line + action) · **skeleton** ·
alert · **order-timeline** · stars · avatar · sticky-action-bar · price-block · offer-ribbon

### Copy (Hindi primary)

Har string `apps/web/src/lib/i18n/hi.ts` me — **hardcode bilkul nahi**.
Devanagari primary, English bracket me jahan zaroori: "आलू (Potato)".
Button me exact action: "ऑर्डर करें", "कार्ट में डालें" — "Submit"/"OK" nahi.
Empty state invite kare: "कार्ट खाली है — ताज़ी सब्ज़ी देखें"
Error bataye ab kya karein: "यह पता 6 किमी से बाहर है — दूसरा पता चुनें"
Numbers Latin digits me (₹245, 6 किमी).

### Motion & a11y

Sirf user action ka response, ≤150 ms, ease-out. **Scroll-triggered animation bilkul nahi.**
`prefers-reduced-motion` respect. `<html lang="hi">`. Har field pe label.
Focus ring 2px `--g-600` offset 2. Har image pe Hindi alt. Keyboard se poora checkout.

---

## 10. MOBILE APP (React Native) — ek app, role-based navigation

```
apps/mobile/src/
├── navigation/RootNavigator.tsx    # auth state → Auth | RoleNavigator
├── navigation/RoleNavigator.tsx    # switch(user.role) → Customer | Delivery | Staff
├── screens/customer/   Home Categories Search Product Service Cart Checkout
│                       Orders Tracking Wallet Prescriptions Profile
├── screens/delivery/   Dashboard AssignedOrders OrderDetail Navigate
│                       StartDelivery LiveLocation CompleteDelivery History Earnings
├── screens/staff/      Dashboard Orders DeliveryBoard Reports
├── services/           api (auto refresh) · socket · fcm · location · storage
└── store/              auth cart tracking
```

- Role **backend se** (`/auth/me`), app state se nahi. App restart pe dobara verify.
- Staff stack lazy load — customer build me admin screens render hi nahi hoti
- Tokens **react-native-keychain** me (AsyncStorage me nahi)
- FCM: token `POST /notifications/device-token`; logout pe deactivate
- Location: foreground service + persistent notification (Android). Delivery khatam →
  `watchPosition` clear + service stop (⚠️ ye zaroori hai)
- Battery < 15% → interval 15 s → 30 s, high accuracy off, user ko batao
- Offline → AsyncStorage queue (max 20 points), online pe flush

---

## 11. SEO

- `generateMetadata` har page pe: unique title (50–60), description (150–160), canonical, OG
  Pattern: `{Page} — फतनपुर बाज़ार | रानीगंज, प्रतापगढ़`
- Hindi slugs: `/sabzi /phal /kirana /dawai /kheti /sewa /khoj /area/{gaon}`
- `/area/{village}` — har gaon ka **apna unique 200-word intro** (DB se editable).
  ⚠️ Duplicate content mat banana — 8 gaon ke 8 alag paragraph
- JSON-LD: Organization + LocalBusiness (geo + areaServed GeoCircle 6 km + openingHours) ·
  WebSite+SearchAction · ItemList (category) · Product+Offer (+aggregateRating sirf asli) ·
  BreadcrumbList · FAQPage · BlogPosting
- `sitemap.ts` (products, categories, areas, blog, legal) + `robots.ts`
  ⚠️ `/mera /admin /supervisor /delivery /api /cart /checkout /login` — Disallow + noindex
- Blog: launch pe 6 post (content seed me ready):
  "फतनपुर बाज़ार में ऑनलाइन सब्ज़ी कैसे मंगाएं" · "रानीगंज में घर बैठे किराना" ·
  "प्रतापगढ़ के किसानों के लिए खाद-बीज" · "गर्मी में सब्ज़ी कैसे स्टोर करें" ·
  "फतनपुर बाज़ार का इतिहास" · "ऑनलाइन ऑर्डर पर पैसे कैसे बचाएं"
- Footer me NAP (Name, Address, Phone) — Google Business Profile se exact same format

---

## 12. SECURITY — `SECURITY_AUDIT.md` poora follow karo

Non-negotiable summary:

```
1. Har query parameterised. Dynamic ORDER BY/LIMIT sirf allowlist se
2. dangerouslySetInnerHTML sirf admin content pe + allowlist sanitizer
3. helmet + CORS allowlist (⚠️ origin '*' KABHI nahi) + body limit 1MB (upload 8MB)
4. Rate limits: SECURITY_AUDIT §5 ki poori table
5. Uploads: real mime + re-encode + private storage + signed URL + dobara authz check
6. Ownership check har jagah. Dusre ka resource → 404 (403 nahi)
7. req.body.userId / query.customerId pe KABHI bharosa nahi
8. Secrets sirf env. Frontend bundle me kabhi nahi. Boot pe validate
9. Audit log: staff.*, price change, inventory, order status manual, payment verify,
   refund, delivery reassign, settings, prescription view/review
10. Error: customer ko saaf Hindi + ref code. Stack trace/SQL error KABHI response me nahi
11. Login/OTP timing constant (user exist karta hai ya nahi — leak na ho)
12. Aakhri ADMIN lock · allow_admin_creation default OFF
```

---

## 13. PERFORMANCE BUDGET (build ke end me measure karke report karo)

| Metric                     | Target    | Hard fail |
| -------------------------- | --------- | --------- |
| Homepage HTML (gzip)       | ≤ 35 KB   | 50 KB     |
| First Load JS (homepage)   | ≤ 110 KB  | 150 KB    |
| CSS (gzip)                 | ≤ 20 KB   | 30 KB     |
| Product thumb              | ≤ 20 KB   | 35 KB     |
| DB queries per public page | ≤ 8       | 15        |
| API p95 (50 concurrent)    | ≤ 150 ms  | 400 ms    |
| Next.js process RSS        | ≤ 150 MB  | 250 MB    |
| API process RSS            | ≤ 150 MB  | 250 MB    |
| Lighthouse mobile Perf     | ≥ 90      | 85        |
| Lighthouse SEO / a11y      | 100 / ≥95 | —         |
| LCP (4G, mid Android)      | ≤ 2.5 s   | 3.0 s     |
| CLS                        | ≤ 0.05    | 0.1       |

---

## 14. SEED DATA

```
Permissions + settings: schema.sql me already (31 + 52)
Service zone: 1 row — Fatanpur center, mode RADIUS, radius 6 km (schema.sql me seeded)
  ⚠️ Seed me comment: "center approximate hai, admin map editor se exact karein"
Villages: 8–10 (Section 1 ki list) — lat/lng, distance, eta, delivery_fee,
  is_popular (top 3), aur har ek ka 200-word unique intro_html
Village aliases: har gaon ke 2–4 alias — roman spelling, Devanagari, aur uske tole
  (जैसे रानीगंज → "Raniganj", "Rani Ganj", "raniganj")  ⚠️ picker ki search isi pe chalti hai
  ⚠️ Seed ke waqt har village ka `distance_km` haversine se compute karo aur
     agar 6 km se bahar ho to `is_active=0` seed karo + console pe warning print karo
  ⚠️ Coordinates approximate hain — seed me comment likho ki admin panel se exact karne hain
Service area requests: 3 demo (alag-alag gaon se) taki admin ka expansion report khaali na lage
Users: 1 ADMIN (CLI se), 1 SUPERVISOR, 2 DELIVERY_BOY, 3 CUSTOMER
Suppliers: 4 (Sharma Kirana, Fatanpur Mandi, Verma Store, Local Farmer)
Categories: 14 (सब्ज़ी, हरी सब्ज़ी, फल, आटा-दाल, तेल-मसाला, चाय-चीनी, साबुन-डिटर्जेंट,
  बिस्किट-नमकीन, दूध-डेयरी, दवाई, खाद-बीज, घर की मरम्मत, गैस-अप्लायंस, दस्तावेज़)
Products: 80 PRODUCT + 8 SERVICE — asli naam + Hindi + realistic price
  + search_text synonyms (aloo/alu/potato/आलू, pyaz/onion/प्याज, tamatar/tomato/टमाटर...)
  Placeholder images KHUD generate karo (green-tint bg + product name text, 200w+600w WebP)
  ⚠️ Bahar se image download mat karna
Search synonyms: 60
Blog: 6 post (Section 11 ki list), asli Hindi content 400+ words each
Pages: about, privacy, terms, refund, shipping, contact — asli content (lorem nahi)
FAQs: 10 · Coupons: 3 (NAYA50, FREEDEL, SABZI10) · Banners: 2
Orders: 6 demo alag-alag status me (dashboard khaali na lage) + 1 service booking
```

---

## 15. TESTING — `npm run test` (khud likho, khud chalao)

`TEST_REPORT.md` me 102 planned tests hain. Kam se kam ye chalne chahiye:

**Unit** — haversine · money · order state machine matrix (har allowed pass, har disallowed fail)
· coupon (8 case) · permission resolution · search synonym · `decrementUnsigned` · slug · OTP hash

**Integration (test DB pe, har test se pehle truncate+seed):**

```
🔒 SEC   Public register + role:'ADMIN' → role CUSTOMER
🔒 SEC   ?role=ADMIN query → ignore
🔒 SEC   Anjaan phone staff login → staff account NAHI banta
🔒 SEC   Disabled user ka valid token → 403
🔒 SEC   Refresh reuse → poori chain revoke
🔒 RBAC  CUSTOMER→/admin/* (har route) → 403
🔒 RBAC  CUSTOMER→dusre ka order → 404
🔒 RBAC  DELIVERY_BOY→/admin/staff → 403 · dusre rider ka assignment → 403
🔒 RBAC  SUPERVISOR→POST /admin/staff → 403 · grant ke baad → 200
🔒 RBAC  SUPERVISOR→settings → 403 (grant ke baad bhi — ADMIN-only)
🔒 RBAC  Token tampering → 401 · DB role downgrade → turant 403
   ORD   COD order end-to-end (stock, snapshot, payment row)
🔒 ORD   Idempotency: same key 2 baar → ek order
🔒 ORD   CONCURRENT: stock=1, 2 order → exactly 1 pass
🔒 ORD   CONCURRENT: stock=10, 10 order → 10 pass, stock 0, oversell nahi
   ORD   Cancel → stock wapas, wallet refund, coupon rollback, sold_count sahi
   ORD   Out of area 422 · min order 422 · COD limit 422 (aur delivered ke baad hat jaye)
   ORD   Invalid transition 409 · rider reject → dobara assign ho jaye
   ORD   Adjustment: qty kam → stock+total+refund sahi · qty badhana → error
   ORD   Rx gate: bina approval CONFIRMED nahi · reject → cancel+refund+restock
   ORD   Service: slot → assign → start → completion OTP → COMPLETED
   PAY   COD: delivery OTP pe hi PAID · UPI claim → AWAITING_VERIFICATION
🔒 PAY   Duplicate UTR 409 · SUPERVISOR verify → 403 · client paid:true → ignore
🔒 PAY   Prepaid bina PAID → PICKED_UP block
   PAY   AWAITING_VERIFICATION cancel → REFUND_PENDING queue
   TRK   Stale (90s) → isStale true · reconnect → snapshot · complete → session end
🔒 TRK   Bina token connect → disconnect
🔒 TRK   Dusre order ka room → koi data nahi
🔒 TRK   Dusre rider ki location → reject + log
   TRK   <100m → DB write nahi (par broadcast hota hai) · duplicate ts → ek count
   RX    Bina token file → 403 · expired token → 403 · dusre user ka → 403
   JOB   Ek failing job ek run me saare retries na khaye (backoff lage)
```

**E2E (Playwright, web):** guest browse → cart → login (OTP) → address → COD order →
admin confirm → assign → rider deliver (OTP) → customer review

**Smoke:** 25 public URL 200 · `<h1>` exactly 1 · security headers · robots+sitemap valid XML ·
JSON-LD valid · 320px pe horizontal scroll nahi · performance budget measure

Output: `TESTS: N passed, 0 failed` + `TEST_REPORT.md` update karo asli numbers ke saath.
⚠️ Koi test fail ho to us phase se aage MAT badho.

---

## 16. BUILD ORDER — ek continuous run, 14 phases

```
P1  Monorepo + shared-types (enums, order state machine, API types) + config + CI skeleton
    ✅ npm workspaces chale, tsconfig strict, lint pass

P2  DB: schema.sql → migration + Knex + repositories + seed
    ✅ migrate + seed chale, 54 tables, unit tests (money, geo, unsigned) pass

P3  Backend core: main.ts, config validation, guards, decorators, interceptors, filters,
    Zod pipe, rate limiter, audit, jobs/cron skeleton, /health
    ✅ /health 200, galat env pe app start na ho

P4  Auth: OTP send/verify, JWT + refresh rotation, sessions, staff login gate
    ✅ AUTH tests pass — khaaskar role-injection wale

P5  RBAC: permissions resolve + cache, staff CRUD, permission grant/revoke, admin bootstrap CLI
    ✅ saare 17 RBAC test pass

P6  Catalog: categories, products (PRODUCT+SERVICE), suppliers, search+synonyms, compliance
    kill-switch, images pipeline
    ✅ disabled vertical har jagah se gayab, out-of-stock detail page 200

P7  Cart + Pricing + Coupons + addresses + **geo/service-area (A8 poora)**
    **village picker (A8.9) + aliases** · GPS validation + accuracy handling · zone matching · sorry screen + lead capture
    ✅ quote sahi, GEO-01..12 pass, out-of-area 422 dono jagah (quote + order), min order block

P8  Orders: placement transaction, idempotency, state machine (dono path), adjustment,
    inventory concurrency
    ✅ ORD tests pass — khaaskar dono CONCURRENT wale

P9  Payments: COD, UPI intent+QR+claim+verify, refund, gateway driver (OFF), webhook idempotency
    ✅ PAY tests pass

P10 Delivery + Tracking: assignment, delivery OTP, Socket.IO gateway, location pipeline,
    tracking sessions, COD settlement
    ✅ TRK tests pass, 100 socket ka memory test

P11 Services + Prescriptions + Wallet + Referral + Reviews + Notifications (FCM + WebPush)
    ✅ rx access scoping, referral anti-abuse, duplicate review 409

P12 Website: design system, saare public pages + SEO + JSON-LD + sitemap, auth flow,
    customer app, admin panel (**+ villages A8.10 + service-area map editor A8.6 + area requests A8.11**),
    supervisor panel, delivery panel
    ✅ Lighthouse ≥90, 320px pe koi h-scroll nahi, E2E pass, GEO-13..16 pass

P13 Mobile: RN app, role navigation, customer + delivery + staff screens, FCM, location
    service, socket client, keychain storage
    ✅ Android build banta hai, dono role ka flow chalta hai

P14 Hardening: security headers, rate limits verify, performance budget measure,
    Playwright E2E, docs update, deploy artifacts, seed-admin CLI
    ✅ saare tests green, budget table green, TEST_REPORT.md asli numbers ke saath
```

---

## 17. FINAL DELIVERABLES

1. **Poora monorepo** — chalta hua, seeded, tested
2. **`TEST_REPORT.md` updated** — asli pass/fail + performance budget ke asli numbers
3. **`ASSUMPTIONS.md`** — jo bhi assume kiya
4. **`README.md`** — local setup (5 command me chal jaye)
5. **`ADMIN-GUIDE-HINDI.md`** — **poori Hindi me**, non-technical ke liye:
   product kaise add karein · order kaise confirm karein · stock kaise badlein ·
   rider kaise assign karein · UPI payment kaise verify karein · COD cash kaise jama lein ·
   staff kaise banayein · coupon kaise banayein. Numbered steps, screenshots ki jagah saaf shabd.
6. **`.env.example`** dono apps ke liye, har variable ka comment
7. **CI workflow** — test + build + deploy artifact (⚠️ do Next build kabhi parallel nahi)
8. **Deploy artifacts** — `apps/web/.next/standalone` + `apps/api/dist`
9. **`NEXT-STEPS.md`** — launch se pehle owner ko kya karna hai (checklist):
   exact coordinates · village list · UPI VPA · support phone · DLT/SMS provider ·
   WebSocket test · Play Store · FSSAI · legal pages review

---

## 18. CODE QUALITY

- TypeScript strict, `any` nahi. Har function pe param + return type
- Function 50 line se lambi na ho. Class ek hi kaam kare
- Magic number nahi — settings ya constant
- Har `catch` me log + user-friendly Hindi message. Empty catch kabhi nahi
- Comment **kyun** bataye, **kya** nahi. Har business rule ke upar comment
- Har list query paginated. Har data view pe loading + empty + error teenon states
- Duplicate code 3rd baar dikhe to helper banao
- Koi TODO/FIXME chhod ke mat jaana — ya kar do ya `ASSUMPTIONS.md` me likho
- Commit granular, message me kya aur kyun

---

Ab **P1 se shuru karo aur P14 tak bina ruke jao.**
Har phase ke baad ek line ka status. End me Section 17 ke saare deliverables.

===PROMPT END===
