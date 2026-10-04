import { NextResponse, type NextRequest } from 'next/server';
import { IS_PROD } from '@/lib/env';
import { isLang, LANG_COOKIE } from '@/lib/i18n';
import { ADDRESS_COOKIE, VILLAGE_COOKIE } from '@/lib/session';

/** Gaon + bhasha ki prefs — 30 din (A8.4 / §19). Koi secret nahi, isliye httpOnly nahi. */
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Same CSRF rule as the BFF: a cross-site form cannot set this header or a JSON content type.
  if (req.headers.get('x-requested-with') !== 'fb-web' || !(req.headers.get('content-type') ?? '').startsWith('application/json')) {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'गलत अनुरोध' } }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { village?: { id: number; name: string } | null; lang?: string; addressId?: number | null };
  const out = NextResponse.json({ ok: true, data: { saved: true } });
  const base = { path: '/', sameSite: 'lax' as const, secure: IS_PROD, maxAge: 30 * 24 * 3600 };

  if (body.village === null) out.cookies.set({ name: VILLAGE_COOKIE, value: '', ...base, maxAge: 0 });
  else if (body.village && typeof body.village.id === 'number' && typeof body.village.name === 'string') {
    const v = encodeURIComponent(JSON.stringify({ id: body.village.id, name: body.village.name.slice(0, 60) }));
    out.cookies.set({ name: VILLAGE_COOKIE, value: v, ...base });
  }
  // Which saved address the header shows / checkout pre-selects. Only an id — ownership is still
  // checked by the API on every quote/order, so a tampered cookie can't reach anyone else's address.
  if (body.addressId === null) out.cookies.set({ name: ADDRESS_COOKIE, value: '', ...base, maxAge: 0 });
  else if (typeof body.addressId === 'number' && Number.isInteger(body.addressId) && body.addressId > 0) {
    out.cookies.set({ name: ADDRESS_COOKIE, value: String(body.addressId), ...base, httpOnly: true });
  }
  if (isLang(body.lang)) out.cookies.set({ name: LANG_COOKIE, value: body.lang, ...base, maxAge: 365 * 24 * 3600 });
  return out;
}
