package com.fatanpurbazaar.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import com.facebook.react.soloader.OpenSourceMergedSoMapping

class MainApplication : Application(), ReactApplication {

    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> =
                PackageList(this).packages.apply {
                    add(FGLocationServicePackage())
                    add(DeviceBatteryPackage())
                    add(OrderAlertPackage())
                }

            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun attachBaseContext(base: android.content.Context) {
        super.attachBaseContext(base)
        // SoLoader MUST init here — before ContentProviders (Firebase, androidx.startup)
        // run, otherwise they trigger SoLoader.init without ExternalSoMapping,
        // isEnabled becomes false (SDK>=23 + manifest default), and NativeLoader gets
        // SystemDelegate which crashes on merged SO names like hermes_executor→hermestooling
        SoLoader.init(this, OpenSourceMergedSoMapping)
    }

    override fun onCreate() {
        super.onCreate()
        // Order-alert channels exist from the first launch: a push that arrives while the app
        // is dead must find the channel it names, or Android drops it onto the default one.
        OrderAlertModule.createChannels(this)
        /*
         * RN 0.81 ka naya entry point. Pehle yahan `DefaultNewArchitectureEntryPoint.load()`
         * tha jo sirf New Arch par chalta tha; `loadReactNative` dono architecture par sahi
         * cheez karta hai aur SoLoader bhi sambhaal leta hai.
         * (Upar attachBaseContext ka SoLoader.init jaan-boojhkar waisa hi rakha gaya hai —
         *  wo Firebase ke ContentProvider se pehle chalna zaroori hai.)
         */
        loadReactNative(this)
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            val ordersChannel = NotificationChannel(
                "fatanpur_orders",
                "ऑर्डर अपडेट",
                NotificationManager.IMPORTANCE_HIGH
            ).apply { description = "ऑर्डर की स्थिति और अपडेट" }

            val deliveryChannel = NotificationChannel(
                "fatanpur_delivery",
                "डिलीवरी ट्रैकिंग",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "लाइव डिलीवरी ट्रैकिंग" }

            val generalChannel = NotificationChannel(
                "fatanpur_general",
                "सामान्य सूचनाएं",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply { description = "प्रचार और अन्य सूचनाएं" }

            manager.createNotificationChannels(listOf(ordersChannel, deliveryChannel, generalChannel))
        }
    }
}
