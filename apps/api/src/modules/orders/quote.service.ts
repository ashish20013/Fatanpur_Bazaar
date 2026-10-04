import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import type { QuoteResponse } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { AppError, notFound } from '../../common/errors';
import { fromPaise, mulQty, toPaise, type Paise } from '../../common/utils/money';
import { isOpenAt, istMinutes } from '../../common/utils/time';
import { computeQuote, quoteBreakdown, QuoteError, type QuoteOutput } from '../../domain/pricing';
import type { CheckResult } from '../../domain/serviceability';
import { SettingsService } from '../settings/settings.service';
import { ServiceAreaService } from '../service-area/service-area.service';
import { CatalogService, type ProductForOrder } from '../catalog/catalog.service';
import { CouponsService } from '../coupons/coupons.service';
import { WalletService } from '../wallet/wallet.service';

export interface QuoteInput {
  addressId: number;
  items: { productId: number; quantity: number }[];
  couponCode?: string;
  useWallet?: boolean;
  paymentMethod: 'COD' | 'UPI' | 'WALLET' | 'GATEWAY';
  orderType?: 'DELIVERY' | 'SERVICE';
}
export interface QuoteContext {
  out: QuoteOutput;
  address: Record<string, unknown> & { id: number; receiver_name: string; phone: string; line1: string; landmark: string | null; latitude: string | null; longitude: string | null };
  villageName: string | null;
  check: CheckResult;
  products: Map<number, ProductForOrder>;
  couponId: number | null;
  etaMinutes: number;
  orderType: 'DELIVERY' | 'SERVICE';
  warnings: string[];
}

/** A12 — server-only pricing. Nothing monetary is read from the client. */
@Injectable()
export class QuoteService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
    private readonly sa: ServiceAreaService,
    private readonly catalog: CatalogService,
    private readonly coupons: CouponsService,
    private readonly wallet: WalletService,
  ) {}

  async build(userId: number, input: QuoteInput, trx?: Knex.Transaction): Promise<QuoteContext> {
    const conn = trx ?? this.db;
    // 1. address must be the caller's (else 404 — never 403)
    const address = await conn('addresses').where({ id: input.addressId, user_id: userId }).whereNull('deleted_at').first();
    if (!address) throw notFound();
    // 2. service-area gate — re-evaluated LIVE (village may have been switched off since save)
    const check = await this.sa.check({
      villageId: address.village_id ?? undefined,
      lat: address.latitude !== null ? Number(address.latitude) : undefined,
      lng: address.longitude !== null ? Number(address.longitude) : undefined,
      accuracyM: address.gps_accuracy_m ?? undefined,
    });
    const villageName = check.village ? check.village.nameHi ?? check.village.name : null;
    if (!check.serviceable) throw this.sa.outOfAreaError(check, villageName ?? 'इस पते');

    /*
     * 3. Store hours — accepted, not refused.
     *
     * The shop shuts at night; the website does not. An order placed at 11pm is a real order, and
     * turning it away sends a first-time customer to sleep annoyed and to somebody else tomorrow.
     * So we take it and say plainly when it will arrive. `accept_orders_when_closed = 0` puts the
     * old refusal back for a shopkeeper who would rather not wake up to a queue.
     */
    const open = await this.settings.str('store_open_time', '07:00');
    const close = await this.settings.str('store_close_time', '21:00');
    const shopOpen = isOpenAt(istMinutes(), open, close);
    if (!shopOpen && !(await this.settings.bool('accept_orders_when_closed', true))) {
      throw new AppError('STORE_CLOSED', { time: open });
    }

    // 5. products — ONE IN query
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const products = await this.catalog.productsForOrder(ids, trx);
    const orderType = input.orderType ?? ([...products.values()].some((p) => p.item_type === 'SERVICE') ? 'SERVICE' : 'DELIVERY');
    if ([...products.values()].some((p) => (p.item_type === 'SERVICE') !== (orderType === 'SERVICE'))) {
      throw new AppError('BUSINESS_RULE', { reason: 'सामान और सेवा का ऑर्डर अलग-अलग करें' });
    }

    // 8. coupon (discount is on items only)
    const itemsPreview = input.items.reduce<Paise>((s, i) => {
      const p = products.get(i.productId);
      return p ? s + mulQty(toPaise(p.price), i.quantity) : s;
    }, 0);
    let discount: Paise = 0;
    let couponId: number | null = null;
    const warnings: string[] = [];
    // Said once here so the cart, the checkout and the confirmation screen all say the same thing.
    if (!shopOpen) warnings.push(`CLOSED_NOW:${open}`);
    if (input.couponCode) {
      const r = await this.coupons.evaluate(input.couponCode, { userId, itemsTotal: itemsPreview, orderType }, trx);
      if (!r.ok) throw new AppError('COUPON_INVALID', { reason: r.reason });
      discount = r.discount;
      couponId = r.coupon.id;
    }

    // 12. trust facts
    const user = await conn('users').where({ id: userId }).first('phone_verified');
    const [{ delivered }] = (await conn('orders').where({ customer_id: userId }).whereIn('status', ['DELIVERED', 'COMPLETED']).count({ delivered: '*' })) as { delivered: number }[];
    const walletBalance = input.useWallet ? await this.wallet.balance(userId, trx) : 0;

    let out: QuoteOutput;
    try {
      out = computeQuote({
        lines: input.items,
        products: new Map([...products].map(([id, p]) => [id, { ...p, stock_qty: Number(p.stock_qty) }])),
        orderType,
        minOrder: check.minOrder,
        deliveryFee: check.deliveryFee,
        freeDeliveryAbove: await this.settings.money('free_delivery_above', 0),
        discount,
        walletBalance,
        useWallet: Boolean(input.useWallet),
        paymentMethod: input.paymentMethod,
        trust: {
          phoneVerified: Number(user?.phone_verified) === 1,
          deliveredCount: Number(delivered),
          trustOrdersNeeded: await this.settings.int('trust_orders_needed', 1),
          codUnverifiedLimit: await this.settings.money('cod_unverified_limit', 50000),
        },
      });
    } catch (e) {
      if (e instanceof QuoteError) throw new AppError(e.code, e.params);
      throw e;
    }
    if (input.paymentMethod === 'WALLET' && out.grandTotal > 0) throw new AppError('PAYMENT_METHOD_UNAVAILABLE');
    // 13. ETA (A8.8 — never empty)
    const etaMinutes = check.etaMinutes;
    return { out, address, villageName, check, products, couponId, etaMinutes, orderType, warnings };
  }

  toResponse(ctx: QuoteContext): QuoteResponse {
    const o = ctx.out;
    return {
      itemsTotal: fromPaise(o.itemsTotal),
      deliveryFee: fromPaise(o.deliveryFee),
      visitingCharge: fromPaise(o.visitingCharge),
      discount: fromPaise(o.discount),
      walletUsed: fromPaise(o.walletUsed),
      grandTotal: fromPaise(o.grandTotal),
      needsPrescription: o.needsPrescription,
      etaMinutes: ctx.etaMinutes,
      breakdown: quoteBreakdown(o),
      warnings: ctx.warnings,
    };
  }
}
