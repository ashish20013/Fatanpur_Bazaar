package com.fatanpurbazaar.app

import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

/**
 * The ringing part of an incoming order.
 *
 * ⚠️ A React Native screen is not enough and was never going to be. When the phone is locked, or
 * the app has been swiped away, or Android has frozen it to save battery, there is no JavaScript
 * running to render anything — so the alert has to exist as an Android notification with its own
 * channel, its own sound and its own full-screen intent, posted by native code. That is what this
 * module is: the JS side decides WHAT to say, this decides HOW the phone behaves.
 *
 * What it deliberately does NOT do:
 *  • no background service to keep the app alive — Android 12+ forbids starting one from the
 *    background anyway, and a shop does not need one: a high-priority FCM message wakes the app
 *    for long enough to post a notification, which is exactly the budget Google intends.
 *  • no bypassing of permissions. POST_NOTIFICATIONS is asked for on Android 13+, and
 *    USE_FULL_SCREEN_INTENT is declared but reported honestly: from Android 14 the system grants
 *    it only to calling and alarm apps, so `canFullScreen()` tells the truth and the JS side falls
 *    back to a heads-up notification plus the in-app screen.
 */
class OrderAlertModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    companion object {
        const val CHANNEL_URGENT = "urgent_orders"
        const val CHANNEL_NORMAL = "orders"
        const val NOTIFICATION_ID = 7301

        /** Extras the activity reads to know it was opened by an order alert. */
        const val EXTRA_ORDER = "fb_order_number"
        const val EXTRA_ACTION = "fb_alert_action"

        private var player: MediaPlayer? = null

