# SECURITY_AUDIT.md
**Fatanpur Bazaar** · v3.0 · **Design-stage audit** (code likhne ke baad dobara chalega)
Instruction §21, §22, §23, §28, §30, §31, §32

> Status legend: ✅ design me tay · 🔨 code me implement hona hai · ⚠️ risk jo maanna padega · 🚨 blocker

---

## 0. Executive summary

| Area | Status |
|---|---|
| Role escalation (public registration) | ✅ 4 layers of defence, 11 attack cases test me |
| Authentication (OTP + JWT) | ✅ design tay, 🔨 implement |
| Authorization (RBAC + ownership) | ✅ matrix tay, 🔨 guards |
| Injection (SQL/XSS) | ✅ parameterised + React escaping |
| Payment integrity | ✅ server-side only; ⚠️ UPI manual verification ka risk maanna hoga |
| File upload (prescriptions) | ✅ private + signed URL + re-encode |
| Socket authorization | ✅ server-side rooms only |
| Secrets | ✅ env only, ⚠️ FCM service account file ka handling dhyan se |
| Audit logging | ✅ har dangerous action |
| Error handling | ✅ envelope + no stack traces |

**Koi 🚨 blocker nahi hai.** Do ⚠️ risks hain jo business decision hain (§9).

---

## 1. Role escalation — sabse zyada dhyan wala area (§4, §23, §35)

Poora detail `ROLE_PERMISSION_MATRIX.md` §0 me. Yahan audit ka nazariya:

| Layer | Kya rokta hai | Verify |
|---|---|---|
| 1. DB `DEFAULT 'CUSTOMER'` | INSERT me role na ho to CUSTOMER | ✅ MariaDB pe test kiya |
| 2. DTO whitelist | `role` field payload se kat jaata hai | 🔨 `ValidationPipe({whitelist:true})` |
| 3. Service hard-code | `role: Role.CUSTOMER` literal, spread mana | 🔨 code review checklist |
| 4. Alag admin route | `staff.create` permission + audit | 🔨 |

**Aur do defence jo maine add ki hain:**
5. **`settings.allow_admin_creation` default OFF** — ADMIN hone ke baad bhi naya ADMIN banane ke liye ek aur switch on karna padta hai. Ek galat click se poora control chala jaana mushkil ho jaata hai.
6. **Aakhri ADMIN lock** — system me kam se kam ek ACTIVE admin hona chahiye; aakhri ko disable/downgrade nahi kar sakte (khud ko lock out karne se bachav).

⚠️ **Code review ka permanent rule:** `auth.service.ts` me kabhi `...dto` spread na ho user
banate waqt. Ye ek line poori security tod deti hai. CI me ek grep check bhi lag sakta hai.

---

## 2. Authentication

| Cheez | Design |
|---|---|
| Method | Phone + OTP (password kahin nahi) |
| OTP generation | `crypto.randomInt(100000, 999999)` — ⚠️ `Math.random()` kabhi nahi |
| OTP storage | `bcrypt`/`argon2` hash. **Plain OTP kabhi DB me, log me, ya response me nahi** |
| OTP expiry | 5 min (`otp_ttl_seconds`) |
| Max attempts | 3 galat → OTP consume ho jaata hai, naya maangna padta hai |
| Resend cooldown | 60 s |
| Rate limits | phone: 3/15min · IP: 10/15min · verify: 5/15min |
| Enumeration | "OTP bhej diya" hamesha same response — chahe number registered ho ya na ho. Timing bhi constant (dummy hash compare) |
| Access token | JWT, **15 min**, `{sub, role, jti}` |
| Refresh token | 32 random bytes, **DB me sirf sha256 hash**, 30 din, **rotating** |
| Refresh reuse | Purana refresh dobara aaya → **poori chain revoke** + admin alert (token theft ka signal) |
| Role source | ⚠️ **Har request pe DB se** (30 s cache). Token ka role sirf hint hai |
| Logout | Session revoke (server-side) — sirf client se token hatana kaafi nahi |
| Staff login | Account pehle se hona chahiye. Anjaan number pe staff account **kabhi nahi banta** |
| Token storage (web) | Refresh: **httpOnly + Secure + SameSite=Lax cookie**. Access: memory. **localStorage me kabhi nahi** |
| Token storage (mobile) | `react-native-keychain` (Keychain / EncryptedSharedPreferences). AsyncStorage me nahi |

