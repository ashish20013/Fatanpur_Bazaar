import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * §14: placeholder product images are GENERATED locally (never downloaded): green-tint square,
 * product name as text, 200w + 600w WebP. They are replaced by real photos from /admin/products.
 * Text rendering uses whatever fonts the server has (librsvg/fontconfig); if Devanagari glyphs are
 * missing the English line still renders, and if sharp itself is unavailable we fall back to SVG files.
 */
export interface PlaceholderOut {
  url: string;
  urlSm: string;
  width: number;
  height: number;
}

const esc = (s: string): string => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Deterministic tint per product so the grid does not look like one flat block. */
function tint(slug: string): string {
  const palette = ['#e6f4ea', '#f2f9f4', '#dff0e5', '#eef7e8', '#fdf2dc', '#e8f3ee'];
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length] as string;
}

export function placeholderSvg(title: string, subtitle: string, slug: string, size = 600): string {
  const fs1 = Math.round(size * 0.11);
  const fs2 = Math.round(size * 0.07);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="100%" height="100%" fill="${tint(slug)}"/>
<circle cx="${size / 2}" cy="${size * 0.36}" r="${size * 0.16}" fill="#bfe3cc"/>
<text x="50%" y="${size * 0.68}" font-family="Mukta, 'Noto Sans Devanagari', 'DejaVu Sans', sans-serif" font-size="${fs1}" font-weight="700" fill="#11492f" text-anchor="middle">${esc(title)}</text>
<text x="50%" y="${size * 0.8}" font-family="'DejaVu Sans', Arial, sans-serif" font-size="${fs2}" fill="#48584f" text-anchor="middle">${esc(subtitle.slice(0, 26))}</text>
</svg>`;
}

export async function writePlaceholder(storagePath: string, publicUploadUrl: string, slug: string, title: string, subtitle: string): Promise<PlaceholderOut> {
  const rel = 'products/seed';
  const dir = join(storagePath, 'uploads', rel);
  await mkdir(dir, { recursive: true });
  const url = (w: number, ext: string): string => `${publicUploadUrl}/${rel}/${slug}-${w}.${ext}`;
  try {
    const { default: sharp } = await import('sharp');
    for (const w of [200, 600]) {
      await sharp(Buffer.from(placeholderSvg(title, subtitle, slug, w))).webp({ quality: 80 }).toFile(join(dir, `${slug}-${w}.webp`));
    }
    return { url: url(600, 'webp'), urlSm: url(200, 'webp'), width: 600, height: 600 };
  } catch {
    const { writeFile } = await import('node:fs/promises');
    for (const w of [200, 600]) await writeFile(join(dir, `${slug}-${w}.svg`), placeholderSvg(title, subtitle, slug, w));
    return { url: url(600, 'svg'), urlSm: url(200, 'svg'), width: 600, height: 600 };
  }
}
