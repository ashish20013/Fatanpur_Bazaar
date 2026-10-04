/**
 * Only same-site relative paths are allowed as a post-login destination.
 * Rejects `//evil.com`, `/\evil.com`, `https://…`, `javascript:` and control characters —
 * otherwise `/login?next=//evil.com` becomes an open redirect (phishing with our own domain).
 */
export function safeNext(next: unknown): string | null {
  // `?next=a&next=b` arrives as an array — anything but one plain string is ignored.
  if (typeof next !== 'string' || !next || next.length > 300) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\\]/.test(next)) return null;
  return next;
}
