import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { SITE_URL } from '@/lib/env';
import { currentLang } from '@/lib/session';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'फतनपुर बाज़ार — रानीगंज में किराना, सब्ज़ी घर तक', template: '%s' },
  description:
    'फतनपुर बाज़ार (रानीगंज, प्रतापगढ़) से आसपास के गाँवों में 30–60 मिनट में होम डिलीवरी — किराना, फल-सब्ज़ी, मिठाई, कपड़े, बिजली का सामान, डॉक्टर और भाड़ा गाड़ी। कैश ऑन डिलीवरी और UPI।',
  applicationName: 'फतनपुर बाज़ार',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: { images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'फतनपुर बाज़ार — गाँव का अपना बाज़ार, अब घर तक' }] },
  formatDetection: { telephone: true },
  other: { 'geo.region': 'IN-UP', 'geo.placename': 'Raniganj, Pratapgarh' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1c5735',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const lang = await currentLang();
  return (
    <html lang={lang} dir="ltr">
      <head>
        {/* LCP: only the Devanagari body face is preloaded (headings use font-display: optional). */}
        <link rel="preload" href="/fonts/mukta-deva-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[80] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-em-700">
          {lang === 'hi' ? 'मुख्य सामग्री पर जाएं' : 'Skip to content'}
        </a>
        {children}
      </body>
    </html>
  );
}
