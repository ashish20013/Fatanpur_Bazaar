# Google Play review login — Fatanpur Bazaar

Google Play ke reviewer ko aapka OTP SMS nahi milta, aur app me password nahi hai. Isliye wo
login hi nahi kar paate aur app **"reviewer could not access the app"** keh kar reject ho jaati
hai. Ye uska hal hai — ek alag review account, ek fixed code, aur baaki sabhi customers ke liye
sab kuch bilkul waisa hi.

---

## 1. Jo Play Console me daalna hai (bas copy-paste)

**Play Console → App content → App access → "All or some functionality is restricted"**
→ Add new instruction:

| Field | Value |
| --- | --- |
| Name | `Customer login (OTP)` |
| Username / Mobile number | `9000000099` |
| Password / OTP | `722134` |
| Any other instructions | niche ka text |

**"Any other instructions" me ye paste karein:**

```
This app uses mobile number + OTP. There is no password login.

How to sign in:
1. Open the app and tap "लॉगिन" / Login (bottom-right profile icon → Login).
2. Enter mobile number: 9000000099
3. Tap "OTP भेजें" (Send OTP).
4. Enter this verification code: 722134
5. Tap "लॉगिन करें" (Login).

Notes for the reviewer:
- No SMS is sent to this number. The code above is fixed for this one dedicated
  review account, so you do not need to receive an SMS.
- A delivery address is already saved on the account, so Cart → Checkout →
  "सामान मिलने पर नकद" (Cash on Delivery) → "ऑर्डर करें" can be completed.
- Online/UPI payment is disabled for this review account, so no real payment is
  made. Test orders placed by this account are cancelled automatically.
- The app is in Hindi with an English toggle ("हिं / EN") at the top of the home
  screen next to the search box.
- This account is a normal customer. Admin, supervisor and delivery-partner areas
  are staff-only and are not part of the customer app flow.
```

⚠️ **Number aur OTP yahan example hain.** Aapke server ke `.env` me jo hai wahi sach hai —
`npm run play-review` chalakar exact text print kar sakte hain (neeche §3).

---

## 2. Ye kaise kaam karta hai (aur kaise SAFE hai)

Ek hi cheez badalti hai: **ek number ko random code ki jagah fixed code milta hai.** Bas.

