# API_DOCUMENTATION.md
**Fatanpur Bazaar API** (NestJS) · v3.0 · Base: `https://api.fatanpurbazaar.com/v1`

Ye document backend ka **contract** hai — website, mobile app aur tests teeno isi se bandhe hain.
Types `packages/shared-types` se aate hain, taaki teeno jagah ek hi definition rahe.

---

## 1. Conventions

### Response envelope
```jsonc
// Success
{ "ok": true, "data": { ... }, "meta": { "page": 1, "perPage": 24, "total": 143 } }
// Error
{ "ok": false, "error": { "code": "ORDER_STOCK_OUT",
                          "message": "आलू का स्टॉक खत्म हो गया",
                          "field": "items[0].quantity",
                          "ref": "a3f9c1" } }
```
`message` **Hindi me** hai (seedha UI me dikhane layak). `code` machine ke liye. `ref` log se milane ke liye.

### Auth
```
Authorization: Bearer <access_token>          # 15 min
Cookie: fb_rt=<refresh_token>                 # httpOnly, 30 din (web)
X-Device-Id: <uuid>                           # mobile
X-Idempotency-Key: <uuid>                     # order create pe zaroori
```

### Status codes
`200` ok · `201` bana · `400` galat input · `401` login chahiye · `403` haq nahi ·
`404` nahi mila / **aapka nahi hai** · `409` conflict (invalid state transition) ·
`422` business rule fail · `429` rate limit · `500` server

⚠️ Dusre user ka resource maangne pe **404** (403 nahi) — warna ID exist karna leak hota hai.

### Pagination
`?page=1&perPage=24` (max 100). Response me `meta.total`, `meta.hasMore`.

---

## 2. Auth — `/auth`

| Method | Path | Auth | Kya |
|---|---|---|---|
| POST | `/auth/otp/send` | public | OTP bhejo |
| POST | `/auth/otp/verify` | public | OTP verify + login/register |
| POST | `/auth/refresh` | refresh cookie | Naya access token (rotating) |
| POST | `/auth/logout` | user | Ye session revoke |
| POST | `/auth/logout-all` | user | Saare devices |
| GET | `/auth/me` | user | `{id, name, phone, role, permissions[]}` |
| GET | `/auth/sessions` | user | Apne active devices |
| DELETE | `/auth/sessions/:id` | user | Ek device logout |

```jsonc
// POST /auth/otp/send   { "phone": "9876543210", "purpose": "LOGIN" }
{ "ok": true, "data": { "sent": true, "expiresIn": 300, "resendAfter": 60,
                        "isRegistered": true } }
// ⚠️ isRegistered hamesha true bhejo agar enumeration ka darr ho —
//    ya dono case me identical response. Yahan hum identical response dete hain.

// POST /auth/otp/verify { "phone": "9876543210", "otp": "483920",
//                         "name": "Ram", "referralCode": "ABC12345" }
{ "ok": true, "data": {
    "user": { "id": 42, "name": "Ram", "role": "CUSTOMER" },
    "accessToken": "eyJ...", "expiresIn": 900,
    "redirect": "/mera", "isNewUser": true } }
```
🔒 **`role` request me bheja jaye to chup-chaap gir jaata hai. Public registration hamesha CUSTOMER.**

Errors: `OTP_INVALID` (kitne attempts bache) · `OTP_EXPIRED` · `OTP_TOO_MANY` ·
`ACCOUNT_DISABLED` · `RATE_LIMITED` (`Retry-After` header ke saath)

---

## 3. Catalog — `/catalog` (public, cached)

| Method | Path | Kya |
|---|---|---|
| GET | `/catalog/home` | Homepage sections ek call me (banners, verticals, featured, popular) |
| GET | `/catalog/categories` | Category tree (enabled verticals only) |
| GET | `/catalog/products` | `?category&vertical&type&q&sort&page` |
| GET | `/catalog/products/:slug` | Product detail + supplier naam + related |
| GET | `/catalog/services` | `?category` — item_type=SERVICE |
| GET | `/catalog/services/:slug/slots?date=` | Available booking slots |
| GET | `/catalog/search?q=` | Synonym expansion + fulltext + LIKE fallback |
| GET | `/catalog/search/suggest?q=` | Max 8, 60 s cache |
| GET | `/catalog/areas` | Service villages + ETA |

