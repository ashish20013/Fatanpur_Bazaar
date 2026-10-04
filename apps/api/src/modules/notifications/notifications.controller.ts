import { Body, Controller, Get, Inject, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PagedResult } from '../../common/interceptors/transform.interceptor';
import { pageArgs, type AppRequest, type AuthUser } from '../../common/types';
import { NotificationService } from './notification.service';
import { ENV, type Env } from '../../config/config.module';

const DeviceToken = z.object({ token: z.string().min(20).max(255), platform: z.enum(['ANDROID', 'IOS']), deviceId: z.string().max(64).optional() });
const WebPushSub = z.object({ endpoint: z.string().url().max(600), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

@Controller()
export class NotificationsController {
  constructor(
    private readonly notify: NotificationService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('users/me/notifications')
  async list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>): Promise<PagedResult<unknown>> {
    const { page, perPage } = pageArgs(q, 20, 50);
    const r = await this.notify.list(u.id, page, perPage);
    return new PagedResult(r.items, page, perPage, r.total);
  }

  @Patch('notifications/:id/read')
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.notify.markRead(u.id, id);
    return { ok: true };
  }

  @Patch('notifications/read-all')
  async readAll(@CurrentUser() u: AuthUser): Promise<{ ok: true }> {
    await this.notify.markRead(u.id, 'all');
    return { ok: true };
  }

  @Post('notifications/device-token')
  async deviceToken(@CurrentUser() u: AuthUser, @Body(new ZodPipe(DeviceToken)) b: z.infer<typeof DeviceToken>): Promise<{ ok: true }> {
    await this.notify.registerDeviceToken(u.id, b.token, b.platform, b.deviceId);
    return { ok: true };
  }

  @Post('notifications/device-token/deactivate')
  async deactivate(@CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ token: z.string().max(255) }))) b: { token: string }): Promise<{ ok: true }> {
    await this.notify.deactivateDeviceToken(u.id, b.token);
    return { ok: true };
  }

  @Post('notifications/web-push')
  async webPush(@CurrentUser() u: AuthUser, @Body(new ZodPipe(WebPushSub)) b: z.infer<typeof WebPushSub>, @Req() req: AppRequest): Promise<{ ok: true }> {
    await this.notify.saveWebPush(u.id, b, req.headers['user-agent']);
    return { ok: true };
  }

  @Public()
  @Get('notifications/vapid-public-key')
  vapid(): { key: string | null } {
    return { key: this.env.VAPID_PUBLIC_KEY ?? null };
  }
}
