import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { Log } from '../../common/logger';
import { CronService } from '../jobs/cron.service';
import { QueueService } from '../jobs/queue.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationService } from '../notifications/notification.service';
import { OrderStateService, SYSTEM_ACTOR } from './order-state.service';

/** Order-related cron + job handlers (A26). */
@Injectable()
export class OrdersTasks implements OnModuleInit {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly cron: CronService,
    private readonly queue: QueueService,
    private readonly settings: SettingsService,
    private readonly state: OrderStateService,
    private readonly notify: NotificationService,
  ) {}

  onModuleInit(): void {
    this.cron.register({ name: 'orders:auto-cancel', schedule: { every: true }, run: () => this.autoCancel() });
    this.queue.register('order.review_request', (p) => this.reviewRequest(String(p.orderNumber)));
  }

  /**
   * Unpaid orders die after order_auto_cancel_min — EXCEPT rx-pending ones (own 24 h timeout) and
   * AWAITING_VERIFICATION (the customer already sent money; a human must look).
   */
  async autoCancel(): Promise<string> {
    const mins = await this.settings.int('order_auto_cancel_min', 30);
    const rxHours = await this.settings.int('rx_pending_timeout_hours', 24);
    const stale = (await this.db('orders')
      .where('status', 'PENDING_PAYMENT')
      .where('payment_status', '<>', 'AWAITING_VERIFICATION')
      .where((w) =>
        w
          .where((a) => a.whereNot((x) => x.where('requires_prescription', 1).andWhere('prescription_status', 'PENDING_REVIEW')).andWhere('placed_at', '<', this.db.raw('NOW() - INTERVAL ? MINUTE', [mins])))
          .orWhere((b) => b.where('requires_prescription', 1).andWhere('prescription_status', 'PENDING_REVIEW').andWhere('placed_at', '<', this.db.raw('NOW() - INTERVAL ? HOUR', [rxHours]))),
      )
      .limit(100)
      .pluck('order_number')) as string[];
    let n = 0;
    for (const no of stale) {
      try {
        await this.state.changeStatus(no, 'CANCELLED', SYSTEM_ACTOR, { note: 'समय पर भुगतान/पुष्टि नहीं हुई — अपने आप रद्द' });
        n++;
      } catch (e) {
        Log.warn('orders.auto_cancel_failed', { orderNumber: no, err: String(e) });
      }
    }
    return `cancelled ${n}/${stale.length}`;
  }

  private async reviewRequest(orderNumber: string): Promise<void> {
    if (!(await this.settings.bool('reviews_enabled', true))) return;
    const o = await this.db('orders').where({ order_number: orderNumber }).whereIn('status', ['DELIVERED', 'COMPLETED']).first('customer_id');
    if (!o) return;
    await this.notify.send({ userId: o.customer_id, type: 'review.request', title: 'आपका अनुभव कैसा रहा?', body: 'सामान और डिलीवरी को स्टार दें — इससे हमें और बेहतर बनने में मदद मिलती है।', linkUrl: `/mera/order/${orderNumber}#review`, channels: ['IN_APP', 'PUSH'], dedupeKey: `review:${orderNumber}` });
  }
}