⚠️ **SMS driver abhi `null` hai** (DLT registration pending). Iska matlab launch se pehle
ek provider chahiye — warna login hi nahi hoga. Ye §9 me risk R2 hai.

---

## 3. Authorization (§7, §22)

- **Har** protected endpoint pe guard. Frontend route hiding ko security nahi maana gaya.
- Do alag layer: **permission** ("is tarah ki cheez") + **ownership** ("ye wali cheez").
- Ownership guard resource ko fetch karke controller me inject karta hai — controller dobara
  fetch nahi karta (TOCTOU race se bachav).
- ⚠️ **Dusre ka resource maangne pe `404` dena hai, `403` nahi** — warna attacker ko pata chal
  jaata hai ki wo ID exist karti hai (enumeration).
- `req.body.customerId` / `req.query.userId` / `req.params.riderId` pe **kabhi bharosa nahi**.

Test coverage: `ROLE_PERMISSION_MATRIX.md` §9 (17 test cases).

---

## 4. Injection & input

| Vector | Bachav |
|---|---|
| SQL injection | Knex/mysql2 parameterised binding. Raw SQL me bhi `?` binding. **String concat se query kabhi nahi.** Dynamic `ORDER BY`/`LIMIT` sirf allowlist se |
| XSS (web) | React default escaping. `dangerouslySetInnerHTML` sirf admin-authored content pe, aur wahan bhi sanitizer (allowlist: p, b, i, ul, ol, li, a[href], h2-h4, br) |
| XSS (stored) | Product naam, review comment, address — sab escape hokar render hote hain |
| CSRF | JWT `Authorization` header me (cookie-based auth nahi) → CSRF surface nahi. Refresh cookie `SameSite=Lax` + refresh endpoint pe origin check |
| Mass assignment | Zod schema + `whitelist: true` — unknown fields gir jaate hain |
| Prototype pollution | `JSON.parse` reviver nahi, `Object.assign` user input pe nahi |
| Path traversal | Upload filenames server-generated (UUID), user ka naam kabhi path me nahi |
| SSRF | Koi user-supplied URL fetch nahi hoti |
| Command injection | `exec`/`spawn` user input ke saath kahin nahi (mysqldump ke args hard-coded) |
| ReDoS | Regex simple aur bounded; input length limits pehle |

---

## 5. API hardening (§21)

```ts
app.use(helmet({ contentSecurityPolicy: {...}, hsts: { maxAge: 31536000 } }));
app.use(json({ limit: '1mb' }));                 // upload route pe alag 8 MB
app.enableCors({ origin: env.ALLOWED_ORIGINS.split(','), credentials: true });
// ⚠️ origin: true / '*' kabhi nahi — allowlist hi
app.useGlobalPipes(new ZodValidationPipe({ whitelist: true }));
app.useGlobalFilters(new AllExceptionsFilter());
app.useGlobalInterceptors(new TransformInterceptor(), new AuditInterceptor());
```

**Rate limits (DB-backed, Redis nahi):**
| Bucket | Limit |
|---|---|
| `otp:send:{phone}` | 3 / 15 min |
| `otp:send:ip:{ip}` | 10 / 15 min |
| `otp:verify:{phone}` | 5 / 15 min |
| `login:ip:{ip}` | 20 / 15 min |
| `order:place:{user}` | 6 / 60 min |
| `api:{ip}` | 300 / 5 min |
| `search:{ip}` | 120 / 5 min |
| `upload:{user}` | 10 / day |
| `contact:{ip}` | 3 / 60 min |
| `socket:connect:{user}` | 3 concurrent |

**Security headers** (web + api dono):
`Strict-Transport-Security` · `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` ·
`Referrer-Policy: strict-origin-when-cross-origin` ·
`Permissions-Policy: geolocation=(self), camera=(), microphone=()` · CSP (`script-src 'self'`)

---

## 6. File uploads — prescriptions (§28)

Ye **health data** hai. Sabse sakht handling:

