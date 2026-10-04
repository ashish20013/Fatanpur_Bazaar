import { Controller, Get } from '@nestjs/common';
import { Owns, Resource } from '../../common/decorators';
import { notFound } from '../../common/errors';
import { TrackingService } from './tracking.service';

/** REST fallback for tracking (10 s polling when sockets fail) — same payload as tracking.snapshot. */
@Controller('orders')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get(':orderNumber/track')
  @Owns('order', 'orderNumber')
  async track(@Resource() order: { order_number: string }): Promise<unknown> {
    const s = await this.tracking.snapshot(order.order_number);
    if (!s) throw notFound();
    return s;
  }
}
