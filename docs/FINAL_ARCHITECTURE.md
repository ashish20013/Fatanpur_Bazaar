# FINAL_ARCHITECTURE.md
**Fatanpur Bazaar** — production e-commerce + delivery platform
Version 3.0 · 8 September 2026 · Status: **LOCKED** (audit complete, ready to build)

---

## 1. Scope aur scale (jispe har decision tika hai)

| | |
|---|---|
| Visitors | 50–100/day normal, ~200/day peak |
| Orders | 50–100/day maximum |
| Staff Day 1 | 1 ADMIN, 1 SUPERVISOR, 2 DELIVERY_BOY (hard-coded nahi — DB me kitne bhi) |
| Service area | Fatanpur Bazaar, Raniganj, Pratapgarh, UP 230301 — **6 km** (`service_zones`: RADIUS ya POLYGON, admin map editor se) |
| Catalog | Sabzi, phal, kirana, dawai (license ke baad), kheti ka saman, **aur services** |
| Meat/chicken | **Scope se bahar** (owner ka faisla) |
| Seller model | **Single store** — saara saman admin list karta hai. Supplier ka naam product ke neeche dikhta hai, uska koi dashboard nahi. |
| Peak concurrency | ~10–15 simultaneous users, ~4 live socket connections |

Ye numbers har page pe yaad rakhne hain. Is scale pe **Redis, queues, microservices, sharding, load balancer — sab waste hain**. Lekin code aisa hona chahiye ki VPS pe jaane pe kuch rewrite na karna pade.

---

## 2. Stack — final

| Layer | Choice | Version |
|---|---|---|
| Backend | **NestJS** (modular monolith) | Nest 11 |
| Runtime | **Node.js 24 LTS** | Active LTS (Oct 2025 – Oct 2026 active, EOL Apr 2028) |
| Language | TypeScript strict | TS 5.x |
| DB | **MySQL 8 / MariaDB 10.4+** (dono pe chale) | — |
| DB access | **mysql2 + Knex query builder** (raw SQL jahan zaroori) | — |
| Website | **Next.js App Router** (SSR + ISR) | Next 15 |
| Realtime | **Socket.IO** (WebSocket → polling fallback) | 4.x |
| Mobile | **React Native** (bare, ek hi app, role-based navigation) | 0.7x |
| Push | **FCM** (mobile) + **Web Push VAPID** (website) — ek hi NotificationService ke peeche | — |
| Auth | Phone + OTP → **JWT access (15 min) + rotating refresh (30 din, DB me hashed)** | — |
| Maps | **Provider abstraction** — default OSM/MapLibre, Google drop-in | — |
| Payments | **COD + UPI direct (HDFC VPA)** — gateway driver ready par OFF | — |
| Cache | In-process LRU + HTTP cache headers. **Redis nahi** (abhi) | — |
| Uploads | Local disk, private dir + signed URL | — |

### Node version: 24 kyun, 22 nahi
September 2026 me Node 24 **Active LTS** hai (Oct 2025 se), Node 22 **Maintenance LTS** ho chuka (EOL Apr 2027), Node 20 **EOL ho chuka** (Apr 2026). Node 26 abhi LTS nahi hua (Oct 2026 me hoga). Isliye 24 hi sahi jagah hai — naya isliye nahi ki naya hai, balki isliye ki wo abhi active support me hai aur uska window sabse lamba hai (Apr 2028).
Hostinger 18/20/22/24 support karta hai → **24 select karna**.

### Do cheezein jo instruction se hatke hain (aur kyun)

1. **Prisma nahi, Knex + mysql2.** Prisma ka query engine binary ~15–20 MB hai aur har app instance uska apna copy load karta hai. Char Node processes (do apps × 2) pe ye 60–80 MB aur ~15k inodes ka fokat kharcha hai. Knex halka hai, raw SQL likhne deta hai (jo `FOR UPDATE` aur UNSIGNED-safe arithmetic ke liye hume chahiye hi hai), aur migrations bhi deta hai. TypeScript types hum khud define karte hain — 54 tables ke liye ek din ka kaam, phir hamesha ke liye control.
2. **Pharmacist alag role nahi.** Instruction me roles exactly 4 hain (CUSTOMER/ADMIN/SUPERVISOR/DELIVERY_BOY). Isliye parchi jaanchne ka haq ek **permission** hai (`prescriptions.review`) jo ADMIN kisi bhi staff ko de sakta hai. Ye instruction §5 ke "future permission system" wale point ko bhi poora karta hai.

---

## 3. Deployment topology

