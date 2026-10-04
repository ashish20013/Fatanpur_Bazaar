/**
 * ⚠️ output: 'standalone' — Hostinger deploy me poora node_modules kabhi nahi jaata
 * (HOSTING_CAPACITY: .next/standalone = 56 MB / 2,096 files vs 300 MB+ with node_modules).
 * ⚠️ next build ka peak ~849 MB hai — CI me do build kabhi parallel mat chalana.
 */
const isProd = process.env.NODE_ENV === 'production';

/**
 * Security headers (SECURITY_AUDIT §5) on every response.
 * CSP: scripts only from our own origin — Next's App Router needs inline bootstrap scripts, so
 * 'unsafe-inline' stays for script-src (a nonce would force every page dynamic and kill ISR);
 * the real XSS defence is server-side sanitising of all stored HTML. Everything else is locked:
 * no plugins, no framing, no foreign forms, images/tiles/API only from known origins.
 */
function origin(u) {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
}
const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL || '');
const wsOrigin = apiOrigin.replace(/^http/, 'ws');
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://tile.openstreetmap.org ${apiOrigin}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin} ${wsOrigin}${isProd ? '' : ' ws://localhost:* http://localhost:*'}`.trim(),
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  ...(isProd ? ['upgrade-insecure-requests'] : []),
].join('; ');
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Location for the address form, microphone for voice search — our own pages only.
  { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(self), camera=(), payment=(), usb=()' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Keep Next's fetch/ISR cache on disk, not in the Node heap: on shared hosting every MB of RSS
  // counts (HOSTING_CAPACITY — 4 Node apps in 3 GB). Disk reads of a few KB are cheap.
  cacheMaxMemorySize: 0,
  productionBrowserSourceMaps: false,
  eslint: { ignoreDuringBuilds: true },
  images: {
    // Sab images upload pe hi resize ho chuki hain (A27) — request-time resize kabhi nahi.
    unoptimized: true,
  },
  experimental: {
    // Sirf jo chahiye wahi bundle me aaye (First Load JS budget 110 KB).
    optimizePackageImports: ['@fb/shared-types'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The sprite URL carries a content hash (?v=…), so browsers may keep it for a year.
      { source: '/icons/sprite.svg', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
  async rewrites() {
    /*
     * Uploads and the socket live on the API; these keep them same-origin for the browser.
     *
     * ⚠️ Not dev-only any more. Pictures are requested as plain `/uploads/...` so they resolve on
     * whatever host the visitor used (a phone on the LAN, the real domain, the PC). If the hosting
     * layer already routes /uploads to the API these rewrites never see the request; if it does
     * not, Next proxies it and the pictures still appear. Correct either way, instead of depending
     * on a proxy rule nobody remembers to add.
     */
    const api = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';
    return [
      { source: '/uploads/:path*', destination: `${api}/uploads/:path*` },
      { source: '/socket/:path*', destination: `${api}/socket/:path*` },
    ];
  },
};

module.exports = nextConfig;
