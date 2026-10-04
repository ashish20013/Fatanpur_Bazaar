import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../../modules/identity/rate-limit.service';
import { RATE_LIMIT, type RateLimitSpec } from '../decorators';
import { clientIp, type AppRequest } from '../types';

/** Applies @RateLimit specs after auth (so 'user' buckets know the user). */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const specs = this.reflector.get<RateLimitSpec[] | undefined>(RATE_LIMIT, ctx.getHandler());
    if (!specs) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    for (const s of specs) {
      const who = s.by === 'user' ? (req.user ? `u${req.user.id}` : `ip${clientIp(req)}`) : clientIp(req);
      await this.limiter.hit(`${s.bucket}:${who}`, s.limit, s.windowSec);
    }
    return true;
  }
}
