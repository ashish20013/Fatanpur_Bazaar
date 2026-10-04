# HOSTING_CAPACITY.md
**Fatanpur Bazaar + App #2** on one Hostinger plan · v3.0 · 8 September 2026

> Instruction §25: *"Before final deployment, calculate whether both applications can safely run within the 3 GB / 2 CPU environment. If not, explicitly report the bottleneck. Do NOT claim the environment is safe without checking."*
>
> **Ye document guess pe nahi likha gaya.** Neeche ke saare numbers is session ke sandbox me
> asli Next.js 15 aur ek asli Node API process chala kar **naape** gaye hain. Method §7 me hai.

---

## 1. Available resources

Aapke hPanel se (Business/Unlimited tier):

```
RAM              3072 MB          CPU cores        2
Max processes    120              PHP workers      60
Inodes           600,000          Disk             50 GB
Websites         50               Node.js websites 5      ← ye asli limit hai
MySQL conn/user  50               Bandwidth        Unlimited
```

Pehle se chal raha hai: `gstbillgenerator.com` (PHP) + 2 static websites.

---

## 2. Kya deploy hoga

| # | Website | Process | Node? |
|---|---|---|---|
| 1 | `fatanpurbazaar.com` | Next.js standalone server | ✅ |
| 2 | `api.fatanpurbazaar.com` | NestJS + Socket.IO | ✅ |
| 3 | `app2domain.com` | Next.js standalone server | ✅ |
| 4 | `api.app2domain.com` | NestJS + Socket.IO | ✅ |
| 5 | `gstbillgenerator.com` | PHP (purani) | ❌ |
| 6–7 | 2 static sites | LiteSpeed static | ❌ |

**4 Node websites, limit 5 → 1 spare.** ✅ Fit hota hai, par staging ke liye jagah nahi bachegi —
staging alag jagah (local machine ya ek chhota VPS) pe rakhna.

---

## 3. NAAPE GAYE numbers (guess nahi)

Sandbox: Node 22.22, 28-route Next.js 15 app (`output: 'standalone'`), aur ek API process jisme
Nest core + Express + Socket.IO + Knex + mysql2 + Helmet + Zod load hain aur MySQL se juda hua hai.

### 3.1 Runtime memory

| Process | Idle RSS | Load ke baad |
|---|---:|---:|
| Next.js standalone server (28 routes) | **110 MB** | **120 MB** |
| API (Nest deps + Socket.IO + MySQL pool) | **100 MB** | **101.5 MB** |
| API + **100 live WebSocket connections** | — | **103.6 MB** (+2.1 MB) |

> **100 socket connections ka kul kharcha 2.1 MB hai — ~21 KB per socket.**
> Aapko peak pe ~10–15 sockets chahiye (2 rider + kuch customer + 2 staff dashboard).
> Matlab live tracking ka memory kharcha practically **zero** hai.

### 3.2 Latency (same sandbox)

| Target | Concurrency | p50 | p95 | max |
|---|---:|---:|---:|---:|
| Next.js pages | 10 | 9.0 ms | 22.9 ms | 23.6 ms |
| Next.js pages | 25 | 17.3 ms | 47.1 ms | 51.3 ms |
| Next.js pages | 50 | 27.9 ms | 65.8 ms | 74.0 ms |
| API JSON (DB query) | 10 | 6.7 ms | 21.1 ms | 21.3 ms |
| API JSON (DB query) | 50 | 25.6 ms | 45.8 ms | 53.1 ms |

Aapka asli peak ~10–15 concurrent hai. **50 concurrent pe bhi p95 66 ms hai** — matlab
zaroorat se 3–5 guna headroom pehle se demonstrate ho chuka hai.

### 3.3 Build memory — **ye asli bottleneck hai**

| Kaam | Peak RSS (poora process tree) | Time |
|---|---:|---:|
| `next build` (28 routes, standalone) | **849 MB** | 31 s |

⚠️ **Ye ek app ka ek build hai.** Do Next apps ek saath build karoge to ~1.7 GB.
Ye single sabse bada risk hai — neeche §5 me iska plan hai.

### 3.4 Disk aur inodes

| Cheez | Size | Files (inodes) |
|---|---:|---:|
| API `node_modules` (prod deps) | 46 MB | **6,923** |
| Web `node_modules` (dev, build ke liye) | 337 MB | 8,917 |
| Web `.next/standalone` (**jo deploy hota hai**) | 56 MB | **2,096** |

**Deploy karne layak footprint per app ≈ 6,923 + 2,096 ≈ 9,000 files, ~102 MB.**
Do apps ≈ **18,000 files, ~205 MB**.

