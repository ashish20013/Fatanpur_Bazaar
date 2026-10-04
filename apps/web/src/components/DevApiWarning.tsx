import type { ReactNode } from 'react';
import { apiFailure } from '@/lib/api';

/**
 * Development-only: say out loud when the page is empty because the API did not answer.
 *
 * Every public block falls back to empty data so one failure cannot 500 the page. The side effect
 * is that a down API, an unmigrated database or an unseeded catalogue all look identical to a
 * finished site with nothing in it — no categories in the rail, no products, no error. Someone
 * running this for the first time has no way to tell "I forgot to start the API" from "the code
 * is broken".
 *
 * This renders nothing in production: a customer must never see plumbing.
 */
export function DevApiWarning(): ReactNode {
  if (process.env.NODE_ENV === 'production') return null;
  const fail = apiFailure();
  if (!fail) return null;
  return (
    <div role="status" className="border-b-2 border-danger bg-[#fdecea] px-4 py-3 text-ink">
      <p className="mx-auto max-w-[1280px] text-base">
        <strong className="text-danger">API से जवाब नहीं मिला</strong> — इसीलिए यह पन्ना ख़ाली दिख रहा है।{' '}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm">{fail.path}</code> → {fail.reason}
      </p>
      <p className="mx-auto mt-1 max-w-[1280px] text-sm text-ink-2">
        जाँचें: (1) दूसरे टर्मिनल में <code className="font-mono">npm run dev:api</code> चल रहा है?{' '}
        (2) <code className="font-mono">npm run db:migrate</code> और <code className="font-mono">npm run db:seed -- --demo</code> चल चुके हैं?{' '}
        (3) MySQL/MariaDB चालू है? · यह चेतावनी सिर्फ़ development में दिखती है।
      </p>
    </div>
  );
}