```
                    HOSTINGER (ek hi plan, 3 GB / 2 core)
 ┌───────────────────────────────────────────────────────────────────┐
 │                                                                   │
 │  fatanpurbazaar.com          →  Next.js app     (Node process #1) │
 │  api.fatanpurbazaar.com      →  NestJS API      (Node process #2) │──┐
 │                                  ↑ Socket.IO yahi se               │  │
 │  app2domain.com              →  Next.js app     (Node process #3) │  │
 │  api.app2domain.com          →  NestJS API      (Node process #4) │  │
 │                                                                   │  │
 │  gstbillgenerator.com        →  PHP (purani site, chhedna nahi)   │  │
 │  2 static websites           →  LiteSpeed static                  │  │
 └───────────────────────────────────────────────────────────────────┘  │
                                                                        │
   MySQL (Hostinger managed)  ◄────────────────────────────────────────┘
   fatanpur_db   ·   app2_db        ← alag DB, alag user, alag password

   React Native app  ──HTTPS + WSS──►  api.fatanpurbazaar.com
                     ──FCM──────────►  Firebase (sirf push delivery)
```

**Char Node processes, 5 ki limit** — ek spare bachta hai (staging ke liye nahi, emergency ke liye).
Detail aur asli math: `HOSTING_CAPACITY.md`.

### Alag API subdomain kyun (Next.js ke API routes me nahi ghusaya)
- Mobile app aur website **dono** ko same backend chahiye. Agar API Next.js ke andar hoti to mobile app ko website ke deployment se bandhna padta.
- Socket.IO ko ek lamba-jeevi process chahiye. Next.js ka process page rendering ke liye hai; usme socket rakhna dono ko aapas me bandh deta hai.
- Instruction §20: "Business logic NestJS me. Next.js/React Native me duplicate nahi." Alag process isko physically enforce karta hai.
- VPS pe jaane pe ye topology waisi ki waisi chalti hai — sirf `API_URL` badalta hai.

---

## 4. Backend — NestJS modular monolith

```
apps/api/src/
├── main.ts                     # bootstrap, helmet, CORS, validation pipe, graceful shutdown
├── app.module.ts
├── common/
│   ├── guards/                 # JwtAuthGuard, RolesGuard, PermissionsGuard, OwnershipGuard
│   ├── decorators/             # @Public() @Roles() @RequirePermission() @CurrentUser()
│   ├── interceptors/           # LoggingInterceptor, TransformInterceptor, AuditInterceptor
│   ├── filters/                # AllExceptionsFilter (kabhi stack trace bahar nahi)
│   ├── pipes/                  # ZodValidationPipe
│   └── utils/                  # money.ts, geo.ts, ids.ts, hash.ts, phone.ts
├── config/                     # typed config (env validation boot pe — galat env = app start hi na ho)
├── database/
│   ├── knex.provider.ts        # pool: min 2, max 8  ⚠️ (2 apps × 8 = 16 < 50 limit)
│   ├── migrations/
│   ├── seeds/
│   └── repositories/           # har table ka typed repository
└── modules/
    ├── auth/                   # OTP, JWT, refresh rotation, staff login gate
    ├── users/                  # profile, addresses
    ├── staff/                  # ⚠️ SIRF yahan se staff banta hai
    ├── permissions/            # RBAC resolve + cache
    ├── catalog/                # categories, products (PRODUCT + SERVICE), suppliers, search
    ├── inventory/              # stock, transaction-safe, inventory_logs
    ├── cart/                   # server-side cart, guest merge
    ├── orders/                 # placement, state machine, adjustment
    ├── payments/               # COD, UPI claim/verify, gateway driver (OFF)
    ├── delivery/               # assignment, OTP verify, COD settlement
    ├── tracking/               # Socket.IO gateway + location pipeline
    ├── services/               # service booking, slots, technician
    ├── prescriptions/          # upload, private serve, review (permission-gated)
    ├── notifications/          # FCM + WebPush + in-app, dedupe
    ├── coupons/  referrals/  reviews/  wallet/
    ├── content/                # pages, faqs, blog, banners
    ├── admin/                  # dashboards, reports, settings
    ├── audit/                  # audit_logs writer + reader
    └── jobs/                   # @Cron scheduler + jobs table drain
```

**Niyam:** module ek dusre ke **service** ko inject karte hain, dusre ke repository ko nahi. Cross-module DB access mana hai — isse baad me module nikalna aasan rehta hai.

