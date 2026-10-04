/**
 * Allowlist HTML sanitiser for staff-authored content (SECURITY_AUDIT §4):
 * p, b, strong, i, em, ul, ol, li, a[href], h2–h4, br, blockquote. Everything else is dropped;
 * attributes other than a safe href are removed. Deliberately tiny — no dependency, no DOM.
 *
 * It is a single left-to-right TOKENISER, not a find-and-replace: every `<` either starts a
 * complete, well-formed tag that we re-emit ourselves, or it is written out as `&lt;`; every
 * stray `>` becomes `&gt;`. So nothing that is not our own output can open a tag — an unclosed
 * `<img src=x onerror=… x=` (which a regex-replace would pass through untouched) turns into text.
 */
const ALLOWED = new Set(['p', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a', 'h2', 'h3', 'h4', 'br', 'blockquote']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript|textarea|title)\b[\s\S]*?<\/\1\s*>/gi;
const TAG = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*)?)\/?>/;

function safeHref(attrs: string): string | null {
  const m = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  const href = (m?.[2] ?? m?.[3] ?? m?.[4] ?? '').trim();
  return /^(https?:\/\/|\/(?!\/)|#|tel:|mailto:)/i.test(href) && !/["'<>`\s]/.test(href) ? href : null;
}

function emitTag(closing: boolean, tagRaw: string, attrs: string): string {
  const tag = tagRaw.toLowerCase();
  if (!ALLOWED.has(tag)) return '';
  if (closing) return tag === 'br' ? '' : `</${tag}>`;
  if (tag === 'br') return '<br>';
  if (tag !== 'a') return `<${tag}>`;
  const href = safeHref(attrs);
  if (!href) return '<a>';
  return `<a href="${href}"${/^https?:/i.test(href) ? ' rel="nofollow noopener" target="_blank"' : ''}>`;
}

export function sanitizeHtml(input: string): string {
  const s = input.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(DROP_WITH_CONTENT, '');
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '<') {
      const m = TAG.exec(s.slice(i, i + 2000));
      if (m) {
        out += emitTag(m[1] === '/', m[2], m[3]);
        i += m[0].length;
        continue;
      }
      out += '&lt;';
    } else if (ch === '>') {
      out += '&gt;';
    } else {
      out += ch;
    }
    i++;
  }
  return out;
}
