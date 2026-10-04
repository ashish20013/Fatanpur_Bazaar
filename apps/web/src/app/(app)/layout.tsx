import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { MeResponse, Permission } from '@fb/shared-types';
import { StaffNav, type StaffLink } from '@/components/admin/StaffNav';
import { BagBar } from '@/components/BagBar';
import { ErrorReporter } from '@/components/ErrorReporter';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Icon } from '@/components/icons';
import { getMe } from '@/lib/data';
import { dict, type Lang } from '@/lib/i18n';
import { getShell } from '@/lib/shell';

/** Dashboards are never indexed (§11 robots). */
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };
export const dynamic = 'force-dynamic';

/**
 * ⚠️ These menus are UX only — a hidden link is not security.
 * The real gate is the API guards (JwtAuth → Roles → Permissions → Ownership).
 */
function staffLinks(me: MeResponse): StaffLink[] {
  const has = (p: Permission): boolean => me.role === 'ADMIN' || me.permissions.includes(p);
  if (me.role === 'DELIVERY_BOY') {
    return [
      { href: '/delivery', label: 'Today', icon: 'layout-dashboard', group: 'Deliveries' },
      { href: '/delivery/assignments', label: 'My deliveries', icon: 'truck-delivery', group: 'Deliveries' },
      { href: '/delivery/history', label: 'History', icon: 'history', group: 'Deliveries' },
      { href: '/delivery/earnings', label: 'Earnings', icon: 'wallet', group: 'Deliveries' },
    ];
  }
  const b = me.role === 'ADMIN' ? '/admin' : '/supervisor';
  const all: (StaffLink & { perm?: Permission; adminOnly?: boolean })[] = [
    { href: b, label: 'Dashboard', icon: 'layout-dashboard', group: 'Overview' },
    { href: `${b}/orders`, label: 'Orders', icon: 'package', group: 'Sales', perm: 'orders.view_all' },
    { href: `${b}/delivery`, label: 'Delivery board', icon: 'truck-delivery', group: 'Sales', perm: 'delivery.assign' },
    { href: '/admin/payments', label: 'Payments & finance', icon: 'cash-banknote', group: 'Sales', adminOnly: true },
    { href: `${b}/customers`, label: 'Customers', icon: 'users', group: 'Sales', perm: 'customers.view' },
    { href: '/admin/products', label: 'Products', icon: 'basket', group: 'Catalog', adminOnly: true },
    { href: '/admin/categories', label: 'Categories', icon: 'category', group: 'Catalog', adminOnly: true },
    { href: `${b}/inventory`, label: 'Inventory / stock', icon: 'box', group: 'Catalog', perm: 'inventory.manage' },
    { href: `${b}/villages`, label: 'Villages', icon: 'map-pin', group: 'Service area', perm: 'villages.manage' },
    { href: '/admin/service-area', label: 'Delivery boundary', icon: 'map-2', group: 'Service area', adminOnly: true },
    { href: '/admin/area-requests', label: 'Area requests', icon: 'flag', group: 'Service area', adminOnly: true },
    { href: '/admin/coupons', label: 'Coupons', icon: 'ticket', group: 'Marketing', adminOnly: true },
    { href: '/admin/banners', label: 'Banners', icon: 'speakerphone', group: 'Marketing', adminOnly: true },
    { href: '/admin/content', label: 'Blog, pages & FAQ', icon: 'article', group: 'Content', adminOnly: true },
    { href: '/admin/staff', label: 'Staff & access', icon: 'users-group', group: 'Team', adminOnly: true },
    { href: '/supervisor/riders', label: 'Delivery partners', icon: 'motorbike', group: 'Team', perm: 'staff.manage_riders' },
    { href: `${b}/reports`, label: 'Reports & analytics', icon: 'chart-bar', group: 'System', perm: 'reports.view' },
    { href: '/admin/audit', label: 'Security / activity log', icon: 'shield-check', group: 'System', adminOnly: true },
    { href: '/admin/settings', label: 'Settings', icon: 'settings', group: 'System', adminOnly: true },
  ];
  return all.filter((l) => (l.adminOnly ? me.role === 'ADMIN' : !l.perm || has(l.perm))).filter((l) => !(me.role === 'ADMIN' && l.href === '/supervisor/riders'));
}

function customerTabs(lang: Lang): { href: string; label: string; icon: string }[] {
  const t = dict(lang);
  return [
    { href: '/mera', label: t.account.title, icon: 'user-circle' },
    { href: '/mera/orders', label: t.menu.orders, icon: 'package' },
    { href: '/mera/addresses', label: t.menu.addresses, icon: 'address-book' },
    { href: '/mera/wallet', label: t.menu.wallet, icon: 'wallet' },
    { href: '/mera/notifications', label: t.menu.notifications, icon: 'bell' },
    { href: '/mera/profile', label: t.menu.profile, icon: 'settings' },
  ];
}

export default async function AppLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const me = await getMe();
  if (!me) redirect('/login');

  /*
   * Which shell to draw is a question about the ROUTE, not about the person.
   *
   * It used to be answered by role alone: anyone who was not a CUSTOMER got the staff sidebar,
   * whatever page they had opened. So the shopkeeper who chose "shop as a customer" at login and
   * then tapped his own bag found his orders, wallet and addresses wrapped in an admin panel with
   * no customer tabs — his own account was effectively unreachable. /mera is the customer account
   * for everyone who has one, and everyone here has one.
   *
   * ⚠️ Shell only. What this person may actually read is decided by the API's ownership checks,
   * which never looked at this file.
   */
  const path = (await headers()).get('x-fb-path') ?? '';
  const inCustomerArea = path === '/mera' || path.startsWith('/mera/');

  if (me.role !== 'CUSTOMER' && !inCustomerArea) {
    const title = me.role === 'ADMIN' ? 'Admin' : me.role === 'SUPERVISOR' ? 'Supervisor' : 'Delivery';
    return (
      <div lang="en" className="min-h-dvh bg-[#f3f1ea] lg:flex">
        <StaffNav links={staffLinks(me)} title={title} who={`${me.name ?? ''} · ${me.phone}`} />
        <main id="main" className="min-w-0 flex-1 px-3 py-5 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>
    );
  }

  const s = await getShell();
  return (
    <>
      <Header
        lang={s.lang}
        roots={s.home.roots}
        addressLabel={s.addressLabel}
        addressId={s.addressId}
        isLoggedIn
        userName={me.name}
        supportPhone={s.settings.supportPhone}
        whatsapp={s.settings.whatsapp}
        deliveryWindow={s.settings.deliveryWindow}
        cartCount={s.cart?.itemCount ?? 0}
        showRail={false}
      />
      <div className="fb-container pb-28 pt-4">
        <nav aria-label={dict(s.lang).nav.myAccount} className="fb-scroll-x -mx-[14px] mb-5 px-[14px]">
          <ul className="flex gap-2">
            {customerTabs(s.lang).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line-2 bg-card px-4 text-base text-ink-2 no-underline hover:border-em-300 hover:text-em-800">
                  <Icon name={l.icon} size={16} className="text-au-600" /> {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main">{children}</main>
      </div>
      <Footer lang={s.lang} credit={s.settings.credit} />
      <ErrorReporter />
      <BagBar lang={s.lang} initial={s.cart} />
    </>
  );
}
