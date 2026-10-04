# Hostinger पर वेबसाइट चालू करना — क़दम-दर-क़दम

यह गाइड उस व्यक्ति के लिए है जो पहली बार दुकान को इंटरनेट पर चढ़ा रहा है। हर क़दम क्रम से करें।
कुल समय: लगभग **2 घंटे** (DNS फैलने में कुछ घंटे और लग सकते हैं)।

> दुकान दो हिस्सों में चलती है, और Hostinger पर ये **दो अलग Node.js ऐप** बनेंगे:
>
> | ऐप | पता | क्या है |
> | --- | --- | --- |
> | **API** | `api.आपका-डोमेन.com` | दिमाग़ — डेटाबेस, ऑर्डर, OTP, डिलीवरी |
> | **वेबसाइट** | `आपका-डोमेन.com` | दुकान, जो ग्राहक देखते हैं |
>
> नीचे हर जगह `fatanpurbazaar.com` लिखा है — उसकी जगह अपना डोमेन लिखें।

---

## भाग 1 — अपने कंप्यूटर पर दो zip बनाना ⏱️ 15 मिनट

सर्वर पर कभी build नहीं करना है (वेबसाइट का build 850 MB RAM खाता है — दुकान बंद हो सकती है)।
Build आपके कंप्यूटर पर होगा और सर्वर पर सिर्फ़ तैयार zip जाएगा।

1. `apps/web/` में एक नई फ़ाइल बनाएँ: **`.env.production.local`** — उसमें यह लिखें:

   ```
   NEXT_PUBLIC_API_URL=https://api.fatanpurbazaar.com
   NEXT_PUBLIC_SITE_URL=https://fatanpurbazaar.com
   NEXT_PUBLIC_SOCKET_PATH=/socket
   ```

   ⚠️ ये तीन पते build के समय वेबसाइट में **पक्के जुड़ जाते हैं**। गलत रहे तो वेबसाइट पुराने
   (localhost) पते पर API ढूँढेगी। डोमेन बदले तो zip दोबारा बनाना होगा।

2. प्रोजेक्ट के मुख्य फ़ोल्डर में:

   ```
   npm ci
   node scripts/make-release.mjs
   ```

3. `release/` फ़ोल्डर में दो फ़ाइलें बनेंगी:
   - `fatanpur-api.zip` (लगभग 0.5 MB)
   - `fatanpur-web.zip` (लगभग 25 MB)

---

## भाग 2 — डेटाबेस बनाना ⏱️ 5 मिनट

hPanel → **Databases → MySQL Databases**:

1. नया database बनाएँ, जैसे `u123_fatanpur`, user `u123_fatanpur`, और **मज़बूत password** (20+ अक्षर)।
2. ये तीनों कहीं लिख लें — भाग 3 में चाहिए।

---

## भाग 3 — API चढ़ाना ⏱️ 30 मिनट

### 3.1 ऐप बनाएँ

hPanel → **Websites → Add website → Node.js App** (Business या Cloud प्लान पर मिलता है):

- डोमेन: **`api.fatanpurbazaar.com`** (subdomain पहले से न हो तो यहीं बन जाएगा)
- तरीक़ा: **Upload files** → `fatanpur-api.zip` चुनें
- Build settings:
  - **Node version:** 22 या 24 (जो सबसे नया दिखे)
  - **Framework / preset:** Other / Express
  - **Entry file:** `dist/main.js`
  - **Install:** `npm install` (Hostinger ख़ुद करता है — ठीक है)
  - **Build command:** ख़ाली छोड़ें (build पहले ही हो चुका है)
  - **Start command** (अगर पूछे): `npm start`

> Hostinger के पैनल के शब्द समय-समय पर थोड़े बदलते हैं। मतलब यही रहेगा: zip ऊपर डालना, entry
> `dist/main.js`, build ख़ाली।

### 3.2 पासवर्ड वाली चाबियाँ (Environment variables)

