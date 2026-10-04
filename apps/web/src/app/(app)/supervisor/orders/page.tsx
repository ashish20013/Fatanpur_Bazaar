import type { ReactNode } from 'react';
import { OrdersScreen } from '@/components/admin/screens';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const [lang, sp] = await Promise.all([staffLang(), searchParams]);
  return <OrdersScreen lang={lang} base="/supervisor" sp={sp} />;
}