### Request lifecycle
```
HTTP → helmet → CORS(allowlist) → body limit(1MB, upload 8MB) → rate limit
  → JwtAuthGuard      (token valid? user ACTIVE? role DB se, token se NAHI)
  → RolesGuard        (@Roles('ADMIN'))
  → PermissionsGuard  (@RequirePermission('staff.create'))
  → ZodValidationPipe (whitelist — extra fields chup-chaap gir jaate hain)
  → Controller (patla) → Service (business logic) → Repository (SQL)
  → TransformInterceptor ({ok, data} envelope)
  → AuditInterceptor (dangerous actions log)
  → AllExceptionsFilter (customer ko saaf message, log me poora detail)
```

⚠️ **JWT me role hota hai, par har request pe DB se dobara padha jaata hai** (users table, 30-second in-process cache ke saath). Kyunki admin ne kisi staff ko abhi disable kiya ho to uska purana token 15 minute tak nahi chalna chahiye.

---

## 5. Website (Next.js) — ek hi site, role se dashboard

```
apps/web/src/app/
├── (public)/                       # SSR + ISR, indexed
│   ├── page.tsx                    # home
│   ├── [vertical]/page.tsx         # /sabzi /phal /kirana /dawai /kheti /sewa
│   ├── category/[slug]/page.tsx
│   ├── product/[slug]/page.tsx
│   ├── service/[slug]/page.tsx
│   ├── area/[slug]/page.tsx        # local SEO
│   ├── khoj/page.tsx  blog/  (legal)/
│   └── sitemap.ts  robots.ts  manifest.ts
├── (auth)/login/                   # phone → OTP
└── (app)/                          # noindex, role se decide hota hai
    ├── layout.tsx                  # server-side: session padho, role nikalo, sahi shell render karo
    ├── mera/                       # CUSTOMER
    ├── admin/                      # ADMIN
    ├── supervisor/                 # SUPERVISOR
    └── delivery/                   # DELIVERY_BOY
```

**Login ke baad routing:** `/login` → backend `{user, role}` → server-side redirect:
CUSTOMER→`/mera` · ADMIN→`/admin` · SUPERVISOR→`/supervisor` · DELIVERY_BOY→`/delivery`

⚠️ Ye **sirf UX** hai. Asli suraksha backend guards me hai. Koi customer URL me `/admin` type kare to page shell dikh bhi jaye to har API call 403 degi aur layout redirect kar dega. Frontend route hiding ko kabhi security nahi maana gaya (instruction §7).

**Token kahan rehta hai:** refresh token **httpOnly + Secure + SameSite=Lax cookie** me (JS use nahi kar sakta). Access token memory me. Next.js server components cookie se access token refresh karke API call karte hain. `localStorage` me token kabhi nahi — XSS pe poora account chala jaata hai.

---

## 6. Mobile app (React Native) — ek app, role-based navigation

```
apps/mobile/src/
├── navigation/
│   ├── RootNavigator.tsx      # auth state → Auth | RoleNavigator
│   └── RoleNavigator.tsx      # switch(user.role) → Customer | Delivery | Supervisor | Admin
├── screens/customer/          # Home, Categories, Search, Product, Cart, Checkout,
│                              # Orders, Tracking, Services, Profile
├── screens/delivery/          # Dashboard, AssignedOrders, OrderDetail, Navigate,
│                              # StartDelivery, LiveLocation, CompleteDelivery, History
├── screens/staff/             # Dashboard, Orders, Delivery board, Reports (permission se)
├── services/                  # api client (auto refresh), socket client, fcm, location
└── store/                     # auth, cart, tracking
```

- Role **backend se aata hai** (`/auth/me`), app ki state se nahi. App restart pe dobara verify hota hai.
- Customer build me admin screens bundle me jaati hain par kabhi render nahi hoti — aur unka har API call backend pe 403 hota hai. (Instruction §16: "Do not ship unnecessary admin functionality to customer screens" — hum route-level code splitting se admin stack tabhi load karte hain jab role staff ho.)
- Tokens **Keychain / EncryptedSharedPreferences** me (`react-native-keychain`), AsyncStorage me nahi.

---

## 7. Realtime (Socket.IO) — sirf zaroori jagah

Poora design: `LIVE_TRACKING.md`. Yahan sirf jagah:

- **Ek** Socket.IO server, NestJS process ke andar (`/socket` path, same origin as API).
- Handshake pe JWT verify — anonymous connection allowed nahi.
- Rooms server decide karta hai, client kabhi `join` nahi maang sakta.
- Events: `order.status.updated`, `delivery.assigned`, `delivery.started`, `delivery.location.updated`, `delivery.completed`, `order.cancelled`.
- ⚠️ Hostinger shared pe WebSocket upgrade **verify nahi hua** — `transports: ['websocket','polling']` rakha hai taaki WS na chale to polling pe khud gir jaye. Test procedure `HOSTING_CAPACITY.md` §6 me hai. **Launch se pehle wo test chalana zaroori hai.**

