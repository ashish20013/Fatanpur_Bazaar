import type { ApiResponse, PageMeta } from '@fb/shared-types';
import { API_INTERNAL_URL } from './env';
import { clientIpFrom, edgeHeaders } from './edge';

/** A slow API must not hold every page open. Five seconds is already a very long page on 3G. */
const TIMEOUT_MS = 5_000;

/**
 * The shopper's address, read from this request's headers — but only for calls made on his behalf.
 *
 * ⚠️ Not for cached public reads. Next keys its fetch cache on the request headers, so a page
 * fetched with each visitor's address would be a different cache entry for every visitor and the
 * page cache would never hit. Those calls go with the edge secret alone: the API then knows it is
 * this server rebuilding a page, not a person, and does not count it against anybody.
 *
 * `next/headers` only works while rendering a request; outside one (a build, a cron) there is no
 * shopper, and null is the honest answer.
 */
async function shopperIp(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers');
    return clientIpFrom(await headers());
  } catch {
    return null;
  }
}

/**
 * Ek hi API client — server components, route handlers aur E2E sab isi se jaate hain.
 * ⚠️ Access token cookie se aata hai; client bundle me token kabhi nahi pahunchta
 * (browser se mutations /api/bff/* route handlers ke through jaati hain).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly hindi: string,
    readonly field?: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(`${code}: ${hindi}`);
    this.name = 'ApiError';
  }

  /** A8.4 — out-of-area ka data (servedAreas, distanceKm) sorry-screen ko chahiye. */
  get isOutOfArea(): boolean {
    return this.code === 'OUT_OF_SERVICE_AREA';
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  guestKey?: string | null;
  idempotencyKey?: string;
  /** ISR: seconds. 0 = always fresh (default for authed calls). */
  revalidate?: number;
  tags?: string[];
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

function buildHeaders(o: ApiOptions): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json', ...o.headers };
  if (o.body !== undefined && !(o.body instanceof FormData)) h['content-type'] = 'application/json';
  if (o.token) h.authorization = `Bearer ${o.token}`;
  if (o.guestKey) h['x-guest-key'] = o.guestKey;
  if (o.idempotencyKey) h['x-idempotency-key'] = o.idempotencyKey;
  return h;
}

/** Raw call — envelope unwrap + Hindi error. Never throws for network without context. */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = `${API_INTERNAL_URL}/v1${path.startsWith('/') ? path : `/${path}`}`;
  const cached = !opts.token && !opts.method && opts.revalidate !== undefined;
  const init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    method: opts.method ?? 'GET',
    headers: { ...buildHeaders(opts), ...edgeHeaders(cached ? null : await shopperIp()) },
    signal: opts.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  };
  if (opts.body !== undefined) init.body = opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body);
  if (cached) init.next = { revalidate: opts.revalidate, tags: opts.tags };
  else init.cache = 'no-store';

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'सर्वर से बात नहीं हो पा रही — थोड़ी देर में कोशिश करें', undefined, { cause: String(e) });
  }
  const text = await res.text();
  let json: ApiResponse<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as ApiResponse<T>) : null;
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.ok !== true) {
    const err = json && json.ok === false ? json.error : null;
    throw new ApiError(res.status, err?.code ?? 'INTERNAL', err?.message ?? 'कुछ गड़बड़ हो गई', err?.field, err?.data);
  }
  return json.data;
}

/** Paginated GET — meta (page/perPage/total) bhi chahiye hota hai. */
export async function apiPaged<T>(path: string, opts: ApiOptions = {}): Promise<Paged<T>> {
  const url = `${API_INTERNAL_URL}/v1${path.startsWith('/') ? path : `/${path}`}`;
  const cached = !opts.token && opts.revalidate !== undefined;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: { ...buildHeaders(opts), ...edgeHeaders(cached ? null : await shopperIp()) },
      cache: cached ? undefined : 'no-store',
      next: cached ? { revalidate: opts.revalidate, tags: opts.tags } : undefined,
      signal: opts.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit);
  } catch (e) {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'सर्वर से बात नहीं हो पा रही — थोड़ी देर में कोशिश करें', undefined, { cause: String(e) });
  }
  const json = (await res.json().catch(() => null)) as ApiResponse<T[]> | null;
  if (!json) throw new ApiError(res.status, 'INTERNAL', 'कुछ गड़बड़ हो गई');
  if (!res.ok || json.ok !== true) {
    const err = json.ok === false ? json.error : null;
    throw new ApiError(res.status, err?.code ?? 'INTERNAL', err?.message ?? 'कुछ गड़बड़ हो गई');
  }
  const meta: PageMeta = json.meta ?? { page: 1, perPage: json.data.length, total: json.data.length, hasMore: false };
  return { items: json.data, meta };
}

/** Public pages: ISR ke saath (revalidate 60) — SSR cost kam, SEO ke liye HTML ready. */
export function publicApi<T>(path: string, revalidate = 60, tags?: string[]): Promise<T> {
  return api<T>(path, { revalidate, tags });
}

/**
 * Never throws — one failing block must not 500 the whole public page.
 *
 * ⚠️ But it must not fail SILENTLY either. When the API is down or the database has not been
 * seeded, every block falls back to empty and the site renders a correct-looking shell with
 * nothing in it: no categories, no products, no explanation. That is the worst possible failure
 * for a shopkeeper running this himself — the page looks broken and says nothing. So: always log
 * the reason to the server console, and remember it so the page can say so in development.
 */
let lastApiFailure: { path: string; reason: string; at: number } | null = null;

export function apiFailure(): { path: string; reason: string; at: number } | null {
  // Only meaningful for a moment — a stale entry from an hour ago is noise.
  return lastApiFailure && Date.now() - lastApiFailure.at < 60_000 ? lastApiFailure : null;
}

export async function safeApi<T>(path: string, fallback: T, revalidate = 60): Promise<T> {
  try {
    return await publicApi<T>(path, revalidate);
  } catch (e) {
    const reason = e instanceof ApiError ? `${e.status} ${e.code}` : String((e as Error)?.message ?? e);
    lastApiFailure = { path, reason, at: Date.now() };
    console.error(`[fatanpur] API request failed: ${path} → ${reason}. Is the API running (npm run dev:api) and the database migrated + seeded?`);
    return fallback;
  }
}
