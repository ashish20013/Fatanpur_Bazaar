'use client';

import { usePathname } from 'next/navigation';

/**
 * Which staff area this screen is being shown in — '/admin' or '/supervisor'.
 *
 * The same board and list components appear in both, and they used to link every order to
 * `/admin/orders/…`. The middleware sends a supervisor straight back out of `/admin`, so for him
 * every one of those links went nowhere. Links are built from the area he is actually in.
 */
export function useAreaBase(): '/admin' | '/supervisor' {
  const p = usePathname() ?? '';
  return p === '/supervisor' || p.startsWith('/supervisor/') ? '/supervisor' : '/admin';
}
