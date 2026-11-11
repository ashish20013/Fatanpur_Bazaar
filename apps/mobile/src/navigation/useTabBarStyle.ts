import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout } from '../theme/tokens';

/**
 * Android gesture navigation draws its pill over the bottom of the window. A fixed tabBar
 * height hides behind it, so the icons and labels end up under the system bar and the last
 * pixels of tap target are stolen. Grow the bar by the live bottom inset instead.
 */
export function useTabBarStyle(): ViewStyle {
  const insets = useSafeAreaInsets();
  return {
    height: layout.bottomNavH + 8 + insets.bottom,
    paddingBottom: 8 + insets.bottom,
    paddingTop: 6,
    backgroundColor: colors.card,
    borderTopColor: colors.line,
  };
}
