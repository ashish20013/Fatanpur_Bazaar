# Google Play review OTP ko live karna — step by step

Date: 11 November 2026

---

## Pehle samajh lein: kaam kyun nahi kar raha

Fixed OTP ka faisla **server** karta hai, app nahi. App to sirf number bhejta hai aur jo code
aap likhte hain wahi server ko wapas bhejta hai.

Aapke live server par abhi **purana API build** chal raha hai. Proof:

```
https://api.fatanpurbazaar.com/v1/health      → 200   (server chal raha hai)
https://api.fatanpurbazaar.com/v1/khata-band  → 404   (naya code nahi hai)
```

`/khata-band` sirf naye build me hai. Matlab review login ka code server tak pahuncha hi nahi.
To jab reviewer ka number OTP maangta hai, server ek **random OTP** banata hai aur SMS bhej
deta hai — aur `722134` daalne par "OTP galat hai" aata hai.

**Ye app ki ya code ki galti nahi hai. Bas deploy baaki hai.**

---

## Teen kaam, isi kram me

| # | Kaam | Kahan |
| --- | --- | --- |
| 1 | Server ke `.env` me 2 line | Hostinger terminal |
| 2 | Naya API code deploy | Aapka computer (git push) |
| 3 | Review user banana | Hostinger terminal |

⚠️ Kram zaroori hai: `.env` pehle, kyunki deploy ke baad app turant naya `.env` padh lega.
Aur step 3 ki command **sirf naye build me** hai, isliye wo deploy ke baad.

---

## STEP 1 — Server ke `.env` me 2 line (Hostinger terminal)

Hostinger panel → **Advanced** → **SSH Access** → terminal kholein. Phir:

```bash
nano ~/domains/api.fatanpurbazaar.com/hbuilds/config/.env
```

File ke **sabse neeche** ye daal dein:

```
# Google Play review login — sirf is EK number par fixed code chalta hai
PLAY_REVIEW_PHONE=9000000099
PLAY_REVIEW_OTP=722134
PLAY_REVIEW_UNTIL=
PLAY_REVIEW_ORDER_TTL_MIN=10
```

Save: `Ctrl+O` → `Enter` → `Ctrl+X`

Check kar lein ki sahi gaya:

```bash
grep PLAY_REVIEW ~/domains/api.fatanpurbazaar.com/hbuilds/config/.env
```

Chaar line dikhni chahiye.

> **Ye line abhi daalne se kuch nahi tootega.** Purana build in naye naamon ko pehchanta nahi,
> to unhe chup-chaap ignore kar deta hai. Asar deploy ke baad hoga.

---

## STEP 2 — Deploy (aapke computer par)

Website ki 4 file abhi badli hui hain. Aapne kaha tha live website chhedni nahi hai, isliye
yahan **sirf API aur mobile** commit ho rahe hain — website waisi hi rahegi:

```powershell
cd "D:\Fatanpur Bazaar\Website\fatanpur-bazaar"

# sirf api + mobile + docs (apps/web jaanbujhkar chhoda gaya hai)
git add apps/api apps/mobile packages docs .gitignore

# dekh lein kya ja raha hai — is list me apps/web ki koi file NAHI honi chahiye
git status --short

git commit -m "feat(api): Play review login, khata band (account deletion), order alerts; chore(mobile): RN 0.81.6 + API 36 + 16KB"
git push
```

Push ke baad GitHub Actions apne aap build karke server par bhej dega.
Dekhne ke liye: **github.com/ashish20013/Fatanpur_Bazaar → Actions**

