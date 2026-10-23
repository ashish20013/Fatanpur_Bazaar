# Android Build Guide — फतनपुर बाज़ार

Play Store pe publish karne ke liye step-by-step guide.

---

## Prerequisites (पहले ये install करें)

1. **Node.js 24 LTS** — https://nodejs.org
2. **Java 17 JDK** — https://adoptium.net/temurin/releases (Temurin 17)
3. **Android Studio** — https://developer.android.com/studio
   - Install करते वक्त ये components चुनें:
     - Android SDK (API 35)
     - Android SDK Build-Tools 35.0.0
     - Android NDK 27.1.12297006
     - CMake
4. **Environment variables** set करें (Windows):
   ```
   ANDROID_HOME = C:\Users\<YourName>\AppData\Local\Android\Sdk
   JAVA_HOME = C:\Program Files\Eclipse Adoptium\jdk-17...
   Path में जोड़ें: %ANDROID_HOME%\platform-tools
   ```

---

## Step 1: Dependencies install करें

```bash
cd fatanpur-bazaar
npm install
```

---

## Step 2: Gradle Wrapper generate करें

Android Studio से project open करने पर ये automatically बन जाएगा, 
या manually:

```bash
cd apps/mobile/android
gradle wrapper --gradle-version 8.10.2
```