```jsonc
// GET /catalog/products/aloo-1kg
{ "ok": true, "data": {
  "id": 12, "name": "Aloo", "nameHi": "आलू", "slug": "aloo-1kg",
  "itemType": "PRODUCT", "unit": "kg", "unitValue": 1,
  "price": "25.00", "mrp": "30.00", "discountPercent": 17,
  "inStock": true, "stockQty": 48, "maxQtyPerOrder": 20, "isWeighted": true,
  "prescriptionRequired": false,
  "supplier": { "name": "Sharma Kirana", "village": "Fatanpur Bazaar" },  // ← neeche dikhta hai
  "images": [{ "url": "...", "urlSm": "...", "width": 600, "height": 600, "alt": "आलू" }],
  "rating": { "avg": "4.30", "count": 12 },
  "seo": { "title": "...", "description": "...", "canonical": "..." }
} }
```
⚠️ Out-of-stock product ka page **200 hi rahega** (`inStock:false`), 404 nahi —
warna stock 0 hote hi Google index churn hota hai.

---

## 4. Cart — `/cart` (server-side)

| Method | Path | Auth |
|---|---|---|
| GET | `/cart` | user ya `X-Guest-Key` |
| POST | `/cart/items` | `{productId, quantity, slotDate?, slotStart?}` |
| PATCH | `/cart/items/:id` | `{quantity}` |
| DELETE | `/cart/items/:id` | |
| DELETE | `/cart` | khaali karo |
| POST | `/cart/merge` | login ke baad guest cart merge |

```jsonc
// GET /cart
{ "ok": true, "data": {
  "items": [{ "id": 8, "productId": 12, "name": "आलू", "unit": "1 kg",
              "price": "25.00", "quantity": 2, "lineTotal": "50.00",
              "issues": [] }],
  "itemsTotal": "50.00", "itemCount": 2,
  "needsPrescription": false,
  "warnings": [{ "code": "PRICE_CHANGED", "productId": 12,
                 "message": "आलू का दाम ₹23 से ₹25 हो गया" }]
} }
```
Har GET pe server dobara validate karta hai: price, stock, availability, vertical enabled.

---

## 5. Orders — `/orders`

| Method | Path | Auth |
|---|---|---|
| POST | `/orders/quote` | user — server hi paisa ginta hai |
| POST | `/orders` | user + `X-Idempotency-Key` |
| GET | `/orders` | user (apne) |
| GET | `/orders/:orderNumber` | user (ownership) |
| GET | `/orders/:orderNumber/track` | user (ownership) — REST fallback |
| POST | `/orders/:orderNumber/cancel` | user (sirf PENDING_PAYMENT/CONFIRMED) |
| GET | `/orders/:orderNumber/bill` | user — print-friendly |
| POST | `/orders/:orderNumber/review` | user (DELIVERED ke baad) |
| POST | `/orders/:orderNumber/reorder` | user — cart me bhar do |

```jsonc
// POST /orders/quote
// { "addressId": 3, "items": [{"productId":12,"quantity":2}],
//   "couponCode": "NAYA50", "useWallet": true, "paymentMethod": "COD" }
{ "ok": true, "data": {
  "itemsTotal": "50.00", "deliveryFee": "20.00", "discount": "0.00",
  "walletUsed": "10.00", "grandTotal": "60.00",
  "etaMinutes": 45, "needsPrescription": false,
  "breakdown": [...], "warnings": [] } }

// POST /orders   (X-Idempotency-Key: 550e8400-...)
{ "ok": true, "data": {
  "orderNumber": "FB-20260908-0007", "status": "CONFIRMED",
  "grandTotal": "60.00", "paymentMethod": "COD",
  "upi": null,        // UPI ho to: { intentUrl, qrUrl, vpa, amount }
  "etaMinutes": 45, "redirect": "/mera/order/FB-20260908-0007" } }
```

Errors: `OUT_OF_SERVICE_AREA` · `MIN_ORDER_NOT_MET` · `STOCK_INSUFFICIENT` ·
`PRESCRIPTION_REQUIRED` · `COD_LIMIT_EXCEEDED` · `DUPLICATE_REQUEST` (idempotency)

---

## 6. Payments — `/payments`

| Method | Path | Auth |
|---|---|---|
| GET | `/payments/upi-details/:orderNumber` | user — intent URL + QR |
| POST | `/payments/upi/claim` | user — `{orderNumber, utr, screenshot?}` |
| POST | `/payments/:id/verify` | **`payments.verify` (ADMIN)** |
| POST | `/payments/:id/reject` | `payments.verify` |
| POST | `/payments/:id/refund` | `payments.refund` |
| POST | `/webhooks/payment/:driver` | public + HMAC (gateway ke liye, abhi OFF) |

```jsonc
// GET /payments/upi-details/FB-20260908-0007
{ "ok": true, "data": {
  "vpa": "fatanpurbazaar@hdfcbank", "payeeName": "Fatanpur Bazaar",
  "amount": "60.00",
  "intentUrl": "upi://pay?pa=...&pn=...&am=60.00&cu=INR&tn=FB-20260908-0007",
  "qrUrl": "/v1/payments/upi-qr/FB-20260908-0007.png",
  "instructions": "भुगतान के बाद UTR नंबर डालें" } }
```
🔒 Client kabhi `paid: true` nahi bhej sakta. Status server hi set karta hai.