- Inodes: 18,000 / 600,000 = **3%** ✅ (mujhe laga tha ye tight hoga — naapne pe nikla ki nahi hai)
- Disk: 205 MB + uploads + logs + backups ≈ 2–5 GB / 50 GB = **10%** ✅

> ⚠️ Ye tabhi sach hai jab **`output: 'standalone'`** use karo aur server pe
> `node_modules` (337 MB / 8,917 files) na chhodo. Standalone output 4× kam files hai.

---

## 4. Poora capacity budget

### Steady state (normal din)

| Component | RAM |
|---|---:|
| Fatanpur: Next.js | 120 MB |
| Fatanpur: API + sockets | 105 MB |
| App #2: Next.js | 120 MB |
| App #2: API + sockets | 105 MB |
| **Node total** | **450 MB** |
| MySQL (conservative estimate — Hostinger pe ye shared service hai) | 250 MB |
| LiteSpeed + PHP (gstbillgenerator + static) | 250 MB |
| OS / overhead | 150 MB |
| **KUL** | **~1,100 MB** |
| **Bacha hua** | **~1,970 MB (64%)** |

✅ **Steady state me environment surakshit hai, aur kaafi khaali hai.**

### Deploy ke waqt (ek app build ho raha hai)

| | RAM |
|---|---:|
| Chal rahe 4 processes | 450 MB |
| Ek `next build` peak | 849 MB |
| MySQL + PHP + OS | 650 MB |
| **KUL peak** | **~1,950 MB (64%)** |

✅ **Ek build safe hai.**

### ❌ Deploy ke waqt (DONO apps ek saath build)

| | RAM |
|---|---:|
| Chal rahe processes | 450 MB |
| Do `next build` | 1,698 MB |
| MySQL + PHP + OS | 650 MB |
| **KUL** | **~2,800 MB (91%)** |

🚨 **YE KHATRE ME HAI.** 3 GB ke itne paas ki OOM killer kisi bhi process ko maar sakta hai —
aur sabse zyada sambhavna hai ki wo **aapki chalti hui site** ho, build nahi.

---

## 5. BOTTLENECK REPORT (jaisa instruction §25 me maanga)

| # | Bottleneck | Severity | Fix |
|---|---|---|---|
| **B1** | **Build memory** — do simultaneous Next builds ~2.8 GB tak le jaate hain | 🔴 HIGH | **CI me build karo** (GitHub Actions), server pe sirf built artifact bhejo. Agar server pe hi build karna hai to: ek waqt me ek app, business hours ke bahar, aur `NODE_OPTIONS=--max-old-space-size=768` |
| **B2** | **Node.js websites limit = 5**, hume 4 chahiye | 🟡 MED | Fit hai par staging ke liye jagah nahi. Staging local ya alag ₹500 VPS pe |
| **B3** | **Socket.IO WebSocket support Hostinger shared pe verify nahi hua** | 🟡 MED | §6 ka test launch se pehle chalao. WS na chale to `transports:['polling']` fallback pehle se code me hai — 15 concurrent clients pe polling bhi theek chalega |
| **B4** | **MySQL connections 50/user** | 🟢 LOW | Pool `max: 8` per API app (2 apps = 16) explicitly set karo. Default 10+ chhodoge to phpMyAdmin/cron ke saath limit chhoo sakte ho |
| **B5** | **2 shared CPU cores** — build ke waqt sab kuch dhima | 🟢 LOW | Build CI me (B1 ka fix isko bhi solve karta hai) |
| **B6** | Purani PHP site ka RAM naapa nahi gaya (uska asli usage pata nahi) | 🟢 LOW | Deploy se pehle ek baar SSH se `ps aux --sort=-rss \| head -20` chala ke dekh lo |

### Final verdict

> ✅ **Dono applications is 3 GB / 2 core environment me surakshit chal sakti hain**, is ek shart pe:
> **dono Next.js apps ka build kabhi ek saath server pe na ho.**
> Sabse achha: build hi server pe mat karo — GitHub Actions me karo, artifact deploy karo.
> Uske baad steady state sirf ~36% RAM use karta hai.

---

## 6. Socket.IO WebSocket test (deploy se pehle ZAROOR chalao)

Hostinger ke docs shared Node hosting pe WebSocket upgrade ke bare me kuch saaf nahi kehte,
aur maine iska koi authoritative jawab nahi paya. Isliye **maan kar mat chalo — test karo.**
10 minute ka kaam hai:

