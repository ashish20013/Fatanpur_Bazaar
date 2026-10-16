import { Inject, Injectable } from '@nestjs/common';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ENV, type Env } from '../../config/config.module';
import { AppError } from '../../common/errors';
import { Log } from '../../common/logger';
import { checkImage, type ImageKind } from '@fb/shared-types';
import { isImage, sniffMime } from '../../common/utils/filetype';
import { shortRandom } from '../../common/utils/ids';

export interface StoredImage {
  url: string; // 600w
  urlSm: string; // 200w
  urlLg: string; // 1200w
  width: number;
  height: number;
  files: string[];
}

/**
 * A27 — resize ONCE at upload (never at request time): EXIF stripped, WebP q82, 200/600/1200 w.
 * Date folders keep any one directory small (inode-friendly listing on shared hosting).
 *
 * Upload is ATOMIC: if any variant fails to write, every file already written for that upload
 * is removed so the DB never points at a partial set. Without this a sharp crash mid-loop
 * leaves (say) the 200 w on disk but not the 600 w, and the product card shows a picture
 * while the detail page shows a broken image — the exact symptom the audit found.
 */
@Injectable()
export class ImagesService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async storeProductImage(buf: Buffer, slug: string, kind: ImageKind = 'products'): Promise<StoredImage> {
    // The hard ceiling first, before sharp is asked to decode anything: a 40 MB file must be
    // refused on its length alone, not after the server has tried to build a bitmap out of it.
    if (buf.length > this.env.UPLOAD_MAX_MB * 1024 * 1024) throw new AppError('PAYLOAD_TOO_LARGE');
    if (!isImage(sniffMime(buf))) throw new AppError('UNSUPPORTED_FILE');
    const meta = await sharp(buf, { failOn: 'error' }).metadata();
    if (!meta.width || !meta.height) throw new AppError('UNSUPPORTED_FILE');
    /*
     * The size and shape rules are checked HERE as well as in the browser, and this is the
     * check that counts. The browser's copy exists so a 5 MB phone photo never leaves the phone —
     * a real saving on 3G — but anyone can post straight to this endpoint, so a rule only the
     * client enforces is a suggestion.
     */
    const bad = checkImage(kind, { bytes: buf.length, width: meta.width, height: meta.height });
    if (bad) throw new AppError('BUSINESS_RULE', { reason: bad.hi, reasonEn: bad.en });
    const now = new Date();
    const rel = `${kind}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dir = join(this.env.STORAGE_PATH, 'uploads', rel);
    await mkdir(dir, { recursive: true });
    const base = `${slug.slice(0, 60)}-${shortRandom()}`;
    /*
     * A category picture is now a shop-front card on the rail, not a 70 px medallion, so 200 px is
     * too soft on a 2x/3x phone and 600 px is twenty times more than the card can show. 320 px sits
     * exactly where the card needs it — crisp at 3x, about 15 KB.
     */
    const widths = kind === 'banners' ? [640, 1280] : kind === 'categories' ? [320, 600, 1200] : [200, 600, 1200];
    const files: string[] = [];
    let w600 = { width: 600, height: 600 };

    // --- ATOMIC WRITE: all variants succeed or none remain on disk ---
    try {
      for (const w of widths) {
        const file = `${base}-${w}.webp`;
        // Product shots are squared (1:1 grid, zero CLS); banners keep the 6.4:1 advertising strip.
        const pipeline = sharp(buf).rotate().resize(kind === 'banners' ? { width: w, height: Math.round(w / 6.4), fit: 'cover' } : { width: w, height: w, fit: 'cover', position: 'attention' });
        /*
         * The rail loads six to eleven category pictures before anything is tapped, so their weight is
         * paid by every visitor on every first visit — on a 3G phone that is the difference between a
         * shop front appearing and a grey box. At 82 they came to roughly 28 KB each; at 72 they are
         * near 14 KB, and the loss is invisible at a card 96 px wide. A product photo is inspected
         * before it is bought and keeps the higher setting.
         */
        const quality = kind === 'categories' && w <= 320 ? 72 : 82;
        const info = await pipeline.webp({ quality }).toFile(join(dir, file));
        if (w === 600) w600 = { width: info.width, height: info.height };
        files.push(join(dir, file));
      }
    } catch (err) {
      // One variant failed — remove every file that DID write so the DB never points at a
      // partial set. A missing file is fine (ENOENT ignored); a permission error is logged
      // but must not mask the original failure.
      Log.error('image.variant_failed', { slug, kind, writtenSoFar: files.length, total: widths.length, err: err instanceof Error ? err.message : String(err) });
      await Promise.allSettled(files.map((f) => unlink(f).catch((e) => {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') Log.warn('image.rollback_unlink', { file: f, err: String(e) });
      })));
      throw new AppError('INTERNAL', {}, { hi: 'फ़ोटो सेव नहीं हो पाई — दोबारा कोशिश करें' });
    }

    const url = (w: number): string => `${this.env.PUBLIC_UPLOAD_URL}/${rel}/${base}-${w}.webp`;
    const small = kind === 'banners' ? 640 : kind === 'categories' ? 320 : 200;
    return { url: url(600), urlSm: url(small), urlLg: url(1280), width: w600.width, height: w600.height, files };
  }

  /** Delete the stored variants when a product image row is deleted (no orphan files). */
  async removeByUrl(url: string): Promise<void> {
    const prefix = `${this.env.PUBLIC_UPLOAD_URL}/`;
    if (!url.startsWith(prefix)) return;
    const rel = url.slice(prefix.length).replace(/-(200|320|600|640|1200|1280)\.webp$/, '');
    if (rel.includes('..')) return;
    // Every width any `kind` can produce — a missing file is ignored below, so listing all is safe.
    for (const w of [200, 320, 600, 640, 1200, 1280]) {
      try {
        await unlink(join(this.env.STORAGE_PATH, 'uploads', `${rel}-${w}.webp`));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') Log.warn('image.unlink_failed', { err: String(e) });
      }
    }
  }
}
