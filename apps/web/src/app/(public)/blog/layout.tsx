import type { ReactNode } from 'react';

/** Reading pages: gutter + a comfortable line length (~70 characters). */
export default function Layout({ children }: { children: ReactNode }): ReactNode {
  return <div className="fb-container pt-4 sm:pt-6"><div className="mx-auto max-w-3xl">{children}</div></div>;
}
