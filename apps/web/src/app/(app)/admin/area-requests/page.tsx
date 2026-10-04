import type { ReactNode } from 'react';
import { AreaRequests, type RequestGroup } from '@/components/admin/AreaRequests';
import { authed } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** A8.11 — यही तय करता है कि अगला ज़ोन कहाँ बनेगा. */
export default async function Page(): Promise<ReactNode> {
  const [lang, groups] = await Promise.all([staffLang(), authed<RequestGroup[]>('/admin/service-area/requests')]);
  const t = dict(lang);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.areaRequests}</h1>
      <AreaRequests lang={lang} groups={groups} />
    </div>
  );
}
