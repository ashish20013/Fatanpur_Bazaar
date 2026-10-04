import type { ReactNode } from 'react';

/** Page gutter + breathing room (the public shell itself is full-bleed for the home bands). */
export default function Layout({ children }: { children: ReactNode }): ReactNode {
  return <div className="fb-container pt-4 sm:pt-6">{children}</div>;
}
