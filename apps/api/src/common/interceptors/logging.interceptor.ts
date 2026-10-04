import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { tap, type Observable } from 'rxjs';
import { Log } from '../logger';
import type { AppRequest } from '../types';

/** One line per request with latency — slow ones (>400 ms, the p95 hard-fail budget) at warn. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const t0 = process.hrtime.bigint();
    return next.handle().pipe(
      tap(() => {
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        const meta = { method: req.method, route: req.route?.path ?? req.path, ms: Math.round(ms), userId: req.user?.id };
        if (ms > 400) Log.warn('request.slow', meta);
        else Log.debug('request', meta);
      }),
    );
  }
}
