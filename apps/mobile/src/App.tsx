import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from './store/lang';
import { AlertProvider } from './store/alerts';
import { AuthProvider } from './store/auth';
import { SettingsProvider } from './store/settings';
import { CartProvider } from './store/cart';
import { TrackingProvider } from './store/tracking';
import { RootNavigator } from './navigation/RootNavigator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkBanner } from './components/NetworkBanner';
import { NotificationBanner } from './components/NotificationBanner';
import { OrderAlerts } from './components/OrderAlerts';
import { colors } from './theme/tokens';
import { applyGlobalFont } from './theme/applyFont';

// Before the first render, so nothing paints in the system font and then reflows into Mukta.
applyGlobalFont();

/**
 * Root component — order matters: ErrorBoundary outermost, then providers, then navigation.
 * NavigationContainer is inside RootNavigator (not here) to avoid double-wrapping.
 */
export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        {/* The site's header is the emerald band, and the status bar sits directly on it. */}
        <StatusBar barStyle="light-content" backgroundColor={colors.band} translucent={false} />
        {/* The shop's own settings (prices, COD/UPI, delivery window) wrap everything, because
            the header and the first screen already need them. */}
        {/* Language outermost of the data providers: every screen under it, and the header's
            हिं | EN switch, read their words from here. */}
        <LanguageProvider>
          <SettingsProvider>
            <AuthProvider>
              <CartProvider>
                <TrackingProvider>
                  {/* Order alerts wrap the navigator so the ringing card can appear over any
                      screen — and so the ringtone is owned by one provider that cannot be
                      unmounted by navigation. */}
                  <AlertProvider>
                    <NetworkBanner />
                    <NotificationBanner />
                    <RootNavigator />
                    <OrderAlerts />
                  </AlertProvider>
                </TrackingProvider>
              </CartProvider>
            </AuthProvider>
          </SettingsProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
