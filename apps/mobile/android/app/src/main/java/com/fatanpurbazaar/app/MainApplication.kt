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
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost

class MainApplication : Application(), ReactApplication {

    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> =
                PackageList(this).packages.apply {
                    add(FGLocationServicePackage())
                    add(DeviceBatteryPackage())
                }

            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            load()
        }
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
