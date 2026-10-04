import type { ReactNode } from 'react';
import { InventoryScreen } from '@/components/admin/screens';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Page(): Promise<ReactNode> {
  const lang = await staffLang();
  return <InventoryScreen lang={lang} />;
}
