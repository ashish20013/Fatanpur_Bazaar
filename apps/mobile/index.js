/**
 * Entry point. Registers the FCM background handler BEFORE the app component mounts —
 * Firebase requires this to run at module scope, outside any React lifecycle (A25).
 */
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './src/App';
import { name as appName } from './app.json';

messaging().setBackgroundMessageHandler(async () => {
  // Data-only messages are handled by the OS tray automatically for notification-type
  // payloads; this hook exists so a future data-only push (e.g. silent cache-bust) has
  // somewhere to run without crashing the app in the background.
});

AppRegistry.registerComponent(appName, () => App);
