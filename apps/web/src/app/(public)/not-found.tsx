import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { buttonClass } from '@/components/ui';
import { getSettings } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

/** notFound() jahan bhi (public) ke andar chale (product/category/area/service...) yahi dikhta hai. */
export default async function NotFound(): Promise<ReactNode> {
  const [lang, settings] = await Promise.all([currentLang(), getSettings()]);
  const t = dict(lang);
  return (
    <div className="flex flex-col items-center gap-3 fb-container py-16 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-au-50 text-au-700 ring-1 ring-au-200" aria-hidden="true">
        <Icon name="map-2" size={30} />
      </span>
      <h1 className="fb-display text-3xl">{t.notFound.title}</h1>
      <p className="max-w-sm text-base text-ink-2">{t.notFound.body}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={buttonClass('primary', 'md')}>
          {t.notFound.cta}
        </Link>
        <a href={`tel:+91${settings.supportPhone}`} className={buttonClass('secondary', 'md')}>
          <Icon name="phone" size={18} /> +91 {settings.supportPhone}
        </a>
      </div>
    </div>
  );
}
