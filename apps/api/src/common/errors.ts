import { ERROR_CATALOG, formatMessage, type ErrorCode } from '@fb/shared-types';

/**
 * The one exception type business code throws. The filter turns it into the envelope
 * { ok:false, error:{ code, message(hi), field?, ref, data? } } with the catalogue HTTP status.
 */
export class AppError extends Error {
  readonly status: number;
  readonly messageHi: string;
  /** English twin for the English-only staff panels. Any `<name>En` param overrides `{<name>}` (e.g. reasonEn, areaEn). */
  readonly messageEn: string;
  constructor(
    readonly code: ErrorCode,
    readonly params: Record<string, string | number> = {},
    readonly extra: { field?: string; data?: Record<string, unknown>; status?: number; headers?: Record<string, string>; hi?: string } = {},
  ) {
    const entry = ERROR_CATALOG[code];
    super(`${code}: ${formatMessage(entry.en, params)}`);
    this.status = extra.status ?? entry.http;
    this.messageHi = extra.hi ?? formatMessage(entry.hi, params);
    this.messageEn = formatMessage(entry.en, englishParams(params));
  }
}

function englishParams(params: Record<string, string | number>): Record<string, string | number> {
  const out = { ...params };
  for (const k of Object.keys(params)) if (k.endsWith('En') && k.length > 2) out[k.slice(0, -2)] = params[k] as string | number;
  return out;
}

/** Shorthands for the most common cases. */
export const notFound = (): AppError => new AppError('NOT_FOUND');
export const forbidden = (): AppError => new AppError('FORBIDDEN');
export const conflict = (reason: string, data?: Record<string, unknown>, reasonEn?: string): AppError =>
  new AppError('CONFLICT', reasonEn ? { reason, reasonEn } : { reason }, { data });
export const rule = (reason: string, data?: Record<string, unknown>, reasonEn?: string): AppError =>
  new AppError('BUSINESS_RULE', reasonEn ? { reason, reasonEn } : { reason }, { data });

/**
 * Thrown from inside a transaction when a side effect (e.g. OTP attempt counter) must be
 * COMMITTED even though the request fails. Transaction wrappers commit, then rethrow `inner`.
 */
export class CommitThenThrow extends Error {
  constructor(readonly inner: AppError) {
    super(inner.message);
  }
}

export function isDuplicateKey(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ER_DUP_ENTRY';
}
