import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { api } from '../services/api';

/**
 * The shop's own settings, read from the API — the same `/content/settings` the website reads in
 * `apps/web/src/lib/data.ts getSettings()`, with the same keys and the same defaults.
 *
 * ⚠️ Why this exists: the app used to hard-code the delivery window, the minimum order, the
 * delivery fee and whether UPI was accepted. The shopkeeper changes those in the admin panel —
 * so the website would start saying "डिलीवरी मुफ़्त" while the app still said ₹20, and turning UPI
 * off would stop the website offering it while the app happily sent customers to a closed
 * payment route. Everything the owner can switch has to be read, never assumed.
 *
 * Failure is quiet on purpose: if the call fails the defaults below are the same ones the
 * website falls back to, so the shop still works on a bad connection.
 */
export interface PublicSettings {
  supportPhone: string;
  whatsapp: string;
  deliveryFee: string;
  minOrder: string;
  freeDeliveryAbove: string;
  storeOpen: string;
  storeClose: string;
  codEnabled: boolean;
  upiEnabled: boolean;
  /** The header's promise, e.g. "30–60 मिनट". */
  deliveryWindow: string;
  timerMinutes: number;
  defaultDistrict: string;
  defaultPincode: string;
  /** When on, an address needs a GPS fix or written directions before it can be saved. */
  requireLocation: boolean;
  /** The advertising strip above the goods: off until the owner switches it on. */
  bannerEnabled: boolean;
  /** How long one banner holds before the next, in seconds (the website clamps 2–30). */
  bannerSeconds: number;
  serviceRadiusKm: number;
  reviewsEnabled: boolean;
  showUpcomingCategories: boolean;
  acceptOrdersWhenClosed: boolean;
}

export const DEFAULT_SETTINGS: PublicSettings = {
  supportPhone: '',
  whatsapp: '',
  deliveryFee: '20.00',
  minOrder: '99.00',
  freeDeliveryAbove: '299.00',
  storeOpen: '07:00',
  storeClose: '21:00',
  codEnabled: true,
  upiEnabled: true,
  deliveryWindow: '30–60 मिनट',
  timerMinutes: 30,
  defaultDistrict: 'प्रतापगढ़',
  defaultPincode: '',
  requireLocation: true,
  bannerEnabled: false,
  bannerSeconds: 5,
  serviceRadiusKm: 6,
  reviewsEnabled: true,
  showUpcomingCategories: true,
  acceptOrdersWhenClosed: false,
};

function parse(raw: Record<string, string | null>): PublicSettings {
  const s = (k: string, d = ''): string => raw[k] ?? d;
  const num = (k: string, d: number): number => {
    const n = Number(s(k, ''));
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    supportPhone: s('support_phone'),
    whatsapp: s('whatsapp_number', s('support_phone')),
    deliveryFee: s('delivery_fee', DEFAULT_SETTINGS.deliveryFee),
    minOrder: s('min_order', DEFAULT_SETTINGS.minOrder),
    freeDeliveryAbove: s('free_delivery_above', DEFAULT_SETTINGS.freeDeliveryAbove),
    storeOpen: s('store_open_time', DEFAULT_SETTINGS.storeOpen),
    storeClose: s('store_close_time', DEFAULT_SETTINGS.storeClose),
    codEnabled: s('cod_enabled', '1') === '1',
    upiEnabled: s('upi_enabled', '1') === '1',
    deliveryWindow: s('delivery_window_label', DEFAULT_SETTINGS.deliveryWindow) || DEFAULT_SETTINGS.deliveryWindow,
    timerMinutes: Math.min(120, Math.max(5, num('delivery_timer_minutes', DEFAULT_SETTINGS.timerMinutes))),
    defaultDistrict: s('default_district', DEFAULT_SETTINGS.defaultDistrict) || DEFAULT_SETTINGS.defaultDistrict,
    defaultPincode: s('default_pincode'),
    requireLocation: s('require_location', '1') === '1',
    bannerEnabled: s('home_banner_enabled', '0') === '1',
    bannerSeconds: Math.min(30, Math.max(2, num('home_banner_seconds', DEFAULT_SETTINGS.bannerSeconds))),
    serviceRadiusKm: num('service_radius_km', DEFAULT_SETTINGS.serviceRadiusKm),
    reviewsEnabled: s('reviews_enabled', '1') === '1',
    showUpcomingCategories: s('show_upcoming_categories', '1') === '1',
    acceptOrdersWhenClosed: s('accept_orders_when_closed', '0') === '1',
  };
}

const SettingsContext = createContext<PublicSettings>(DEFAULT_SETTINGS);

export function useSettings(): PublicSettings {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_SETTINGS);

  const load = useCallback(async () => {
    try {
      setSettings(parse(await api.get<Record<string, string | null>>('/content/settings')));
    } catch {
      // The defaults above match the website's own fallbacks — the shop keeps working.
    }
  }, []);

  useEffect(() => {
    void load();
    // The shopkeeper may change a price or close UPI while the app sits in a pocket.
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  const value = useMemo(() => settings, [settings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
