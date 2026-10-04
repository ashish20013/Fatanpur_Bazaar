import { cache } from 'react';
import type { AddressView, CartView, HomeResponse, MeResponse, VillageOption } from '@fb/shared-types';
import { authed, getCart, getHome, getMe, getSettings, getVillages, type PublicSettings } from './data';
import type { Lang } from './i18n';
import { currentLang, savedAddressId, savedVillage } from './session';

export interface Shell {
  lang: Lang;
  settings: PublicSettings;
  home: HomeResponse;
  villages: VillageOption[];
  cart: CartView | null;
  me: MeResponse | null;
  addresses: AddressView[];
  addressId: number | null;
  addressLabel: string | null;
}

/**
 * Everything the header/footer need, fetched once per request (React `cache` dedupes calls from the
 * layout and the page).
 *
 * ⚠️ Not customer-only any more. The shopkeeper, his admin and his delivery partners shop here
 * too — that is the whole point of the "staff or customer?" choice at login — so anybody who is
 * signed in gets their saved addresses in the header. Gating it on the CUSTOMER role left a staff
 * member staring at "अपना पता चुनें" with his own addresses nowhere in sight.
 */
export const getShell = cache(async (): Promise<Shell> => {
  const lang = await currentLang();
  const [settings, home, villages, cart, me, pickedId, village] = await Promise.all([getSettings(), getHome(lang), getVillages(), getCart(), getMe(), savedAddressId(), savedVillage()]);
  const addresses = me ? await authed<AddressView[]>('/users/me/addresses').catch(() => [] as AddressView[]) : [];
  const chosen = addresses.find((a) => a.id === pickedId) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const vName = (a: AddressView): string => (lang === 'hi' ? (a.villageNameHi ?? a.villageName ?? a.areaText) : (a.villageName ?? a.areaText)) ?? '';
  const addressLabel = chosen ? [vName(chosen), chosen.line1].filter(Boolean).join(' · ') : (village?.name ?? null);
  return { lang, settings, home, villages, cart, me, addresses, addressId: chosen?.id ?? null, addressLabel };
});

/**
 * Where a staff member's own panel lives. Null for a customer (and for a signed-out visitor), so
 * the shortcut in the profile menu simply is not rendered for them.
 *
 * ⚠️ Presentation only, exactly like the redirect after login. Whether this person may open that
 * panel is decided by the guards on the API; a link is not access.
 */
export function staffHome(role: string | null | undefined): string | null {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'SUPERVISOR':
      return '/supervisor';
    case 'DELIVERY_BOY':
      return '/delivery';
    default:
      return null;
  }
}