| Requirement | Kaise poora hua |
| --- | --- |
| Dedicated review account, aapka personal nahi | Alag number, alag user row (#11), role `CUSTOMER` |
| Production customer credentials expose na hon | Kisi asli customer ka data kahin use nahi hota |
| Normal users ke liye OTP security kamzor na ho | Baaki har number par wahi `crypto.randomInt` 6-digit code, wahi 5 min expiry, wahi 3 koshish, wahi rate limit |
| "123456" jaisa universal OTP na ho | Code sirf **ek** number ke liye chalta hai. Dusre customer par wahi code daalein to `OTP_INVALID`. Aasan code (123456 / 11111111 / sequential) par **app start hi nahi hogi** |
| Insecure backdoor na ho | Koi bypass flag nahi. Code wahi `otp_requests` row me bcrypt hash hokar jaata hai aur wahi bcrypt compare se check hota hai. Ek baar use hone ke baad khatam (replay band) |
| Review access isolated aur controlled | Sirf `.env` se on hota hai (admin panel se nahi, DB se nahi). 2 line hatao → band. `PLAY_REVIEW_UNTIL` daalo → tareekh ke baad khud band |
| Admin / supervisor / delivery tak pahunch na ho | Account `CUSTOMER` hai. Staff login (`STAFF_LOGIN`) par ye code kaam **nahi** karta, aur `POST /admin/staff` is number ko staff banane se **mana** kar deta hai |
| Asli paisa na chale | Is account ke liye UPI/gateway band — sirf COD. COD me paisa saman dene par chalta hai, aur uske order 10 minute me khud cancel ho jaate hain (stock wapas) |
| Reviewer bina aapse poochhe login kar sake | Upar ka text poora hai: number, code, step-by-step, address pehle se saved |

**Ek cheez aur:** review account ka naam jaan-boojhkar
`Google Play Review (TEST — saman na bhejein)` rakha gaya hai. Order card par, delivery board
par, rider ke alert me aur bill par — har jagah yahi naam dikhega, to galti se koi saman nahi
bhejega.

---

## 3. Server par kya karna hai (3 step, ek baar)

**Step 1 —** `apps/api/.env` me ye 3 line daalein (number aur code aap badal sakte hain):

```
PLAY_REVIEW_PHONE=9000000099
PLAY_REVIEW_OTP=722134
PLAY_REVIEW_ORDER_TTL_MIN=10
```

⚠️ Dono (phone + otp) bharein ya dono khali. Ek bhara ek khali = API start nahi hogi (jaan-
boojhkar — aadha setup sabse khatarnak hota hai).
⚠️ Apna code chahiye to 6 random digit lein: `node -e "console.log(require('crypto').randomInt(100000,999999))"` (6 se 8 digit tak chalega)

**Step 2 —** API restart karein, phir:

```
cd apps/api
npm run play-review
```

Ye account bana dega (ya pehle se hai to theek kar dega), ek active gaon me address laga dega,
aur Play Console ka poora text print kar dega — wahi copy karke Console me paste kar dein.

**Step 3 —** Play Console → App access me paste karein (§1).

### Review khatam hone ke baad

`.env` se `PLAY_REVIEW_PHONE` aur `PLAY_REVIEW_OTP` ki value khali kar dein aur API restart
karein. Bas — fixed code turant band. Account DB me ek saadharan customer ki tarah pada rahega
(use delete karne ki zaroorat nahi, par chahein to admin panel se disable kar dein).

Ya pehle se tareekh set kar dein, taki bhoolne par bhi khud band ho jaye:

```
PLAY_REVIEW_UNTIL=2026-12-31
```

---

## 4. Agar Google phir bhi poochhe

Kuch reviewer "demo account" ke saath screen recording maangte hain. Tab ye likhein:

> The account provided is a fully functional customer account. No SMS is required — the
> verification code in the App Access instructions is fixed for that account. Browsing,
> search, cart, address selection and Cash-on-Delivery checkout are all available. Online
> payment is intentionally disabled for the review account so that no real transaction occurs.

Agar wo "login not working" kehte hain, pehle khud test karein: app me wahi number aur code
daal kar dekh lein. 99% case me ya `.env` khali reh gaya, ya API restart nahi hua, ya
`PLAY_REVIEW_UNTIL` ki tareekh nikal gayi.

---

## 5. Test jo chalaye gaye (24/24 pass)

```
1 review number: OTP send accepted                               PASS
1 nothing was sent to it (no SMS, no dev-log line)               PASS
1 an ordinary otp_requests row was written                       PASS
1 the fixed code logs in                                         PASS
1 and it is a CUSTOMER                                           PASS
1 redirected to the customer home                                PASS
2 the same code cannot be replayed                               PASS
3 a wrong code is refused for the review number too              PASS
4 ⚠️ the review code does NOT work on another customer            PASS
4 that customer still gets a random 6-digit code                 PASS
4 and their own code still works (nothing changed for customers) PASS
5 ⚠️ STAFF_LOGIN with the review number is refused                PASS
5 and no staff account was created for it                        PASS
5 ⚠️ POST /admin/staff refuses the review number                  PASS
5 ... and it is still a CUSTOMER afterwards                      PASS
6 an address is already saved                                    PASS
6 and it is inside the service area                              PASS
6 ⚠️ UPI is refused for the review account (no real money)        PASS
6 a COD order goes through                                       PASS
6 the order carries the warning name the shop will see           PASS
7 the cron cancelled the review order                            PASS
7 and the stock came back (through the state machine)            PASS
8 ⚠️ a real customer order of the same age is left alone          PASS
```

Boot guards bhi test kiye: aadha config → start nahi hoti; `11111111` aur `12345678` →
"guessable" error; `PLAY_REVIEW_UNTIL` purani tareekh → fixed code refuse (`OTP_INVALID`) aur
log me `auth.play_review_expired`.

Regression: poora alert suite **36/36**, API lint clean, typecheck clean, unit tests **151/151**.
Website ki koi file nahi chhui gayi.

---

## 6. Badle hue files

| File | Kya |
| --- | --- |
| `apps/api/src/config/env.ts` | 4 naye env var + boot validation (aadha config, guessable code) |
| `apps/api/src/modules/auth/auth.service.ts` | `playReviewCode()` + ek guarded branch (random code ki jagah fixed) |
| `apps/api/src/modules/auth/auth.schemas.ts` | OTP 6 → 6–8 digit (customer ke liye 6 hi) |
| `apps/api/src/modules/staff/staff.service.ts` | review number ko staff banane se inkaar |
| `apps/api/src/modules/orders/order-placement.service.ts` | review account → sirf COD |
| `apps/api/src/modules/orders/orders.tasks.ts` | `play-review:cleanup` cron (test order khud cancel) |
| `apps/api/src/database/seeds/play-review.ts` | **naya** — account + address + warning naam |
| `apps/api/src/cli.ts` | **naya command** `play-review` — setup + Console text print |
| `apps/api/package.json` | `npm run play-review` |
| `apps/api/.env.example` | Hindi comment ke saath naye variable |

Database me koi migration nahi — koi naya table, koi naya column nahi.
