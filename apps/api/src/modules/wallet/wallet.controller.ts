import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators';
import { pageArgs, type AuthUser } from '../../common/types';
import { WalletService } from './wallet.service';

@Controller('users/me/wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  async mine(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>): Promise<{ balance: string; items: unknown[]; page: number; perPage: number; total: number }> {
    const { page, perPage } = pageArgs(q, 20, 50);
    const r = await this.wallet.history(u.id, page, perPage);
    return { balance: r.balance, items: r.items, page, perPage, total: r.total };
  }
}
