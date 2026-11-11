# Pehla update — live site par kya badlega

Date: 12 November 2026 · Comparison: `db8c1cc` (17 Oct, **jo abhi live hai**) → `4c85026` + ek
pending fix (jo deploy hoga)

---

## Pehle ye samajh lein: live par abhi kaunsa code hai

17 Oct ke baad 4 commit hue, par **wo chaaron sirf mobile app ke the** (23–25 Oct). Website aur
API ka code live par wahi hai jo 17 Oct ko gaya tha.

Confirm kiya:

```
https://api.fatanpurbazaar.com/v1/health      → 200   (chal raha hai)
https://api.fatanpurbazaar.com/v1/khata-band  → 404   (naya code nahi hai)
live site ka <title>                          → "फतनपुर बाज़ार — रानीगंज में किराना, सब्ज़ी घर तक"
                                                 (ye 17 Oct wala title hai)
```

Matlab ye update **~26 din ka jama hua kaam** ek saath live kar raha hai, sirf Play Store ke
teen blocker nahi.

---

## Ek line ka jawab

**Customer ko dikhne wala badlav kam hai. Sabse bada asar AAPKO (owner/admin) mehsoos hoga** —
ek naya order-alert system chalu ho jayega jo ऑर्डर assign na hone par aapko baar-baar notification
bhejega. Database ka structure nahi badal raha. Customer ka order, payment, cart, tracking — sab
waise hi chalega.

---

## 1. DATABASE — kuch nahi badal raha ✅

| Cheez | Haalat |
| --- | --- |
| Naya migration | **Ek bhi nahi** — table, column, index kuch nahi badlega |
| Purana data | Bilkul safe — koi delete/update nahi |
| Deploy par `migrate` | Chalega, par karne ko kuch nahi milega |

### Par ek baat — deploy `seed` bhi chalata hai

Deploy script `node dist/cli.js seed` chalata hai. Maine dekha ki wo kya karega:

| Seed | Production par asar |
| --- | --- |
| `content` (pages, FAQs, blog) | **Skip** — code me hai `if (pages me data hai) return`. Aapke edit safe hain |
| `local-seo` blog posts | **0 naye** — saare 9 slug pehle jaise hain |
| `local-seo` FAQs | ⚠️ **4 naye FAQ add honge** (neeche list) |
| Baaki seeds | 17 Oct se badle nahi — pehle hi chal chuke hain |

**Chaar naye FAQ jo live site ke FAQ page par aa jayenge:**

1. क्या रानीगंज में भी डिलीवरी होती है?
2. मेरा गाँव सूची में नहीं है, क्या करूँ?
3. क्या आवाज़ से सामान खोज सकते हैं?
4. क्या भाड़े की गाड़ी भी बुक होती है?

Ye sirf **add** honge — purana FAQ na badlega na hatega (code question se match karke skip karta
hai). Agar in chaaron me se koi aapko nahi chahiye, deploy ke baad admin panel se hata dein.

⚠️ Teesra FAQ "आवाज़ से सामान खोज सकते हैं" — ye feature site par hai ya nahi, ye aap confirm kar
lein. Jo cheez nahi hai uska FAQ customer ko confuse karta hai.

---

## 2. CUSTOMER ko kya dikhega

### (a) Site ka title aur Google description badal raha hai ⚠️

| | **Abhi live** | **Deploy ke baad** |
| --- | --- | --- |
| Title | फतनपुर बाज़ार — रानीगंज में किराना, सब्ज़ी घर तक | फतनपुर बाज़ार \| Fatanpur Bazaar |
| Description | …रानीगंज तहसील, प्रतापगढ़ **से** …किराना, फल-सब्ज़ी, मिठाई, कपड़े, बिजली का सामान, डॉक्टर और भाड़ा गाड़ी | …रानीगंज, प्रतापगढ़ **में और** आसपास… + **दवाइयाँ, लैब टेस्ट** |

**Do baat dhyan dein:**

1. ⚠️ **"दवाइयाँ, लैब टेस्ट" likha ja raha hai, par wo site par hai hi nahi.** Maine live check
   kiya: `fatanpurbazaar.com/dawai` par **404** aata hai (PHARMACY vertical OFF hai, license ke
   baad ON hona tha). Google me "दवाई" likha dekhkar aaya customer ko kuch nahi milega — aur ye
   drug licence ke lihaz se bhi theek nahi. **Mera sujhav: license aane tak ye do shabd hata
   dein.**
