'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * What a person sees when a page could not be built — a slow or restarting server, a permission
 * the owner just took away, a fetch that failed.
 *
 * Without it Next shows its own "Application error: a client-side exception has occurred", in
 * English, with no way back: a rider whose earnings panel failed to load lost his whole delivery
 * screen, and a supervisor whose `reports.view` was removed could not open his own landing page.
 * This keeps the person somewhere: what happened in both languages, a retry, and a way home.
 */
export function ErrorScreen({ reset, home = '/', digest }: { reset?: () => void; home?: string; digest?: string }): React.ReactNode {
  useEffect(() => {
    // The server already logged the real error; this records that somebody actually hit it.
    try {
      void fetch('/api/bff/_client-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'fb-web' },
        body: JSON.stringify({ message: 'error boundary shown', digest: digest ?? null, path: window.location.pathname }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* reporting must never itself become the error */
    }
  }, [digest]);

  return (
    <main id="main" className="fb-container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-12 text-center">
      <h1 className="fb-display text-2xl text-ink">यह पन्ना अभी नहीं खुल पाया</h1>
      <p className="max-w-md text-base text-ink-2">
        सर्वर से जवाब नहीं मिला। थोड़ी देर में दोबारा कोशिश करें — आपका ऑर्डर और खाता सुरक्षित है।
        <span className="mt-1 block text-sm text-ink-3">This page could not be loaded. Please try again in a moment.</span>
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {reset ? (
          <button type="button" onClick={reset} className="h-11 rounded-full bg-em-700 px-5 text-body font-semibold text-white">
            दोबारा कोशिश करें
          </button>
        ) : null}
        <Link href={home} className="inline-flex h-11 items-center rounded-full border border-line-2 bg-card px-5 text-body font-semibold text-em-800 no-underline">
          होम पर जाएं
        </Link>
      </div>
      {digest ? <p className="text-xs text-ink-3">Ref: {digest}</p> : null}
    </main>
  );
}
