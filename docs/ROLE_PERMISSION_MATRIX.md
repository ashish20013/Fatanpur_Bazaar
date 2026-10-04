# ROLE_PERMISSION_MATRIX.md
**Fatanpur Bazaar** · v3.0 · Ye document **testable contract** hai — har row ka ek test case hai (`TEST_REPORT.md`).

---

## 0. THE RULE (instruction §4, §23, §35 — sabse important)

```
PUBLIC REGISTRATION  =  CUSTOMER  ONLY.  Hamesha. Bina apvaad ke.

ADMIN         → sirf initial setup script ya kisi aur ADMIN dwara
SUPERVISOR    → sirf ADMIN dwara
DELIVERY_BOY  → sirf ADMIN dwara
CUSTOMER      → koi bhi bana sakta hai (phone + OTP)

Koi bhi user apna role khud badal nahi sakta — CUSTOMER, DELIVERY_BOY, SUPERVISOR koi bhi nahi.
```

### Ye code me kaise enforce hota hai (4 layers, ek fail ho to baaki bachaate hain)

**Layer 1 — Database default**
```sql
role ENUM('CUSTOMER','ADMIN','SUPERVISOR','DELIVERY_BOY') NOT NULL DEFAULT 'CUSTOMER'
```
Registration INSERT me `role` column likha hi nahi jaata. Verified: naya user hamesha CUSTOMER banta hai.

**Layer 2 — DTO whitelist**
`RegisterDto` me `role` field hai hi nahi. `ValidationPipe({ whitelist: true, forbidNonWhitelisted: false })` unknown fields ko payload se **kaat deta hai** — controller tak pahunchte hi nahi.
```ts
// POST /auth/verify-otp  { phone, otp, name?, referralCode?, role:'ADMIN' }
// → controller ko milta hai: { phone, otp, name?, referralCode? }   ← role gayab
```

**Layer 3 — Service hard-code**
```ts
// auth.service.ts — public registration ka EKMATRA rasta
private async createCustomer(phone: string, name?: string) {
  return this.users.insert({
    phone,
    name,
    role: Role.CUSTOMER,        // ← literal. variable nahi, parameter nahi, spread nahi.
    status: UserStatus.ACTIVE,
  });
}
```
⚠️ Is function me `...dto` spread karna **mana hai**. Code review me ye pehli cheez dekhi jaayegi.

**Layer 4 — Staff banane ka alag rasta**
`POST /admin/staff` — `@Roles('ADMIN')` + `@RequirePermission('staff.create')` + audit log. Public router me is path ka koi alias nahi.

### Attack cases jo fail hone chahiye (aur test me hain)
| Attack | Result |
|---|---|
| `POST /auth/verify-otp {phone, otp, role:"ADMIN"}` | User bana, role=CUSTOMER |
| `POST /auth/verify-otp?role=ADMIN` | Query param ignore, role=CUSTOMER |
| `POST /admin/staff` bina token | 401 |
| `POST /admin/staff` CUSTOMER token se | 403 |
| `POST /admin/staff` SUPERVISOR token se | 403 (default me `staff.create` nahi) |
| `POST /admin/staff` DELIVERY_BOY token se | 403 |
| `PATCH /users/me {role:"ADMIN"}` | role field DTO me hai hi nahi → ignore |
| `PATCH /admin/staff/:id {role:"ADMIN"}` SUPERVISOR se | 403 |
| JWT me role manually "ADMIN" karke bheja (signature todi) | 401 — signature verify fail |
| Purana valid JWT jisme role=ADMIN tha, par DB me ab CUSTOMER | 403 — **role DB se padha jaata hai, token se nahi** |
| Mobile app ki local state me role=ADMIN set karke API call | 403 — backend DB dekhta hai |

---

## 1. Role summary

| Role | Ban kaise sakta hai | Login | Default landing |
|---|---|---|---|
| `CUSTOMER` | Public: phone + OTP | Phone + OTP | `/mera` |
| `ADMIN` | Initial setup script, ya dusra ADMIN | Phone + OTP (account pehle se hona chahiye) | `/admin` |
| `SUPERVISOR` | Sirf ADMIN | Phone + OTP (account pehle se) | `/supervisor` |
| `DELIVERY_BOY` | Sirf ADMIN | Phone + OTP (account pehle se) | `/delivery` |

⚠️ **Staff login pe naya account KABHI nahi banta.** Agar koi anjaan number staff login try kare:
- Wo phone customer flow se CUSTOMER account bana sakta hai (normal registration), **ya**
- Staff-specific endpoint pe `401 Unauthorized` milta hai.
Kabhi bhi "phone naya hai to staff bana do" nahi hota.

---

## 2. Permission catalogue (31 permissions, `permissions` table me seeded)

