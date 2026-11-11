import type { LinkingOptions } from '@react-navigation/native';
import type { CustomerStackParamList } from './CustomerTabs';

/**
 * Where a link opens.
 *
 * ⚠️ The Android manifest has declared `fatanpurbazaar://` and `https://fatanpurbazaar.com`
 * since the first build, but nothing ever consumed them: React Navigation was given no linking
 * config, so every link — including the `linkUrl` the backend attaches to each push — landed on
 * whatever screen happened to be showing. A delivery partner tapping "नई डिलीवरी" got the shop's
 * home page and had to find the job himself.
 *
 * The paths mirror the website's, so one `linkUrl` from the API works for both: the site opens
 * `/mera/order/FB-123` in a browser and the app opens the same path on the tracking screen.
 *
 * Unknown paths are ignored by React Navigation rather than crashing, and routes that belong to
 * a tree which is not mounted (a customer link while the staff panel is open) simply do not
 * match — the person stays where they are.
 */
export const linking: LinkingOptions<CustomerStackParamList> = {
  prefixes: ['fatanpurbazaar://', 'https://fatanpurbazaar.com', 'http://fatanpurbazaar.com'],
  config: {
    screens: {
      Tabs: {
        screens: {
          Home: '',
          Cart: 'cart',
          Orders: 'mera/orders',
          Profile: 'mera',
        },
      },
      // The website's own /login path: a link that needs an account lands on the same screen
      // in the app, instead of dropping the person on the shop's home page.
      Phone: 'login',
      Categories: 'c/:slug',
      Search: 'khoj',
      Product: 'product/:slug',
      Service: 'service/:slug',
      Checkout: 'checkout',
      OrderTracking: 'mera/order/:orderNumber',
      Wallet: 'mera/wallet',
      Prescriptions: 'mera/prescriptions',
      Notifications: 'mera/notifications',
    },
  },
};
