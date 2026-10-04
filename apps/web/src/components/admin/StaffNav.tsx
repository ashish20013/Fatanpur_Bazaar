'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';

export interface StaffLink {
  href: string;
  label: string;
  icon: string;
  group: string;
}

function NavList({ links, onGo }: { links: StaffLink[]; onGo?: () => void }): React.ReactNode {
  const path = usePathname();
  const groups = [...new Set(links.map((l) => l.group))];
  return (
    <nav aria-label="Staff navigation" className="space-y-5">
      {groups.map((g) => (
        <div key={g}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-au-300/80">{g}</p>
          <ul className="space-y-0.5">
            {links
              .filter((l) => l.group === g)
              .map((l) => {
                const on = path === l.href || (l.href.split('/').length > 2 && path.startsWith(`${l.href}/`));
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={onGo}
                      aria-current={on ? 'page' : undefined}
                      className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] no-underline transition-colors duration-150 ${on ? 'bg-au-300 font-semibold text-em-900' : 'text-em-100 hover:bg-em-900/60 hover:text-white'}`}
                    >
                      <Icon name={l.icon} size={18} /> {l.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Desktop: fixed sidebar. Phone: a top bar with a menu drawer. English only (owner's rule). */
export function StaffNav({ links, title, who }: { links: StaffLink[]; title: string; who: string }): React.ReactNode {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  async function logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'fb-web' }, body: '{}', credentials: 'same-origin' });
    router.replace('/login');
    router.refresh();
  }
  const brand = (
    <div className="flex items-center gap-3 px-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/wordmark.svg" alt="Fatanpur Bazaar" width={90} height={34} className="h-[34px] w-auto" />
      <span className="rounded-full border border-au-400/50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-au-200">{title}</span>
    </div>
  );
  const foot = (
    <div className="space-y-2 border-t border-em-600/50 px-3 pt-3">
      <p className="truncate text-sm text-em-100">{who}</p>
      <div className="flex gap-2">
        <Link href="/" className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-em-600 text-sm text-em-100 no-underline hover:text-white">
          <Icon name="building-store" size={16} /> Store
        </Link>
        <button type="button" onClick={() => void logout()} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-em-600 text-sm text-em-100 hover:text-white">
          <Icon name="logout" size={16} /> Log out
        </button>
      </div>
    </div>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 overflow-y-auto bg-em-800 py-5 lg:flex">
        {brand}
        <div className="flex-1 px-2">
          <NavList links={links} />
        </div>
        {foot}
      </aside>
      <div className="fb-band sticky top-0 z-40 flex h-14 items-center justify-between px-3 lg:hidden">
        {brand}
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="grid h-11 w-11 place-items-center rounded-full text-au-200">
          <Icon name="menu-2" size={24} />
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Menu" closeLabel="Close">
        <div className="bg-em-800 px-2 py-4">
          <NavList links={links} onGo={() => setOpen(false)} />
          <div className="mt-4">{foot}</div>
        </div>
      </Sheet>
    </>
  );
}
