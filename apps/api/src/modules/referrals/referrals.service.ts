import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { Log } from '../../common/logger';
import { fromPaise } from '../../common/utils/money';
import { decideReferral } from '../../domain/referral';
import { SettingsService } from '../settings/settings.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationService } from '../notifications/notification.service';
import { OrderStateService, type TransitionCtx } from '../orders/order-state.service';

/** A22 Referral.check on DELIVERED/COMPLETED — every anti-abuse guard, then credit in the same trx. */
@Injectable()
export class ReferralsService implements OnModuleInit {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
    private readonly wallet: WalletService,
    private readonly notify: NotificationService,
    private readonly state: OrderStateService,
  ) {}

  onModuleInit(): void {
    this.state.registerHook({ name: 'referral', after: (c) => this.onTransition(c) });
  }

  private async onTransition(ctx: TransitionCtx): Promise<void> {
    if (ctx.to !== 'DELIVERED' && ctx.to !== 'COMPLETED') return;
    if (!(await this.settings.bool('referral_enabled', true))) return;
    const { trx, order } = ctx;
    const ref = await trx('referrals').where({ referred_id: order.customer_id }).whereNull('reward_issued_at').forUpdate().first();
    if (!ref) return;
    const [{ n }] = (await trx('orders').where({ customer_id: order.customer_id }).whereIn('status', ['DELIVERED', 'COMPLETED']).count({ n: '*' })) as { n: number }[];
    const customer = await trx('users').where({ id: order.customer_id }).first('phone_verified');
    const referrerSession = await trx('auth_sessions').where({ user_id: ref.referrer_id }).orderBy('id').first('ip_address');
    const addr = await trx('addresses').where({ id: order.address_id }).first('line1', 'village_id');
    const sameAddress = addr ? Boolean(await trx('addresses').where({ user_id: ref.referrer_id, line1: addr.line1, village_id: addr.village_id }).first('id')) : false;
    const [{ today }] = (await trx('referrals').whereRaw('DATE(reward_issued_at) = CURDATE()').count({ today: '*' })) as { today: number }[];
    const payment = await trx('payments').where({ order_id: order.id }).first('status');
    const decision = decideReferral({
      referral: ref,
      customerId: order.customer_id,
      deliveredCount: Number(n),
      paymentStatus: payment?.status ?? order.payment_status,
      payable: String(order.final_grand_total ?? order.grand_total),
      minOrder: await this.settings.str('referral_min_order', '199.00'),
      phoneVerified: Number(customer?.phone_verified) === 1,
      referrerSignupIp: referrerSession?.ip_address ?? null,
      sameAddress,
      rewardsToday: Number(today),
      dailyCap: await this.settings.int('referral_daily_cap', 3),
    });
    if (decision.action === 'FLAG') {
      await trx('referrals').where({ id: ref.id }).update({ is_flagged: 1 });
      Log.info('referral.flagged', { referralId: ref.id, why: decision.why });
      return;
    }
    if (decision.action !== 'REWARD') return;
    const amount = await this.settings.money('referral_reward', 5000);
    await this.wallet.credit(trx, ref.referrer_id, amount, 'REFERRAL_REWARD', order.order_number, 'रेफ़रल इनाम');
    await trx('referrals').where({ id: ref.id }).update({ reward_amount: fromPaise(amount), reward_issued_at: trx.fn.now() });
    await this.notify.send({ userId: ref.referrer_id, type: 'referral.reward', title: 'रेफ़रल इनाम मिला 🎉', body: `आपके दोस्त का पहला ऑर्डर पहुँच गया — ₹${Number(fromPaise(amount))} आपके वॉलेट में।`, channels: ['IN_APP', 'PUSH'], dedupeKey: `ref:${ref.id}` }, trx);
  }

  async flagged(): Promise<unknown[]> {
    return this.db('referrals as r').join('users as a', 'a.id', 'r.referrer_id').join('users as b', 'b.id', 'r.referred_id').where('r.is_flagged', 1).whereNull('r.reward_issued_at').select('r.id', 'a.name as referrer', 'b.name as referred', 'r.created_at as createdAt');
  }

  /** Admin approves a flagged referral → pay it (still only once). */
  async approve(id: number, actorId: number): Promise<void> {
    await this.db.transaction(async (trx) => {
      const ref = await trx('referrals').where({ id, is_flagged: 1 }).whereNull('reward_issued_at').forUpdate().first();
      if (!ref) return;
      const amount = await this.settings.money('referral_reward', 5000);
      await this.wallet.credit(trx, ref.referrer_id, amount, 'REFERRAL_REWARD', `ref:${id}`, 'रेफ़रल इनाम (मंज़ूर)', actorId);
      await trx('referrals').where({ id }).update({ reward_amount: fromPaise(amount), reward_issued_at: trx.fn.now(), is_flagged: 0 });
    });
  }
}
