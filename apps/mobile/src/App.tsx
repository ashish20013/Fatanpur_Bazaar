import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './store/auth';
import { CartProvider } from './store/cart';
import { TrackingProvider } from './store/tracking';
import { RootNavigator } from './navigation/RootNavigator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkBanner } from './components/NetworkBanner';
import { colors } from './theme/tokens';

/**
 * Root component — order matters: ErrorBoundary outermost, then providers, then navigation.
 * NavigationContainer is inside RootNavigator (not here) to avoid double-wrapping.
 */
export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={colors.surface}
          translucent={false}
        />
        <AuthProvider>
          <CartProvider>
            <TrackingProvider>
              <NetworkBanner />
              <RootNavigator />
            </TrackingProvider>
          </CartProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