2. Naye title me se "रानीगंज" aur "किराना" nikal gaye. Brand ke liye saaf lagta hai, par local
   search me yahi do shabd aapko dhundhwate hain. Google ko naya title pakadne me 1–2 hafta
   lagta hai, aur ranking thodi hil sakti hai.

### (b) Pata bharne ka form — 5 hint hat jayenge

Ye **aapka hi maanga hua badlav** hai (aaj):

| Field | Pehle hint dikhta tha | Ab |
| --- | --- | --- |
| घर / मोहल्ला | "जैसे: वार्ड 4, हनुमान मंदिर के पास" | kuch nahi |
| लैंडमार्क | "पहचान की जगह लिखें — गाँव में यही असली पता है" | kuch nahi |
| पिता/पति का नाम | "जैसे: रामलाल यादव — गाँव में घर इसी से मिलता है" | kuch nahi |
| रास्ता | "जैसे: पक्की सड़क से पूरब की ओर…" | kuch nahi |
| नोट | "जैसे: आने से पहले फ़ोन करें, दरवाज़े पर कुत्ता है" | kuch nahi |

Field, label aur "zaroori hai" ki checking — sab waise hi hain. Sirf grey example text gaya.

**Ek imaandaar baat:** gaon ke pate me landmark hi asli pata hota hai, aur ye example log ko
dikhate the ki kya likhna hai. Ho sakta hai ab kuch log landmark khali chhod dein ya sirf "ghar"
likh dein, jisse rider ko dhundhne me dikkat ho. Ek-do hafte dekh lein — agar aise pate aane
lagein to kam se kam **लैंडमार्क** ka hint wapas laga dena behtar hoga.

"मेरे पते" wale khali page se bhi ek line hat jayegi (wahan yahi landmark hint body ban raha
tha) — icon, title aur "पता जोड़ें" button waise hi rahenge.

### (c) English site par ek toota label theek ho gaya

`532a370` commit me English me `Father / husband / guardian name` label **gayab ho gaya tha** —
field par naam hi nahi dikhta aur error aata `" is required"`. Wo maine git history se wapas daal
diya. **Live par ye kabhi toota nahi tha**, to aapke customer ne ye nahi dekha — bas deploy ke
saath jaane se pehle pakad liya.

### (d) Jo bilkul nahi badla

Cart, checkout, pricing, coupon, UPI/COD, order status, live tracking, search, village picker,
service area (6 km), product pages, blog, sitemap — **in sab ka code chhua hi nahi gaya**.
Customer ke liye order karne ka tarika bilkul wahi hai.

Login page, SectionHead aur Logo file me badlav sirf **formatting** ka hai (comma aur line
wrapping). Maine whitespace hata kar compare karke confirm kiya — dikhne me kuch nahi badlega.

---

## 3. AAPKO (owner / staff) kya mehsoos hoga — ye sabse zaroori hissa

### ⚠️ Naya order-alert system chalu ho jayega, apne aap

Naya `alerts` module (603 line) delivery flow me jud gaya hai, aur uski default setting
**`alert_enabled = ON`** hai. Iska matlab:

**Jo pehle se tha (badla nahi):** order ready hone par on-duty rider ko push + socket jaata tha.

**Jo NAYA hoga:**

| Kya | Default |
| --- | --- |
| Rider ka alert kitni der me expire | 120 second |
| Order assign na ho to **admin + supervisor ko escalation** | **120 second baad** |
| Wo escalation dobara | **har 300 second (5 min)**, assign hone tak |
| Ringtone / vibration / lock screen | ON / ON / PUBLIC |
| Rider ko dobara ring | 2 baar |
| Rider ka naya "mana karein" button | `POST /delivery/decline/:orderNumber` |

**Iska asli asar, saaf shabdon me:** escalation `CONFIRMED` aur `PREPARING` wale order par bhi
lagta hai — matlab **jab aap saman taiyar kar rahe hote hain, tab bhi**. Sabzi taiyar karne me
20 minute lagte hain, aur rider assign aap haath se karte hain. To **lagbhag har order par**
2 minute baad "ऑर्डर assign नहीं हुआ" ka alert aayega, aur phir har 5 minute dobara — assign
hone tak. Din ke 50–100 order par ye kaafi notification ban jayenge.

Push tabhi bajega jab aapne browser me notification allow kiya ho ya mobile app lagi ho (app
abhi publish nahi hui), par **in-app notification ki list me ye sab jama hoti rahengi**.

