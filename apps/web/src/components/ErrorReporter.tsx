'use client';

import { useEffect } from 'react';

/**
 * Sends browser errors to the server so they land in the same problems.log the server writes.
 *
 * Most of what breaks on this site breaks on a phone in a village — an old Android WebView, a fetch
 * that dies on 3G, a script that throws only at 320 px. None of that reaches the server by itself,
 * so a test session used to produce a log with a hole in exactly the half being tested.
 *
 * Three habits keep it from becoming noise or a nuisance:
 *   • the same message is sent once per page, so a render loop cannot post a thousand times;
 *   • at most a handful per page in total;
 *   • it never reports its own failure — a POST that fails is dropped in silence, because the one
 *     thing worse than a lost error is an error loop that reports itself.
 */
const MAX_PER_PAGE = 5;

export function ErrorReporter(): null {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;

    const post = (body: Record<string, unknown>): void => {
      const key = String(body.message ?? '') + String(body.source ?? '');
      if (seen.has(key) || sent >= MAX_PER_PAGE) return;
      seen.add(key);
      sent++;
      // keepalive so the report still goes out if the error happens as the page is navigating away.
      void fetch('/api/bff/_client-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'fb-web' },
        body: JSON.stringify({ ...body, url: location.pathname + location.search }),
        keepalive: true,
      }).catch(() => {
        /* reporting must never itself raise */
      });
    };

    const onError = (e: ErrorEvent): void => {
      post({
        kind: 'error',
        message: e.message || 'script error',
        source: e.filename || undefined,
        line: Number.isFinite(e.lineno) ? e.lineno : undefined,
        stack: e.error instanceof Error ? e.error.stack?.slice(0, 2000) : undefined,
      });
    };
    const onRejection = (e: PromiseRejectionEvent): void => {
      const r = e.reason as unknown;
      post({
        kind: 'unhandledrejection',
        message: r instanceof Error ? r.message : String(r).slice(0, 300),
        stack: r instanceof Error ? r.stack?.slice(0, 2000) : undefined,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
