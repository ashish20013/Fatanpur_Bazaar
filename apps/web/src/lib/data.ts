import type { CartView, HomeResponse, MeResponse, VillageOption } from '@fb/shared-types';
import { api, safeApi } from './api';
import { accessToken, guestKey } from './session';

/**
 * Server components ka data layer. Public data ISR (revalidate 60) se aata hai;
 * user-specific data hamesha no-store.
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
  /** Header promise, e.g. "30–60 मिनट" (setting delivery_window_label). */
  deliveryWindow: string;
  /** Length of one timer phase in minutes (green, then the same again in yellow). */
  timerMinutes: number;
  defaultDistrict: string;
  defaultPincode: string;
  requireLocation: boolean;
  /** The thin strip under the header. The shopkeeper owns all of it from Settings. */
  strip: { enabled: boolean; imageUrl: string | null; title: string | null; subtitle: string | null };
  /** Footer credit line — name, e-mail and optional site, all editable from the admin panel. */
  credit: { name: string; email: string; url: string };
  /** Play Store link. Empty until the app is published, and an empty value hides the badge. */
  playStoreUrl: string;
  /** The advertising strip above the goods: whether it shows, and how long a slide holds. */
  banner: { enabled: boolean; seconds: number };
  raw: Record<string, string | null>;
}

const FALLBACK: Record<string, string | null> = {};

export async function getSettings(): Promise<PublicSettings> {
  const raw = await safeApi<Record<string, string | null>>('/content/settings', FALLBACK, 300);
  const s = (k: string, d = ''): string => raw[k] ?? d;
  return {
    supportPhone: s('support_phone'),
    whatsapp: s('whatsapp_number', s('support_phone')),
    deliveryFee: s('delivery_fee', '20.00'),
    minOrder: s('min_order', '99.00'),
    freeDeliveryAbove: s('free_delivery_above', '299.00'),
    storeOpen: s('store_open_time', '07:00'),
    storeClose: s('store_close_time', '21:00'),
    codEnabled: s('cod_enabled', '1') === '1',
    upiEnabled: s('upi_enabled', '1') === '1',
    deliveryWindow: s('delivery_window_label', '30–60 मिनट') || '30–60 मिनट',
    timerMinutes: Math.min(120, Math.max(5, Number(s('delivery_timer_minutes', '30')) || 30)),
    defaultDistrict: s('default_district', 'प्रतापगढ़') || 'प्रतापगढ़',
    defaultPincode: s('default_pincode', ''),
    requireLocation: s('require_location', '1') === '1',
    strip: {
      enabled: s('strip_enabled', '1') === '1',
      imageUrl: s('strip_image_url') || null,
      // Empty string is a deliberate choice ("no second line"), so only a MISSING key falls back.
      title: raw.strip_title === undefined ? null : s('strip_title'),
      subtitle: raw.strip_subtitle === undefined ? null : s('strip_subtitle'),
    },
    credit: {
      name: s('footer_credit_name', 'ASK Infotech') || 'ASK Infotech',
      email: s('footer_credit_email'),
      url: s('footer_credit_url'),
    },
    // Only honoured when the badge is switched on AND a real link is set — see Footer.tsx.
    playStoreUrl: s('app_badge_enabled', '1') === '1' ? s('playstore_url') : '',
    banner: {
      enabled: s('home_banner_enabled', '1') === '1',
      // Clamped again in the component; a stray 0 here must never become a flicker on the page.
      seconds: Math.min(30, Math.max(2, Number(s('home_banner_seconds', '5')) || 5)),
    },
    raw,
  };
}

export async function getHome(lang: 'hi' | 'en' = 'hi'): Promise<HomeResponse> {
  const h = await safeApi<Partial<HomeResponse>>(`/catalog/home${lang === 'en' ? '?lang=en' : ''}`, {}, 60);
  // Normalise: an older cached payload (or an API mid-deploy) must never crash the shell.
  return {
    banners: h.banners ?? [],
    verticals: h.verticals ?? [],
    featured: h.featured ?? [],
    popular: h.popular ?? [],
    categories: h.categories ?? [],
    roots: h.roots ?? [],
    sections: h.sections ?? [],
  };
}

export async function getVillages(): Promise<VillageOption[]> {
  const res = await safeApi<{ villages: VillageOption[] }>('/service-area/villages', { villages: [] }, 3600);
  return res.villages ?? [];
}

/** Cart guest key ya user token se — dono cookie me hain. */
export async function getCart(): Promise<CartView | null> {
  const [token, guest] = await Promise.all([accessToken(), guestKey()]);
  if (!token && !guest) return null;
  try {
    return await api<CartView>('/cart', { token, guestKey: guest });
  } catch {
    return null;
  }
}

export async function getMe(): Promise<MeResponse | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    return await api<MeResponse>('/auth/me', { token });
  } catch {
    return null;
  }
}

/** Authed GET — dashboard pages isi se data lete hain. */
export async function authed<T>(path: string): Promise<T> {
  const token = await accessToken();
  return api<T>(path, { token });
}
