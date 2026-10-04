import Link from 'next/link';
import type { ReactNode } from 'react';
import type { RootCategory } from '@fb/shared-types';
import { dict, type Lang } from '@/lib/i18n';
import { CategoryRail } from './CategoryRail';
import { AddressChip } from './header/AddressChip';
import { LangToggle } from './header/LangToggle';
import { Logo } from './header/Logo';
import { ProfileMenu } from './header/ProfileMenu';
import { SearchBar } from './header/SearchBar';
import { Icon } from './icons';

/**
 * Owner's wireframe:
 *   [ logo ]      [ 📍 choose your address ]      [ bag · profile ]
 *   [ 🔍 जो सामान खरीदना है, यहाँ खोजें        🎤 ]  [ हिं | EN ]
 *   ( ◯ ◯ ◯ ◯ category rail, drifting slowly → )
 * On a wide screen the search moves up into the first row. The emerald band + gold wordmark are
 * the logo's own colours; only the top band is sticky, the rail scrolls away with the page.
 */
export function Header({
  lang,
  roots,
  activeRoot,
  addressLabel,
  addressId,
  isLoggedIn,
  userName,
  staffHome = null,
  supportPhone,
  whatsapp,
  deliveryWindow,
  cartCount,
  searchQuery,
  showRail = true,
}: {
  lang: Lang;
  roots: RootCategory[];
  activeRoot?: string | null;
  addressLabel: string | null;
  addressId: number | null;
  isLoggedIn: boolean;
  userName: string | null;
  /** Staff only: the panel this person belongs to, so they can get back to it while shopping. */
  staffHome?: string | null;
  supportPhone: string;
  whatsapp: string;
  deliveryWindow: string;
  cartCount: number;
  searchQuery?: string;
  showRail?: boolean;
}): ReactNode {
  const t = dict(lang);
  return (
    <>
      <header className="fb-band sticky top-0 z-40 text-white">
        {/* Tight on a phone on purpose: every row of padding here is a row of products that does
            not fit on the first screen. Desktop keeps its air. */}
        <div className="fb-container flex flex-wrap items-center gap-x-2 gap-y-1.5 pb-2 pt-1.5 lg:flex-nowrap lg:gap-x-4 lg:gap-y-1 lg:pb-1.5 lg:pt-1">
          <Logo label={t.brand.name} height={36} />
          <div className="min-w-0 flex-1 lg:max-w-[260px] lg:flex-none">
            <AddressChip lang={lang} deliveryWindow={deliveryWindow} label={addressLabel} selectedId={addressId} isLoggedIn={isLoggedIn} supportPhone={supportPhone} />
          </div>
          <div className="order-last flex w-full items-center gap-2 lg:order-none lg:w-auto lg:flex-1">
            <SearchBar lang={lang} initial={searchQuery} />
            <LangToggle lang={lang} title={t.header.langTitle} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/cart"
              aria-label={`${t.header.bag}${cartCount ? ` (${cartCount})` : ''}`}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-au-400/60 bg-em-900/50 text-au-200 no-underline transition-colors duration-150 hover:bg-em-900/80 lg:h-11 lg:w-11"
            >
              <Icon name="shopping-bag" size={20} className="lg:h-[22px] lg:w-[22px]" />
              {cartCount > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-au-400 px-1 text-[11px] font-bold leading-none text-em-900 tabular-nums">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              ) : null}
            </Link>
            <ProfileMenu lang={lang} userName={userName} isLoggedIn={isLoggedIn} staffHome={staffHome} supportPhone={supportPhone} whatsapp={whatsapp} />
          </div>
        </div>
      </header>
      {showRail ? <CategoryRail lang={lang} roots={roots} active={activeRoot} supportPhone={supportPhone} /> : null}
    </>
  );
}
