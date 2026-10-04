import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_HOME, type Role } from '@fb/shared-types';
import { API_INTERNAL_URL, COOKIE_DOMAIN, IS_PROD } from '@/lib/env';
import { clientIpFrom, edgeHeaders } from '@/lib/edge';
import { AT_COOKIE, GUEST_COOKIE, RT_COOKIE } from '@/lib/session';

/**
 * Middleware do kaam karta hai:
 *  1. Access token expire hone par refresh (A4 rotation) — server components ko hamesha taaza token mile.
 *  2. Role ke hisaab se dashboard routing. ⚠️ Sirf UX — asli suraksha backend guards me hai (§8).
 * Aur guest cart key (X-Guest-Key) pehli visit pe bana deta hai.
 */
/**
 * Areas that belong to one role and nobody else. A signed-in person who lands on somebody else's
 * dashboard is sent to their own.
 *
 * ⚠️ `/mera` is deliberately NOT in this list. It is the customer's own account — orders, wallet,
 * addresses — and the shopkeeper, his admin and his delivery partners buy their groceries here
 * too. Gating it by role meant a staff member who chose "shop as a customer" at login was thrown
 * straight back into the admin panel the moment he opened his bag, with no way to see his own
 * order. It needs a signed-in person, not a particular role; what he may actually read there is
 * decided by ownership on the API, which has never depended on this list.
 */
const AREA_PREFIX: Record<string, Role> = {
  '/admin': 'ADMIN',
  '/supervisor': 'SUPERVISOR',
  '/delivery': 'DELIVERY_BOY',
};

/** Signed in is enough. */
const SIGNED_IN_ONLY = ['/mera'];

interface RefreshOut {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: number; role: Role };
}

function cookie(name: string, value: string, maxAge: number): Parameters<NextResponse['cookies']['set']>[0] {
  return {
    name,
    value,
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
}

/**
 * What a refresh attempt told us.
 *
 * ⚠️ Only `dead` may clear the refresh cookie. It used to be cleared on ANY failure — a refresh
 * that lost a race with another tab's refresh, a 429, the API restarting during a deploy — and
 * page loads, prefetches and background fetches race constantly. Whichever reply reached the
 * browser last decided whether the shopper stayed logged in. A 30-day login thrown away because
 * two requests left at the same instant is a bug the shopper experiences as "it keeps logging me
 * out", and he has no way to know why.
 */
type RefreshResult = { kind: 'ok'; out: RefreshOut } | { kind: 'dead' } | { kind: 'retry' };

async function refresh(token: string, clientIp: string | null): Promise<RefreshResult> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-platform': 'WEB', ...edgeHeaders(clientIp) },
      body: JSON.stringify({ refreshToken: token }),
      cache: 'no-store',
      // A hung API must not hang every page; on a timeout the shopper just carries on as a guest
      // for this one request and the next page tries again.
      signal: AbortSignal.timeout(5_000),
    });
    const json = (await res.json().catch(() => null)) as { ok: boolean; data?: RefreshOut; error?: { code?: string } } | null;
    if (res.ok && json?.ok && json.data) return { kind: 'ok', out: json.data };
    // Definite: the token is unknown, expired, revoked, or the account is switched off.
    const code = json?.error?.code;
    if ((res.status === 401 && code === 'UNAUTHENTICATED') || code === 'ACCOUNT_DISABLED') return { kind: 'dead' };
    // REFRESH_RACE, RATE_LIMITED, 5xx, anything unexpected: keep the cookie.
    return { kind: 'retry' };
  } catch {
    return { kind: 'retry' };
  }
}

/** JWT ka role claim sirf redirect decide karne ke liye (verify backend karta hai). */
function roleFromJwt(token: string): Role | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(
      Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { role?: Role };
    return json.role ?? null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  let access = req.cookies.get(AT_COOKIE)?.value ?? null;
  const refreshTok = req.cookies.get(RT_COOKIE)?.value ?? null;
  const setCookies: ReturnType<typeof cookie>[] = [];

  let refreshed: RefreshOut | null = null;
  if (!access && refreshTok) {
    const r = await refresh(refreshTok, clientIpFrom(req.headers));
    if (r.kind === 'ok') {
      refreshed = r.out;
      access = r.out.accessToken;
      setCookies.push(
        cookie(AT_COOKIE, r.out.accessToken, r.out.expiresIn),
        cookie(RT_COOKIE, r.out.refreshToken, 30 * 24 * 3600),
      );
    } else if (r.kind === 'dead') {
      setCookies.push(cookie(RT_COOKIE, '', 0));
    }
  }

  const under = (p: string): boolean => pathname === p || pathname.startsWith(`${p}/`);
  const guarded = Object.keys(AREA_PREFIX).find(under);
  const needsLogin = guarded ?? SIGNED_IN_ONLY.find(under);
  const role = needsLogin && access ? roleFromJwt(access) : null;
  /*
   * The layout cannot see the URL — a Next layout is handed no pathname — and the shell it has to
   * draw depends on WHERE you are, not on what you are: /mera is the customer account for
   * everyone, including the owner. So the path travels to it in a header.
   */
  const headers = new Headers(req.headers);
  headers.set('x-fb-path', pathname);
  /*
   * ⚠️ Hand the FRESH token to whatever runs after this, not just to the browser.
   *
   * Setting a cookie on the response reaches the browser on its next request. The request being
   * handled right now still carries the old, expired one — so the first tap after fifteen minutes
   * idle went to the API with no login at all. "खरीदें" quietly put the item in the guest bag
   * instead of the shopper's, and "ऑर्डर करें" answered "लॉगिन करें". Rewriting the cookie header
   * on the forwarded request makes the refresh take effect for this request too.
   */
  if (refreshed) {
    const jar = new Map<string, string>();
    for (const c of req.cookies.getAll()) jar.set(c.name, c.value);
    jar.set(AT_COOKIE, refreshed.accessToken);
    jar.set(RT_COOKIE, refreshed.refreshToken);
    headers.set('cookie', [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '));
  }
  let response = NextResponse.next({ request: { headers } });
  if (needsLogin && !role) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    response = NextResponse.redirect(url);
  } else if (guarded && role && role !== AREA_PREFIX[guarded]) {
    // Galat dashboard — apne ghar bhej do (ADMIN → /admin, rider → /delivery …)
    const url = req.nextUrl.clone();
    url.pathname = ROLE_HOME[role];
    url.search = '';
    response = NextResponse.redirect(url);
  }

  // Guest cart key — login se pehle cart isi se chalta hai, login pe merge ho jaata hai (A11).
  if (!req.cookies.get(GUEST_COOKIE)?.value) {
    response.cookies.set({
      name: GUEST_COOKIE,
      value: crypto.randomUUID(),
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 3600,
    });
  }

  for (const c of setCookies) {
    if (typeof c === 'string') response.headers.append('set-cookie', c);
    else response.cookies.set(c);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|uploads|robots.txt|sitemap.xml|manifest.webmanifest|sw.js).*)',
  ],
};
