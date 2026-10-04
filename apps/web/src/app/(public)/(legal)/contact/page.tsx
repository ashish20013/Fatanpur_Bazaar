import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ContactForm } from '@/components/ContactForm';
import { ContentPage, contentPageMetadata } from '@/components/ContentPage';
import { getSettings } from '@/lib/data';
import { BRAND } from '@/lib/env';
import { currentLang } from '@/lib/session';
import { Icon } from '@/components/icons';

export const revalidate = 3600;
export const generateMetadata = (): Promise<Metadata> => contentPageMetadata('contact');

export default async function ContactPage(): Promise<ReactNode> {
  const [lang, settings] = await Promise.all([currentLang(), getSettings()]);
  return (
    <ContentPage slug="contact">
      {/* §11 — NAP block, Google Business Profile jaisa exact format */}
      <section className="fb-card space-y-1 p-4">
        <h2 className="text-lg font-semibold">{BRAND.nameHi}</h2>
        <address className="not-italic text-base text-ink-2">
          {BRAND.addressHi}
          <br />
          <a href={`tel:+91${settings.supportPhone}`} className="font-semibold text-g-700">
            <Icon name="phone" size={18} /> +91 {settings.supportPhone}
          </a>
          {settings.whatsapp ? (
            <>
              {' · '}
              <a href={`https://wa.me/91${settings.whatsapp}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-g-700">
                WhatsApp
              </a>
            </>
          ) : null}
        </address>
      </section>
      <ContactForm lang={lang} />
    </ContentPage>
  );
}
