import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/env';

/**
 * Public pages are open to every crawler, including the answer engines that quote shops when
 * someone asks where to buy online near Raniganj. Private areas (dashboards, bag, checkout,
 * login, API) are closed for everyone and also carry noindex.
 */
const PRIVATE = ['/mera', '/admin', '/supervisor', '/delivery', '/api', '/cart', '/checkout', '/login'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
