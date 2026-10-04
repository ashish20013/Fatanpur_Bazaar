import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { JsonLd } from '@/components/JsonLd';
import { EmptyState } from '@/components/ui';
import { safeApi } from '@/lib/api';
import { dict } from '@/lib/i18n';
import { buildMetadata, faqLd } from '@/lib/seo';
import { currentLang } from '@/lib/session';

export const revalidate = 3600;

interface Faq {
  id: number;
  question: string;
  answer: string;
}

export const metadata: Metadata = buildMetadata({
  title: 'सवाल-जवाब — ऑर्डर और डिलीवरी',
  description: 'फतनपुर बाज़ार पर ऑर्डर, डिलीवरी क्षेत्र, भुगतान और रिफंड से जुड़े आम सवालों के जवाब यहाँ पढ़ें।',
  path: '/faq',
});

export default async function FaqPage(): Promise<ReactNode> {
  const [lang, general, home] = await Promise.all([currentLang(), safeApi<Faq[]>('/content/faqs?scope=general', [], 3600), safeApi<Faq[]>('/content/faqs?scope=home', [], 3600)]);
  const seen = new Set<string>();
  const faqs = [...general, ...home].filter((f) => (seen.has(f.question) ? false : (seen.add(f.question), true)));
  const t = dict(lang);

  return (
    <div className="space-y-4">
      <h1 className="fb-display text-3xl leading-tight">{t.footer.faq}</h1>
      {faqs.length ? (
        <div className="fb-card divide-y divide-line p-0">
          {faqs.map((f) => (
            /* Native <details>/<summary> — JS ke bina bhi kaam kare (§8 accordion) */
            <details key={f.id} className="group px-4 py-3">
              <summary className="fb-tap flex cursor-pointer list-none items-center justify-between gap-2 text-body font-semibold text-ink">
                {f.question}
                <Icon name="chevron-down" size={20} className="shrink-0 text-au-600 transition-transform duration-150 group-open:rotate-180" />
              </summary>
              {/* ⚠️ Answer ContentService.saveFaq me sanitise ho chuki hai — isliye surakshit hai */}
              <div className="fb-prose pt-2 text-base text-ink-2" dangerouslySetInnerHTML={{ __html: f.answer }} />
            </details>
          ))}
        </div>
      ) : (
        <EmptyState icon="info-circle" title={t.common.loading} />
      )}
      {faqs.length ? <JsonLd data={faqLd(faqs.map((f) => ({ question: f.question, answer: f.answer })))} /> : null}
    </div>
  );
}