```
1. Size ≤ 5 MB (route-level limit, global 1 MB se alag)
2. MIME `file-type` library se ASLI content dekh kar — extension pe bharosa nahi
   Allowed: image/jpeg, image/png, image/webp, application/pdf
3. Image ho to sharp se RE-ENCODE (EXIF strip, koi embedded payload nahi bachta)
4. PDF ho to magic bytes + size check; inline kabhi serve nahi, hamesha attachment
5. Filename server-generated UUID. User ka naam/extension path me kabhi nahi
6. Storage: storage/private/rx/{userId}/{uuid}.{ext}  ← webroot ke BAAHAR
7. Serve: GET /files/rx/:token
     token = base64url({rxId, uid, exp}) + '.' + hmac_sha256(payload, APP_SECRET)
     - hmac verify (timing-safe)
     - exp ≤ 10 min
     - ⚠️ AUR uske baad DOBARA authorization check (token purana ho sakta hai par
       user ka access beech me chhin gaya ho)
     - Headers: private, no-store, nosniff, Content-Disposition: attachment
8. Access: owner · ADMIN · `prescriptions.review` permission wala staff. Bas.
   ⚠️ "koi bhi staff" nahi.
9. Har view audit_logs me (kaun, kab, kaunsi rx)
10. Retention: `rx_retention_days` (365) ke baad file delete, row `purged_at` ke saath rehti hai
11. Virus scanning: shared hosting pe ClamAV nahi chal sakta.
    ⚠️ Iski jagah: re-encode (jo 95% payloads maar deta hai) + PDF ko kabhi inline na dena
    + executable extensions block. VPS pe jaane pe ClamAV add karna. → RISK R3
```

Baaki uploads (product images, ID proof): product images public, ID proof private + admin-only.
`uploads/` folder me PHP/JS execution server config se blocked.

---

## 7. Payments (§30)

| Rule | Implementation |
|---|---|
| Client ka `payment_success=true` | **Kabhi trust nahi.** Server hi status set karta hai |
| Amount | Hamesha server calculate karta hai (`/orders/quote`). Client ka amount discard |
| COD | Delivery OTP verify hone pe hi PAID |
| **UPI (HDFC direct)** | Customer intent/QR se bhejta hai → UTR daalta hai → `AWAITING_VERIFICATION` → **ADMIN** bank/UPI app me dekh kar verify karta hai → PAID |
| UTR duplicate | `payments.upi_utr` UNIQUE — ek UTR do order pe nahi lag sakta |
| UPI verify kaun | **Sirf ADMIN** (`payments.verify`). SUPERVISOR ko default me nahi |
| Prepaid gate | `prepaid_required_before_pickup` — non-COD order PAID hue bina PICKED_UP nahi ho sakta |
| Gateway (future) | Webhook + HMAC signature (timing-safe) + `webhook_events` table se idempotency + hamesha 200 return |
| Duplicate order | `order_idempotency` (INSERT-first, unique key) |
| Payment success par order fail | Order transaction pehle commit hota hai, payment intent uske baad. Agar payment aaya aur order nahi bana → `webhook_events` me orphan row + admin alert queue |
| Refund | Sirf `payments.refund` permission + audit. Default: wallet credit (instant, dispute-free) |

⚠️ **UPI manual verification ek asli risk hai** — §9 R1.

---

## 8. Audit logging (§31)

Ye actions **hamesha** log hote hain (`audit_logs`, before/after JSON ke saath):
```
staff.create · staff.disable · staff.enable · staff.role_change · permissions.change
product.price_change · product.create/delete · inventory.adjust
order.status_change (manual) · order.cancel · order.adjust
payment.verify · payment.reject · refund.initiate
delivery.assign · delivery.reassign · cod.settle
settings.change · prescription.view · prescription.review
user.disable · login.staff · login.failed (5+ attempts)
system.bootstrap (pehla admin)
```
- `audit_logs` **kabhi delete nahi** hoti (cleanup cron isko chhoota nahi).
- Log me kabhi nahi: OTP, token, password hash, poora phone (masked: `9876XXXX10`), prescription content.
- Admin panel me searchable viewer (`audit.view` permission).

---

## 9. Risks jo maanne padenge

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| **R1** | **UPI manual verification** — koi galat/farzi UTR daal kar order aage badha sakta hai jab tak admin check na kare | Medium | `upi_auto_accept_limit` (₹500) se upar ka order admin verify ke bina CONFIRMED nahi hota · UTR unique · pickup se pehle PAID mandatory · admin ke liye roz "atke hue payments" report. **Asli fix: payment gateway** — jab volume badhe |
| **R2** | **SMS/DLT abhi nahi hai** → OTP deliver nahi hoga → login band | 🚨 launch blocker | DLT registration **abhi shuru karo** (1–2 hafte). Tab tak: staff ke liye admin manually OTP bypass nahi kar sakta — isliye ye launch se pehle solve karna hi hai |
| **R3** | **Virus scanning nahi** (shared hosting pe ClamAV possible nahi) | Low | Re-encode + PDF inline block + extension allowlist. VPS pe ClamAV |
| **R4** | **Do apps ek plan pe** — ek app ka bug (memory leak) dusre ko gira sakta hai | Medium | `--max-old-space-size=384` per process · alag DB user/password · UptimeRobot dono pe |
| **R5** | **Hostinger pe WebSocket verify nahi hua** | Medium | Polling fallback code me. Launch se pehle test (`HOSTING_CAPACITY.md` §6) |
| **R6** | **Firebase service account JSON** server pe rakhni padegi | Medium | File webroot ke bahar, `chmod 600`, git me kabhi nahi (`.gitignore` + pre-commit hook). Rotate karne ka rasta documented |
| **R7** | Shared hosting pe **doosre tenants** | Low | Hostinger ka isolation. Sensitive data DB me, aur DB password strong + app-specific user |