Deploy ke baad ye check karein (ab 404 ki jagah 200 aana chahiye):

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://api.fatanpurbazaar.com/v1/khata-band
```

→ **200** aaya to naya code live ho gaya.

> ⚠️ Koi naya database migration nahi hai, to deploy se DB ka schema nahi badlega. Deploy
> apne aap `migrate` chalata hai par karne ko kuch nahi milega.

---

## STEP 3 — Review user banana (Hostinger terminal)

Deploy pura hone ke **baad**:

```bash
export PATH=/opt/alt/alt-nodejs24/root/usr/bin:$PATH
cd ~/domains/api.fatanpurbazaar.com/hbuilds/current/nodejs
node dist/cli.js play-review
```

Ye command khud hi:

- `9000000099` wala CUSTOMER khata banayegi, naam **"Google Play Review (TEST — saman na bhejein)"**
- ek pata save karegi (taki reviewer checkout tak pahunch sake)
- Play Console me daalne wala text print karegi

Agar wo number pehle se kisi staff ka hota to command **mana kar deti hai** — jaanbujhkar,
taki galti se admin account review ke haath me na chala jaye.

### Phir app restart

```bash
touch ~/domains/api.fatanpurbazaar.com/hbuilds/current/nodejs/tmp/restart.txt
```

---

## STEP 4 — Khud test karein (2 minute)

App kholein (ya kisi bhi phone se):

1. Login screen → number **9000000099**
2. "OTP भेजें" dabayein
3. Code **722134** daalein
4. Login ho jana chahiye, aur "मेरा खाता" me naam dikhega:
   **Google Play Review (TEST — saman na bhejein)**

Command line se bhi check kar sakte hain:

```powershell
curl.exe -s -X POST https://api.fatanpurbazaar.com/v1/auth/otp/send `
  -H "Content-Type: application/json" `
  -d "{\"phone\":\"9000000099\",\"purpose\":\"LOGIN\"}"
```
→ `{"ok":true,"data":{"sent":true,...}}`

```powershell
curl.exe -s -X POST https://api.fatanpurbazaar.com/v1/auth/otp/verify `
  -H "Content-Type: application/json" `
  -d "{\"phone\":\"9000000099\",\"otp\":\"722134\"}"
```
→ `accessToken` aur user ka naam aana chahiye.

⚠️ 1 minute ka resend cooldown hai — jaldi-jaldi 2 baar send karne par 429 aayega, ye sahi hai.

---

## Agar phir bhi "OTP galat hai" aaye

Ek-ek karke check karein:

| Check | Command | Theek kya hai |
| --- | --- | --- |
| Naya code live hai? | `curl .../v1/khata-band` | **200** (404 = deploy nahi hua) |
| `.env` me line hain? | `grep PLAY_REVIEW ~/domains/api.fatanpurbazaar.com/hbuilds/config/.env` | 4 line |
| App ne naya `.env` padha? | `touch .../current/nodejs/tmp/restart.txt` phir dobara try | — |
| Number bilkul sahi? | — | `9000000099`, bina `+91`, bina space |
| Code bilkul sahi? | — | `722134` — 6 digit |

**Sabse aam galti:** `.env` me line daal di par restart nahi kiya. Node app `.env` sirf boot
par padhta hai.

---

## Yaad rakhne layak do baatein

1. **Normal customer par koi asar nahi.** Server me check hai: code sirf tab badalta hai jab
   number **bilkul** `9000000099` ho aur purpose `LOGIN` ho. Baaki har number ka OTP waise hi
   random rehta hai. Ye sandbox me 24 test se verify hua hai — dusre number par `722134`
   daalne par login nahi hota.

2. **Review khatam hone ke baad band kar dein.** `.env` me:
   ```
   PLAY_REVIEW_UNTIL=2026-12-31
   ```
   Is tareekh ke baad fixed code khud band ho jayega, bina deploy ke. Ya dono line khali kar
   dein — feature poori tarah band ho jayega.

---

## Ek chhoti baat

`apps/mobile/scripts/patch-native-modules.sh` ab **bekaar** ho gayi hai. Wo do cheezein patch
karti thi (react-native-screens ka missing field, aur firebase ka `color/primary`) — dono ab
asli jagah se theek ho chuke hain: screens ka naya version, aur `firebase.json`. **Use mat
chalayein** — wo `node_modules` me haath daalti hai aur ab ulta nuksan kar sakti hai. Maine use
`.gitignore` me daal diya hai; aap `apps/mobile/scripts` folder delete kar sakte hain.

Isi tarah `apps/mobile/android/build-output.txt` aur
`apps/mobile/android/app/src/main/java/com/fatanpurbazaar/app/_to_delete/` — dono junk hain,
`.gitignore` me daal diye hain, aap delete kar dein.
