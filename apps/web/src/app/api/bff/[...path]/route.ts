import { NextResponse, type NextRequest } from 'next/server';
import { API_INTERNAL_URL } from '@/lib/env';
import { clientIpFrom, edgeHeaders } from '@/lib/edge';
import { AT_COOKIE, GUEST_COOKIE } from '@/lib/session';

/**
 * BFF proxy: browser → yahan → API. Access token httpOnly cookie se lagta hai, isliye
 * token kabhi JS ke haath nahi aata (SECURITY_AUDIT §2).
 * ⚠️ Ye koi permission decide NAHI karta — asli gate API ke guards hain (§8).
 * CSRF: cookies SameSite=Lax hain aur JSON content-type + same-origin zaroori hai.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Kuch raaste sirf apne dedicated handler se jaayein (cookie set karte hain). */
const BLOCKED = [/^\/v1\/auth\/(otp|refresh|logout)/i, /^\/v1\/webhooks\//i];

/*
 * Body caps. The API enforces its own (1 MB JSON, 8 MB uploads), but by then this server has
 * already read the whole thing into memory — and that memory is outside the JS heap, so the
 * `--max-old-space-size` cap does not catch it. A single 300 MB POST took this process to a
 * gigabyte. On shared hosting that is the whole site down. So the cap is enforced here first.
 */
const MAX_JSON = 1 * 1024 * 1024;
const MAX_UPLOAD = 8 * 1024 * 1024;

/** A slow API must not hold a shopper's page open forever. Uploads get longer on 3G. */
const TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 30_000;

function refuse(status: number, code: string, msg: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message: msg } }, { status });
}

/**
 * Turn the catch-all segments into an API path, refusing anything that could step outside it.
 *
 * ⚠️ Next decodes each segment, so `%2F` arrives as a literal `/` INSIDE one segment — and
 * `x/..%2fauth/otp/verify` became `x/../auth/otp/verify`, which `new URL` then normalised past the
 * BLOCKED list straight to the OTP verify route. The same trick reached the payment webhook and
 * escaped `/v1` altogether. So every segment is checked on its own, and the BLOCKED list is
 * applied to the URL's final, normalised path — the thing that is actually requested.
 */
function apiUrl(path: string[]): URL | null {
  for (const seg of path) {
    if (!seg || seg === '.' || seg === '..' || /[/\\]/.test(seg) || seg.includes('\0')) return null;
  }
  const url = new URL(`${API_INTERNAL_URL}/v1/${path.map(encodeURIComponent).join('/')}`);
  if (!url.pathname.startsWith('/v1/')) return null;
  if (BLOCKED.some((re) => re.test(url.pathname))) return null;
  return url;
}

/** Read the body, stopping the moment it passes the cap instead of after it has all arrived. */
async function readCapped(req: NextRequest, max: number): Promise<ArrayBuffer | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > max) return null;
  if (!req.body) return new ArrayBuffer(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const url = apiUrl(path);
  if (!url) return refuse(403, 'FORBIDDEN', 'यह रास्ता यहाँ से नहीं');
  const method = req.method.toUpperCase();
  if (method !== 'GET' && req.headers.get('x-requested-with') !== 'fb-web') return refuse(403, 'FORBIDDEN', 'गलत अनुरोध');
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.append(k, v));

  const headers: Record<string, string> = {
    accept: req.headers.get('accept') ?? 'application/json',
    // Each shopper under his own address at the API, not all of them under this server's.
    ...edgeHeaders(clientIpFrom(req.headers)),
  };
  const token = req.cookies.get(AT_COOKIE)?.value;
  const guest = req.cookies.get(GUEST_COOKIE)?.value;
  if (token) headers.authorization = `Bearer ${token}`;
  if (guest) headers['x-guest-key'] = guest;
  const idem = req.headers.get('x-idempotency-key');
  if (idem) headers['x-idempotency-key'] = idem;

  // Multipart (prescription/product image upload) ko byte-for-byte aage bhejna hai;
  // JSON ke liye text hi kaafi hai.
  const ct = req.headers.get('content-type') ?? '';
  const isMultipart = ct.startsWith('multipart/form-data');
  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    const buf = await readCapped(req, isMultipart ? MAX_UPLOAD : MAX_JSON);
    if (!buf) return refuse(413, 'PAYLOAD_TOO_LARGE', isMultipart ? 'फ़ाइल बहुत बड़ी है — 8 MB तक ही चलेगी' : 'अनुरोध बहुत बड़ा है');
    if (buf.byteLength) {
      body = buf;
      headers['content-type'] = isMultipart ? ct : 'application/json';
    }
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(isMultipart ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS) });
  } catch (e) {
    const timedOut = (e as Error)?.name === 'TimeoutError';
    return refuse(timedOut ? 504 : 503, 'SERVICE_UNAVAILABLE', timedOut ? 'सर्वर जवाब देने में देर कर रहा है — थोड़ी देर में दोबारा कोशिश करें' : 'सर्वर से बात नहीं हो पा रही — थोड़ी देर में कोशिश करें');
  }
  const type = res.headers.get('content-type') ?? 'application/json';
  /*
   * Binary replies must pass through as bytes. Reading them with res.text() decodes them as UTF-8
   * and every byte that is not valid UTF-8 becomes U+FFFD — which is why the UPI QR arrived as a
   * broken-image icon: the PNG was mangled in transit, not missing. Only text is read as text.
   */
  if (!/^(application\/json|text\/|application\/xml)/i.test(type)) {
    return new NextResponse(await res.arrayBuffer(), {
      status: res.status,
      headers: { 'content-type': type, 'cache-control': 'private, no-store' },
    });
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': type, 'cache-control': 'no-store' },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path);
}
