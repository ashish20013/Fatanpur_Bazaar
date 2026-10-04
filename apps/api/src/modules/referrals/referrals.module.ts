import { Body, Controller, Get, HttpCode, Module, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser, RequirePermission, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { ReferralsService } from './referrals.service';

@Controller('admin/referrals')
@Roles('ADMIN')
@RequirePermission('customers.manage')
export class AdminReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Get('flagged')
  flagged(): Promise<unknown> {
    return this.referrals.flagged();
  }
  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser, @Body() _b: unknown): Promise<{ ok: true }> {
    await this.referrals.approve(id, u.id);
    return { ok: true };
  }
}

@Module({ controllers: [AdminReferralsController], providers: [ReferralsService] })
export class ReferralsModule {}