---

## 7. Delivery — `/delivery` (DELIVERY_BOY)

| Method | Path | Kya |
|---|---|---|
| GET | `/delivery/assignments` | Apne active + offered |
| POST | `/delivery/assignments/:id/accept` | |
| POST | `/delivery/assignments/:id/reject` | `{reason}` — order wapas pool me |
| POST | `/delivery/assignments/:id/pickup` | |
| POST | `/delivery/assignments/:id/complete` | `{otp}` — **OTP verify hone pe hi DELIVERED** |
| POST | `/delivery/assignments/:id/fail` | `{reason}` |
| POST | `/delivery/duty` | `{available: true/false}` |
| GET | `/delivery/history` | |
| GET | `/delivery/earnings` | Wallet + cod_in_hand |

```jsonc
// POST /delivery/assignments/91/complete  { "otp": "4321" }
// galat OTP:
{ "ok": false, "error": { "code": "DELIVERY_OTP_INVALID",
    "message": "OTP गलत है। ग्राहक से ऑर्डर पेज का 4 अंक का कोड पूछें। 2 कोशिश बची हैं।" } }
// 3 galat attempt: 429 + admin alert
```

---

## 8. Admin — `/admin` (ADMIN + per-route permission)

| Method | Path | Permission |
|---|---|---|
| GET | `/admin/dashboard` | `reports.view` |
| GET | `/admin/orders` | `orders.view_all` |
| PATCH | `/admin/orders/:no/status` | `orders.update_status` |
| POST | `/admin/orders/:no/adjust` | `orders.adjust` |
| POST | `/admin/orders/:no/assign` | `delivery.assign` |
| GET/POST/PATCH/DELETE | `/admin/products` | `products.manage` |
| PATCH | `/admin/products/:id/price` | `products.price_change` |
| PATCH | `/admin/products/:id/stock` | `inventory.manage` |
| GET/POST | `/admin/suppliers` | `suppliers.manage` |
| GET | `/admin/customers` | `customers.view` |
| **POST** | **`/admin/staff`** | **`staff.create`** ⚠️ |
| PATCH | `/admin/staff/:id/disable` | `staff.manage` |
| PATCH | `/admin/staff/:id/role` | ADMIN only |
| PUT | `/admin/staff/:id/permissions` | `permissions.manage` |
| GET | `/admin/payments/pending` | `payments.view` |
| POST | `/admin/cod/settle` | `delivery.settle_cod` |
| GET | `/admin/prescriptions` | `prescriptions.review` |
| GET/PUT | `/admin/settings` | `settings.manage` |
| GET | `/admin/audit-logs` | `audit.view` |
| GET | `/admin/reports/*` | `reports.view` |

```jsonc
// POST /admin/staff
// { "phone": "9876543211", "name": "Rahul", "role": "DELIVERY_BOY",
//   "employeeCode": "EMP-003", "vehicleType": "BIKE",
//   "permissions": ["orders.view"] }
{ "ok": true, "data": { "id": 55, "role": "DELIVERY_BOY", "employeeCode": "EMP-003" } }
```
🔒 Ye **ekmatra** rasta hai staff banane ka. `role: "ADMIN"` ke liye
`settings.allow_admin_creation` bhi ON hona chahiye (default OFF).

---

## 9. Baaki

| Group | Endpoints |
|---|---|
| Users | `GET/PATCH /users/me` · `GET/POST/PATCH/DELETE /users/me/addresses` · `GET /users/me/wallet` · `GET /users/me/notifications` |
| Prescriptions | `POST /prescriptions` (upload) · `GET /files/rx/:token` (signed) · `POST /prescriptions/:id/review` |
| Services | `GET /services/bookings` · `POST /services/bookings/:id/reschedule` · `POST /services/bookings/:id/complete` |
| Notifications | `POST /notifications/device-token` (FCM) · `POST /notifications/web-push` · `PATCH /notifications/:id/read` |
| Content | `GET /content/pages/:slug` · `GET /content/faqs` · `GET /content/blog` · `POST /content/contact` |
| System | `GET /health` · `GET /version` |

```jsonc
// GET /health   (UptimeRobot isi ko hit karega)
{ "ok": true, "data": {
  "status": "up", "db": "up", "uptimeSec": 84213,
  "rssMb": 103, "activeSockets": 4, "socketTransport": "websocket",
  "version": "1.0.0", "commit": "a3f9c1d" } }
```

---

### Service area (6 km boundary — algorithm A8)

