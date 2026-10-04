/**
 * What a picture has to be before the shop will accept it.
 *
 * The shopkeeper photographs goods on a phone, and a modern phone produces a 12-megapixel, 5 MB
 * JPEG. Uploading that to shared hosting costs him a minute of 3G, costs the server a big resize,
 * and produces exactly the same 600 px WebP as a picture a tenth the size. Worse, it happens
 * dozens of times an evening while he is adding stock.
 *
 * So the rules live here, in one place both ends read, and the browser checks them BEFORE the file
 * leaves the phone — that is the part that actually saves his data and his time. The server checks
 * them again, because a rule a client enforces is a suggestion: anyone can post straight to the
 * API.
 *
 * The numbers are chosen from what the site actually renders, not picked round:
 *  • a product tile is 200 px, its detail view 600 px, its zoom 1200 px — so anything under
 *    600×600 would have to be upscaled, and anything over 2500 is thrown away at resize time;
 *  • the banner slot is a thin advertising strip — 320×50 on a phone, the size every ad network
 *    hands out artwork in — so 6.4:1 is required rather than merely suggested. A 3:1 picture
 *    cropped to 6.4:1 loses the top and bottom of whatever it shows, which is how a banner ends up
 *    with the headline sliced in half.
 */

export interface ImageRule {
  /** Largest file we will accept, in bytes. */
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  /** width ÷ height the picture must be close to, or null when any shape is fine. */
  aspect: number | null;
  /** How far from `aspect` is still acceptable, as a fraction (0.08 = 8%). */
  aspectTolerance: number;
}

export type ImageKind = 'products' | 'categories' | 'banners';

const MB = 1024 * 1024;

export const IMAGE_RULES: Record<ImageKind, ImageRule> = {
  // Square. A tile, a detail view and a zoom are all cut from this one file.
  products: { maxBytes: 3 * MB, minWidth: 600, minHeight: 600, maxWidth: 2500, maxHeight: 2500, aspect: 1, aspectTolerance: 0.08 },
  categories: { maxBytes: 3 * MB, minWidth: 600, minHeight: 600, maxWidth: 2500, maxHeight: 2500, aspect: 1, aspectTolerance: 0.08 },
  /*
   * 6.4:1 — the 320×50 advertising strip, which is the shape the slot actually is.
   *
   * The minimum is 640×100 rather than 320×50 because the strip is drawn at full device width:
   * on a phone with a 2× screen a 320 px file is upscaled and the text in it goes soft, and the
   * one thing a paid-for banner cannot be is blurry. 1920×300 is as large as the render ever uses.
   */
  banners: { maxBytes: 2 * MB, minWidth: 640, minHeight: 100, maxWidth: 1920, maxHeight: 300, aspect: 6.4, aspectTolerance: 0.12 },
};

export interface ImageCheckInput {
  bytes: number;
  width: number;
  height: number;
}

/**
 * Check a picture against its rule.
 *
 * Returns the reason it was refused — in Hindi for the shopkeeper and in English for the log —
 * or null when it is fine. Every message says what is wrong AND what to do about it, because
 * "invalid image" tells a person nothing they can act on.
 */
export function checkImage(kind: ImageKind, input: ImageCheckInput): { hi: string; en: string } | null {
  const r = IMAGE_RULES[kind];
  const mb = (n: number): string => (n / MB).toFixed(n % MB === 0 ? 0 : 1);

  if (input.bytes > r.maxBytes) {
    return {
      hi: `यह फ़ोटो ${mb(input.bytes)} MB की है। ${mb(r.maxBytes)} MB तक ही चलेगी — फ़ोन की गैलरी में फ़ोटो खोलकर "Resize" या "छोटा करें" चुनें, फिर दोबारा कोशिश करें।`,
      en: `The file is ${mb(input.bytes)} MB; the limit is ${mb(r.maxBytes)} MB. Resize the photo and try again.`,
    };
  }
  if (input.width < r.minWidth || input.height < r.minHeight) {
    return {
      hi: `यह फ़ोटो ${input.width}×${input.height} की है — बहुत छोटी। कम से कम ${r.minWidth}×${r.minHeight} चाहिए, वरना साइट पर धुंधली दिखेगी।`,
      en: `${input.width}×${input.height} is too small; at least ${r.minWidth}×${r.minHeight} is needed or it will look blurred.`,
    };
  }
  if (input.width > r.maxWidth || input.height > r.maxHeight) {
    return {
      hi: `यह फ़ोटो ${input.width}×${input.height} की है — बहुत बड़ी। ${r.maxWidth}×${r.maxHeight} तक ही चलेगी (इससे बड़ी का कोई फ़ायदा नहीं, सिर्फ़ इंटरनेट और जगह खर्च होती है)।`,
      en: `${input.width}×${input.height} is larger than ${r.maxWidth}×${r.maxHeight}; the extra pixels are discarded at resize time anyway.`,
    };
  }
  if (r.aspect !== null) {
    const got = input.width / input.height;
    if (Math.abs(got - r.aspect) / r.aspect > r.aspectTolerance) {
      const shape = r.aspect === 1 ? 'चौकोर (square)' : `${r.aspect}:1 पतली पट्टी जैसी (जैसे 320×50)`;
      const shapeEn = r.aspect === 1 ? 'square' : `${r.aspect}:1`;
      return {
        hi: `यह फ़ोटो ${shape} नहीं है (${input.width}×${input.height})। फ़ोन के फ़ोटो ऐप में "Crop" चुनकर ${shape} काटें — वरना साइट पर सामान का किनारा कट जाएगा।`,
        en: `Expected a ${shapeEn} image; got ${input.width}×${input.height}. Crop it before uploading, or the subject will be cut off.`,
      };
    }
  }
  return null;
}

/** One short line for the upload button, so the rule is visible before a file is chosen. */
export function imageRuleHint(kind: ImageKind, lang: 'hi' | 'en' = 'hi'): string {
  const r = IMAGE_RULES[kind];
  const mb = (r.maxBytes / MB).toFixed(0);
  const shape = r.aspect === 1 ? (lang === 'hi' ? 'चौकोर' : 'square') : `${r.aspect}:1`;
  return lang === 'hi'
    ? `${shape} फ़ोटो · ${r.minWidth}×${r.minHeight} से ${r.maxWidth}×${r.maxHeight} · ${mb} MB तक · JPG/PNG/WebP`
    : `${shape} · ${r.minWidth}×${r.minHeight} to ${r.maxWidth}×${r.maxHeight} · up to ${mb} MB · JPG/PNG/WebP`;
}
