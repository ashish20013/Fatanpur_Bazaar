import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { LoginForm } from '@/components/LoginForm';
import { getMe, getSettings } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { safeNext } from '@/lib/safe-next';
import { buildMetadata } from '@/lib/seo';
import { currentLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'लॉगिन',
  description: 'फ़ोन नंबर और OTP से लॉगिन करें',
  path: '/login',
  noindex: true,
});

const HOME: Record<string, string> = {
  CUSTOMER: '/mera',
  ADMIN: '/admin',
  SUPERVISOR: '/supervisor',
  DELIVERY_BOY: '/delivery',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const [lang, me, , sp] = await Promise.all([currentLang(), getMe(), getSettings(), searchParams]);
  const t = dict(lang);
  const next = safeNext(sp.next);
  // Already logged in → straight to their own home (role comes from the backend).
  if (me) redirect(me.role === 'CUSTOMER' ? (next ?? '/mera') : (HOME[me.role] ?? '/'));

  return (
    <main
      id="main"
      className="grid min-h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] bg-paper lg:grid-cols-[1.05fr_1fr] lg:grid-rows-1"
    >
      {/* Brand side — emerald band with the gold wordmark (desktop), a short strip on phones. */}
      <aside className="fb-band relative flex flex-col justify-between px-6 py-6 text-white lg:px-12 lg:py-12">
        <Link href="/" className="inline-flex w-fit no-underline" aria-label={t.brand.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/wordmark-white.svg"
            alt={t.brand.name}
            width={185}
            height={70}
            className="h-12 w-auto lg:h-16"
          />
        </Link>
        <div className="hidden max-w-md lg:block">
          <p className="fb-display text-4xl leading-tight text-[#fbf4df]">{t.hero.title}</p>
          <ul className="mt-6 space-y-3 text-body text-em-100">
            {[
              { icon: 'scooter', text: t.auth.perk1 },
              { icon: 'cash-banknote', text: t.auth.perk2 },
              { icon: 'phone', text: t.auth.perk3 },
            ].map((p) => (
              <li key={p.icon} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-au-400/50 bg-em-900/40 text-au-300">
                  <Icon name={p.icon} size={18} />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="hidden text-sm text-em-100/80 lg:block">{t.foot.made}</p>
      </aside>

      <section className="flex items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-[420px] space-y-5">
          <div className="fb-card p-5 shadow-2 sm:p-7">
            <LoginForm lang={lang} next={next ?? undefined} />
          </div>
          {/* <p className="text-center text-sm text-ink-3">{t.auth.staffNote}</p> */}
          {/* {settings.supportPhone ? (
            <p className="text-center text-base text-ink-2">
              <a href={`tel:+91${settings.supportPhone}`} className="inline-flex items-center gap-1.5 font-semibold text-em-700 no-underline">
                <Icon name="phone" size={16} /> +91 {settings.supportPhone}
              </a>
            </p>
          ) : null} */}
          <p className="text-center">
            <Link href="/" className="inline-flex items-center gap-1 text-base text-ink-2">
              <Icon name="arrow-left" size={16} /> {t.nav.home}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
