import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, space } from '../theme/tokens';

/**
 * How much room a scrolling TAB screen must leave at the bottom.
 *
 * ⚠️ The tab bar floats over the content, it does not push it up. A screen that ends with
 * `padding: 16` hides its last rows behind the bar — on the staff order screen that was the row
 * of "Preparing / Ready for pickup" buttons, the controls the shop uses on every single order,
 * half-covered by the tab bar and partly untappable.
 *
 * Android's gesture pill eats a few more pixels below the bar, hence the live inset.
 */
export function useScrollBottomPad(): number {
  const insets = useSafeAreaInsets();
  return layout.bottomNavH + 8 + insets.bottom + space[4];
}
