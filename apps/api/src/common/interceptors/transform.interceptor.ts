import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

/** Marker for paginated results so the envelope gets `meta`. */
export class PagedResult<T> {
  constructor(
    readonly items: T[],
    readonly page: number,
    readonly perPage: number,
    readonly total: number,
  ) {}
}
/** Marker for raw responses (files, redirects, webhooks) that must bypass the envelope. */
export class RawResponse {
  constructor(readonly body: unknown) {}
}

/** {ok:true, data, meta?} envelope for every JSON response (API_DOCUMENTATION §1). */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    return next.handle().pipe(
      map((value: unknown) => {
        if (value instanceof RawResponse) return value.body;
        if (value instanceof PagedResult) {
          return { ok: true, data: value.items, meta: { page: value.page, perPage: value.perPage, total: value.total, hasMore: value.page * value.perPage < value.total } };
        }
        return { ok: true, data: value ?? null };
      }),
    );
  }
}
