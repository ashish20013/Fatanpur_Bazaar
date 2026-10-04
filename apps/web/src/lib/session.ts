import { cookies } from 'next/headers';
import type { AuthResponse, MeResponse } from '@fb/shared-types';
import { api, ApiError } from './api';
import { COOKIE_DOMAIN, IS_PROD } from './env';
import { DEFAULT_LANG, isLang, LANG_COOKIE, type Lang } from './i18n';

/**
 * Web auth = BFF pattern. Dono token httpOnly cookies me rehte hain (isi domain pe);
 * ⚠️ localStorage me token KABHI nahi (SECURITY_AUDIT §2). Browser JS token ko chhoo bhi nahi sakta.
 */
export const AT_COOKIE = 'fb_at';
export const RT_COOKIE = 'fb_rt';
export const GUEST_COOKIE = 'fb_guest';
export const AREA_COOKIE = 'fb_area';
export const VILLAGE_COOKIE = 'fb_village';
export const ADDRESS_COOKIE = 'fb_addr';

export interface CookieOut {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax';
    path: string;
    maxAge: number;
    domain?: string;
  };
}

function cookieOpts(maxAge: number, httpOnly = true): CookieOut['options'] {
  return { httpOnly, secure: IS_PROD, sameSite: 'lax', path: '/', maxAge, ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}) };
}

/** Cookies jo login/refresh ke baad set karni hain (route handler inhe response pe lagata hai). */
export function sessionCookies(auth: AuthResponse): CookieOut[] {
  const out: CookieOut[] = [{ name: AT_COOKIE, value: auth.accessToken, options: cookieOpts(auth.expiresIn ?? 900) }];
  if (auth.refreshToken) out.push({ name: RT_COOKIE, value: auth.refreshToken, options: cookieOpts(30 * 24 * 3600) });
  return out;
}

export function clearedCookies(): CookieOut[] {
  return [
    { name: AT_COOKIE, value: '', options: cookieOpts(0) },
    { name: RT_COOKIE, value: '', options: cookieOpts(0) },
  ];
}

/** Server component se access token padhna. */
export async function accessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(AT_COOKIE)?.value ?? null;
}

export async function guestKey(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(GUEST_COOKIE)?.value ?? null;
}

export async function currentLang(): Promise<Lang> {
  const jar = await cookies();
  const v = jar.get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

/**
 * Owner's rule: ADMIN / SUPERVISOR / DELIVERY panels are English-only (customers keep Hindi by
 * default). Every staff page asks for its language here, so it can never flip to Hindi.
 */
export async function staffLang(): Promise<Lang> {
  return 'en';
}

/** 30 din ka chuna hua gaon (A8.4) — homepage strip aur address form isse pre-fill hote hain. */
export async function savedVillage(): Promise<{ id: number; name: string } | null> {
  const jar = await cookies();
  const raw = jar.get(VILLAGE_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as { id: number; name: string };
    return typeof v?.id === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** Address the customer picked in the header ("यहीं डिलीवर करें"). */
export async function savedAddressId(): Promise<number | null> {
  const jar = await cookies();
  const n = Number(jar.get(ADDRESS_COOKIE)?.value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * ⚠️ Ye sirf UX hai — asli suraksha backend guards me hai (§8).
 * Token invalid ho to null; middleware refresh kar chuka hota hai.
 */
export async function currentUser(): Promise<MeResponse | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    return await api<MeResponse>('/auth/me', { token });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

export { cookieOpts };
