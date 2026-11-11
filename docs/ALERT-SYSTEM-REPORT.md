# Fatanpur Bazaar — Real-Time Order Alerts, Global Admin Configuration & Test Report

Date: 2 November 2026 · Scope: `apps/api` + `apps/mobile` only
**The live website was not touched.** No file under `apps/web` was modified (verified), no
migration was run, no production data was written, and no existing API contract was changed.

---

## 1. Summary of what was built

| Phase | What it does | State |
| --- | --- | --- |
| 2 | Health Check-up / product card layout fixed at the shared component, not per screen | Done, verified on device |
| 3 | Rapido-style ringing order alert for on-duty delivery boys, with ACCEPT / REJECT | Done, verified on device |
| 4 | Admin + supervisor informational alert — **no** accept/reject, auto-dismisses | Done, verified on device |
| 5 | Escalation when an order stays unassigned, with "assign" and "I'll arrange" | Done, verified on device |
| 6 | Alert & Notification Management in the admin panel (27 settings + 5 history views) | Done, verified on device |
| 7 | Backend as the source of truth: atomic assignment, idempotency, audit | Done, 36/36 automated |
| 8 | End-to-end testing per role + edge cases | Done, with 4 gaps listed in §8 |
| 9 | Checks, build, this report | Done |

The alert layer was built **on top of the delivery pool that already existed** — the same
row-locked `claim()` decides who gets an order, so two delivery boys can never both get it.
Nothing about ordering, payment, OTP, the catalogue or the website changed.

---

## 2. Files

### New — backend (`apps/api/src/modules/alerts/`)
- `alert-config.service.ts` — the 27 settings, their defaults, validation, and an upserting save
- `alerts.service.ts` — fan-out, escalation, "I'll arrange", history, the cron safety net
- `alerts.controller.ts` — the admin endpoints (global-admin only) and the escalation board
- `alerts.module.ts`

### Modified — backend
- `app.module.ts` — registers `AlertsModule`
- `modules/tracking/tracking.gateway.ts` — `emitAlert()` / `emitAlertToUsers()` (additive)
- `modules/delivery/delivery.service.ts` — fires the alert after a successful announce, resolves
  it on claim/assign, new `declinePool()`, registers the `alerts:escalation-sweep` cron
- `modules/delivery/delivery.controller.ts` — `POST /delivery/decline/:orderNumber`
- `modules/delivery/delivery.module.ts` — imports `AlertsModule`

### New — app
- `src/store/alerts.tsx` — one owner of the ringtone/vibration lifecycle and the role gate
- `src/components/OrderAlerts.tsx` — the three cards (incoming / info / escalation)
- `src/screens/staff/AdminAlerts.tsx` — the Global Admin screen
- `src/navigation/linking.ts`, `src/navigation/useGrid.ts`

### Modified — app
- `src/App.tsx`, `src/services/socket.ts`, `src/navigation/RootNavigator.tsx`,
  `src/navigation/StaffStack.tsx`, `src/screens/staff/Menu.tsx`,
  `src/components/ProductTile.tsx`, `src/screens/customer/Categories.tsx`,
  `src/screens/customer/Search.tsx`

### New — Android native
- `OrderAlertModule.kt` (channels, full-screen intent, ring/buzz), `OrderAlertPackage.kt`,
  `FbMessagingService.kt` (data-only push while the app is dead)

### Modified — Android native
- `MainApplication.kt`, `AndroidManifest.xml`, `app/build.gradle`, `app/proguard-rules.pro`

---

## 3. API changes (all additive)

| Method | Route | Who |
| --- | --- | --- |
| GET | `/v1/admin/alerts/config` | ADMIN + `settings.manage` + **global admin** |
| PUT | `/v1/admin/alerts/config` | ADMIN + `settings.manage` + **global admin** |
| GET | `/v1/admin/alerts/logs?kind=…` | ADMIN + `settings.manage` + **global admin** |
| GET | `/v1/admin/alerts/unassigned` | ADMIN/SUPERVISOR + `delivery.assign` |
| POST | `/v1/admin/alerts/unassigned/:orderNumber/arrange` | ADMIN/SUPERVISOR + `delivery.assign` |
| POST | `/v1/delivery/decline/:orderNumber` | DELIVERY_BOY (own pool offer) |

Assigning a rider deliberately **reuses** the existing `POST /admin/orders/:orderNumber/assign`.
A second way to assign would be a second place for the "one active assignment" rule to be got
wrong. No existing route changed its request or response shape.

New socket events (server → client only; the client still cannot ask for a room):
`alert.incoming_order`, `alert.order_info`, `alert.order_unassigned`,
`alert.escalation.resolved`, `alert.escalation.arranging`.

---

## 4. Database changes and migration requirements

**None. There is nothing to migrate.**

- Settings live in the existing `settings` table, group `alerts`. **No row is written until you
  press Save** in the admin panel — until then the defaults come from code, so deploying the API
  changes no data at all.