| Group | Code | Kya karne deta hai | Dangerous |
|---|---|---|---|
| orders | `orders.view` | Orders dekhna | |
| | `orders.view_all` | Sabhi customers ke orders | |
| | `orders.update_status` | Status aage badhana | |
| | `orders.cancel` | Cancel karna | ⚠️ |
| | `orders.adjust` | Quantity/item badalna (taul) | ⚠️ |
| delivery | `delivery.assign` | Delivery boy assign | |
| | `delivery.reassign` | Dobara assign | |
| | `delivery.track` | Live tracking dekhna | |
| | `delivery.settle_cod` | COD cash jama lena | ⚠️ |
| catalog | `products.view` | Products dekhna | |
| | `products.manage` | Add/edit/delete | ⚠️ |
| | `products.price_change` | Price badalna | ⚠️ |
| | `categories.manage` | Categories | ⚠️ |
| | `suppliers.manage` | Suppliers | ⚠️ |
| inventory | `inventory.view` | Stock dekhna | |
| | `inventory.manage` | Stock badalna | ⚠️ |
| customers | `customers.view` | Customer list | |
| | `customers.manage` | Disable/edit | ⚠️ |
| staff | `staff.view` | Staff list | |
| | `staff.create` | **Naya staff banana** | ⚠️ |
| | `staff.manage` | Enable/disable/edit | ⚠️ |
| | `permissions.manage` | Permission dena/lena | ⚠️ |
| payments | `payments.view` | Payments dekhna | |
| | `payments.verify` | **UPI verify karna** | ⚠️ |
| | `payments.refund` | Refund | ⚠️ |
| marketing | `coupons.manage` | Coupons | ⚠️ |
| pharmacy | `prescriptions.review` | **Parchi jaanchna** | ⚠️ |
| content | `content.manage` | Blog/pages/FAQ | |
| reports | `reports.view` | Reports | |
| system | `audit.view` | Audit logs | |
| | `settings.manage` | Settings | ⚠️ |

### Effective permission resolve karne ka algorithm
```
effectivePermissions(user):
  1. user.role === 'ADMIN'  → SAARI permissions (bypass)
  2. base = SELECT permission_code FROM role_permissions WHERE role = user.role
  3. overrides = SELECT permission_code, granted FROM user_permissions WHERE user_id = user.id
  4. final = (base ∪ {overrides where granted=1}) − {overrides where granted=0}
  5. 30 second in-process cache (user.id key). Permission badalne pe turant invalidate.
```
`user_permissions.granted = 0` se ADMIN kisi staff se ek specific haq **cheen** bhi sakta hai.

---

## 3. Default role → permission matrix

✅ = default me hai · ➕ = ADMIN de sakta hai · ❌ = kabhi nahi

| Permission | CUSTOMER | DELIVERY_BOY | SUPERVISOR | ADMIN |
|---|:---:|:---:|:---:|:---:|
| orders.view | ❌* | ✅ (sirf apne) | ✅ | ✅ |
| orders.view_all | ❌ | ❌ | ✅ | ✅ |
| orders.update_status | ❌ | ➕† | ✅ | ✅ |
| orders.cancel | ❌* | ❌ | ✅ | ✅ |
| orders.adjust | ❌ | ❌ | ✅ | ✅ |
| delivery.assign | ❌ | ❌ | ✅ | ✅ |
| delivery.reassign | ❌ | ❌ | ✅ | ✅ |
| delivery.track | ❌* | ❌ | ✅ | ✅ |
| delivery.settle_cod | ❌ | ❌ | ➕ | ✅ |
| products.view | ❌* | ❌ | ✅ | ✅ |
| products.manage | ❌ | ❌ | ➕ | ✅ |
| products.price_change | ❌ | ❌ | ➕ | ✅ |
| categories.manage | ❌ | ❌ | ➕ | ✅ |
| suppliers.manage | ❌ | ❌ | ➕ | ✅ |
| inventory.view | ❌ | ❌ | ✅ | ✅ |
| inventory.manage | ❌ | ❌ | ✅ | ✅ |
| customers.view | ❌ | ❌ | ✅ | ✅ |
| customers.manage | ❌ | ❌ | ➕ | ✅ |
| staff.view | ❌ | ❌ | ✅ | ✅ |
| **staff.create** | ❌ | ❌ | **❌ (default)** ➕ | ✅ |
| **staff.manage** | ❌ | ❌ | **❌ (default)** ➕ | ✅ |
| **permissions.manage** | ❌ | ❌ | ❌ | ✅ |
| payments.view | ❌* | ❌ | ✅ | ✅ |
| **payments.verify** | ❌ | ❌ | **❌ (default)** ➕ | ✅ |
| payments.refund | ❌ | ❌ | ➕ | ✅ |
| coupons.manage | ❌ | ❌ | ➕ | ✅ |
| prescriptions.review | ❌ | ❌ | ➕ | ✅ |
| content.manage | ❌ | ❌ | ➕ | ✅ |
| reports.view | ❌ | ❌ | ✅ | ✅ |
| audit.view | ❌ | ❌ | ➕ | ✅ |
| settings.manage | ❌ | ❌ | ❌ | ✅ |

