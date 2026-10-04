# DEPLOYMENT.md
**Fatanpur Bazaar** (+ App #2) on Hostinger · v3.0

> Sabse zaroori niyam: **build server pe nahi hoga.** Naapa gaya hai ki ek `next build`
> 849 MB peak leta hai — do build ek saath 3 GB ke plan ko khatre me daal dete hain
> (`HOSTING_CAPACITY.md` §4). Build GitHub Actions me hoga, server pe sirf artifact jaayega.

---

## 1. Ek baar ka setup

### 1.1 Domains (hPanel → Websites → Add Website)
```
fatanpurbazaar.com          → Node.js app  (Next.js)
api.fatanpurbazaar.com      → Node.js app  (NestJS)      ← subdomain
app2domain.com              → Node.js app  (Next.js)
api.app2domain.com          → Node.js app  (NestJS)
```
Char Node websites, limit 5. `gstbillgenerator.com` aur 2 static sites ko haath nahi lagana.

### 1.2 Node version
hPanel → har Node app → **Node.js 24** (Active LTS).
Kyun 24: Node 20 EOL ho chuka (Apr 2026), 22 maintenance-only (EOL Apr 2027),
24 active LTS hai (EOL Apr 2028), 26 abhi LTS nahi bana.

### 1.3 Database (hPanel → Databases → MySQL)
```
DB 1:  fatanpur_db    user: fatanpur_user    (strong password)
DB 2:  app2_db        user: app2_user        (ALAG password)
```
⚠️ Har user ke paas **sirf apne** DB ka access ho (`GRANT ALL ON fatanpur_db.*`), global nahi.
Do apps ka kabhi cross-access nahi hona chahiye (instruction §25).

```bash
# schema import — phpMyAdmin → Import → schema.sql
# ya SSH se:
mysql -u fatanpur_user -p fatanpur_db < schema.sql
```

### 1.4 Folder structure (per app)
```
~/domains/fatanpurbazaar.com/
├── public_html/          ← Next.js standalone yahan (document root)
│   ├── server.js
│   ├── .next/  node_modules/  public/
└── .env                  ← webroot ke BAAHAR

~/domains/api.fatanpurbazaar.com/
├── public_html/          ← NestJS dist
│   ├── main.js  node_modules/
└── .env
~/storage/fatanpur/       ← uploads, logs, backups — webroot ke BAAHAR
├── private/rx/           ← prescriptions (chmod 700)
├── uploads/              ← public images (symlink public_html/uploads se)
├── logs/  backups/
└── firebase-service-account.json   (chmod 600)
```

### 1.5 SSL
hPanel → SSL → Let's Encrypt install → **Force HTTPS ON** (char domains pe).

---

## 2. Environment variables

`.env` **kabhi git me nahi**. hPanel ke env editor se ya SSH se banao.

```bash
# ===== API (api.fatanpurbazaar.com) =====
NODE_ENV=production
PORT=3000                                   # Hostinger apne aap assign karta hai
NODE_OPTIONS=--max-old-space-size=384

APP_NAME="Fatanpur Bazaar"
APP_URL=https://fatanpurbazaar.com
API_URL=https://api.fatanpurbazaar.com
ALLOWED_ORIGINS=https://fatanpurbazaar.com,https://www.fatanpurbazaar.com

DB_HOST=localhost
DB_PORT=3306
DB_NAME=fatanpur_db
DB_USER=fatanpur_user
DB_PASSWORD=<strong>
DB_POOL_MIN=2
DB_POOL_MAX=8                               # ⚠️ 2 apps × 8 = 16 < 50 limit

JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>   # alag hona chahiye
APP_SECRET=<openssl rand -hex 32>           # file token HMAC
EDGE_SECRET=<openssl rand -hex 32>          # ⚠️ WEB ke .env me BILKUL yahi — har grahak ki apni rate-limit bucket
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d

SMS_DRIVER=null                             # DLT ke baad: fast2sms | msg91
SMS_API_KEY=
SMS_SENDER_ID=
SMS_TEMPLATE_ID=

FIREBASE_SERVICE_ACCOUNT=/home/uXXXX/storage/fatanpur/firebase-service-account.json
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@fatanpurbazaar.com

MAP_PROVIDER=osm                            # osm | google
MAP_API_KEY=

STORAGE_PATH=/home/uXXXX/storage/fatanpur
UPLOAD_MAX_MB=8

SOCKET_PATH=/socket
SOCKET_TRANSPORTS=websocket,polling         # WS test ke baad tay
SOCKET_PING_INTERVAL=25000

TZ=Asia/Kolkata
LOG_LEVEL=info
SETUP_TOKEN=<pehla admin banane ke baad HATA dena>

# ===== WEB (fatanpurbazaar.com) =====
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=384
NEXT_PUBLIC_API_URL=https://api.fatanpurbazaar.com
NEXT_PUBLIC_SITE_URL=https://fatanpurbazaar.com
NEXT_PUBLIC_SOCKET_URL=https://api.fatanpurbazaar.com
NEXT_PUBLIC_MAP_PROVIDER=osm
NEXT_TELEMETRY_DISABLED=1
API_INTERNAL_URL=http://127.0.0.1:3000      # server-side calls localhost se (tez)
EDGE_SECRET=<API wala hi>                   # server-only, NEXT_PUBLIC_ nahi
EDGE_TRUSTED_HOPS=1                         # Hostinger proxy = 1; Cloudflare bhi ho to 2
REVALIDATE_SECRET=<openssl rand -hex 16>
TZ=Asia/Kolkata
```

⚠️ App #2 ke liye **saare secrets alag** — kabhi copy-paste mat karna (instruction §25).

**Boot pe validation:** koi bhi zaroori env missing ya default value ho to app start hi na ho —
`config/env.validation.ts` me Zod schema, aur fail pe saaf message.

---

## 3. CI build + deploy (GitHub Actions)

> Haath se deploy (bina CI): `HOSTINGER-LAUNCH-HINDI.md` — `node scripts/make-release.mjs`
> do zip banata hai (`release/fatanpur-api.zip`, `release/fatanpur-web.zip`), wahi upload karne hain.

`.github/workflows/deploy.yml`
```yaml
name: Build & Deploy
on:
  push: { branches: [main] }
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false        # ⚠️ do build ek saath kabhi nahi

jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint --workspace=apps/api
      - run: npm run test --workspace=apps/api          # unit + integration
      - run: npm run build --workspace=apps/api
      - run: |                                          # sirf prod deps
          cd apps/api && npm ci --omit=dev --prefix ./dist
      - name: Deploy via SSH
        run: |
          rsync -az --delete apps/api/dist/ \
            ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}:~/domains/api.fatanpurbazaar.com/public_html/
      - name: Migrate + restart
        run: ssh ... "cd ~/domains/api.fatanpurbazaar.com/public_html && node migrate.js && touch tmp/restart.txt"

  web:
    needs: api                     # ⚠️ series me — kabhi parallel nahi (RAM)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run build --workspace=apps/web         # standalone output
      - run: |
          cp -r apps/web/public apps/web/.next/standalone/
          cp -r apps/web/.next/static apps/web/.next/standalone/.next/
      - name: Deploy
        run: rsync -az --delete apps/web/.next/standalone/ ...:~/domains/fatanpurbazaar.com/public_html/
```

**Ye pattern kyun:**
- Build CI ke runner pe (7 GB RAM) hota hai — server ko chhoota bhi nahi
- `concurrency` + `needs: api` do build ko kabhi ek saath nahi hone deta
- Server pe sirf `.next/standalone` jaata hai: **56 MB / 2,096 files** (poore node_modules ke 337 MB / 8,917 files ki jagah)
- Test pass na ho to deploy hi nahi hota

**Agar GitHub Actions abhi nahi set kar sakte** (manual deploy):
```bash
# LOCAL machine pe build
npm run build --workspace=apps/web
# zip → hPanel File Manager → upload → extract
# ⚠️ SERVER PE `next build` MAT chalao jab dono apps live hon
```

---

## 4. Pehla launch (order me)

```bash
cd ~/domains/api.fatanpurbazaar.com/public_html     # yahan release/api ka saaman hai

# 1. Tables (migrations — schema.sql + baad ke saare badlaav, order me)
node dist/cli.js migrate

# 2. Seed: permissions, settings, gaon, categories, products, aur teen staff khaate
#    (8576891104 mukhya admin · 9616038670 doosra admin · 9889353665 delivery).
#    ⚠️ --demo production me KABHI nahi (code khud mana karta hai).
node dist/cli.js seed

# 3. Sab theek hai? (env, DB, storage, secrets)
node dist/cli.js doctor

# 4. VAPID keys (web push) → output API .env me, public key web .env me
node dist/cli.js vapid

# 5. Cron (hPanel → Advanced → Cron Jobs) — sirf EK entry
*/5 * * * * cd ~/domains/api.fatanpurbazaar.com/public_html && /usr/bin/node dist/cli.js cron >> ~/storage/fatanpur/logs/cron.log 2>&1

# 6. Verify
curl https://api.fatanpurbazaar.com/v1/health
curl -I https://fatanpurbazaar.com          # HTTP 200 + security headers
```

---

## 5. Launch se pehle checklist

```
INFRA
[ ] Char Node apps chal rahe hain, Node 24 pe
[ ] Dono DB alag, alag user, alag password
[ ] SSL + Force HTTPS char domains pe
[ ] Cron entry dono API apps pe
[ ] storage/ webroot ke bahar, private/rx chmod 700
[ ] Firebase JSON chmod 600, git me nahi
[ ] .env dono apps ke alag secrets ke saath

SECURITY  (poori list SECURITY_AUDIT.md §12)
[ ] Pehla admin CLI se bana, SETUP_TOKEN hataya
[ ] settings.allow_admin_creation = OFF
[ ] CORS allowlist (no '*')
[ ] Saare 17 RBAC test pass
[ ] Error response me stack trace nahi (prod pe curl karke dekha)

VERIFY  (ye do abhi baaki hain)
[ ] 🔴 WebSocket transport test (HOSTING_CAPACITY.md §6) — WS ya polling?
[ ] 🔴 SMS provider live (DLT) — warna login hi nahi hoga

BUSINESS
[ ] Exact coordinates settings me (Google Maps se lat,lng)
[ ] Village list + delivery fee + ETA
[ ] UPI VPA (HDFC) + payee name
[ ] Support phone + WhatsApp
[ ] Products + images + suppliers
[ ] Staff: 1 supervisor + 2 delivery boy admin panel se bane
[ ] Legal pages (privacy, terms, refund, shipping) — Play Store bhi maangta hai

MONITORING
[ ] UptimeRobot: 4 monitors (2 web + 2 api /health)
[ ] Backup cron chal raha hai AUR ek restore test ho chuka hai
[ ] Google Search Console + sitemap submit
```

---

## 6. Rozana ka rakhrakhav

| Kab | Kya |
|---|---|
| Roz | Admin panel: atke hue payments, failed jobs, rider cod_in_hand |
| Hafte me | Ek backup laptop/Drive pe download; error log dekhо |
| Mahine me | `npm audit`; disk + inode check (`df -i`); RSS check |
| 3 mahine | **Backup restore drill** — jo backup restore na hua ho wo backup nahi hai |

```bash
# health check
curl -s https://api.fatanpurbazaar.com/v1/health | jq

# memory (SSH)
ps -eo rss=,cmd= --sort=-rss | head -10 | awk '{printf "%.0f MB  %s\n", $1/1024, $2}'

# inodes
df -i ~ | tail -1
```

---

## 7. Rollback

```bash
# Har deploy se pehle CI purana artifact rakhta hai
ssh ... "cd ~/domains/api.fatanpurbazaar.com && \
         mv public_html public_html.bad && mv public_html.prev public_html && \
         touch public_html/tmp/restart.txt"
```
- **DB migrations hamesha additive** — column drop/rename ek hi deploy me nahi.
  Pattern: add → dono jagah likho → backfill → padhna switch → agle release me purana drop.
  Isse rollback pe DB kabhi nahi tootta.
- Rollback ke baad: `/health` check + ek test order.

---

## 8. VPS pe migration (jab zaroorat pade)

```
1. VPS lo (2 vCPU / 4 GB — ~₹700–1000/mo)
2. Node 24 + MySQL 8 + Nginx (reverse proxy, WS ke saath) + PM2
3. mysqldump → import
4. Wahi artifacts deploy karo — code me KUCH NAHI badalta
5. Env: DB_HOST, DB_POOL_MAX badhao, SOCKET_TRANSPORTS=websocket
6. PM2: api cluster 2 instances (tab socket.io-redis-adapter zaroori hoga)
7. DNS switch, purane plan ko ek hafte tak chalne do
```
Kya milega: pakka WebSocket, server pe build ka darr khatam, Redis ka option, root access.
