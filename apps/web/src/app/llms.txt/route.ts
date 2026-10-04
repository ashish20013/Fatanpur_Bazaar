import type { RootCategory, VillageOption } from '@fb/shared-types';
import { safeApi } from '@/lib/api';
import { getSettings } from '@/lib/data';
import { BRAND, SITE_URL } from '@/lib/env';

/**
 * /llms.txt — a short, factual plain-text summary for answer engines (the llmstxt.org convention),
 * built from live data so it never drifts from the site: what the shop is, where it delivers,
 * what it sells, how to order and how to reach it.
 */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const [settings, areas, home] = await Promise.all([
    getSettings(),
    safeApi<{ villages: VillageOption[] }>('/catalog/areas', { villages: [] }, 3600),
    safeApi<{ roots?: RootCategory[] }>('/catalog/home?lang=hi', { roots: [] }, 3600),
  ]);
  const villages = areas.villages ?? [];
  const roots = (home.roots ?? []).filter((r) => !r.upcoming);
  const lines = [
    `# ${BRAND.nameEn} (${BRAND.nameHi})`,
    '',
    `> Local online bazaar in Fatanpur, Raniganj tehsil, Pratapgarh district, Uttar Pradesh ${BRAND.pincode}, India. Home delivery of groceries, fresh vegetables and fruit, sweets and daily essentials to nearby villages, usually in ${settings.deliveryWindow.replace('मिनट', 'minutes')}. Cash on delivery or UPI. Site language: Hindi (English available).`,
    '',
    '## Contact',
    settings.supportPhone ? `- Phone / WhatsApp: +91 ${settings.supportPhone} (orders are also taken by phone)` : '',
    `- Open daily ${settings.storeOpen}–${settings.storeClose} (IST)`,
    `- Website: ${SITE_URL}`,
    '',
    '## Delivery area (villages served)',
    ...villages.map((v) => `- ${v.name} (${v.nameHi ?? v.name})${v.distanceKm !== null && Number(v.distanceKm) > 0 ? ` — about ${v.distanceKm} km from Fatanpur Bazaar` : ''}: ${SITE_URL}/area/${v.slug}`),
    '',
    '## What is sold',
    ...roots.map((r) => `- ${r.name} (${r.nameHi ?? r.name}): ${SITE_URL}/${r.slug}`),
    '',
    '## Useful pages',
    `- How ordering works (FAQ): ${SITE_URL}/faq`,
    `- Articles for local customers: ${SITE_URL}/blog`,
    `- Delivery policy: ${SITE_URL}/shipping`,
    `- Refund policy: ${SITE_URL}/refund`,
    `- About: ${SITE_URL}/about`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
  return new Response(`${lines.join('\n')}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