        /**
         * Channels must exist before the first notification lands, and a channel's importance and
         * sound are frozen at creation — changing them later needs a different id. Called from
         * MainApplication.onCreate so a push that arrives while the app is dead still finds them.
         */
        @JvmStatic
        fun createChannels(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            if (nm.getNotificationChannel(CHANNEL_URGENT) == null) {
                val sound = soundUri(context)
                val urgent = NotificationChannel(CHANNEL_URGENT, "नए ऑर्डर", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "नया ऑर्डर आने पर बजने वाली सूचना"
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 500, 300, 500, 300, 500)
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    setBypassDnd(true)
                    setSound(
                        sound,
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    )
                }
                nm.createNotificationChannel(urgent)
            }
            if (nm.getNotificationChannel(CHANNEL_NORMAL) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_NORMAL, "ऑर्डर की जानकारी", NotificationManager.IMPORTANCE_DEFAULT).apply {
                        description = "ऑर्डर से जुड़ी सामान्य सूचनाएं"
                    },
                )
            }
        }

        /** res/raw/order_alert if the owner has dropped one in, otherwise the system ringtone. */
        private fun soundUri(context: Context): Uri {
            val id = context.resources.getIdentifier("order_alert", "raw", context.packageName)
            return if (id != 0) Uri.parse("android.resource://${context.packageName}/$id")
            else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        }

        /**
         * Posts the alert. Static so the FCM service can call it with no React context alive.
         *
         * The full-screen intent is what turns a notification into a ride-hailing-style card over
         * the lock screen. Android only honours it when the screen is off or locked and the app is
         * eligible; when it is not honoured the same notification still shows as a heads-up banner
         * with both action buttons, which is the honest fallback rather than a silent failure.
         */
        @JvmStatic
        fun postIncoming(context: Context, orderNumber: String, title: String, body: String, urgent: Boolean) {
            createChannels(context)
            val open = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_ORDER, orderNumber)
                putExtra(EXTRA_ACTION, "OPEN")
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            // ⚠️ IMMUTABLE: nothing outside the app may rewrite these extras and make the app act
            // on an order the sender chose. Required from Android 12 and correct before it.
            val openPi = PendingIntent.getActivity(context, 1, open, flags)
            val acceptPi = PendingIntent.getActivity(
                context, 2,
                Intent(open).apply { putExtra(EXTRA_ACTION, "ACCEPT") }, flags,
            )
            val rejectPi = PendingIntent.getActivity(
                context, 3,
                Intent(open).apply { putExtra(EXTRA_ACTION, "REJECT") }, flags,
            )

            val builder = NotificationCompat.Builder(context, if (urgent) CHANNEL_URGENT else CHANNEL_NORMAL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(if (urgent) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setOngoing(urgent)
                .setContentIntent(openPi)
            if (urgent) {
                builder.setFullScreenIntent(openPi, true)
                    .addAction(0, "स्वीकार करें", acceptPi)
                    .addAction(0, "मना करें", rejectPi)
            }
            try {
                NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
            } catch (_: SecurityException) {
                // POST_NOTIFICATIONS refused. Nothing to do here — the in-app screen is the
                // fallback, and pretending otherwise would hide a real problem from the rider.
            }
        }
    }

    override fun getName(): String = "OrderAlert"

    @ReactMethod
    fun createChannels(promise: Promise) {
        try {
            createChannels(ctx)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CHANNEL_ERROR", e.message, e)
        }
    }

    /**
     * Whether a full-screen alert will actually be shown.
     *
     * Android 14 turned USE_FULL_SCREEN_INTENT into a permission granted by default only to
     * calling and alarm apps. Reporting this lets the rider's screen say "आपके फ़ोन पर पूरा
     * अलर्ट बंद है" instead of silently never appearing.
     */
    @ReactMethod
    fun canFullScreen(promise: Promise) {
        try {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val allowed = if (Build.VERSION.SDK_INT >= 34) nm.canUseFullScreenIntent() else true
            promise.resolve(allowed)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /** Is the phone locked right now? The JS side uses it to decide notification vs in-app card. */
    @ReactMethod
    fun isLocked(promise: Promise) {
        try {
            val km = ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            promise.resolve(km.isKeyguardLocked || !pm.isInteractive)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun showIncoming(payload: ReadableMap, promise: Promise) {
        try {
            postIncoming(
                ctx,
                if (payload.hasKey("orderNumber")) payload.getString("orderNumber") ?: "" else "",
                if (payload.hasKey("title")) payload.getString("title") ?: "नया ऑर्डर" else "नया ऑर्डर",
                if (payload.hasKey("body")) payload.getString("body") ?: "" else "",
                !payload.hasKey("urgent") || payload.getBoolean("urgent"),
            )
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIFY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancel(promise: Promise) {
        try {
            NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Ring and buzz until told to stop.
     *
     * ⚠️ On the RINGTONE stream and looping, because an order alert the rider sleeps through is
     * worth nothing — but `stopRinging` is called from every exit path on the JS side (accept,
     * reject, expiry, the screen unmounting, the app going to the background) so it can never be
     * left ringing. Being its own MediaPlayer rather than the channel's sound is what makes
     * stopping it possible at all: a channel sound plays for as long as it plays.
     */
    @ReactMethod
    fun startRinging(loop: Boolean, vibrate: Boolean, promise: Promise) {
        // ⚠️ Sound and buzz get a try/catch EACH, and deliberately so. They used to share one:
        // when MediaPlayer.prepare() failed — no ringtone set on the phone, a silent profile, a
        // device that refuses to open content://settings/system/ringtone (seen on the emulator) —
        // the throw jumped straight past the vibrate call, so the rider got neither sound NOR
        // buzz from a phone that was perfectly able to vibrate. The two are independent now and
        // the promise reports whether ANYTHING happened.
        var rang = false
        try {
            stopPlayer()
            player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                setDataSource(ctx, soundUri(ctx))
                isLooping = loop
                setOnErrorListener { _, _, _ -> true }
                prepare()
                start()
            }
            rang = true
        } catch (e: Exception) {
            // A phone that will not ring is not a reason to drop the order: the card still shows,
            // and the buzz below still runs.
            stopPlayer()
        }
        var buzzed = false
        if (vibrate) {
            try {
                vibrator()?.let {
                    val pattern = longArrayOf(0, 600, 400, 600, 400)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        it.vibrate(VibrationEffect.createWaveform(pattern, if (loop) 0 else -1))
                    } else {
                        @Suppress("DEPRECATION")
                        it.vibrate(pattern, if (loop) 0 else -1)
                    }
                    buzzed = true
                }
            } catch (e: Exception) {
                // No vibrator, or a manufacturer ROM refusing the waveform. Nothing to recover.
            }
        }
        promise.resolve(rang || buzzed)
    }

    @ReactMethod
    fun stopRinging(promise: Promise) {
        stopPlayer()
        try {
            vibrator()?.cancel()
        } catch (_: Exception) {
        }
        promise.resolve(true)
    }

    private fun stopPlayer() {
        try {
            player?.let {
                if (it.isPlaying) it.stop()
                it.release()
            }
        } catch (_: Exception) {
        }
        player = null
    }

    private fun vibrator(): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
}
