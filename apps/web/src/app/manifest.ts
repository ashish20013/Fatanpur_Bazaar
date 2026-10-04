import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/env';

/** PWA manifest — the owner's logo pack (round-square for "any", full-bleed square as maskable). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.nameHi} — ${BRAND.nameEn}`,
    short_name: BRAND.nameHi,
    description: 'रानीगंज, प्रतापगढ़ — किराना, फल-सब्ज़ी, मिठाई और ज़रूरी सामान घर तक',
    lang: 'hi-IN',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f2e9',
    theme_color: '#1c5735',
    categories: ['shopping', 'food'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
