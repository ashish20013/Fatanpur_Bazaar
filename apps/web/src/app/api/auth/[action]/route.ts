import { NextResponse, type NextRequest } from 'next/server';
import type { AuthResponse, OtpSendResponse } from '@fb/shared-types';
import { API_INTERNAL_URL } from '@/lib/env';
import { clientIpFrom, edgeHeaders } from '@/lib/edge';
import { AT_COOKIE, GUEST_COOKIE, RT_COOKIE, clearedCookies, sessionCookies } from '@/lib/session';

/**
 * Auth ke teen raaste — inhe alag rakha hai kyunki yahi cookies set/clear karte hain.
 * ⚠️ OTP ya token kabhi response body me client tak nahi bheja jaata: sirf cookie.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['otp-send', 'otp-verify', 'logout']);

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; field?: string; data?: Record<string, unknown> };
}

/*
 * ⚠️ The shopper's own address goes with every one of these. The OTP limits — three codes per
 * phone and ten per address in fifteen minutes — are the ones that matter most, and before this
 * every person in every village arrived at the API as this one server: the eleventh shopper to ask
 * for a login code in a quarter of an hour was refused, whoever he was.
 */
async function callApi<T>(path: string, body: unknown, clientIp: string | null, token?: string): Promise<{ status: number; json: ApiEnvelope<T> }> {
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/v1${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-platform': 'WEB',
        ...edgeHeaders(clientIp),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
      // OTP delivery waits on the SMS/WhatsApp provider, which can itself take ten seconds.
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // A dropped connection or a timeout must answer in Hindi, not crash the route into a bare 500.
    return { status: 503, json: { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'सर्वर से बात नहीं हो पा रही — थोड़ी देर में कोशिश करें' } } };
  }
  const json = (await res.json().catch(() => ({ ok: false }))) as ApiEnvelope<T>;
  return { status: res.status, json };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }): Promise<NextResponse> {
  const { action } = await ctx.params;
  if (!ACTIONS.has(action)) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'नहीं मिला' } }, { status: 404 });
  if (req.headers.get('x-requested-with') !== 'fb-web') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'गलत अनुरोध' } }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ip = clientIpFrom(req.headers);

  if (action === 'otp-send') {
    const { status, json } = await callApi<OtpSendResponse>('/auth/otp/send', body, ip);
    return NextResponse.json(json, { status });
  }

  if (action === 'otp-verify') {
    const { status, json } = await callApi<AuthResponse>('/auth/otp/verify', { ...body, platform: 'WEB' }, ip);
    if (!json.ok || !json.data) return NextResponse.json(json, { status });
    const auth = json.data;
    // Token cookie me; client ko sirf user + redirect milta hai.
    const out = NextResponse.json({ ok: true, data: { user: auth.user, redirect: auth.redirect, isNewUser: auth.isNewUser } });
    for (const c of sessionCookies(auth)) out.cookies.set({ name: c.name, value: c.value, ...c.options });
    // A11 — guest cart login ke turant baad merge hota hai.
    const guest = req.cookies.get(GUEST_COOKIE)?.value;
    if (guest) {
      await fetch(`${API_INTERNAL_URL}/v1/cart/merge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.accessToken}`, 'x-guest-key': guest, ...edgeHeaders(ip) },
        body: '{}',
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      }).catch(() => undefined);
    }
    return out;
  }

  const token = req.cookies.get(AT_COOKIE)?.value;
  const refreshToken = req.cookies.get(RT_COOKIE)?.value;
  if (token) await callApi('/auth/logout', { refreshToken }, ip, token).catch(() => undefined);
  const out = NextResponse.json({ ok: true, data: { loggedOut: true } });
  for (const c of clearedCookies()) out.cookies.set({ name: c.name, value: c.value, ...c.options });
  return out;
}
