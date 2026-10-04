import { ERROR_CATALOG, formatMessage, type ErrorCode } from '@fb/shared-types';
import { CONFIG } from '../config';
import { hi } from '../i18n/hi';
import { TokenStore, getOrCreateDeviceId, type StoredTokens } from './storage';

/**
 * Thrown for every failed call. `messageHi` is always safe to show directly (either the
 * server's own Hindi message, or a local Hindi fallback for network/parse failures) —
 * screens never need a second translation step (§10 non-negotiable: Hindi-primary).
 */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK' | 'UNKNOWN',
    readonly status: number,
    readonly messageHi: string,
    readonly field?: string,
    readonly data?: Record<string, unknown>,
    readonly retryAfterSec?: number,
  ) {
    super(messageHi);
  }
}

interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}
export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}
interface Envelope<T> {
  ok: boolean;
  data?: T;
  meta?: PageMeta;
  error?: { code: ErrorCode; message: string; field?: string; data?: Record<string, unknown> };
}

// ───────────────────────── token state (memory + Keychain, never AsyncStorage) ─────────────────────────
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Fired once when a refresh attempt fails outright — AuthContext logs the user out on this. */
export function onUnauthorized(cb: Listener): () => void {
  unauthorizedListeners.add(cb);
  return () => unauthorizedListeners.delete(cb);
}

export async function setTokens(tokens: StoredTokens | null): Promise<void> {
  if (!tokens) {
    accessToken = null;
    refreshToken = null;
    await TokenStore.clear();
    return;
  }
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  await TokenStore.save(tokens);
}

/** Call once at app start, before rendering navigation — restores the session from Keychain. */
export async function restoreTokens(): Promise<boolean> {
  const t = await TokenStore.load();
  if (!t) return false;
  accessToken = t.accessToken;
  refreshToken = t.refreshToken;
  return true;
}

export function hasSession(): boolean {
  return accessToken !== null;
}

function uuidV4(): string {
  // Idempotency keys only need to be unique per device+action, not cryptographically random —
  // Math.random is fine; the shape must still match the server's UUID regex.
  const hex = (n: number): string => Math.floor(n).toString(16).padStart(2, '0');
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.map(hex).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
/** Exposed for order placement, which must send a fresh key per user tap (A14). */
export const newIdempotencyKey = uuidV4;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  isRetry?: boolean;
}

async function rawFetch(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (!opts.form) headers['Content-Type'] = 'application/json';
  if (!opts.skipAuth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  headers['X-Platform'] = 'ANDROID';
  headers['X-Device-Id'] = await getOrCreateDeviceId();
  return fetch(`${CONFIG.apiUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
}

async function doRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const deviceId = await getOrCreateDeviceId();
    const res = await rawFetch('/auth/refresh', { method: 'POST', body: { refreshToken, deviceId }, skipAuth: true });
    const json = (await res.json()) as Envelope<{ accessToken: string; refreshToken: string }>;
    if (!res.ok || !json.ok || !json.data) return false;
    await setTokens({ accessToken: json.data.accessToken, refreshToken: json.data.refreshToken });
    return true;
  } catch {
    return false;
  }
}

/** Single-flight: concurrent 401s all await the SAME refresh call instead of racing it. */
async function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) refreshInFlight = doRefresh().finally(() => (refreshInFlight = null));
  return refreshInFlight;
}

function toApiError(status: number, json: Envelope<unknown> | null, retryAfterSec?: number): ApiError {
  if (json?.error) {
    const entry = ERROR_CATALOG[json.error.code] as { hi: string } | undefined;
    const messageHi = json.error.message || (entry ? entry.hi : hi.common.somethingWrong);
    return new ApiError(json.error.code, status, messageHi, json.error.field, json.error.data, retryAfterSec);
  }
  return new ApiError('UNKNOWN', status, hi.common.somethingWrong, undefined, undefined, retryAfterSec);
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await rawFetch(path, opts);
  } catch {
    throw new ApiError('NETWORK', 0, hi.common.noInternet);
  }
  if (res.status === 401 && !opts.skipAuth && !opts.isRetry) {
    const ok = await refreshOnce();
    if (ok) return request<T>(path, { ...opts, isRetry: true });
    accessToken = null;
    refreshToken = null;
    await TokenStore.clear();
    unauthorizedListeners.forEach((cb) => cb());
    throw new ApiError('UNAUTHENTICATED', 401, ERROR_CATALOG.UNAUTHENTICATED.hi);
  }
  const retryAfterHeader = res.headers.get('Retry-After');
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // no body (e.g. some 5xx from a proxy) — fall through to the generic error below
  }
  if (!res.ok || !json?.ok) throw toApiError(res.status, json, retryAfterSec);
  return json.data as T;
}

async function requestPaged<T>(path: string, opts: RequestOptions = {}): Promise<Paged<T>> {
  let res: Response;
  try {
    res = await rawFetch(path, opts);
  } catch {
    throw new ApiError('NETWORK', 0, hi.common.noInternet);
  }
  if (res.status === 401 && !opts.isRetry) {
    const ok = await refreshOnce();
    if (ok) return requestPaged<T>(path, { ...opts, isRetry: true });
    unauthorizedListeners.forEach((cb) => cb());
    throw new ApiError('UNAUTHENTICATED', 401, ERROR_CATALOG.UNAUTHENTICATED.hi);
  }
  const json = (await res.json().catch(() => null)) as Envelope<T[]> | null;
  if (!res.ok || !json?.ok) throw toApiError(res.status, json);
  return { items: json.data ?? [], meta: json.meta ?? { page: 1, perPage: json.data?.length ?? 0, total: json.data?.length ?? 0, hasMore: false } };
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) => request<T>(path, { headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'POST', body, headers }),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'PUT', body, headers }),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'PATCH', body, headers }),
  delete: <T>(path: string, headers?: Record<string, string>) => request<T>(path, { method: 'DELETE', headers }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', form }),
  paged: <T>(path: string, query: Record<string, string | number | boolean | undefined> = {}) => requestPaged<T>(`${path}${qs(query)}`),
  qs,
  formatError: formatMessage,
};

export function accessTokenValue(): string | null {
  return accessToken;
}
