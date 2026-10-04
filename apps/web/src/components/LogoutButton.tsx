'use client';

import { useRouter } from 'next/navigation';
import { dict, type Lang } from '@/lib/i18n';

/** Logout = cookies clear + session revoke (dono kaam route handler karta hai). */
export function LogoutButton({ lang }: { lang: Lang }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  return (
    <button
      type="button"
      className="fb-tap px-2 text-base font-semibold text-ink-2"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'fb-web' }, body: '{}', credentials: 'same-origin' });
        router.replace('/');
        router.refresh();
      }}
    >
      {t.nav.logout}
    </button>
  );
}
