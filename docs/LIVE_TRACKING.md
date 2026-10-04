# LIVE_TRACKING.md
**Fatanpur Bazaar** — live delivery tracking design · v3.0
Instruction §9 (tracking), §10 (location design), §11 (socket security)

---

## 1. Design ka ek line me saar

> **Socket.IO se live dikhta hai, MySQL me sirf zaroori nishaan bachte hain,
> aur agar location purani ho jaye to UI usko "live" kehna band kar deta hai.**

Naapa hua kharcha (`HOSTING_CAPACITY.md` §3.1): **100 concurrent WebSocket connections = 2.1 MB**
(~21 KB per socket). Aapki zaroorat peak pe ~10–15 sockets hai. Memory yahan koi mudda hi nahi hai.

---

## 2. Kaun kya dekhta hai

| Role | Dekhta hai | Nahi dekhta |
|---|---|---|
| **CUSTOMER** | Apne order ka status, assigned delivery boy ka naam + phone, uski current/近 location, map, ETA | Dusre orders, dusre riders, rider ki location jab uska order active na ho |
| **DELIVERY_BOY** | Apne assigned orders, customer ka address + phone, navigation | Dusre riders, unrelated customers, saare orders |
| **SUPERVISOR** | Saari active deliveries, har rider ki location, status board | (`delivery.track` permission ke bina kuch nahi) |
| **ADMIN** | Sab kuch | — |

⚠️ Rider ki location tabhi share hoti hai jab uska ek **active assignment** ho.
Duty pe hone se location share nahi hoti — sirf active delivery pe hoti hai.

---

## 3. Location pipeline (§10 — "har GPS update DB me mat likho")

```
 Rider phone (RN app)
   │  navigator.geolocation.watchPosition
   │  har 15 s (settings: tracking_ping_seconds)
   │  SIRF jab assignment status ACCEPTED ya PICKED_UP ho
   ▼
 socket.emit('delivery.location', {assignmentId, lat, lng, accuracy, speed, ts})
   │
   ▼
 NestJS TrackingGateway
   ├─ 1. AUTH        : socket.data.user maujood? DELIVERY_BOY hai?
   ├─ 2. OWNERSHIP   : ye assignment isi rider ka hai? status active hai?  (30s cache)
   ├─ 3. SANITY      : lat 6–38 N, lng 68–98 E (India bounds)
   │                   accuracy > 200 m → "kamzor signal" flag, par store karo
   │                   ts abhi se 2 min purana → discard (purana buffer aaya hai)
   ├─ 4. THROTTLE    : pichle accept kiye ping se < 10 s → drop (battery/data bachao)
   ├─ 5. MEMORY      : in-process Map me last position rakho  ← ye "live" ka source hai
   ├─ 6. BROADCAST   : io.to(`order:{orderNumber}`).emit('delivery.location.updated', {...})
   │                   io.to('ops:delivery').emit(...)
   └─ 7. PERSIST     : ⚠️ SIRF in teen me se koi shart poori ho tab:
                        (a) pichle DB point se doori > 100 m   (tracking_persist_meters)
                        (b) pichle DB write ko 60 s ho gaye
                        (c) pehla ping, ya status badla (pickup/deliver)
                      → INSERT delivery_locations   (breadcrumb trail)
                      Har 30 s me ek baar: UPDATE tracking_sessions
                        SET last_lat, last_lng, last_ping_at, ping_count
```

### Kitna DB write bachta hai
```
Ek delivery = ~20 minute = 80 pings (15 s pe)
  Bina optimisation : 80 INSERT + 80 UPDATE = 160 writes
  Is design me      : ~8 INSERT (100 m rule) + ~40 UPDATE (30 s rule) = ~48 writes  (−70%)
Roz 100 delivery   : ~4,800 writes/day. Ye bilkul aaram se chalta hai.
```

---

## 4. Socket.IO security (§11)

### 4.1 Connection
```ts
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;            // query string me NAHI
  if (!token) return next(new Error('UNAUTHORIZED'));
  const payload = await jwt.verifyAsync(token);           // signature + expiry
  const user = await users.findActiveById(payload.sub);   // ⚠️ DB se — token se nahi
  if (!user || user.status !== 'ACTIVE') return next(new Error('UNAUTHORIZED'));
  socket.data.user = { id: user.id, role: user.role, perms: await perms.for(user) };
  next();
});
```
- Anonymous connection **allowed nahi**.
- Token expire hone pe client refresh karke reconnect karta hai (auto).
- Ek user max 3 concurrent socket (4th pe sabse purana disconnect) — resource abuse rokta hai.

