import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacSha256(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Constant-time string compare (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab); // keep timing similar
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** base64url(JSON) + '.' + HMAC — used for prescription file tokens (A21). */
export function signToken(data: Record<string, unknown>, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${hmacSha256(payload, secret)}`;
}

export function verifyToken<T>(token: string, secret: string): T | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, hmacSha256(payload, secret))) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
