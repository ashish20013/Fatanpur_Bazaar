import { createNavigationContainerRef } from '@react-navigation/native';
import type { CustomerStackParamList } from './CustomerTabs';

/**
 * A handle on the navigation tree for the one component that lives OUTSIDE it: the थैला bar.
 *
 * ⚠️ The bar is deliberately mounted once, above the whole stack, the way the website's shell
 * holds it — not copied into every screen. But a component that is a sibling of the navigator
 * rather than a child of it has no navigation context, so `useNavigation` / `useNavigationState`
 * throw there ("Couldn't get the navigation state. Is your component inside a navigator?") —
 * and because that throw happens during render, the error boundary swallowed the entire
 * customer side of the app. This ref is how such a component asks where it is and moves on:
 * the container exposes it, so it works from anywhere.
 */
export const navigationRef = createNavigationContainerRef<CustomerStackParamList>();
