# ============================================================
# Fatanpur Bazaar — React Native 0.76.5 ProGuard/R8 Rules
# ============================================================

# --- React Native core ---
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# --- SoLoader — CRITICAL for merged .so library loading ---
# Without this, R8 strips the SoLoader/ExternalSoMapping classes,
# the merged SO mapping fails, and the app tries to load
# non-existent standalone .so files (e.g. libhermes_executor.so)
-keep class com.facebook.soloader.** { *; }

# Explicitly keep the merged SO mapping (maps hermes_executor -> hermestooling etc.)
-keep class com.facebook.react.soloader.OpenSourceMergedSoMapping { *; }
-keep class * implements com.facebook.soloader.ExternalSoMapping { *; }

# --- Keep ALL native methods across all classes ---
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

# --- FBJNI HybridData (C++ bridge) ---
-keepclassmembers class * {
    com.facebook.jni.HybridData *;
    <init>(com.facebook.jni.HybridData);
}
-keepclasseswithmembers class * {
    com.facebook.jni.HybridData *;
}

# --- React Native annotations ---
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keep @com.facebook.proguard.annotations.DoNotStripAny class * { *; }
-keep @com.facebook.jni.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.jni.annotations.DoNotStrip *;
}
-keep @com.facebook.jni.annotations.DoNotStripAny class * { *; }
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
    void set*(***);
    *** get*();
}

# --- React Native bridge & modules ---
-keep class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep,includedescriptorclasses class com.facebook.react.turbomodule.core.** { *; }
-keep,includedescriptorclasses class com.facebook.react.internal.turbomodule.core.** { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
}
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
}

# --- ReactBuildConfig (needed by HermesExecutor to determine debug/release) ---
-keep class com.facebook.react.common.build.ReactBuildConfig { *; }

# --- React Native defaults ---
-keep class com.facebook.react.defaults.** { *; }

# --- Yoga layout engine ---
-keep,allowobfuscation @interface com.facebook.yoga.annotations.DoNotStrip
-keep @com.facebook.yoga.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.yoga.annotations.DoNotStrip *;
}

# --- Firebase ---
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# --- App native modules ---
-keep class com.fatanpurbazaar.app.FGLocationServiceModule { *; }
-keep class com.fatanpurbazaar.app.FGLocationServicePackage { *; }
-keep class com.fatanpurbazaar.app.DeviceBatteryModule { *; }
-keep class com.fatanpurbazaar.app.DeviceBatteryPackage { *; }
-keep class com.fatanpurbazaar.app.OrderAlertModule { *; }
-keep class com.fatanpurbazaar.app.OrderAlertPackage { *; }
-keep class com.fatanpurbazaar.app.FbMessagingService { *; }
-keep class com.fatanpurbazaar.app.MainApplication { *; }

# --- BuildConfig: the app's .env, read by reflection ---
# ⚠️ react-native-config does not reference these fields from Java — it looks them up on
# BuildConfig at runtime. R8 sees no reference, so it deleted the whole class from the release
# APK (confirmed in mapping/release/usage.txt), and every Config.* value came back empty. The
# app then fell back to its hardcoded constants, which made API_BASE_URL, SUPPORT_PHONE and
# SOCKET_PATH in .env quietly useless in exactly the build that ships. Debug builds were fine,
# which is why it went unnoticed.
-keep class com.fatanpurbazaar.app.BuildConfig { *; }
-keep class com.lugg.RNCConfig.** { *; }

# --- OkHttp / Okio ---
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class sun.misc.Unsafe { *; }
-dontwarn java.nio.file.*
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement

# --- Suppress warnings ---
-dontwarn com.facebook.react.**
-dontwarn com.facebook.proguard.annotations.**
-dontwarn com.facebook.yoga.annotations.**