\* CUSTOMER ka access **permission se nahi, ownership se** aata hai — apne orders, apna cart, apna address, apni tracking. Uske liye koi permission row nahi banti.
† DELIVERY_BOY apne assignment ke andar hi status badal sakta hai (PICKED_UP → DELIVERED), wo bhi `delivery_assignments` ownership check ke saath — general `orders.update_status` nahi.

### Do jaanbujh kar liye gaye faisle
1. **SUPERVISOR ko `staff.create` default me NAHI** — instruction §5 ka seedha aadesh. ADMIN chahe to `user_permissions` se de sakta hai.
2. **SUPERVISOR ko `payments.verify` default me NAHI** — paisa platform ke HDFC UPI me aata hai; verify karne wala aur payout dekhne wala ek hi aadmi nahi hona chahiye. ADMIN chahe to de de.
3. **`permissions.manage` aur `settings.manage` sirf ADMIN** — inse koi bhi apne aap ko upar utha sakta hai, isliye ye ADMIN ke bahar kabhi nahi jaate.

---

## 4. Ownership rules (permission se alag layer)

Permission kehta hai "is tarah ki cheez chhoo sakte ho". Ownership kehta hai "**ye wali** cheez chhoo sakte ho".
**Dono pass hone chahiye.**

| Resource | Ownership rule |
|---|---|
| Order | `order.customer_id = user.id` **YA** staff with `orders.view_all` **YA** us order ka assigned rider |
| Address | `address.user_id = user.id` (staff bhi sirf order ke context me dekhta hai) |
| Cart | `cart.user_id = user.id` |
| Wallet | `wallet.user_id = user.id` |
| Prescription | `rx.user_id = user.id` **YA** `prescriptions.review` permission wala staff |
| Delivery assignment | `assignment.rider_id = user.id` **YA** `delivery.*` permission wala staff |
| Tracking room | order ka customer, uska assigned rider, ya `delivery.track` wala staff |
| Notification | `notification.user_id = user.id` |
| Service booking | order ownership + assigned technician |

**Implementation:** `OwnershipGuard` ek `@Owns('order')` decorator ke saath. Guard resource ko DB se laata hai, `user.id` se milata hai, phir controller me inject kar deta hai — controller dobara fetch nahi karta (TOCTOU se bachne ke liye).

⚠️ Kabhi bhi `req.body.customerId` / `req.query.userId` / `req.params.riderId` pe bharosa nahi. Identity sirf **verified JWT + DB** se aati hai (instruction §22).

---

## 5. Route → guard map (backend)

| Route pattern | Guards |
|---|---|
| `POST /auth/*` | `@Public()` + rate limit (OTP throttle) |
| `GET /catalog/*`, `GET /content/*` | `@Public()` + cache |
| `GET|POST /cart/*` | Auth **ya** guest cart key (ownership) |
| `POST /orders`, `GET /orders/*` | Auth + Ownership |
| `GET /orders/:no/track` | Auth + Ownership (customer/rider/staff) |
| `POST /delivery/assignments/:id/*` | Auth + `DELIVERY_BOY` + assignment ownership |
| `POST /delivery/ping` | Auth + `DELIVERY_BOY` + active assignment hona chahiye |
| `/supervisor/*` | Auth + `SUPERVISOR|ADMIN` + per-route permission |
| `/admin/*` | Auth + `ADMIN` + per-route permission |
| `POST /admin/staff` | Auth + `ADMIN` + `staff.create` + audit |
| `POST /payments/:id/verify` | Auth + `payments.verify` + audit |
| `POST /prescriptions/:id/review` | Auth + `prescriptions.review` + audit |
| `GET /files/rx/:token` | Signed token + ownership/permission recheck |
| `POST /webhooks/*` | `@Public()` + HMAC signature + IP allowlist (auth guard nahi) |

---

## 6. Socket.IO authorization