### 4.2 Rooms — ⚠️ client kabhi join nahi maang sakta
```ts
// connection ke turant baad, SERVER decide karta hai:
async function joinAuthorizedRooms(socket) {
  const u = socket.data.user;
  socket.join(`user:${u.id}`);                       // personal notifications

  if (u.role === 'CUSTOMER') {
    const orders = await orders.activeForCustomer(u.id);
    orders.forEach(o => socket.join(`order:${o.order_number}`));
  }
  if (u.role === 'DELIVERY_BOY') {
    const as = await delivery.activeForRider(u.id);
    as.forEach(a => { socket.join(`delivery:${a.id}`); socket.join(`order:${a.order_number}`); });
  }
  if (u.perms.has('delivery.track')) socket.join('ops:delivery');
  if (u.perms.has('orders.view_all')) socket.join('ops:orders');
}
```
⚠️ **`socket.on('join', room => socket.join(room))` jaisa code kabhi nahi likhna.**
Wo ek line poore system ka data leak kar deti hai — koi bhi `order:FB-20260907-0001` join
karke kisi ka bhi order track kar leta.

Jab naya order bane ya assignment mile, **server** us user ke socket ko naye room me daalta hai
(`io.in(`user:${id}`).socketsJoin(`order:${no}`)`) — client se kuch nahi poocha jaata.

### 4.3 Client kya emit kar sakta hai

| Event | Kaun | Server ka check |
|---|---|---|
| `delivery.location` | sirf DELIVERY_BOY | assignment isi ka? active hai? bounds sahi? throttle? |
| `client.ping` | koi bhi | (heartbeat, koi data nahi) |
| **koi aur event** | — | ignore + `audit_logs` me warning; 3 baar pe disconnect |

Server → client events (sab server-initiated):
```
order.status.updated      { orderNumber, status, label_hi, at }
delivery.assigned         { orderNumber, rider: {name, phone}, otp }   ← OTP sirf customer room me
delivery.started          { orderNumber, at }
delivery.location.updated { orderNumber, lat, lng, at, isStale:false }
delivery.completed        { orderNumber, at }
order.cancelled           { orderNumber, reason }
```
⚠️ `delivery.assigned` me delivery OTP **sirf `order:{no}` room** me jaata hai (customer),
`ops:*` rooms me nahi.

---

## 5. Edge cases (§10 me maange gaye — sab handle hone chahiye)

| Case | Kya hota hai |
|---|---|
| **GPS unavailable** | Rider app "GPS band hai" banner + settings shortcut. Server ko koi ping nahi. Customer ko: "डिलीवरी पार्टनर की लोकेशन अभी नहीं मिल रही" + status timeline chalta rehta hai |
| **Internet disconnected** | Rider app last 20 pings local queue me rakhta hai; wapas aane pe bhejta hai **`ts` ke saath**. Server 2 min se purane points ko sirf breadcrumb me daalta hai, "live" position nahi banata |
| **App background me** | Android me foreground service + persistent notification ("डिलीवरी चल रही है") — warna OS location band kar deta hai. iOS me background location permission. Ping interval background me 15 s → 30 s |
| **Permission denied** | Delivery start hi nahi hoti: "लोकेशन की अनुमति दें" screen. Rider phir bhi manually status badal sakta hai (tracking ke bina delivery ruk nahi sakti) |
| **Stale location** | `last_ping_at` > 90 s purana (`tracking_stale_seconds`) → server `isStale:true` bhejta hai. UI: marker grey, "आखिरी अपडेट 4 मिनट पहले" — **कभी भी पुरानी location "live" नहीं दिखेगी** |
| **Rider offline** | 3 min tak ping nahi → session `is_live=0`, customer ko "संपर्क टूट गया, कोशिश जारी है", supervisor ko alert |
| **Customer disconnect/reconnect** | Reconnect pe server latest snapshot bhejta hai (`GET /orders/:no/track` ka same data socket pe `tracking.snapshot` event me) — customer ko kuch miss nahi hota |
| **Socket reconnect** | Socket.IO ka apna exponential backoff (1s → 5s → 10s, max 30s). Reconnect pe rooms **server dobara** join karta hai |
| **Duplicate location events** | `(assignmentId, ts)` in-memory dedupe (last 50 ts). Same ts dobara aaya → drop |
| **Delivery complete** | Session `is_live=0`, `ended_at`, `end_reason='DELIVERED'`. Rider app `watchPosition` **band** karta hai. Customer ko final map + "डिलीवर हो गया" |
| **Order cancel ho gaya beech me** | Same — session band, rider app ko `delivery.completed` (reason CANCELLED) |
| **Rider app crash / phone band** | 120 min (`tracking_auto_end_min`) baad cron session auto-close karta hai — hamesha ke liye "live" nahi rehta |
| **WebSocket block** | `transports:['websocket','polling']` — Socket.IO khud polling pe gir jaata hai. §7 dekho |
| **Poora socket fail** | Client 10 s ka REST polling fallback (`GET /orders/:no/track`) — tracking chalti rehti hai, bas kam smooth |

---

## 6. Rider app ka behaviour (React Native)

```
Delivery accept  → foreground service start + persistent notification
                 → watchPosition({ enableHighAccuracy: true, distanceFilter: 20 })
Har 15 s         → socket.emit('delivery.location', {...})
Offline          → AsyncStorage queue (max 20 points), online hone pe flush
Battery < 15%    → interval 15 s → 30 s, high accuracy off (batao user ko)
Delivery done    → watchPosition CLEAR + foreground service STOP + notification hatao
App band         → foreground service chalta rehta hai (Android). iOS pe background mode.
```
⚠️ **Delivery khatam hone ke baad location tracking band hona ZAROORI hai** (§9).
Ye sirf privacy nahi — battery aur bharosa dono ka sawaal hai. Rider ko app me saaf dikhna
chahiye ki abhi location share ho rahi hai ya nahi (ek chhota green/grey dot).