पैनल में **Environment variables** वाले हिस्से में ये डालें। चाबियाँ बनाने के लिए अपने कंप्यूटर पर
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` चलाएँ — **हर चाबी के लिए
अलग बार**।

| नाम | क्या डालें |
| --- | --- |
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Kolkata` |
| `NODE_OPTIONS` | `--max-old-space-size=384` |
| `APP_URL` | `https://fatanpurbazaar.com` |
| `API_URL` | `https://api.fatanpurbazaar.com` |
| `ALLOWED_ORIGINS` | `https://fatanpurbazaar.com,https://www.fatanpurbazaar.com` |
| `COOKIE_DOMAIN` | `.fatanpurbazaar.com` |
| `TRUST_PROXY` | `1` |
| `DB_HOST` | `localhost` (hPanel जो दिखाए) |
| `DB_PORT` | `3306` |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | भाग 2 वाले |
| `DB_POOL_MAX` | `8` |
| `JWT_SECRET` | नई चाबी 1 |
| `JWT_REFRESH_SECRET` | नई चाबी 2 |
| `APP_SECRET` | नई चाबी 3 — ⚠️ **कभी मत बदलना** (Cashfree की चाबियाँ इसी से बंद हैं) |
| `EDGE_SECRET` | नई चाबी 4 — ⚠️ **वेबसाइट में भी बिलकुल यही** |
| `STORAGE_PATH` | `/home/uXXXX/storage/fatanpur` (अपने खाते का रास्ता — File Manager में दिखता है) |
| `SOCKET_PATH` | `/socket` |
| `SMS_DRIVER` | `minimoth` (DLT का इंतज़ार नहीं) — या DLT approval के बाद `fast2sms` / `msg91`। ⚠️ `null` पर लाइव साइट में **कोई लॉगिन नहीं कर पाएगा** |
| `MINIMOTH_API_KEY` | minimoth चुना हो तो उसकी key (या fast2sms/msg91 के लिए `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_TEMPLATE_ID`) |
| `SETUP_TOKEN` | नई चाबी 5 — सिर्फ़ पहली बार, भाग 5 के बाद **हटा दें** |

> चारों चाबियाँ **अलग-अलग** होनी चाहिए — एक जैसी हों तो API चालू ही नहीं होगी (जान-बूझकर)।
> पूरी सूची और हर नाम का मतलब `apps/api/.env.example` में है।

### 3.3 Deploy दबाएँ, फिर जाँचें

ब्राउज़र में `https://api.fatanpurbazaar.com/v1/health` खोलें। दिखना चाहिए: `"status":"up","db":"up"`।

`db: down` दिखे → DB का नाम/पासवर्ड जाँचें। पेज ही न खुले → पैनल में **Logs** देखें; "Invalid
environment" लिखा हो तो उसके नीचे लिखा होगा कि कौन-सी चाबी गायब है।

---

## भाग 4 — वेबसाइट चढ़ाना ⏱️ 20 मिनट

hPanel → **Add website → Node.js App**:

- डोमेन: **`fatanpurbazaar.com`**
- **Upload files** → `fatanpur-web.zip`
- **Entry file:** `server.js`
- **Build command:** ख़ाली। **Install:** हो सके तो बंद/ख़ाली — इसमें ज़रूरी सब कुछ पहले से अंदर है।
- Environment variables:

| नाम | क्या डालें |
| --- | --- |
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Kolkata` |
| `NODE_OPTIONS` | `--max-old-space-size=384` |
| `HOSTNAME` | `0.0.0.0` |
| `API_INTERNAL_URL` | `https://api.fatanpurbazaar.com` (Hostinger हर ऐप को अपना port ख़ुद देता है, इसलिए पूरा पता ही सबसे भरोसेमंद है) |
| `EDGE_SECRET` | **API वाली ही चाबी 4** |
| `EDGE_TRUSTED_HOPS` | `1` (आगे Cloudflare लगाएँ तो `2`) |
| `COOKIE_DOMAIN` | `.fatanpurbazaar.com` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | भाग 5 का public key |

Deploy के बाद `https://fatanpurbazaar.com` खोलें — दुकान दिखनी चाहिए।

---

## भाग 5 — पहली बार का सेटअप (SSH से, एक बार) ⏱️ 15 मिनट

hPanel → **Advanced → SSH Access** से टर्मिनल खोलें, फिर API के फ़ोल्डर में:

```bash
cd ~/domains/api.fatanpurbazaar.com/public_html

node dist/cli.js migrate     # सारी टेबलें बनती हैं
node dist/cli.js seed        # गाँव, श्रेणियाँ, सामान, सेटिंग, और तीनों स्टाफ़ खाते
node dist/cli.js doctor      # सब ठीक है? "0 FAIL" आना चाहिए
node dist/cli.js vapid       # ब्राउज़र सूचनाओं की चाबी — दोनों .env में डालें
```

`seed` ये खाते अपने आप बनाता है — कोई पासवर्ड नहीं, सिर्फ़ OTP:

| नंबर | भूमिका |
| --- | --- |
| 8576891104 | मुख्य एडमिन (आप) — सब कुछ |
| 9616038670 | दूसरा एडमिन — जितनी छूट आप दें |
| 9889353665 | डिलीवरी पार्टनर |

⚠️ `seed --demo` production में **कभी नहीं** — वह नक़ली ग्राहक और ऑर्डर बनाता है (कोड ख़ुद मना
करता है)।

