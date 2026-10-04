import type { ReactNode } from 'react';
import { BagBar } from '@/components/BagBar';
import { CallStrip } from '@/components/CallStrip';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { JsonLd } from '@/components/JsonLd';
import { DevApiWarning } from '@/components/DevApiWarning';
import { ErrorReporter } from '@/components/ErrorReporter';
import { AutoLocate } from '@/components/AutoLocate';
import { getShell, staffHome } from '@/lib/shell';
import { localBusinessLd, organizationLd, websiteLd } from '@/lib/seo';

/** Public shell: header (+ category rail) · page · bag bar · thin black footer. All SSR (SEO). */
export default async function PublicLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const s = await getShell();
  return (
    <>
      <ErrorReporter />
      <DevApiWarning />
      <Header
        lang={s.lang}
        roots={s.home.roots}
        addressLabel={s.addressLabel}
        addressId={s.addressId}
        isLoggedIn={Boolean(s.me)}
        userName={s.me?.name ?? null}
        staffHome={staffHome(s.me?.role)}
        supportPhone={s.settings.supportPhone}
        whatsapp={s.settings.whatsapp}
        deliveryWindow={s.settings.deliveryWindow}
        cartCount={s.cart?.itemCount ?? 0}
      />
      <AutoLocate lang={s.lang} hasAddress={Boolean(s.addressLabel)} />
      {/* The page body leaves room at the bottom for whatever is pinned there — the call/app strip
          (--fb-strip-h) and the bag bar (--fb-bag-h), both of which report their own height. So the
          last row of goods and its "खरीदें" button always clear the bars instead of hiding behind
          them, and there is no wasted gap when the bars are not shown. */}
      <main
        id="main"
        className="min-h-[60vh]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px + var(--fb-strip-h, 0px) + var(--fb-bag-h, 0px))' }}
      >
        {children}
      </main>
      <Footer lang={s.lang} credit={s.settings.credit} />
      <BagBar lang={s.lang} initial={s.cart} />
      <CallStrip lang={s.lang} supportPhone={s.settings.supportPhone} playStoreUrl={s.settings.playStoreUrl} />
      <JsonLd
        data={[
          organizationLd(s.settings.supportPhone),
          localBusinessLd({
            supportPhone: s.settings.supportPhone,
            openTime: s.settings.storeOpen,
            closeTime: s.settings.storeClose,
            villages: s.villages.map((v) => ({ name: v.nameHi ?? v.name, nameEn: v.name })),
          }),
          websiteLd(),
        ]}
      />
    </>
  );
}
