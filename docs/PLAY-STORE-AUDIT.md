# Fatanpur Bazaar — Google Play publish audit

Date: 10 November 2026 · App: `com.fatanpurbazaar.app` v1.0.0 (versionCode 1)
Audit ka tarika: app ki asli files padhi gayi, APK ke native libraries ki alignment naapi gayi,
aur Google ke official requirement pages se tareekhein confirm ki gayi.

---

## Nateeja ek line me

**Abhi upload karne par Play reject kar dega.** Do blocker hain, aur dono ka ek hi hal hai:
**React Native upgrade** (0.76.5 → 0.81 ya usse naya). Baaki app ki haalat kaafi acchi hai —
permissions saaf-suthri hain, koi khatarnaak permission nahi, signing sahi hai.

---

## 🔴 BLOCKER 1 — App Android 16 (API 36) target nahi karta

| | |
| --- | --- |
| Abhi hai | `targetSdkVersion = 35` (`android/build.gradle` line 6) |
| Chahiye | **36** |
| Kab se | **31 August 2026** se naye app aur updates dono ke liye zaroori |
| Extension | 1 November 2026 tak mil sakti thi — **wo tareekh bhi nikal gayi** |

Google ka official page saaf likhta hai: new apps aur app updates ko Android 16 (API 36) ya usse
upar target karna hoga. Aapka app 35 par hai, to Play Console upload hi sweekar nahi karega.

**⚠️ Sirf `targetSdkVersion = 36` likh dene se kaam nahi chalega.** React Native 0.76.5 Android 16
ke liye bana hi nahi hai — Android 16 me edge-to-edge zabardasti laागू hota hai, permission aur
foreground-service ke niyam badle hain. React Native me Android 16 ka support **0.81** se aaya hai.

---

## 🔴 BLOCKER 2 — 16 KB memory page size support nahi hai

Ye requirement **1 November 2025** se laागू hai: jis app me native C/C++ code hai aur jo Android 15+
target karta hai, uski native libraries 16 KB page size par chalni chahiye.

Maine aapke abhi bane APK ki har native library khud naapi (`objdump -p`). Alignment `2**14`
(16 KB) hona chahiye, par haalat ye hai:

```
libc++_shared.so              2**12   ❌ (4 KB)
libfbjni.so                   2**12   ❌
libhermes.so                  2**12   ❌
libhermestooling.so           2**12   ❌
libimagepipeline.so           2**12   ❌
libjsi.so                     2**12   ❌
libnative-filters.so          2**12   ❌
libnative-imagetranscoder.so  2**12   ❌
libreactnative.so             2**12   ❌
libconceal.so                 2**16   ✅
libdatastore_shared_counter.so 2**14  ✅
librnscreens.so               2**14   ✅
```

12 me se 9 library fail hain — aur **wo saari React Native ki apni libraries hain**. Inhe aap
theek nahi kar sakte, kyunki ye pehle se compiled aati hain. React Native ne 16 KB support
**0.77** me joda tha.

**Dono blocker ka ek hi hal:** React Native upgrade karein. Kam se kam **0.81** (Android 16 +
16 KB dono isi me aaye). Aaj ka stable **0.88.x** hai; supported line 0.86–0.88 hai.

Upgrade ke baad yahi check dobara chalayein (ek bhi `2**12` nahi bachna chahiye):

```powershell
cd "D:\Fatanpur Bazaar\Website\fatanpur-bazaar\apps\mobile\android\app\build\outputs\apk\release"
# APK ko zip ki tarah kholein, lib\arm64-v8a ke andar ki .so files check karein
```

---

## 🟠 BLOCKER 3 — Account delete karne ka rasta nahi hai

Google ki User Data policy: **jo app account banane deta hai, use account delete karne ka rasta
bhi dena padega.** Aapka app phone + OTP se account banata hai, to ye laागू hota hai.

Do cheezein **dono** chahiye:

1. **App ke andar** ek rasta — "खाता हमेशा के लिए बंद करें" button (Profile screen me). Ye
   seedha web page ka link bhi ho sakta hai, poora flow app me banana zaroori nahi.
2. **Ek web page** jahan se delete ki request ho sake — jaise
   `https://fatanpurbazaar.com/khata-band`. Ye tab bhi chahiye jab kisi ne app uninstall kar
   diya ho. Iska URL Play Console → App content → **Data deletion** me daalna hoga.