- Escalation history and the "I'll arrange" acknowledgements are rows in the existing
  `audit_logs` (`alert.escalated`, `alert.escalation_ack`, `alert.config`).
- Rejection history is the existing `delivery_assignments` REJECTED rows.
- Alert delivery history is the existing `notifications` table (`type` beginning `alert.`).

---

## 5. Global Admin configuration

Admin panel → **Menu → Alerts & notifications** (visible to the main admin only; the server
checks `isGlobalAdmin` in the handler, so hiding the menu entry is a courtesy, not the lock).

27 settings in five groups, every one with the default shown beside it:

- **Who gets alerted** — which delivery boys (`ON_DUTY` / `ALL_RIDERS` / `SELECTED`), named
  rider ids, admins on/off, supervisors on/off, extra user ids
- **Timing** — incoming alert expiry (**120 s**), admin auto-dismiss (**10 s**), escalation after
  (**120 s**), escalation repeat (**300 s**), retry (**60 s**); `0` means "never"
- **How the phone behaves** — ringtone, vibration, priority (HIGH/DEFAULT), lock-screen
  visibility, how many times to ring again (**2**)
- **What the alert says** — eight title/message templates with `{orderNumber} {customer}
  {village} {amount} {money} {items} {status} {minutes}`, plus which order fields to show
- **History** — five tabs: notifications (with sent / not sent), escalations, rejections,
  assignments, configuration changes

Every save is validated server-side (ints 0–86400, booleans, JSON arrays, strings ≤ 400 chars),
refuses any key that is not an alert key, and writes an `alert.config` audit row with before and
after. A setting added on the backend later appears on this screen without a new app release.

---

## 6. Automated test results

`/tmp/claude-0/verify.py` — one pass over the whole promise, against the API and MariaDB:

```
TOTAL: 36/36 passed
```

Including, by phase:

- **6** config read/save/validation; scoped admin refused (403); changes audited
- **3** both on-duty riders rung; payload offers ACCEPT and REJECT; carries ringtone + expiry
- **4** admins informed; **the watcher payload has no `actions` key at all**; carries the
  configured dismiss time; no rider alert reaches an admin
- **5** unassigned order escalates on timeout; cause recorded; appears on the board;
  "I'll arrange" recorded **and the order still NOT assigned**; stays on the board marked as
  being arranged; a claimed order does not escalate
- **7** rejection + expiry do not double-escalate (2 → 2 in the same window);
  **two simultaneous accepts → exactly one wins**; exactly one active assignment;
  same idempotency key → one order
- **6E** all five history views readable; refused to a scoped admin

Other checks: API `tsc --noEmit` clean · API `eslint` clean · app `tsc --noEmit` clean ·
Android `assembleRelease` **BUILD SUCCESSFUL** (20.7 MB, signed with your own release keystore,
`CN=Ashish Yadav`).

---

## 7. Device test results (Android emulator, API 30, x86_64)

Each line below was observed, not assumed.

| # | Test | Result |
| --- | --- | --- |
| 1 | App launches, no fatal exception, catalogue loads from the API | ✅ |
| 2 | Deep link `fatanpurbazaar://login` opens the login screen | ✅ |
| 3 | Delivery boy logs in by phone + OTP, duty toggle writes `is_available=1` | ✅ |
| 4 | New order → ringing card with order ID, 106 s countdown, COD note, ₹ amount, customer name, full address, village, item count, placement time, **ACCEPT + REJECT** | ✅ |
| 5 | Vibration fires with the card (seen in the vibrator service log) | ✅ |
| 6 | ACCEPT → assignment `rider_id=3 ACCEPTED`, order `ASSIGNED`, card gone at once | ✅ |
| 7 | REJECT → `REJECTED` row with reason, order stays `CONFIRMED` and claimable, card gone | ✅ |
| 8 | Admin: banner "नया ऑर्डर · FB-…-0021" / "राम कुमार · ₹50 · फतनपुर बाज़ार · CONFIRMED" | ✅ |
| 9 | Admin: **zero accept/reject controls anywhere on the screen** | ✅ |
| 10 | Admin: banner disappears on its own after the configured window, untouched | ✅ |
| 11 | Escalation card with the exact line "THIS ORDER HAS NOT BEEN ASSIGNED TO ANY DELIVERY BOY YET.", order ID, customer, address, amount, status, time elapsed, cause | ✅ |
| 12 | "मैं इंतज़ाम करूँगा" → audit row written, **order still CONFIRMED with 0 active assignments**, card stays up | ✅ |
| 13 | Assigning a rider clears the escalation card instantly on the admin's phone | ✅ |
| 14 | Global Admin screen: 27 rows grouped, live values, five history tabs with real rows | ✅ |
| 15 | Global Admin screen: edit a value → Save → DB `alert_offer_expiry_sec=90`, `updated_by=1`, `alert.config` audit row, success message | ✅ |
| 16 | `urgent_orders` channel live: importance 4 (HIGH), `USAGE_NOTIFICATION_RINGTONE`, vibration `[0,500,300,500,300,500]` | ✅ |