---

## 7. Hostinger pe WebSocket — abhi VERIFY nahi hua ⚠️

Hostinger shared Node hosting pe WebSocket upgrade ke bare me koi authoritative documentation
nahi mili. Isliye:

1. **Code dono transports ke saath likha hai** — WS mile to WS, na mile to polling.
2. **Launch se pehle test chalana zaroori hai** — script `HOSTING_CAPACITY.md` §6 me hai.
3. Agar sirf polling chale:
   - Har client ek HTTP long-poll connection rakhta hai. 15 clients = 15 connections. 120 process limit pe theek hai.
   - `pingInterval: 25000`, location ping 15 s → 20 s.
   - Latency 200–500 ms zyada — map thoda kam smooth, **par kaam karta hai**.
4. Agar polling bhi na chale → REST polling fallback (10 s) — sabse basic, par kabhi fail nahi hota.

**Teeno raste code me pehle se hone chahiye.** Kaunsa chal raha hai, wo `/health` me
`socketTransport` field me dikhna chahiye.

---

## 8. Customer ka tracking UI

```
┌──────────────────────────────────────┐
│  ऑर्डर FB-20260908-0007               │
│  ● ● ● ○ ○   रास्ते में है             │  ← timeline (hamesha dikhta hai)
├──────────────────────────────────────┤
│  [ नक्शा — rider marker + ghar marker ] │  ← sirf tab jab location taaza ho
│  🟢 अभी अपडेट हुआ                       │
│     ya                                │
│  ⚪ आखिरी अपडेट 4 मिनट पहले            │  ← stale: marker grey + saaf likha
│     ya                                │
│  ⚠️ लोकेशन अभी उपलब्ध नहीं              │  ← GPS nahi: sirf timeline
├──────────────────────────────────────┤
│  राहुल · डिलीवरी पार्टनर                │
│  [ 📞 कॉल करें ]                       │  ← tel: link, gaon me sabse kaam ka button
├──────────────────────────────────────┤
│  डिलीवरी कोड:  4 3 2 1                │  ← ye rider ko batana hai
│  लगभग 12 मिनट                         │
└──────────────────────────────────────┘
```

**Design ke teen niyam:**
1. **Map optional hai, timeline nahi.** Map fail ho jaye to bhi order track hona chahiye.
2. **Purani location kabhi "live" nahi dikhegi.** Grey marker + "X मिनट पहले" — ya kuch nahi.
3. **Call button map se zyada zaroori hai.** Gaon me log map se nahi, phone se pooch kar pata dhoondte hain.

---

## 9. Map provider abstraction (§1 — "provider badla ja sake")

```ts
interface IMapProvider {
  staticMapUrl(opts: { markers: LatLng[]; zoom?: number; size: [number, number] }): string;
  reverseGeocode(p: LatLng): Promise<string | null>;
  geocode(q: string): Promise<LatLng | null>;
  routeEta(from: LatLng, to: LatLng): Promise<{ minutes: number; km: number } | null>;
}
```

| Provider | Kab | Note |
|---|---|---|
| **OsmMapProvider** (default) | Day 1 | MapLibre GL + OSM tiles. Free, koi API key nahi. Attribution zaroori |
| **GoogleMapProvider** | Agar address dhoondhne me dikkat aaye | Rural UP me OSM ka data patla hai; Google ka geocoding clearly behtar hai. Hybrid bhi kar sakte ho: geocoding Google se, tiles OSM se |

Web: MapLibre GL JS (lazy-loaded, sirf tracking page pe).
Mobile: MapLibre React Native, ya `react-native-maps`.
`ETA` default me haversine × 4 min/km hai — routing API tabhi lagana jab zaroorat lage.

---

## 10. Test cases (TEST_REPORT.md me results)

```
TRK-01  Rider online → customer ko location updates milte hain
TRK-02  Rider offline (90 s ping nahi) → UI stale dikhata hai, "live" nahi
TRK-03  Socket disconnect → auto reconnect → snapshot milta hai, koi gap nahi
TRK-04  GPS unavailable → timeline chalta hai, map ki jagah saaf message
TRK-05  App background → foreground service se ping chalte rehte hain
TRK-06  Delivery complete → watchPosition band, session is_live=0
TRK-07  Order cancel beech me → session band, rider ko notify
TRK-08  ⛔ Customer A, customer B ke order ka room join kare → koi data nahi
TRK-09  ⛔ Rider X, rider Y ke assignment ki location bheje → reject + log
TRK-10  ⛔ Bina token socket connect → disconnect
TRK-11  Duplicate ts wale events → ek hi count hota hai
TRK-12  100 m se kam hile → DB me naya row nahi banta (par broadcast hota hai)
TRK-13  120 min baad session auto-close
TRK-14  WS block ho to polling pe gir jaata hai aur tracking chalti rehti hai
```
