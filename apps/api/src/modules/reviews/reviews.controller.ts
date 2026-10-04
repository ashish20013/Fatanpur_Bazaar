import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public, RequirePermission, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import type { AuthUser } from '../../common/types';
import { ReviewsService } from './reviews.service';

const ReviewSchema = z.object({ targetType: z.enum(['ORDER', 'PRODUCT', 'RIDER']), targetId: z.number().int().positive().optional(), rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() });

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('orders/:orderNumber/review')
  create(@Param('orderNumber') no: string, @CurrentUser() u: AuthUser, @Body(new ZodPipe(ReviewSchema)) b: z.infer<typeof ReviewSchema>): Promise<unknown> {
    return this.reviews.create(u.id, no, b);
  }

  @Public()
  @Get('catalog/products/:id/reviews')
  list(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.reviews.forProduct(id);
  }

  @Get('admin/reviews/flagged')
  @Roles('ADMIN', 'SUPERVISOR')
  @RequirePermission('content.manage')
  flagged(): Promise<unknown> {
    return this.reviews.flaggedList();
  }

  @Patch('admin/reviews/:id')
  @HttpCode(200)
  @Roles('ADMIN', 'SUPERVISOR')
  @RequirePermission('content.manage')
  async moderate(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(z.object({ approve: z.boolean() }))) b: { approve: boolean }): Promise<{ ok: true }> {
    await this.reviews.moderate(id, b.approve);
    return { ok: true };
  }
}
