# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# App native modules
-keep class com.fatanpurbazaar.app.FGLocationServiceModule { *; }
-keep class com.fatanpurbazaar.app.DeviceBatteryModule { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep native methods
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
