'use client';

import type { ApiResponse } from '@fb/shared-types';

/**
 * Browser → apne hi origin ke BFF route handlers. ⚠️ Token yahan kabhi nahi aata —
 * route handler httpOnly cookie se token uthata hai (SECURITY_AUDIT §2).
 */
export class ClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly data?: Record<string, unknown>,
    readonly messageEn?: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ClientError';
  }
}

/** Human message for a caught error — English for the (English-only) staff panels. */
export function errText(e: unknown, lang: 'hi' | 'en' = 'hi'): string {
  if (e instanceof ClientError) return lang === 'en' ? (e.messageEn ?? e.message) : e.message;
  return lang === 'en' ? 'Something went wrong. Please retry.' : 'कुछ गड़बड़ हो गई — दोबारा कोशिश करें';
}

export interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
}

/** `path` = API ka path (e.g. "/cart/items"); BFF usi ko forward karta hai. */
export async function call<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-requested-with': 'fb-web' };
  if (opts.idempotencyKey) headers['x-idempotency-key'] = opts.idempotencyKey;
  const res = await fetch(`/api/bff${path.startsWith('/') ? path : `/${path}`}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json || json.ok !== true) {
    const err = json && json.ok === false ? json.error : null;
    throw new ClientError(err?.code ?? 'INTERNAL', err?.message ?? 'कुछ गड़बड़ हो गई', res.status, err?.data, err?.messageEn, err?.field);
  }
  return json.data;
}

/** Idempotency key — ek hi order do baar na bane (A14 §3). crypto.randomUUID har browser me hai. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Prefs (gaon, bhasha) cookies — 30 din (A8.4). */
export async function savePrefs(prefs: { village?: { id: number; name: string } | null; lang?: 'hi' | 'en'; addressId?: number | null }): Promise<void> {
  await fetch('/api/prefs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'fb-web' }, body: JSON.stringify(prefs), credentials: 'same-origin' });
}

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM: number;
}

/**
 * A8.3 niyam 2 — kharab GPS pe kabhi block nahi. Isliye ye function fail hone par
 * null deta hai (error nahi), aur caller village picker dikhata hai.
 */
export function getPosition(timeoutMs = 8000): Promise<GeoFix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy ?? 9999) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
