import type { ReactNode } from 'react';
import { DeliveryBoard, type BoardData } from '@/components/admin/DeliveryBoard';
import { authed } from '@/lib/data';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Page(): Promise<ReactNode> {
  const [lang, board] = await Promise.all([staffLang(), authed<BoardData>('/admin/delivery/board')]);
  return <DeliveryBoard lang={lang} board={board} />;
}