### ⚠️ Aur ek baat — ise band karne ka button website par nahi hai

Alert ki settings `settings` table me rehti hain, **par row tabhi banti hai jab koi save kare**.
Deploy ke turant baad wahan koi `alert_*` row nahi hogi, aur website ka Settings page sirf
maujooda row dikhata hai. Matlab website se ise band nahi kar payenge.

Teen rasta hai:

1. **Mobile app ka "Alerts" screen** — bana hua hai, par app abhi Play par publish nahi hui
2. **API se** — `PUT /alerts/config` (ADMIN + `settings.manage`)
3. **Main `alert_*` ki default row seed me daal dun** — phir wo website ke Settings page par
   apne aap dikhne lagengi aur aap wahin se badal sakenge. **Ye sabse saaf rasta hai; bolें to
   kar deta hoon** (ye sirf nayi row add karega, kisi purani setting ko chhuega nahi).

Jab tak ye na ho, agar notification zyada lagein to escalation band karne ke liye
`alert_escalation_sec` ko `0` karna hota hai (ya `900` = 15 minute, jo zyada practical hai).

---

## 4. Jo code ja raha hai par **so raha hai** (abhi koi asar nahi)

| Feature | Kyun asar nahi |
| --- | --- |
| **Google Play review login** | Poora code `PLAY_REVIEW_PHONE` env par gated hai. Server ke `.env` me wo nahi hai, to ye bilkul band hai. Normal customer ka OTP byte-to-byte wahi code chalata hai |
| **Review account ka UPI block** | Sirf us ek number par, aur wo number maujood hi nahi |
| **`play-review:cleanup` cron** | Pehli line par `return 'off'` |
| **Khata band (account deletion) API** | `GET /users/me/delete-preview`, `POST /users/me/delete` ban gaye, par **website ke "mera khata" page par button nahi hai** (wo sirf mobile app me hai). Public page `/v1/khata-band` khul jayega — Play ko yahi URL chahiye |
| **Rider "mana karein" endpoint** | Mobile app se use hota hai, app abhi publish nahi hui |
| **Staff banane par guard** | Review number ko staff banane se rokta hai — wo number hi nahi hai |

---

## 5. Risk — ek nazar me

| Risk | Kitna | Kya kiya / karna hai |
| --- | --- | --- |
| API deploy ke baad start na ho | **Bahut kam** | Saare naye env `optional` ya `default` wale hain — maine check kiya. Boot safe |
| DB kharab ho | **Nahi** | Koi migration nahi. Seed sirf 4 FAQ add karega |
| Purana content overwrite ho | **Nahi** | Content seed `pages` dekh kar skip ho jaata hai |
| Customer ka order flow toote | **Bahut kam** | Order/cart/payment/tracking ka code chhua nahi. 90/90 integration test pass |
| Notification ki bhadas | **Zyada sambhavna** | Upar wala alerts section — pehla din dekhte rahein |
| SEO ranking hilna | **Thodi** | Title/description badla hai; 1–2 hafta lagega settle hone me |
| "दवाई" ka galat vaada | **Theek karna chahiye** | `/dawai` 404 hai par description me likha hai |

### Test jo maine aapke asli code par chalaye (sandbox me)

```
api  check:no-spread    OK
api  eslint + tsc       0 error
api  unit tests         151 / 151 pass
api  integration        90 / 90 pass
api  build              OK
web  eslint + tsc       0 error
web  next build         OK (saare route bane)
mobile tsc              0 error
npm ci lockfile         sync me
```

---

## 6. Deploy ke baad 10 minute me ye dekh lein

```powershell
# 1. API zinda hai?
curl.exe -s https://api.fatanpurbazaar.com/v1/health

# 2. Naya code gaya? (404 nahi, 200 aana chahiye)
curl.exe -s -o NUL -w "%{http_code}`n" https://api.fatanpurbazaar.com/v1/khata-band

# 3. Site khul rahi hai aur naya title aaya?
curl.exe -s https://fatanpurbazaar.com | Select-String "<title>"
```

Phir khud browser me: homepage → ek product → cart → pata form (hint hatne ke baad form theek
lagta hai?) → FAQ page (4 naye sawaal) → admin panel → orders list.

**Pehla ek ghanta notification par nazar rakhein.** Agar "assign nahi hua" wale alert zyada
lagein, to bata dein — escalation ko 15 minute par le jaana ya band karna, dono do minute ka kaam
hai.