---

## 10. Secrets — kya kahan

| Secret | Kahan | Frontend me? |
|---|---|---|
| `DB_PASSWORD` | server env | ❌ kabhi nahi |
| `JWT_SECRET` (≥32 bytes random) | server env | ❌ |
| `JWT_REFRESH_SECRET` (alag) | server env | ❌ |
| `APP_SECRET` (file token HMAC) | server env | ❌ |
| `SMS_API_KEY` | server env | ❌ |
| `FIREBASE_SERVICE_ACCOUNT` (JSON path) | server file, chmod 600 | ❌ |
| FCM **client** config (apiKey, projectId) | mobile app bundle | ✅ ye public hai, theek hai |
| `UPI_VPA` | DB settings | ✅ customer ko dikhana hi hai |
| Map API key (agar Google) | server env; client ke liye **restricted** key (domain/package restriction) | ⚠️ restricted ho tabhi |

**Boot pe env validation** — koi secret missing ya default value ho to app **start hi na ho**
(chup-chaap default se chalne se accha hai saaf fail hona).

---

## 11. Error handling (§32)

```ts
// AllExceptionsFilter
// Customer ko:
{ ok: false, error: { code: 'ORDER_STOCK_OUT', message: 'आलू का स्टॉक खत्म हो गया' } }
// Unknown error pe:
{ ok: false, error: { code: 'INTERNAL', message: 'कुछ गड़बड़ हो गई। दोबारा कोशिश करें।',
                      ref: 'a3f9c1' } }   ← ref se log me dhoondh sakte ho
// Log me: poora stack, request id, user id, route, sanitized body
```
- Stack trace, SQL error, file path — **kabhi response me nahi**
- `NODE_ENV=production` me Nest ka detailed error output off
- 4xx `warn` level pe, 5xx `error` level pe + admin alert (5 min me 10 se zyada 5xx)

---

## 12. Pre-launch security checklist

```
[ ] JWT_SECRET / REFRESH_SECRET / APP_SECRET — 32+ random bytes, dono apps ke ALAG
[ ] DB user sirf apne DB pe (GRANT ALL ON fatanpur_db.* — global nahi), alag password
[ ] .env git me nahi (.gitignore + pre-commit grep hook)
[ ] Firebase JSON webroot ke bahar, chmod 600
[ ] CORS allowlist me sirf apne domain (no '*')
[ ] Helmet + HSTS + CSP on, headers curl se verify
[ ] Rate limits chalu — OTP pe khud test karke dekha
[ ] Sab 17 RBAC test pass (ROLE_PERMISSION_MATRIX §9)
[ ] Prescription URL bina token / expired token se 403
[ ] uploads/ me PHP/JS execution blocked (server config)
[ ] Error response me stack trace nahi (prod build pe curl karke dekha)
[ ] Pehla admin CLI se bana, SETUP_TOKEN uske baad hataya
[ ] settings.allow_admin_creation = OFF
[ ] Backup chal raha hai AUR ek restore test ho chuka hai
[ ] UptimeRobot dono apps pe
[ ] WebSocket transport test ho chuka (§R5)
[ ] SMS provider live (R2) — warna launch nahi
```

---

## 13. Code likhne ke baad ka audit (ye document tab update hoga)

Abhi ye **design audit** hai. Code aane ke baad ye check hone hain:
- `npm audit` — koi high/critical dependency nahi
- Har guard ka test (bypass ki koshish ke saath)
- Ek round manual pentest: role escalation, IDOR, socket room jump, upload bypass
- Secrets ke liye `git log -p | grep -iE "secret|password|key"` scan
- Production build me source maps public na hon
