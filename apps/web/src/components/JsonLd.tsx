import type { ReactNode } from 'react';

/**
 * JSON-LD block. Data hamesha server pe banta hai aur JSON.stringify se escape hota hai —
 * `<` escape karna zaroori hai warna </script> injection ho sakta hai.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }): ReactNode {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
