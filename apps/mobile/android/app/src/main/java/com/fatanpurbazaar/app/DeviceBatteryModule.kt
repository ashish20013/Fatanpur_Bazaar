package com.fatanpurbazaar.app

import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeviceBatteryModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceBattery"

    @ReactMethod
    fun getLevel(promise: Promise) {
        try {
            val intent = reactApplicationContext.registerReceiver(
                null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            )
            if (intent != null) {
                val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                if (level >= 0 && scale > 0) {
                    promise.resolve((level.toDouble() / scale.toDouble() * 100).toInt())
                } else {
                    promise.resolve(-1)
                }
            } else {
                promise.resolve(-1)
            }
        } catch (e: Exception) {
            promise.reject("BATTERY_ERROR", e.message, e)
        }
    }
}
