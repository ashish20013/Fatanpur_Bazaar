import type { ReactNode } from 'react';
import { PaymentsAdmin, type PendingPayments } from '@/components/admin/PaymentsAdmin';
import { authed, getMe } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** A17 — "अटके हुए भुगतान". यह पेज खाली होना चाहिए. */
export default async function Page(): Promise<ReactNode> {
  const [lang, me, data] = await Promise.all([staffLang(), getMe(), authed<PendingPayments>('/admin/payments/pending')]);
  const t = dict(lang);
  // ⚠️ verify सिर्फ़ payments.verify वाले को दिखे (पैसा प्लेटफ़ॉर्म के HDFC में आता है).
  const canVerify = me?.role === 'ADMIN' || (me?.permissions ?? []).includes('payments.verify');
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.payments}</h1>
      <PaymentsAdmin lang={lang} data={data} canVerify={canVerify} />
    </div>
  );
}