Maine check kiya: app me `delete account` jaisa kuch bhi nahi hai. Aapki privacy policy
(`fatanpurbazaar.com/privacy`) me likha hai ki "helpline par call karke khata band करवा सकते हैं" —
**ye Play ke liye kaafi nahi hai**, kyunki user ko khud se request karne ka rasta chahiye.

---

## 🟡 Play Console me bharna hoga (reject nahi, par rukawat banega)

| Cheez | Haalat | Kya karna hai |
| --- | --- | --- |
| **AAB** (APK nahi) | — | Naye app me `.aab` hi chalta hai. `bundleRelease` se banega |
| **Privacy policy URL** | ✅ maujood | `https://fatanpurbazaar.com/privacy` — Console me daal dein. App ke andar bhi link lagayein (abhi nahi hai) |
| **Data safety form** | ❌ bharna hai | Neeche poori list di hai |
| **Foreground service (location)** | ❌ declare karna hai | Rider ki live tracking — Console me kaam bataना padega + ek demo video |
| **Content rating** | ❌ | Questionnaire bharein. Grocery app → sabse aasan rating |
| **Target audience** | ❌ | "13+" chunein, bachchon wala app **mat** kehna |
| **Ads** | — | App me koi ad nahi — "No ads" declare karein |
| **App access** | ✅ taiyar | Review login `docs/PLAY-REVIEW-ACCESS.md` me ready hai |
| **Play Billing** | ✅ zaroori nahi | Aap asli saman bechte hain (sabzi, kirana) — physical goods par Play ki commission/billing laागू nahi hoti. COD + UPI bilkul sahi hai |

### Data safety form me ye sab declare karna hoga

App ye data leta hai (maine code se confirm kiya):

- **Phone number** — login (OTP) aur order ki jaankari ke liye
- **Naam aur pata** — delivery ke liye
- **Location (approximate + precise)** — address check karne ke liye, aur rider ki live tracking
- **Photos** — parchi (prescription) upload karne ke liye
- **Payment info** — UPI UTR number
- **⚠️ Health data (prescriptions)** — ye **sensitive** category hai

⚠️ **Ek salah:** dawai (PHARMACY) vertical launch par **band** hai, par prescription screen app me
ab bhi khulti hai (`CustomerTabs.tsx` me registered hai) aur CAMERA permission bhi li gayi hai.
Health data declare karne par Play ka review lamba aur sakht ho jaata hai. **Version 1 me wo screen
aur CAMERA permission hata dein** — license milne ke baad v2 me wapas daal dein. Isse review bahut
aasan ho jaayega.

---

## ✅ Jo pehle se sahi hai (ye acchi khabar hai)

| | |
| --- | --- |
| **Permissions bahut kam hain** | 13 permission, aur koi bhi "khatarnaak" category me nahi |
| **Background location NAHI li gayi** | Ye sabse badi raahat hai — `ACCESS_BACKGROUND_LOCATION` maangne par Play ka sabse sakht review lagta hai, video banwaate hain, aur hafton lag jaate hain. Aapka app sirf foreground me location leta hai |
| **`QUERY_ALL_PACKAGES` nahi** | Ye permission अक्सर reject ka kaaran banti hai |
| **Storage permission sahi capped** | `READ_EXTERNAL_STORAGE` par `maxSdkVersion="32"` laga hai — naye Android par nahi maangi jaati. Bilkul sahi tarika |
| **`allowBackup="false"`** | Token aur data phone backup me nahi jaate |
| **Cleartext HTTP band** | Sirf localhost/emulator ke liye khula hai (wo bhi loopback hai, risk nahi). Baaki sab HTTPS |
| **Signing sahi** | APK aapki asli release keystore se signed hai (`CN=Ashish Yadav, Fatanpur Bazaar`) |
| **Token surakshit** | Keychain me, localStorage me nahi |
| **versionCode 1** | Pehle upload ke liye theek. Dusre upload se 2, 3… badhana hoga |

---

## ⚠️ Ek baat jo jaan lena zaroori hai — rider ka full-screen alert

Aapke app me `USE_FULL_SCREEN_INTENT` permission hai (rider ka Rapido-jaisa alert). Android 14 se
Google ne ye badal diya: **Play Store install ke waqt hi ye permission chheen leta hai**, siwaay un
apps ke jinka kaam calling ya alarm hai. Grocery delivery app ko ye by default nahi milti.

Iska matlab:

- Lock screen par poora alert **by default nahi aayega** — uski jagah upar se heads-up notification
  (sound + vibration ke saath) aayega. Order miss nahi hoga, bas dikhne ka tarika chhota hoga.
- Code me ye pehle se handle hai — `canUseFullScreenIntent()` sach-sach batata hai aur app apne aap
  heads-up par chala jaata hai. Kuch todega nahi.
- Rider apne phone me Settings → Apps → Fatanpur Bazaar → **"Manage full screen intents"** se ise
  khud chalu kar sakta hai. Rider ko ye ek baar bata dein.
- ⚠️ Play Console me **ye mat likhein ki ye calling ya alarm app hai** — wo galat declaration hoga
  aur app suspend ho sakta hai.

---

## Kaam karne ka sahi kram

1. **React Native upgrade** 0.76.5 → 0.81+ (0.88 behtar). Sabse bada kaam. Iske baad `targetSdk 36`
   karein aur alignment check dobara chalayein.
2. **Account delete** — app me button + web page + Console me URL.
3. **Prescription screen aur CAMERA** v1 se hata dein (dawai abhi band hai).
4. **App me privacy policy ka link** lagayein (Profile screen me).
5. `versionCode`/`versionName` set karein.
6. **AAB banayein** aur Play Console me upload karein.
7. Console ke saare form bharein (upar ki table).

⚠️ Step 1 ke bina baaki sab bekaar hai — upload hi nahi hoga. Aur step 1 chhota kaam nahi hai:
React Native ke 5 version ka jump hai, saari native libraries dobara test karni padengi.

---

## APK files — kaunsi rakhein, kaunsi delete karein

Aapke project me 4 files hain:

| File | Size | Date | Faisla |
| --- | --- | --- | --- |
| `apps\mobile\android\app\build\outputs\apk\release\app-release.apk` | 20M | 10 Nov | **Rakhein** — abhi bana hua, sabse naya. (Ye `build` folder me hai, dobara build karne par apne aap ban jaata hai) |
| `apps\mobile\release-apk\fatanpur-bazaar-alerts.apk` | 20M | 2 Nov | **Delete** — purana, ismein svg aur firebase ke fix nahi hain |
| `apps\mobile\release-apk\fatanpur-bazaar-v2.apk` | 20M | 24 Oct | **Delete** — bahut purana |
| `apps\mobile\release-apk\fatanpur-bazaar-v3.apk` | 20M | 24 Oct | **Delete** — bahut purana |

Teen file delete karne se ~60 MB khali ho jayega. Ye teeno purani hain — inme na svg ka fix hai,
na firebase colour ka, na naya review login.

⚠️ `.aab` file abhi ek bhi nahi bani hai.

---

## AAB banane ki command (Play Store ke liye)

```powershell
cd "D:\Fatanpur Bazaar\Website\fatanpur-bazaar\apps\mobile\android"
.\gradlew.bat clean
.\gradlew.bat bundleRelease
```

File yahan milegi:

```
D:\Fatanpur Bazaar\Website\fatanpur-bazaar\apps\mobile\android\app\build\outputs\bundle\release\app-release.aab
```

Ye file Play Console → Production → Create new release me upload hoti hai.

**APK banane ki command** (apne phone me test karne ke liye — Play par APK nahi chalta):

```powershell
.\gradlew.bat assembleRelease
```

→ `app\build\outputs\apk\release\app-release.apk`

⚠️ **Par yaad rakhein:** aaj AAB bana kar upload karenge to Play `targetSdk 35` dekh kar reject kar
dega. Pehle React Native upgrade, phir AAB. Abhi AAB sirf isliye banayein ki aap process dekh lein.

---

## Sources

- [Target API level requirements for Google Play apps — developer.android.com](https://developer.android.com/google/play/requirements/target-sdk)
- [Transition to 16 KB page sizes — Android Developers Blog](https://android-developers.googleblog.com/2025/07/transition-to-16-kb-page-sizes-android-apps-games-android-studio.html)
- [React Native 0.77 — Android 16 KB page support](https://reactnative.dev/blog/2025/01/21/version-0.77)
- [React Native 0.81 — Android 16 support](https://reactnative.dev/blog/2025/08/12/react-native-0.81)
- [React Native releases overview](https://reactnative.dev/releases/overview)
- [Provide a way for users to request account and data deletion — Play Console Help](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Full-screen intent limits — Android Open Source Project](https://source.android.com/docs/core/permissions/fsi-limits)
