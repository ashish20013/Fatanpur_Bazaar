'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';

interface Item {
  href: string;
  icon: string;
  label: string;
  external?: boolean;
}

/**
 * Profile icon → everything personal in one place: orders, address book, bag, help, logout —
 * and, below a divider, the compliance pages.
 *
 * Those pages used to sit in a row of small grey links across the footer. Nobody scrolls a shop to
 * the bottom to read a refund policy; they look for it where their own account lives. Keeping them
 * here also means they exist on every screen rather than only at the end of one.
 */
export function ProfileMenu({
  lang,
  userName,
  isLoggedIn,
  staffHome = null,
  supportPhone,
  whatsapp,
}: {
  lang: Lang;
  userName: string | null;
  isLoggedIn: boolean;
  staffHome?: string | null;
  supportPhone: string;
  whatsapp: string;
}): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items: Item[] = isLoggedIn
    ? [
        { href: '/mera/orders', icon: 'package', label: t.menu.orders },
        { href: '/mera/addresses', icon: 'address-book', label: t.menu.addresses },
        { href: '/cart', icon: 'shopping-bag', label: t.menu.bag },
        { href: '/mera/wallet', icon: 'wallet', label: t.menu.wallet },
        { href: '/mera/notifications', icon: 'bell', label: t.menu.notifications },
        { href: '/mera/profile', icon: 'user-circle', label: t.menu.profile },
        { href: '/contact', icon: 'headset', label: t.menu.support },
      ]
    : [
        { href: '/cart', icon: 'shopping-bag', label: t.menu.bag },
        { href: '/contact', icon: 'headset', label: t.menu.support },
      ];

  // Legal and policy pages. Separated from the personal items above by a divider: they belong to
  // the shop, not to the shopper, and mixing them into the same list makes both harder to scan.
  const policies: Item[] = [
    { href: '/about', icon: 'info-circle', label: t.footer.about },
    { href: '/faq', icon: 'message', label: t.footer.faq },
    { href: '/shipping', icon: 'truck-delivery', label: t.footer.shipping },
    { href: '/refund', icon: 'receipt', label: t.footer.refund },
    { href: '/terms', icon: 'file-text', label: t.footer.terms },
    { href: '/privacy', icon: 'lock', label: t.footer.privacy },
    { href: '/blog', icon: 'article', label: t.nav.blog },
  ];

  async function logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'fb-web' }, body: '{}', credentials: 'same-origin' });
    setOpen(false);
    router.replace('/');
    router.refresh();
  }

  const initial = (userName ?? '').trim().charAt(0);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.header.menu}
        aria-haspopup="dialog"
        className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-au-400/60 bg-em-900/50 text-au-200 transition-colors duration-150 hover:bg-em-900/80 lg:h-11 lg:w-11"
      >
        {/*
         * A signed-in shopper gets their initial on gold — the thing every app has trained people
         * to recognise as "me". A guest gets a filled silhouette rather than the thin outline that
         * was here: at 20 px on a phone, against a dark band, a 1.5 px stroke is barely there, and
         * the owner was right that it did not read as a profile icon at all.
         */}
        {isLoggedIn && initial ? (
          <span className="grid h-full w-full place-items-center bg-[linear-gradient(180deg,#efdba2,#cba954)] text-[17px] font-bold leading-none text-em-900">{initial.toUpperCase()}</span>
        ) : (
          <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true" focusable="false" className="lg:h-[23px] lg:w-[23px]">
            <circle cx="12" cy="8.2" r="3.9" />
            <path d="M4.6 19.4c0-3.6 3.3-5.8 7.4-5.8s7.4 2.2 7.4 5.8a.9.9 0 0 1-.9.9H5.5a.9.9 0 0 1-.9-.9z" />
          </svg>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} closeLabel={t.menu.close} title={isLoggedIn ? t.menu.hello(userName ?? '') : t.menu.guest}>
        <div className="px-3 py-3">
          {!isLoggedIn ? (
            <div className="mx-2 mb-3 rounded-lg bg-em-50 p-4">
              <p className="text-base text-ink-2">{t.menu.guestHint}</p>
              <Link href="/login" onClick={() => setOpen(false)} className="mt-3 flex h-12 items-center justify-center rounded bg-em-700 text-body font-semibold text-white no-underline">
                {t.menu.login}
              </Link>
            </div>
          ) : null}
          {/*
            * The way back.
            *
            * Staff are offered "panel or shop?" when they sign in, and whoever picks shopping has
            * to be able to change his mind. Without this the only route back to the panel is
            * typing the URL, which the shopkeeper will not do and should not have to.
            */}
          {isLoggedIn && staffHome ? (
            <Link href={staffHome} onClick={() => setOpen(false)} className="mx-2 mb-3 flex items-center gap-3 rounded-lg bg-em-800 px-4 py-3 text-white no-underline">
              <Icon name="layout-dashboard" size={20} className="shrink-0 text-au-300" />
              <span className="flex-1 text-body font-semibold">{t.auth.goPanelStaff}</span>
              <Icon name="chevron-right" size={18} className="text-au-300" />
            </Link>
          ) : null}
          <ul>
            {items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} onClick={() => setOpen(false)} className="flex h-14 items-center gap-4 rounded-lg px-3 text-body text-ink no-underline hover:bg-paper-2">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-au-50 text-em-700 ring-1 ring-au-200">
                    <Icon name={it.icon} size={20} />
                  </span>
                  <span className="flex-1">{it.label}</span>
                  <Icon name="chevron-right" size={18} className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line px-3 pb-1 pt-3 text-sm font-semibold uppercase tracking-wide text-ink-3">{t.footer.support}</p>
          <ul>
            {policies.map((it) => (
              <li key={it.href}>
                <Link href={it.href} onClick={() => setOpen(false)} className="flex h-12 items-center gap-3 rounded-lg px-3 text-base text-ink-2 no-underline hover:bg-paper-2">
                  <Icon name={it.icon} size={18} className="shrink-0 text-ink-3" />
                  <span className="flex-1">{it.label}</span>
                  <Icon name="chevron-right" size={16} className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
          {supportPhone ? (
            <div className="mt-2 grid grid-cols-2 gap-2 px-2">
              <a href={`tel:+91${supportPhone}`} className="flex h-12 items-center justify-center gap-2 rounded border border-line-2 text-base font-semibold text-em-800 no-underline">
                <Icon name="phone" size={18} /> {t.menu.callUs}
              </a>
              <a href={`https://wa.me/91${whatsapp || supportPhone}`} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-2 rounded border border-line-2 text-base font-semibold text-em-800 no-underline">
                <Icon name="brand-whatsapp" size={18} /> WhatsApp
              </a>
            </div>
          ) : null}
          {isLoggedIn ? (
            <button type="button" onClick={() => void logout()} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg text-base font-semibold text-danger hover:bg-[#fdecea]">
              <Icon name="logout" size={18} /> {t.menu.logout}
            </button>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
