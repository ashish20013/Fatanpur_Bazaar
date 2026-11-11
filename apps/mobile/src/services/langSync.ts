import type { Lang } from '../store/lang';

/**
 * Tells the server which language the customer chose, so the choice follows them.
 *
 * `users.language` already exists on the API and the account page already wrote to it — this
 * just means the header's one-tap switch writes there too. One customer, one preference,
 * whether they open the shop on the website or in the app.
 *
 * ⚠️ Everything here happens AFTER the tap, in a deferred task, and nothing it does can throw
 * into the caller.
 *
 * This was a real bug, and a nasty one to look at: `services/api` is imported by the language
 * store (it needs the current language to write an error message in), so a module that imports
 * `api` and is itself pulled in by a component in the header could be handed a half-built copy
 * of it. Calling `hasSession` on that copy threw, the throw came out of the toggle's `onPress`,
 * and the tap did nothing at all: a customer could press "EN" as often as they liked and the
 * shop stayed in Hindi. Loading `api` lazily, inside a deferred task, keeps the switch —
 * the thing the customer can see — independent of all of it.
 */
export function syncLang(lang: Lang): void {
  setTimeout(() => {
    void (async () => {
      try {
        const { api, hasSession } = await import('./api');
        if (!hasSession()) return; // a guest's choice stays on the device, which is all it can do
        await api.patch('/users/me', { language: lang });
      } catch {
        // A preference the server did not hear about is not worth a word on screen.
      }
    })();
  }, 0);
}