(इसके लिए Gradle 8.10 globally install होना चाहिए: `choco install gradle` या
https://gradle.org/releases/)

---

## Step 3: Firebase setup (FCM push notifications)

1. https://console.firebase.google.com पर जाएं
2. Project बनाएं या existing project चुनें
3. **Android app जोड़ें**:
   - Package name: `com.fatanpurbazaar.app`
   - App nickname: फतनपुर बाज़ार
   - SHA-1 (debug): Android Studio → Gradle tab → `:app` → `Tasks` → `android` → `signingReport`
4. `google-services.json` download करें
5. File को यहाँ रखें: `apps/mobile/android/app/google-services.json`

---

## Step 4: `.env` file बनाएं

```bash
cd apps/mobile
copy .env.example .env
```

`.env` में values भरें:
```
API_BASE_URL=https://your-api-domain.com
SOCKET_PATH=/socket
SUPPORT_PHONE=9616038670
```

---

## Step 5: Debug build (testing)

```bash
cd apps/mobile

# Metro bundler start करें (Terminal 1)
npx react-native start

# Android build + install (Terminal 2)
npx react-native run-android
```

Phone/emulator पर app install हो जाएगा।

---

## Step 6: Release Signing Key बनाएं

**⚠️ बहुत ज़रूरी: ये key + password सुरक्षित रखें! इसके बिना app कभी update नहीं हो पाएगा।**

```bash
cd apps/mobile/android

keytool -genkeypair -v -storetype PKCS12 ^
  -keystore app/fatanpur-release.keystore ^
  -alias fatanpur -keyalg RSA -keysize 2048 -validity 10000
```

Prompts भरें:
- **Password**: मज़बूत password दें (लिख कर रख लें!)
- **First and last name**: Ashish Yadav
- **Organization**: Fatanpur Bazaar
- **City**: Raniganj
- **State**: Uttar Pradesh
- **Country code**: IN

---

## Step 7: keystore.properties बनाएं

```bash
cd apps/mobile/android
copy keystore.properties.example keystore.properties
```

`keystore.properties` में values भरें:
```properties
FB_RELEASE_STORE_FILE=fatanpur-release.keystore
FB_RELEASE_KEY_ALIAS=fatanpur
FB_RELEASE_STORE_PASSWORD=<वही password जो Step 6 में दिया>
FB_RELEASE_KEY_PASSWORD=<वही password>
```

**⚠️ `keystore.properties` और `fatanpur-release.keystore` को Git में PUSH मत करें!**

---

## Step 8: Release AAB build (Play Store के लिए)

```bash
cd apps/mobile/android

# AAB (Android App Bundle) — Play Store upload के लिए
gradlew bundleRelease
```

Output file: `app/build/outputs/bundle/release/app-release.aab`

**Testing के लिए APK:**
```bash
gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`

---

## Step 9: Play Store पर Publish करें

1. https://play.google.com/console पर जाएं
2. **Developer account** बनाएं (₹1900 one-time fee)
3. **App बनाएं**:
   - App name: फतनपुर बाज़ार
   - Default language: हिन्दी (hi)
   - App type: Application
   - Free / Paid: Free
   - Category: Shopping
4. **Store listing** भरें (नीचे content दिया है)
5. **Content rating**: IARC questionnaire भरें
6. **Target audience**: 18+ (e-commerce)
7. **Privacy policy URL** डालें (your website/privacy page)
8. **App signing**: Google Play App Signing enable करें
9. **Release**: `app-release.aab` upload करें → Review → Publish

---

## Play Store Listing Content

### Title (30 characters max)
```
फतनपुर बाज़ार — रानीगंज
```

### Short Description (80 characters max)
```
ताज़ा सब्ज़ी, किराना, फल — रानीगंज प्रतापगढ़ में घर बैठे मंगाएं। फ्री डिलीवरी!
```

### Full Description (Hindi)
```
फतनपुर बाज़ार — रानीगंज, प्रतापगढ़ (उत्तर प्रदेश) का अपना ऑनलाइन बाज़ार।

अब अपने गाँव में बैठे-बैठे ताज़ा सब्ज़ी, फल, किराना सामान और रोज़ाना की ज़रूरत का सामान मंगाएं — सीधे अपने घर पर!

🥬 क्या मिलेगा:
• ताज़ी सब्ज़ियाँ — आलू, टमाटर, प्याज, हरी सब्ज़ी
• फल — केला, सेब, संतरा, अमरूद
• किराना — आटा, दाल, चावल, तेल, मसाले
• डेयरी — दूध, दही, पनीर
• साबुन, डिटर्जेंट, बिस्किट-नमकीन
• खेती का सामान — खाद, बीज (जल्द आ रहा है)
• दवाई (लाइसेंस के बाद)

📦 खास बातें:
• 6 किमी तक फ्री डिलीवरी
• कैश ऑन डिलीवरी (COD) + UPI दोनों
• हिन्दी में पूरा ऐप
• लाइव ट्रैकिंग — अपना सामान कहाँ पहुँचा, देखें
• फ़ोन + OTP से आसान लॉगिन — कोई पासवर्ड नहीं
• बाज़ार जैसे दाम, कोई extra चार्ज नहीं

🏡 हम इन जगहों पर डिलीवरी करते हैं:
फतनपुर बाज़ार, रानीगंज, नथका पूरा, सुवांसा, उदचा, पटहटिया कला, पटहटिया खुर्द, कोयम, कोठरा, गीतानगर, गुड़ा, रामपुर, असापुर, चुरहटी

📞 मदद चाहिए? कॉल करें: 9616038670

फतनपुर बाज़ार — अपने गाँव की दुकान, अब आपकी जेब में!
```

### Category
```
Shopping
```

### Tags
```
grocery, kirana, sabzi, vegetables, fruits, delivery, rural, village, pratapgarh, raniganj, fatanpur
```

---

## Troubleshooting

### Build fail हो रहा है?

1. **JDK version check करें**: `java -version` → 17 होना चाहिए
2. **ANDROID_HOME set है?**: `echo %ANDROID_HOME%`
3. **Clean build**: `cd android && gradlew clean && gradlew bundleRelease`
4. **Node modules fresh करें**: `cd ../.. && rm -rf node_modules && npm install`

### google-services.json error?

Firebase console से fresh download करें और `apps/mobile/android/app/` में रखें।

### Signing error?

`keystore.properties` में passwords check करें। Keystore file `app/` folder में होनी चाहिए।

---

## Version update (अगला update publish करने के लिए)

`apps/mobile/android/app/build.gradle` में:
```gradle
versionCode 2          // हर update पर 1 बढ़ाएं
versionName "1.1.0"    // दिखने वाला version number
```

फिर `gradlew bundleRelease` करें और Play Store पर upload करें।
