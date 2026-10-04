import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IdentityService } from '../../modules/identity/identity.service';
import { IS_PUBLIC, OPTIONAL_AUTH } from '../decorators';
import { AppError } from '../errors';
import type { AppRequest } from '../types';

interface AccessPayload {
  sub: number;
  role: string;
  jti: string;
  /** auth_sessions.id this token was minted for — revoking that row kills the token. */
  sid?: number;
  typ?: string;
}

/** A5 JwtAuthGuard — signature + exp, then role/status from the DB (never from the token). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true; // sockets authenticate in the gateway handshake
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, targets);
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const token = this.bearer(req);
    if (isPublic && !optional) return true;
    if (!token) {
      if (optional) return true;
      throw new AppError('UNAUTHENTICATED');
    }
    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      if (optional) return true; // a stale token must not break public pages
      throw new AppError('UNAUTHENTICATED');
    }
    if (payload.typ && payload.typ !== 'access') throw new AppError('UNAUTHENTICATED');
    const user = await this.identity.loadAuthUser(Number(payload.sub));
    if (!user) throw new AppError('UNAUTHENTICATED');
    // Status first: disabling someone also revokes his sessions, and "your account is closed"
    // (403) is a more useful answer than "log in again" (401) — matrix §0 asks for 403 here.
    if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_DISABLED');
    // A revoked session must stop working now, not in 15 minutes when the JWT expires.
    if (!(await this.identity.isSessionLive(payload.sid))) {
      if (optional) return true;
      throw new AppError('UNAUTHENTICATED');
    }
    req.user = user;
    return true;
  }

  private bearer(req: AppRequest): string | null {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    const t = h.slice(7).trim();
    return t.length > 0 && t.length < 2048 ? t : null;
  }
}
