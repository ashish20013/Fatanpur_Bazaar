/**
 * Minimal Devanagari → Latin transliteration + a phonetic "skeleton" used for
 * Hindi↔roman matching in the village picker and product search_text.
 *   "रानीगंज" → "raaneeganj" → skeleton "rniganj"
 *   "Rani Ganj" → skeleton "rniganj"      (so "rani" / "रानी" / "Rani Ganj" all match)
 * It is intentionally lossy — good enough for a 15-village list and search hints,
 * not a linguistic tool.
 */
const VOWELS: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au',
};
const MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o',
};
const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v',
  श: 'sh', ष: 'sh', स: 's', ह: 'h',
};
/** Consonant + nukta (़) — decomposed form, which is what NFC yields for these letters. */
const NUKTA_FORMS: Record<string, string> = { क: 'q', ख: 'kh', ग: 'g', ज: 'z', ड: 'd', ढ: 'dh', फ: 'f' };
const NUKTA = '\u093C';
const HALANT = '\u094D';
const DEVA = /[\u0900-\u097F]/;

export function hasDevanagari(s: string): boolean {
  return DEVA.test(s);
}

export function transliterate(input: string): string {
  const chars = [...input.normalize('NFD')];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    let cons = CONSONANTS[ch];
    if (cons !== undefined) {
      if (chars[i + 1] === NUKTA) {
        cons = NUKTA_FORMS[ch] ?? cons;
        i++;
      }
      out += cons;
      const next = chars[i + 1];
      if (next === HALANT) i++;
      else if (next !== undefined && MATRAS[next]) {
        out += MATRAS[next];
        i++;
      } else if (next !== undefined && DEVA.test(next)) out += 'a';
      // else: word end → schwa deletion (रानीगंज → "...ganj", not "ganja")
      continue;
    }
    if (VOWELS[ch]) out += VOWELS[ch];
    else if (MATRAS[ch]) out += MATRAS[ch];
    else if (ch === '\u0902' || ch === '\u0901') out += 'n';
    else if (ch === '\u0903') out += 'h';
    else if (ch === HALANT || ch === NUKTA) continue;
    else out += ch;
  }
  return out.toLowerCase();
}

/**
 * Phonetic skeleton: lowercase roman, digraphs folded, all 'a' dropped (schwa is the
 * main source of spelling variance), repeated letters collapsed, non-letters removed.
 */
export function skeleton(input: string): string {
  let s = hasDevanagari(input) ? transliterate(input) : input.toLowerCase();
  s = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/ph/g, 'f')
    .replace(/ee|ii/g, 'i')
    .replace(/oo|uu/g, 'u')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/sh/g, 's')
    .replace(/q/g, 'k')
    .replace(/a/g, '')
    .replace(/(.)\1+/g, '$1');
  return s;
}

export function slugify(input: string): string {
  const base = hasDevanagari(input) ? transliterate(input) : input;
  return base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}
