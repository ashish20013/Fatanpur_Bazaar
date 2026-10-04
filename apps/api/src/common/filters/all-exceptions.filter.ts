import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { ERROR_CATALOG, type ErrorCode } from '@fb/shared-types';
import { AppError, CommitThenThrow } from '../errors';
import { Log } from '../logger';
import type { AppRequest } from '../types';

/**
 * Every error → { ok:false, error:{ code, message(hi), field?, ref } }.
 * Stack traces, SQL errors and file paths NEVER leave the process (SECURITY_AUDIT §11);
 * the `ref` lets support find the full log line.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<AppRequest>();
    const ref = randomBytes(3).toString('hex');
    const ex = exception instanceof CommitThenThrow ? exception.inner : exception;

    let status = 500;
    let code: ErrorCode = 'INTERNAL';
    let message: string = ERROR_CATALOG.INTERNAL.hi;
    let messageEn: string = ERROR_CATALOG.INTERNAL.en;
    let field: string | undefined;
    let data: Record<string, unknown> | undefined;

    if (ex instanceof AppError) {
      status = ex.status;
      code = ex.code;
      message = ex.messageHi;
      messageEn = ex.messageEn;
      field = ex.extra.field;
      data = ex.extra.data;
      for (const [k, v] of Object.entries(ex.extra.headers ?? {})) res.setHeader(k, v);
    } else if (ex instanceof HttpException) {
      status = ex.getStatus();
      code = mapHttp(status);
      message = ERROR_CATALOG[code].hi;
      messageEn = ERROR_CATALOG[code].en;
    } else if (isBodyTooLarge(ex)) {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = ERROR_CATALOG.PAYLOAD_TOO_LARGE.hi;
      messageEn = ERROR_CATALOG.PAYLOAD_TOO_LARGE.en;
    } else if (isBadJson(ex)) {
      status = 400;
      code = 'VALIDATION_FAILED';
      message = ERROR_CATALOG.VALIDATION_FAILED.hi;
      messageEn = ERROR_CATALOG.VALIDATION_FAILED.en;
    }

    /*
     * `errorCode`, not `code`.
     *
     * The logger redacts any field named `code`, because that is what an OTP is called. Our
     * error code is the opposite of a secret — it is the single most useful word in the line —
     * and logging it under that name turned every entry into "code: [redacted]", which told a
     * person reading the log nothing at all. Different thing, different name.
     */
    const meta = { ref, status, errorCode: code, method: req.method, route: req.route?.path ?? req.path, userId: req.user?.id };
    if (status >= 500) Log.error('request.failed', { ...meta, err: ex instanceof Error ? { name: ex.name, message: ex.message, stack: ex.stack } : String(ex) });
    else Log.warn('request.rejected', meta);

    if (res.headersSent) return;
    res.status(status).json({ ok: false, error: { code, message, messageEn, ...(field ? { field } : {}), ref, ...(data ? { data } : {}) } });
  }
}

function mapHttp(status: number): ErrorCode {
  switch (status) {
    case 400: return 'VALIDATION_FAILED';
    case 401: return 'UNAUTHENTICATED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 415: return 'UNSUPPORTED_FILE';
    case 429: return 'RATE_LIMITED';
    default: return status >= 500 ? 'INTERNAL' : 'BUSINESS_RULE';
  }
}
function isBodyTooLarge(e: unknown): boolean {
  return typeof e === 'object' && e !== null && ((e as { type?: string }).type === 'entity.too.large' || (e as { code?: string }).code === 'LIMIT_FILE_SIZE');
}
function isBadJson(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { type?: string }).type === 'entity.parse.failed';
}
