/**
 * The website's half of the handshake with the API (the API's half is apps/api/src/common/edge.ts).
 *
 * Every shopper's request reaches the API through this server, so without help the API sees one
 * address for all of them and rate-limits the whole village as a single person. Two headers fix
 * it: the shopper's real address, and a secret proving it was this server that said so.
 *
 * ⚠️ SERVER ONLY. `EDGE_SECRET` is deliberately not `NEXT_PUBLIC_*`: a browser that knew it could
 * claim any address it liked and slip past every rate limit. Nothing in a client component may
 * import this file.
 */

const SECRET = process.env.EDGE_SECRET ?? '';

/*
 * Written out rather than imported from `node:net`, because this file is also used by the
 * middleware, and Next runs middleware on the Edge runtime where Node's modules do not exist.
 * Only the shape matters here: the API validates the address again with the real `isIP`.
 */
const V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const V6 = /^[0-9a-f:]{2,39}$/i;
function isIP(s: string): boolean {
  return V4.test(s) || (s.includes(':') && V6.test(s));
}

/**
 * How many proxies sit in front of this server and add to X-Forwarded-For. One on Hostinger (their
 * front proxy). If the shop ever goes behind a CDN as well, that is two.
 */
const HOPS = Math.max(1, Number(process.env.EDGE_TRUSTED_HOPS ?? '1') || 1);

/**
 * The shopper's address as this server received it.
 *
 * ⚠️ The RIGHT-hand end of X-Forwarded-For, counted back by the number of proxies we trust — not
 * the left. Each proxy appends what it saw, so the right end was written by our own hosting
 * proxy and the left end was written by whoever sent the request, which means anybody. Taking the
 * left would let a client name its own address with one header.
 */
export function clientIpFrom(h: Headers): string | null {
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((x) => x.trim()).filter(Boolean);
    const pick = parts[parts.length - HOPS];
    if (pick && isIP(pick.replace(/^::ffff:/, ''))) return pick.replace(/^::ffff:/, '');
  }
  const real = h.get('x-real-ip')?.trim().replace(/^::ffff:/, '');
  return real && isIP(real) ? real : null;
}

/**
 * Headers for a call to the API on behalf of a shopper (pass his address) or for this server's
 * own page cache (pass null — the API then knows it is us and does not count it against anybody).
 *
 * Empty when no secret is configured, which is the development set-up: the API ignores the
 * missing header and everything behaves exactly as it did before.
 */
export function edgeHeaders(clientIp: string | null): Record<string, string> {
  if (!SECRET) return {};
  return clientIp ? { 'x-fb-edge': SECRET, 'x-fb-client-ip': clientIp } : { 'x-fb-edge': SECRET };
}
