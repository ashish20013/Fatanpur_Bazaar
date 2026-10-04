# Android project — what the owner must add

This repo does **not** contain a generated `android/` (or `ios/`) native project — only the
JS/TS app under `src/`. That is deliberate: a React Native native shell is large, mostly
boilerplate, and best generated fresh against the exact RN/Gradle/AGP versions available at
build time, then have `src/` dropped in. This document is the exact list of what to paste into
that generated project so the app behaves the way `src/services/location.ts` and
`src/services/fcm.ts` already assume.

## 1. Generate the native project

```bash
cd apps/mobile
npx @react-native-community/cli init FatanpurBazaarShell --version 0.76.5 --skip-install
# copy the generated FatanpurBazaarShell/android (and /ios, if you ever ship it) into apps/mobile/
rm -rf FatanpurBazaarShell/{node_modules,index.js,App.tsx,package.json,src}
mv FatanpurBazaarShell/android apps/mobile/android
rmdir FatanpurBazaarShell 2>/dev/null || rm -rf FatanpurBazaarShell
```

Set the applicationId / package name to something under your own domain (e.g.
`com.fatanpurbazaar.app`) in `android/app/build.gradle` and `android/app/src/main/java/.../MainActivity.kt`
— match whatever you register in the Firebase console for `google-services.json` (step 4).

## 2. AndroidManifest.xml — permissions + entries to paste

Inside `android/app/src/main/AndroidManifest.xml`, above `<application>`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

`FOREGROUND_SERVICE_LOCATION` is required from Android 14 (API 34) onward for any foreground
service that shares location — without it the OS kills the rider's location service outright.

On the `<application>` tag:

```xml
<application
    ...
    android:usesCleartextTraffic="false">
```

`API_BASE_URL` in `.env` **must** be `https://` for any real device build once this is set —
plain `http://10.0.2.2:3000` (Android emulator dev-only) needs the debug-only exception below,
never enabled in a release build.

Debug-only cleartext exception (emulator → your dev machine only) — create
`android/app/src/debug/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
</network-security-config>
```

and reference it **only** from the debug manifest override
`android/app/src/debug/AndroidManifest.xml`:

```xml
<application android:networkSecurityConfig="@xml/network_security_config" android:usesCleartextTraffic="true" />
```

(There is no `src/debug` manifest by default — create the folder and this one file; Gradle
merges debug-variant manifests over the main one automatically, so release builds never see it.)

Register the two services/receivers `src/services/location.ts` and `src/services/fcm.ts` expect,
inside `<application>`:

```xml
<service
    android:name=".location.FGLocationService"
    android:foregroundServiceType="location"
    android:exported="false" />
```

(Firebase Messaging's own service is added automatically by the
`@react-native-firebase/messaging` Gradle plugin — nothing to add for that by hand.)

## 3. The two native modules `src/services/location.ts` calls

The JS layer already guards every call in `try/catch` (see the comment block at the top of
`FGLocationService?.start`/`stop` in `location.ts`) — the app runs fine without these, just
without a persistent notification while sharing location and without battery-based throttling.
Wiring them in properly, once the android project exists:

**`android/app/src/main/java/.../location/FGLocationService.kt`** — starts a real Android
foreground service with a persistent notification (Android requires this for any background
location work) and stops it:

```kotlin
package com.fatanpurbazaar.app.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.fatanpurbazaar.app.R

class FGLocationService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra("title") ?: "फतनपुर बाज़ार"
        val text = intent?.getStringExtra("text") ?: "डिलीवरी लोकेशन शेयर हो रही है"
        val channelId = "fb_location"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(channelId, "Delivery tracking", NotificationManager.IMPORTANCE_LOW))
        }
        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle(title).setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher).setOngoing(true).build()
        startForeground(1001, notification)
        return START_STICKY
    }

    override fun onDestroy() {
        stopForeground(true)
        super.onDestroy()
    }
}
```

**`android/app/src/main/java/.../location/FGLocationServiceModule.kt`** — the bridge the JS
`NativeModules.FGLocationService` in `location.ts` resolves against:

```kotlin
package com.fatanpurbazaar.app.location

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FGLocationServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "FGLocationService"

    @ReactMethod
    fun start(title: String, text: String) {
        val intent = Intent(reactApplicationContext, FGLocationService::class.java)
            .putExtra("title", title).putExtra("text", text)
        reactApplicationContext.startForegroundService(intent)
    }

    @ReactMethod
    fun stop() {
        reactApplicationContext.stopService(Intent(reactApplicationContext, FGLocationService::class.java))
    }
}
```

**`android/app/src/main/java/.../location/DeviceBatteryModule.kt`** — backs
`NativeModules.DeviceBattery.getBatteryLevel()` (used to drop to a 30 s / low-accuracy interval
under 15 % battery, per `location.ts`):

```kotlin
package com.fatanpurbazaar.app.location

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeviceBatteryModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "DeviceBattery"

    @ReactMethod
    fun getBatteryLevel(promise: Promise) {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus = reactApplicationContext.registerReceiver(null, filter)
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        promise.resolve(if (level >= 0 && scale > 0) level.toDouble() / scale.toDouble() else 1.0)
    }
}
```

**`android/app/src/main/java/.../location/LocationPackage.kt`** — registers both, then add
`LocationPackage()` to the list in `MainApplication.kt`'s `getPackages()`:

```kotlin
package com.fatanpurbazaar.app.location

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class LocationPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(FGLocationServiceModule(reactContext), DeviceBatteryModule(reactContext))
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
```

## 4. `google-services.json` (FCM push, A25)

1. Firebase console → your project → Android app → download `google-services.json`.
2. Place it at `android/app/google-services.json` (same folder as `build.gradle` for the app
   module — **not** the project-root `android/build.gradle`).
3. `android/build.gradle` (project-level) — add to the `dependencies` block:
   `classpath("com.google.gms:google-services:4.4.2")`.
4. `android/app/build.gradle` — add at the very bottom:
   `apply plugin: "com.google.gms.google-services"`.
5. `@react-native-firebase/app` and `@react-native-firebase/messaging` (already in
   `package.json`) auto-link the rest.

## 5. Release build + signing

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore fatanpur-release.keystore \
  -alias fatanpur -keyalg RSA -keysize 2048 -validity 10000
# move fatanpur-release.keystore into android/app/, keep the passwords out of git
```

`android/gradle.properties` (or a local, git-ignored `android/keystore.properties`):

```
FB_RELEASE_STORE_FILE=fatanpur-release.keystore
FB_RELEASE_KEY_ALIAS=fatanpur
FB_RELEASE_STORE_PASSWORD=<your password>
FB_RELEASE_KEY_PASSWORD=<your password>
```

`android/app/build.gradle` — inside `android { }`:

```gradle
signingConfigs {
    release {
        storeFile file(FB_RELEASE_STORE_FILE)
        storePassword FB_RELEASE_STORE_PASSWORD
        keyAlias FB_RELEASE_KEY_ALIAS
        keyPassword FB_RELEASE_KEY_PASSWORD
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    }
}
```

Build:

```bash
cd android
./gradlew bundleRelease   # → android/app/build/outputs/bundle/release/app-release.aab (Play Store)
./gradlew assembleRelease # → android/app/build/outputs/apk/release/app-release.apk (direct install/testing)
```

Keep the keystore and its passwords out of git and backed up somewhere safe — a lost signing key
means the app can never be updated again under the same Play Store listing.
