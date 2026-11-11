package com.fatanpurbazaar.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * The only thing that works when the app is not running.
 *
 * ⚠️ A notification-type FCM message is drawn by the system and cannot ring the way a job alert
 * has to, so the server sends the order alert as DATA and this service turns it into the
 * notification — which is why the alert still arrives when the app has been swiped away. React
 * Native's own messaging library only gets a look in once JavaScript is alive; by then the
 * delivery partner has already missed the order.
 *
 * It does the least possible work: read the fields, post the notification, return. No network,
 * no database, no JS bridge — Android gives a woken-up process a few seconds and takes a dim view
 * of apps that overstay.
 */
class FbMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val kind = data["kind"] ?: ""
        // Only the loud kinds are handled here. Everything else is an ordinary notification that
        // the system or the JS layer can show whenever the app next runs.
        if (kind != "incoming_order" && kind != "pool" && kind != "order_unassigned") return
        val urgent = kind != "order_unassigned" && (data["priority"] ?: "HIGH") == "HIGH"
        OrderAlertModule.postIncoming(
            applicationContext,
            data["orderNumber"] ?: "",
            message.notification?.title ?: data["title"] ?: "नया ऑर्डर",
            message.notification?.body ?: data["body"] ?: "",
            urgent,
        )
    }
}
