'use client';

import { usePathname } from 'next/navigation';
import { ErrorScreen } from '@/components/ErrorScreen';

/** Dashboards: home is the person's own panel, not the shop front. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): React.ReactNode {
  const p = usePathname() ?? '';
  const home = p.startsWith('/admin') ? '/admin' : p.startsWith('/supervisor') ? '/supervisor' : p.startsWith('/delivery') ? '/delivery' : '/mera';
  return <ErrorScreen reset={reset} home={home} digest={error.digest} />;
}