---

## 8. Data flow — ek order ka safar

```
1  Customer product khole            → Next.js SSR (ISR cache 60s) → GET /catalog/products
2  Cart me daale                     → POST /cart/items         (server-side cart, DB)
3  Checkout                          → POST /orders/quote       (server hi price ginta hai)
4  Address                           → 6 km gate: village list PEHLE, GPS baad me
                                       (bahar → sorry screen + lead capture, A8)
5  Payment chune                     → COD | UPI (HDFC intent/QR)
6  Order place                       → POST /orders  (idempotency key + DB transaction)
                                        stock lock → ghatao → order → items snapshot
7  Realtime                          → socket: order.status.updated → admin + supervisor
8  Admin/Supervisor confirm          → CONFIRMED → PREPARING → READY_FOR_PICKUP
9  Delivery assign                   → ASSIGNED + delivery OTP bane + rider ko FCM push
10 Rider accept + start              → tracking session shuru, socket location stream
11 Customer tracking screen          → socket: delivery.location.updated (stale ho to saaf likha jaye)
12 Delivery                          → customer 4-digit OTP bolta hai → DELIVERED
                                        COD ho to payments PAID + rider cod_in_hand +=
13 Baad me                           → review request, referral reward check, analytics rollup
```

Service order (order_type=SERVICE) me 8–12 ki jagah: `SCHEDULED → ASSIGNED → IN_PROGRESS → COMPLETED` (completion OTP ke saath).

---

## 9. Kya jaanbujh kar NAHI liya

| Cheez | Kyun nahi | Kab lena |
|---|---|---|
| Redis | 100 orders/day pe cache/queue/session ke liye ek aur service palna faltu hai | 2 se zyada API instance, ya 500+ orders/day |
| BullMQ / job server | `jobs` table + `@Cron` kaafi hai | Redis aane pe |
| Microservices | Ek business, ek team, ek deployment | Kabhi nahi (is scale pe) |
| Docker/K8s | Hostinger pe chal hi nahi sakta, aur zaroorat bhi nahi | VPS pe optional |
| GraphQL | REST simple hai aur mobile+web dono ke liye kaafi | — |
| Elasticsearch | MySQL FULLTEXT + LIKE + synonyms table chal jaata hai (test kiya) | 10k+ products |
| Prisma | binary size + inodes (§2 dekho) | — |
| Separate admin app | Instruction §2/§3 — ek website, ek app | Kabhi nahi |

---

## 10. VPS migration — kya badlega

| Cheez | Hostinger | VPS |
|---|---|---|
| Process manager | Hostinger ka apna | PM2 / systemd (cluster mode) |
| Build | GitHub Actions me (server pe nahi) | Server pe bhi ho sakta hai |
| Socket.IO transport | WS ya polling (test pe depend) | WS pakka |
| Redis | nahi | optional: cache, socket adapter, rate limit |
| Uploads | local disk | local disk ya S3-compatible |
| Scaling | nahi | PM2 cluster + socket.io-redis-adapter |

**Code me kya alag hoga: kuch nahi.** Isliye:
- Har external cheez interface ke peeche hai: `IStorageProvider`, `IMapProvider`, `ISmsProvider`, `IPaymentProvider`, `ICacheProvider`, `IPushProvider`.
- `ICacheProvider` ka default in-memory implementation hai; Redis wala implementation baad me ek file me aata hai, business code chhoota bhi nahi.
- Koi bhi Hostinger-specific path/API code me nahi — sab env variables se.

---

## 11. Repository layout (monorepo)

```
fatanpur-bazaar/
├── apps/
│   ├── api/          # NestJS
│   ├── web/          # Next.js
│   └── mobile/       # React Native
├── packages/
│   ├── shared-types/ # DTO + enum + order state machine — teeno jagah SAME source
│   └── config/       # eslint, tsconfig base
├── docs/             # ye 9 documents
├── .github/workflows/ci.yml    # test + build + deploy artifact
└── package.json      # npm workspaces (Turborepo/Nx ki zaroorat nahi is size pe)
```

`packages/shared-types` sabse zyada value deta hai: order status enum, role enum, permission codes, API response types — teeno apps ek hi definition se import karte hain. Backend me status badla aur frontend update nahi hua → **compile error**, runtime bug nahi.
