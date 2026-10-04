import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'पन्ना नहीं मिला — फतनपुर बाज़ार', robots: { index: false, follow: false } };

/**
 * One 404 for the whole site, in the shop's own words.
 *
 * Several paths fell through to Next's built-in page — unstyled, English, no way back — including
 * a mistyped order number in a customer's own account. A wrong link should still feel like the
 * same shop, and should always offer the way to the goods.
 */
export default function NotFound(): React.ReactNode {
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="fb-display text-2xl text-ink">यह पन्ना नहीं मिला</h1>
      <p className="text-base text-ink-2">
        शायद पता बदल गया है या सामान अब नहीं है।
        <span className="mt-1 block text-sm text-ink-3">This page could not be found.</span>
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className="inline-flex h-11 items-center rounded-full bg-em-700 px-5 text-body font-semibold text-white no-underline">
          सामान देखें
        </Link>
        <Link href="/khoj" className="inline-flex h-11 items-center rounded-full border border-line-2 bg-card px-5 text-body font-semibold text-em-800 no-underline">
          खोजें
        </Link>
      </div>
    </main>
  );
}