| Method | Path | Auth | Kya |
|---|---|---|---|
| GET | `/service-area` | public | Served villages + zone summary (homepage strip) |
| POST | `/service-area/check` | public | `{villageId?, lat?, lng?, accuracyM?}` → `{serviceable, method, zone, etaMinutes, deliveryFee, distanceKm, servedAreas[]}` |
| POST | `/service-area/request` | public + rate limit 5/day per IP | Bahar wale ka lead capture |
| GET | `/admin/service-area/zones` | `service_area.manage` | Zones list |
| PUT | `/admin/service-area/zones/:id` | `service_area.manage` | Zone save (validate + audit) |
| GET | `/admin/service-area/requests` | `service_area.view` | Expansion list (GROUP BY village) |

```jsonc
// POST /service-area/check  { "lat": 25.812, "lng": 82.041, "accuracyM": 30 }
{ "ok": false, "error": {
    "code": "OUT_OF_SERVICE_AREA",
    "message": "माफ़ करें — अभी हम इस क्षेत्र तक डिलीवरी नहीं करते",
    "data": { "distanceKm": 8.4, "nearestServedKm": 2.1, "canRequest": true,
              "servedAreas": ["फतनपुर बाज़ार", "रानीगंज", "..."] } } }
```
⚠️ Village list hamesha GPS se upar hai — detail `COWORK-BUILD-PROMPT.md` A8.3 me.

---

## 10. Socket.IO

```
URL   wss://api.fatanpurbazaar.com   path: /socket
Auth  io(url, { path:'/socket', auth: { token: accessToken },
                transports: ['websocket','polling'] })
```

**Server → client**
| Event | Payload | Kisko |
|---|---|---|
| `tracking.snapshot` | poora current state | reconnect pe |
| `order.status.updated` | `{orderNumber, status, labelHi, at}` | order room |
| `delivery.assigned` | `{orderNumber, rider:{name,phone}, otp}` | customer room only |
| `delivery.started` | `{orderNumber, at}` | order room |
| `delivery.location.updated` | `{orderNumber, lat, lng, at, isStale}` | order room + ops |
| `delivery.completed` | `{orderNumber, at}` | order room |
| `order.cancelled` | `{orderNumber, reason}` | order room |
| `ops.order.new` | `{orderNumber, total, village}` | `ops:orders` (staff) |

**Client → server** — sirf ek:
| Event | Kaun | Payload |
|---|---|---|
| `delivery.location` | DELIVERY_BOY | `{assignmentId, lat, lng, accuracy, speed, ts}` |

⚠️ Client `join` nahi maang sakta — rooms server assign karta hai.
Detail: `LIVE_TRACKING.md` §4.

---

## 11. Error code catalogue

| Code | HTTP | Hindi message |
|---|---|---|
| `UNAUTHENTICATED` | 401 | लॉगिन करें |
| `FORBIDDEN` | 403 | आपके पास इसकी अनुमति नहीं है |
| `NOT_FOUND` | 404 | नहीं मिला |
| `VALIDATION_FAILED` | 400 | (field-wise) |
| `RATE_LIMITED` | 429 | बहुत ज़्यादा कोशिश — {n} मिनट बाद |
| `OTP_INVALID` | 400 | OTP गलत है। {n} कोशिश बची हैं। |
| `OTP_EXPIRED` | 400 | OTP की समय सीमा खत्म |
| `ACCOUNT_DISABLED` | 403 | खाता बंद है — सहायता से संपर्क करें |
| `OUT_OF_SERVICE_AREA` | 422 | माफ़ करें — अभी हम {area} तक डिलीवरी नहीं करते |
| `MIN_ORDER_NOT_MET` | 422 | कम से कम ₹{n} का ऑर्डर करें |
| `STOCK_INSUFFICIENT` | 422 | {item} का सिर्फ {n} स्टॉक है |
| `PRESCRIPTION_REQUIRED` | 422 | पर्ची अपलोड करें |
| `PRESCRIPTION_PENDING` | 409 | पर्ची की जाँच बाकी है |
| `COD_LIMIT_EXCEEDED` | 422 | पहले ऑर्डर पर ₹{n} तक ही कैश ऑन डिलीवरी |
| `PAYMENT_NOT_VERIFIED` | 409 | भुगतान की पुष्टि बाकी है |
| `INVALID_STATE_TRANSITION` | 409 | {from} से {to} नहीं हो सकता |
| `DELIVERY_OTP_INVALID` | 400 | OTP गलत है। {n} कोशिश बची हैं। |
| `DUPLICATE_REQUEST` | 409 | यह ऑर्डर पहले ही बन चुका है |
| `SLOT_UNAVAILABLE` | 422 | यह समय उपलब्ध नहीं — दूसरा चुनें |
| `INTERNAL` | 500 | कुछ गड़बड़ हो गई। दोबारा कोशिश करें। |
