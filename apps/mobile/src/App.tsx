import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './store/auth';
import { CartProvider } from './store/cart';
import { TrackingProvider } from './store/tracking';
import { RootNavigator } from './navigation/RootNavigator';
import { colors } from './theme/tokens';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar backgroundColor={colors.card} barStyle="dark-content" />
      <AuthProvider>
        <TrackingProvider>
          <CartProvider>
            <RootNavigator />
          </CartProvider>
        </TrackingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