इसके बाद API के environment variables से **`SETUP_TOKEN` हटा दें** और ऐप restart करें।

### पुरानी तस्वीरें

अपने कंप्यूटर के `apps/api/storage/uploads/` फ़ोल्डर को File Manager से सर्वर के
`STORAGE_PATH/uploads/` में चढ़ाएँ — इसमें श्रेणियों की असली फ़ोटो हैं।

---

## भाग 6 — Cron (हर 5 मिनट का काम) ⏱️ 5 मिनट

hPanel → **Advanced → Cron Jobs** → सिर्फ़ **एक** entry:

```
*/5 * * * *   cd ~/domains/api.fatanpurbazaar.com/public_html && node dist/cli.js cron >> ~/cron.log 2>&1
```

यही अकेली entry सूचनाएँ भेजती है, पुराने अधूरे ऑर्डर रद्द करती है, रोज़ का backup लेती है, sitemap
बनाती है और वॉलेट का हिसाब मिलाती है। इसके बिना **push सूचनाएँ नहीं जाएँगी**।

---

## भाग 7 — लाइव होने से पहले की जाँच ⏱️ 30 मिनट

अपने फ़ोन से, असली इंटरनेट पर:

- [ ] `https://` पर ताला दिखता है (hPanel → **SSL** → दोनों डोमेन पर चालू)
- [ ] 8576891104 से लॉगिन → "स्टाफ़ / ग्राहक" दोनों विकल्प → एडमिन पैनल खुलता है
- [ ] किसी नए नंबर से लॉगिन → सीधे दुकान (कोई विकल्प नहीं)
- [ ] एक ₹10–20 का COD ऑर्डर करें → एडमिन को सूचना → "पैक हो रहा" → "तैयार"
- [ ] 9889353665 को सौंपें → डिलीवरी वाले फ़ोन पर सूचना → स्वीकार → उठाया
- [ ] ग्राहक के ऑर्डर पेज पर 4 अंक का कोड दिखता है, डिलीवरी वाले को **नहीं** दिखता
- [ ] कोड डालकर "डिलीवर" → एडमिन को सूचना, नक़द डिलीवरी वाले के हिसाब में
- [ ] एडमिन → COD जमा → डिलीवरी वाले का बकाया 0
- [ ] UPI से एक ऑर्डर → UTR डालें → एडमिन "भुगतान मिला" → ग्राहक को सूचना
- [ ] नक़्शे वाला पता: डिलीवरी ऐप में "रास्ता देखें" Google Maps खोलता है
- [ ] `https://fatanpurbazaar.com/robots.txt` और `/sitemap.xml` खुलते हैं
- [ ] Google Search Console में sitemap जमा करें (NEXT-STEPS §11)

सब ✅ हो जाए तो दुकान लाइव है।

---

## आगे से अपडेट कैसे करें

1. अपने कंप्यूटर पर `node scripts/make-release.mjs` → दो नए zip।
2. hPanel में हर ऐप पर नया zip upload → Deploy।
3. SSH से एक बार `node dist/cli.js migrate` (नई टेबल/कॉलम हों तो — चलाने में कोई नुक़सान नहीं)।

⚠️ Upload करते समय `.env` और `storage/` फ़ोल्डर **न मिटें** — zip में ये होते ही नहीं, इसलिए
"सब फ़ाइलें बदलें" जैसा विकल्प न चुनें जो पूरा फ़ोल्डर साफ़ कर दे।

GitHub इस्तेमाल करें तो यह सब अपने आप होता है — `docs/DEPLOYMENT.md` §3।

## कुछ गड़बड़ हो तो

| दिखे | करें |
| --- | --- |
| वेबसाइट खुलती है पर सामान नहीं दिखता | `API_INTERNAL_URL` गलत है, या API बंद है — `/v1/health` खोलें |
| OTP नहीं आता / "OTP नहीं भेज पाए" | `SMS_DRIVER` और उसकी key जाँचें (NEXT-STEPS §3)। लाइव साइट पर `null` से OTP कहीं नहीं जाता — यह सुरक्षा के लिए है |
| "बहुत ज़्यादा कोशिश" हर किसी को | `EDGE_SECRET` दोनों जगह एक जैसा नहीं — दोनों ऐप में दोबारा देखें |
| लॉगिन के बाद बार-बार लॉगआउट | `COOKIE_DOMAIN` दोनों ऐप में `.fatanpurbazaar.com` (आगे बिंदु के साथ) |
| लाइव ट्रैकिंग नहीं चलती | Hostinger पर WebSocket बंद हो तो API में `SOCKET_TRANSPORTS=polling` — ट्रैकिंग फिर भी चलेगी |