```js
// ws-test.js — API app me temporary route ke roop me deploy karo
const { Server } = require('socket.io');
const http = require('http');
const srv = http.createServer((req, res) => res.end('ws test'));
const io = new Server(srv, { path: '/wstest', transports: ['websocket', 'polling'] });
io.on('connection', s => {
  console.log('TRANSPORT =', s.conn.transport.name);   // ← yahi dekhna hai
  s.conn.on('upgrade', t => console.log('UPGRADED TO =', t.name));
  s.emit('hello', { transport: s.conn.transport.name });
});
srv.listen(process.env.PORT || 3000);
```

```js
// client (browser console se ya local node se)
const s = io('https://api.fatanpurbazaar.com', { path: '/wstest' });
s.on('hello', d => console.log('server says', d));
s.on('connect', () => console.log('transport =', s.io.engine.transport.name));
s.io.engine.on('upgrade', () => console.log('upgraded to', s.io.engine.transport.name));
```

| Result | Matlab | Karna kya hai |
|---|---|---|
| `transport = websocket` | ✅ WS chal raha hai | Kuch nahi. Best case. |
| `transport = polling`, upgrade nahi hota | ⚠️ Proxy WS block kar raha hai | `transports:['polling']` lock karo, `pingInterval: 25000`. 15 clients pe theek chalega. Location ping 15s se 20s kar do. |
| Connection hi fail | ❌ Path/proxy issue | Hostinger support se poocho; warna tracking ke liye 10-second REST polling fallback (code me pehle se hai) |

**Ye test launch se pehle karna hai, launch ke baad nahi.** Nateeja `TEST_REPORT.md` me likhna hai.

---

## 7. Naapne ka tarika (reproduce kar sakte ho)

```bash
# 1. API-class process ka footprint
#    (Nest core + express + socket.io + knex + mysql2 + helmet + zod, MySQL se juda)
node server.js & ps -o rss= -p $! | awk '{printf "%.1f MB\n", $1/1024}'

# 2. Next.js build ka peak — poore process tree ka RSS (workers sameet)
#    har 250ms pe pura tree naapo, max rakho
./peaktree.sh npx next build        # → PEAK_TREE_RSS_MB=849

# 3. Standalone server ka runtime
(cd .next/standalone && PORT=3102 node server.js) &
ps -eo rss=,cmd= | grep next-server  # → 110 MB idle, 120 MB load ke baad

# 4. Latency: 10/25/50 concurrency, 4 rounds, p50/p95
node loadtest.js

# 5. Socket cost: 100 clients connect karke RSS ka antar
node socktest.js 100                # → +2.1 MB
```

Sandbox aur Hostinger ek jaise nahi hain (CPU aur disk speed alag hogi), lekin
**memory ke numbers portable hain** — wahi Node, wahi packages, wahi build.
Latency Hostinger pe thodi zyada hogi (shared CPU), par 3–5× headroom us fark ko aaram se jhel lega.

---

## 8. Production settings (inhe set karna zaroori hai)

```bash
# API (dono apps me)
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=384      # ek app dusre ko bhukha na kare
DB_POOL_MIN=2
DB_POOL_MAX=8                              # ⚠️ 2 apps × 8 = 16 < 50 limit
SOCKET_TRANSPORTS=websocket,polling        # §6 test ke baad tay karo
SOCKET_PING_INTERVAL=25000
SOCKET_MAX_HTTP_BUFFER=8192                # chhota payload hi aata hai — bade ko rok do

# Web (dono apps me)
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=384
NEXT_TELEMETRY_DISABLED=1
# next.config.js: output: 'standalone', compress: true, images.formats: ['image/webp']

# Build (CI me — server pe nahi)
NODE_OPTIONS=--max-old-space-size=2048
```

**Monitoring (free):**
- UptimeRobot → `/health` (dono API) + homepage (dono web), 5 min interval
- `/health` return kare: `{ok, db:'up', uptime, rss, activeSockets, version}`
- Har raat cron: agar kisi bhi process ka RSS 350 MB paar kare to admin ko alert

---

## 9. Kab ye plan kaam karna band karega

| Signal | Matlab | Kya karna |
|---|---|---|
| Roz 500+ orders | Traffic 5–10× badha | VPS (2 vCPU / 4 GB, ~₹700–1000/mo) |
| Sockets 200+ concurrent | Live tracking bhaari ho gaya | VPS + Redis adapter |
| Node websites 5 se zyada chahiye | Teesra app | VPS ya alag plan |
| Steady RAM 2 GB paar | Kuch leak kar raha hai ya traffic badha | Pehle profile karo, phir VPS |
| Build server pe 2 min se zyada le | Codebase bada ho gaya | CI build (jo waise bhi karna chahiye) |

Migration ka plan `FINAL_ARCHITECTURE.md` §10 me hai — **code me kuch nahi badalta**,
sirf process manager aur env badalte hain.
