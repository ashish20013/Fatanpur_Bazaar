import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import { safeEqual } from './utils/hash';

/**
 * Who is really on the other end of a request that arrived through the website.
 *
 * Shoppers never talk to this API directly. Their phone talks to the Next.js server, and the Next
 * server talks to us — so to this API, every shopper in every village has the same address: the
 * website's. Every rate limit here is keyed by address, which means they all shared ONE bucket.
 * The tenth person in fifteen minutes to ask for a login code was refused, a single search-engine
 * crawl of the sitemap was enough to start returning 429s to everybody, and the refresh limit
 * logged people out at random. On launch day that is an outage.
 *
 * The fix is a handshake. The website sends the shopper's real address in `x-fb-client-ip`
 * together with `x-fb-edge`, a secret only the two servers know. When the secret matches we use
 * that address; when it does not, the header is ignored and we fall back to the connecting
 * address exactly as before. ⚠️ Without the secret check this header would be a way for anyone to
 * pick their own rate-limit bucket — a fresh one on every request — so the check is the point.
 *
 * A request that carries the secret but NO client address is the website fetching something for
 * its own page cache (a product page being rebuilt, the sitemap). That is the shop's own server,
 * not a person, and it is not rate-limited by the per-address throttle: it makes at most one call
 * per page per minute, and counting it against a shopper would be counting nobody.
 */

export interface EdgeInfo {
  /** The secret matched: this request came from our own website server. */
  trusted: boolean;
  /** The shopper's address as the website saw it, when it sent one. */
  clientIp: string | null;
}

const KEY = Symbol.for('fb.edge');

export function edgeMiddleware(secret: string | undefined): (req: Request, _res: Response, next: NextFunction) => void {
  return (req, _res, next) => {
    let info: EdgeInfo = { trusted: false, clientIp: null };
    const sent = req.headers['x-fb-edge'];
    if (secret && typeof sent === 'string' && safeEqual(sent, secret)) {
      const raw = req.headers['x-fb-client-ip'];
      const ip = typeof raw === 'string' ? raw.trim().replace(/^::ffff:/, '') : '';
      // Only an actual address is accepted. Anything else is dropped rather than used as a
      // rate-limit key, so a malformed header cannot create an unbounded number of buckets.
      info = { trusted: true, clientIp: ip && isIP(ip) ? ip : null };
    }
    (req as unknown as Record<symbol, EdgeInfo>)[KEY] = info;
    next();
  };
}

export function edgeInfo(req: Request): EdgeInfo {
  return (req as unknown as Record<symbol, EdgeInfo | undefined>)[KEY] ?? { trusted: false, clientIp: null };
}
