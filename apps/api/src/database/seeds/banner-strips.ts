import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Knex } from 'knex';

/**
 * Two placeholder strips for the advertising slot, generated here and never downloaded.
 *
 * The slot is a 320×50 advertising unit and the owner will fill it with whatever he is selling
 * that week, or with a paying advertiser's artwork. Until then it would render nothing at all,
 * which makes the feature invisible — he cannot judge a slot he has never seen. So two plain
 * strips are drawn locally in the shop's own colours, saying what the shop actually offers.
 *
 * ⚠️ They are placeholders, and they are written only where a banner row has no picture yet. A
 * strip the owner uploads from Admin → Banners gets a hashed name in a dated folder and is never
 * touched by this. Deleting these two rows removes the strip from the page entirely.
 */

const esc = (s: string): string => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface Strip {
  slug: string;
  title: string;
  line1: string;
  line2: string;
  linkUrl: string;
  from: string;
  to: string;
  ink: string;
  accent: string;
}

/*
 * The shop's own palette, not a stock advertising look: deep green with champagne gold, and a warm
 * ivory one for contrast between the two slides. Nothing blinks and nothing shouts — this strip
 * sits directly above the vegetables.
 */
const STRIPS: Strip[] = [
  {
    slug: 'taaza-sabzi',
    title: 'ताज़ी सब्ज़ी, घर तक',
    line1: 'ताज़ी सब्ज़ी · रोज़ सुबह की',
    line2: '30–60 मिनट में घर तक',
    linkUrl: '/fal-sabzi',
    from: '#123022',
    to: '#215e3d',
    ink: '#fffaf0',
    accent: '#ecd598',
  },
  {
    slug: 'kirana-ghar-tak',
    title: 'किराना घर बैठे',
    line1: 'किराना · आटा–दाल–तेल',
    line2: 'कैश ऑन डिलीवरी या UPI',
    linkUrl: '/kirana',
    from: '#f8eed2',
    to: '#f2dfac',
    ink: '#16261c',
    accent: '#86661f',
  },
];

/**
 * The strip as SVG at a given width, 6.4:1.
 *
 * Text is drawn with whatever fonts the server has. If Devanagari glyphs are missing the shapes
 * and colours still render, so the owner sees the slot working even on a bare host — the same
 * compromise the product placeholders make.
 */
function stripSvg(s: Strip, width: number): string {
  const h = Math.round(width / 6.4);
  const pad = Math.round(h * 0.26);
  const f1 = Math.round(h * 0.3);
  const f2 = Math.round(h * 0.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${s.from}"/><stop offset="1" stop-color="${s.to}"/>
  </linearGradient></defs>
  <rect width="${width}" height="${h}" fill="url(#g)"/>
  <rect x="0" y="${h - Math.max(2, Math.round(h * 0.03))}" width="${width}" height="${Math.max(2, Math.round(h * 0.03))}" fill="${s.accent}" opacity="0.75"/>
  <text x="${pad}" y="${Math.round(h * 0.44)}" font-family="Mukta, Noto Sans Devanagari, DejaVu Sans, sans-serif" font-size="${f1}" font-weight="700" fill="${s.ink}">${esc(s.line1)}</text>
  <text x="${pad}" y="${Math.round(h * 0.78)}" font-family="Mukta, Noto Sans Devanagari, DejaVu Sans, sans-serif" font-size="${f2}" fill="${s.accent}">${esc(s.line2)}</text>
</svg>`;
}

export async function seedBannerStrips(
  db: Knex,
  storagePath: string,
  publicUploadUrl: string,
  log: (m: string) => void,
): Promise<void> {
  const dir = join(storagePath, 'uploads', 'banners', 'seed');
  await mkdir(dir, { recursive: true });

  let sharp: typeof import('sharp') | null = null;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    sharp = null; // no sharp on this host — SVG files still render in every browser
  }

  let written = 0;
  for (const [i, s] of STRIPS.entries()) {
    const ext = sharp ? 'webp' : 'svg';
    const names: Record<number, string> = {};
    for (const w of [640, 1280]) {
      const file = `banner-${s.slug}-${w}.${ext}`;
      const svg = Buffer.from(stripSvg(s, w), 'utf8');
      await writeFile(join(dir, file), sharp ? await sharp(svg).webp({ quality: 82 }).toBuffer() : svg);
      names[w] = `${publicUploadUrl}/banners/seed/${file}`;
    }

    /*
     * Fill in a banner the owner has not given a picture to, and create the row if the slot is
     * empty — but never overwrite a picture that is already there. A seed that replaces an
     * advertiser's artwork on the next deploy would be a very expensive kind of helpful.
     */
    const existing = await db('banners')
      .where({ position: 'HOME_TOP' })
      .orderBy('sort_order')
      .offset(i)
      .first('id', 'image_url');
    if (existing && existing.image_url) continue;
    if (existing) {
      await db('banners')
        .where({ id: existing.id })
        .update({ title: s.title, image_url: names[1280], link_url: s.linkUrl, is_active: 1, sort_order: i });
    } else {
      await db('banners').insert({
        title: s.title,
        image_url: names[1280],
        link_url: s.linkUrl,
        position: 'HOME_TOP',
        sort_order: i,
        is_active: 1,
      });
    }
    written += 1;
  }
  log(
    written
      ? `banner strips: ${written} placeholder${written > 1 ? 's' : ''} written (replace them from Admin → Banners)`
      : 'banner strips: all slots already have a picture — left alone',
  );
}