```
connect  → handshake.auth.token (JWT) verify → user DB se load → socket.data.user
           token nahi / invalid / user disabled → disconnect turant
join     → ⚠️ CLIENT KABHI ROOM NAHI MAANG SAKTA.
           Connect ke baad server khud decide karta hai kaunse room join karne hain:
             CUSTOMER     → user:{id}  +  order:{no} har active order ka
             DELIVERY_BOY → user:{id}  +  delivery:{assignmentId} har active assignment ka
             SUPERVISOR   → ops:orders + ops:delivery   (agar delivery.track permission hai)
             ADMIN        → ops:*
emit     → DELIVERY_BOY sirf `delivery.location` bhej sakta hai, aur wo bhi
           sirf apne active assignment ke liye (payload me assignmentId aata hai par
           server dobara verify karta hai ki wo assignment isi rider ka aur ACTIVE hai)
           Baaki koi client kuch bhi emit kare → ignore + log + 3 baar pe disconnect
```
Detail: `LIVE_TRACKING.md` §4.

---

## 7. Staff lifecycle

```
CREATE   POST /admin/staff { phone, name, role, employeeCode, permissions[]? }
  1. @Roles('ADMIN') + @RequirePermission('staff.create')
  2. role IN (SUPERVISOR, DELIVERY_BOY, ADMIN) — CUSTOMER yahan se nahi banta
  3. ⚠️ role='ADMIN' banane ke liye actor ka ADMIN hona kaafi nahi —
     `settings.allow_admin_creation` bhi ON hona chahiye (default OFF).
     Ye ek galti se poore system ka control dene se bachata hai.
  4. Phone pehle se hai?
       - CUSTOMER hai → "promote" kar sakte ho (role badlega), par:
         audit log + purane saare sessions revoke + customer ka cart/order history rehta hai
       - already staff hai → 409
  5. INSERT users + staff_profiles (employee_code unique)
  6. permissions[] diye ho to user_permissions me daalo (sirf wahi jo actor ke paas khud hain)
  7. audit_logs: staff.create (before=null, after={phone, role, permissions})
  8. Staff ko SMS/notification: "aapka staff account bana hai, phone se OTP login karein"

DISABLE  PATCH /admin/staff/:id/disable { reason }
  users.status='DISABLED', disabled_at/by/reason
  ⚠️ SAARE auth_sessions turant revoke → uske access token 15 min me expire,
     par har request pe DB check hone ki wajah se **turant** band ho jaata hai
  Active deliveries: admin ko force kiya jaata hai ki pehle reassign kare (warna 409)
  audit_logs

ENABLE   PATCH /admin/staff/:id/enable → status='ACTIVE', audit

ROLE     PATCH /admin/staff/:id/role { role }
CHANGE   ADMIN only + audit + saare sessions revoke
         ⚠️ Aakhri ACTIVE ADMIN ka role badalna ya use disable karna BLOCKED hai
            ("system me kam se kam ek admin hona zaroori hai") — apne aap ko lock
            out karne se bachata hai

RESET    POST /admin/staff/:id/revoke-sessions  → saare device logout
```

---

## 8. Initial ADMIN kaise banta hai (chicken-and-egg)

```
npm run seed:admin -- --phone=91XXXXXXXXXX --name="Ashish"
```
- Sirf **CLI se**, HTTP se nahi. Koi bhi HTTP route pehla admin nahi bana sakta.
- Script pehle check karta hai: koi ADMIN pehle se hai? → mana kar deta hai (dobara nahi chalta).
- `SETUP_TOKEN` env var chahiye jo deployment ke waqt set hoti hai aur uske baad hata di jaati hai.
- Ye run audit_logs me `system.bootstrap` ke naam se darj hota hai.

---

## 9. Har row ka test (TEST_REPORT.md me results)

```
AUTH-01  Public register → role hamesha CUSTOMER (role inject karke bhi)
AUTH-02  Staff login: anjaan phone → staff account NAHI banta
AUTH-03  Disabled user ka valid token → 403
AUTH-04  Refresh token rotation: purana token dobara use → poori chain revoke
RBAC-01  CUSTOMER → /admin/* → 403 (har admin route pe)
RBAC-02  CUSTOMER → dusre customer ka order → 404 (403 nahi — existence leak na ho)
RBAC-03  DELIVERY_BOY → /admin/staff → 403
RBAC-04  DELIVERY_BOY → dusre rider ka assignment → 403
RBAC-05  SUPERVISOR → POST /admin/staff → 403 (default)
RBAC-06  SUPERVISOR + granted staff.create → 200
RBAC-07  SUPERVISOR → settings.manage → 403 (grant ke baad bhi — ADMIN-only list)
RBAC-08  Token me role badal kar → 401 (signature)
RBAC-09  DB me role downgrade → purana token turant 403
SOCK-01  Bina token socket connect → disconnect
SOCK-02  Customer dusre order ka room maange → ignore + no data
SOCK-03  Rider dusre assignment ki location bheje → reject + log
OWN-01   Dusre ka address/cart/wallet/prescription → 404/403
```