---

## 8. Bugs found during verification — and fixed

**1. Alert delivery history always came back empty.**
`AlertsService.history()` used knex's `.whereLike()`, which appends `COLLATE utf8_bin`;
MySQL/MariaDB refuse that against this column's charset (error 1253), so the one view meant to
show failed notifications showed nothing at all. Now `.where(col, 'like', …)`.
Verified: 10 rows in the suite and real rows on the device screen.

**2. `.env` was silently ignored in every release APK.**
R8 deleted `com.fatanpurbazaar.app.BuildConfig` (confirmed in `mapping/release/usage.txt`)
because nothing in Java references its fields — but that is exactly where
`react-native-config` reads them at runtime. So in release builds `API_BASE_URL`,
`SUPPORT_PHONE` and `SOCKET_PATH` all came back empty and the app fell back to its hardcoded
constants. Debug builds were fine, which is why it was invisible. Fixed with keep rules in
`proguard-rules.pro` (and keeps added for the three new alert classes, which would have been
stripped next).
**This one changes what you must do before your next release build — see §10.3.**

**3. A phone that could not play a sound also did not vibrate.**
`startRinging` had one try/catch around both. When `MediaPlayer.prepare()` failed — no ringtone
set, silent profile, a device refusing `content://settings/system/ringtone` — the throw jumped
past the vibrate call, so the delivery boy got neither. They are independent now and the call
reports whether either worked.

**4. Turning escalation off did not turn it off.**
With the escalation time set to `0` ("never"), repeats already armed kept alerting every five
minutes, because the timer carried the old interval and `escalate()` never re-checked. Guard
added: a `TIMEOUT` escalation is refused when the setting is `0`. "Nobody on duty" and
"everybody declined" still get through — those are facts, not timeouts, and the master switch
silences everything.
Verified live: 8 minutes, 15 unassigned orders, zero timeout escalations.

---

## 9. Known limitations — not verified, and why

These are the honest gaps. I did not test them, so I am not claiming them.

1. **Push while the app is in the background, terminated, or the phone is locked.**
   The sandbox has no `FIREBASE_SERVICE_ACCOUNT`, so the FCM provider is disabled and no real
   push could be sent. What *is* verified: the receiver service is registered in the manifest,
   the `urgent_orders` channel exists with ringtone audio attributes and the vibration pattern,
   the full-screen intent and both action buttons are built with `FLAG_IMMUTABLE`, and
   `MainActivity` carries `showWhenLocked` + `turnScreenOn`. The remaining step needs your
   service account on the server and a real phone.
2. **The ringtone itself.** The emulator runs with no audio and has no ringtone asset, so
   `MediaPlayer` failed there (handled — see bug 3). Vibration was observed. Sound needs a
   physical device.
3. **Notification permission denied.** `POST_NOTIFICATIONS` only exists from Android 13; the
   emulator is Android 11. The request code is in place but the denial path is untested.
4. **Full-screen intent over the lock screen** needs an Android 14 device to exercise
   `canUseFullScreenIntent()`. The app reports it honestly and falls back to a heads-up
   notification plus the in-app card.
5. **Invalid FCM token cleanup and duplicate-push suppression** depend on 1; the code paths
   (deactivate on `INVALID_TOKEN`/`NOT_REGISTERED`, per-user dedupe keys) are unexercised.
6. `apps/mobile` has **no eslint config** of its own (pre-existing — `npm run lint` there cannot
   run). Running the project's own policy rules over `src` by hand found only two pre-existing
   `Math.random` uses, both documented and non-security-sensitive (an idempotency key and a
   per-install device id), and one missing return type in an older admin screen.

---

## 10. What you need to do — exact steps

1. **Deploy `apps/api`.** New code only; no migration, no data change. The alert settings stay
   on their defaults until you press Save in the admin panel.
2. **Set `FIREBASE_SERVICE_ACCOUNT` on the server** if you want alerts to reach phones that are
   closed or locked. Without it, alerts work only while the app is open.
3. ⚠️ **Fix one line before your next release build:** `apps/mobile/.env` currently reads
   `API_BASE_URL=http://10.0.2.2:3000` (my test emulator). Set it to
   `API_BASE_URL=https://api.fatanpurbazaar.com`. Until bug 2 was fixed this line was ignored in
   release builds; now it is obeyed, so a build made with the current file would point at
   nothing. The live value is kept in `apps/mobile/.env.live.bak`.
   **The APK delivered with this report was built with the emulator value and is for testing on
   my side only — rebuild after fixing the line before you give it to anyone.**
4. **Optional:** drop your own alert sound at
   `apps/mobile/android/app/src/main/res/raw/order_alert.mp3`. Without it the phone's own
   ringtone is used.
5. **Test on a real phone** once 2 and 3 are done: place an order with the delivery boy's app
   closed, and again with the phone locked. That is the one thing I could not do here.
