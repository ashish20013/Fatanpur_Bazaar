import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { CurrentUser, Public, RateLimit } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { AppError } from '../../common/errors';
import { clientIp, type AppRequest, type AuthUser } from '../../common/types';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { OtpSendSchema, OtpVerifySchema, RefreshSchema, type OtpSendDto, type OtpVerifyDto } from './auth.schemas';
import type { z } from 'zod';

/**
 * Tokens are always returned in the body. Web: the Next.js BFF stores them in httpOnly cookies on
 * its own domain (JS never sees them). Mobile: Keychain / EncryptedSharedPreferences.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post('otp/send')
  @HttpCode(200)
  @RateLimit({ bucket: 'login:ip', by: 'ip', limit: 20, windowSec: 900 })
  send(@Body(new ZodPipe(OtpSendSchema)) dto: OtpSendDto, @Req() req: AppRequest): Promise<unknown> {
    return this.auth.sendOtp(dto, clientIp(req));
  }

  /** Query params (?role=ADMIN) are never read here; body passes the role-less Zod schema. */
  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @RateLimit({ bucket: 'login:ip', by: 'ip', limit: 20, windowSec: 900 })
  verify(@Body(new ZodPipe(OtpVerifySchema)) dto: OtpVerifyDto, @Req() req: AppRequest): Promise<unknown> {
    return this.auth.verifyOtp(dto, { platform: dto.platform, deviceId: dto.deviceId ?? (req.headers['x-device-id'] as string | undefined), userAgent: req.headers['user-agent'], ip: clientIp(req) });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ bucket: 'refresh:ip', by: 'ip', limit: 60, windowSec: 900 })
  refresh(@Body(new ZodPipe(RefreshSchema)) body: z.infer<typeof RefreshSchema>, @Req() req: AppRequest): Promise<unknown> {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.fb_rt;
    const token = body.refreshToken ?? (cookieToken && /^[a-f0-9]{64}$/.test(cookieToken) ? cookieToken : undefined);
    if (!token) throw new AppError('UNAUTHENTICATED');
    const platform = (req.headers['x-platform'] as 'WEB' | 'ANDROID' | 'IOS' | undefined) ?? 'WEB';
    return this.auth.refresh(token, { platform: ['WEB', 'ANDROID', 'IOS'].includes(platform) ? platform : 'WEB', deviceId: body.deviceId, userAgent: req.headers['user-agent'], ip: clientIp(req) });
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() u: AuthUser, @Req() req: AppRequest, @Body(new ZodPipe(RefreshSchema)) body: z.infer<typeof RefreshSchema>): Promise<{ ok: true }> {
    await this.auth.logout(u.id, sessionIdFrom(req), body.refreshToken);
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() u: AuthUser): Promise<{ revoked: number }> {
    return { revoked: await this.auth.logoutAll(u.id) };
  }

  @Get('me')
  me(@CurrentUser() u: AuthUser): Promise<unknown> {
    return this.auth.me(u.id);
  }

  @Get('sessions')
  sessions(@CurrentUser() u: AuthUser): Promise<unknown> {
    return this.auth.sessions(u.id);
  }

  @Delete('sessions/:id')
  async revoke(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.tokens.revokeSession(id, u.id, 'user_revoked');
    return { ok: true };
  }
}

/** `sid` claim of the (already verified) access token. */
function sessionIdFrom(req: AppRequest): number | undefined {
  const h = req.headers.authorization;
  if (!h) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(h.slice(7).split('.')[1] ?? '', 'base64url').toString('utf8')) as { sid?: number };
    return typeof payload.sid === 'number' ? payload.sid : undefined;
  } catch {
    return undefined;
  }
}
