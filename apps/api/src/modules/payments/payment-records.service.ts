import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import type { UpiDetails } from '@fb/shared-types';
// import { KNEX } from '../../database/knex.provider';
import { SettingsService } from '../settings/settings.service';

/**
 * Dependency-free core of the payments domain (no import of orders) so order placement and the
 * state machine can create/settle payment rows without a module cycle.
 */
@Injectable()
export class PaymentRecordsService {
  constructor(private readonly settings: SettingsService) {}

  async createForOrder(
    trx: Knex.Transaction,
    orderId: number,
    method: 'COD' | 'UPI' | 'WALLET' | 'GATEWAY',
    amount: string,
  ): Promise<void> {
    await trx('payments').insert({
      order_id: orderId,
      method,
      status: method === 'WALLET' ? 'PAID' : 'PENDING',
      amount,
      upi_vpa: method === 'UPI' ? await this.settings.str('upi_vpa') : null,
      paid_at: method === 'WALLET' ? trx.fn.now() : null,
      gateway: method === 'GATEWAY' ? await this.settings.str('gateway_driver', 'razorpay') : null,
    });
  }

  /** upi://pay intent — opens GPay/PhonePe/Paytm on Android; desktop shows the QR of the same string. */
  async upiDetails(orderNumber: string, amount: string, apiUrl: string): Promise<UpiDetails> {
    const vpa = await this.settings.str('upi_vpa');
    const payeeName = await this.settings.str('upi_payee_name', 'Fatanpur Bazaar');
    const params = new URLSearchParams({ pa: vpa, pn: payeeName, am: amount, cu: 'INR', tn: orderNumber });
    return {
      vpa,
      payeeName,
      amount,
      intentUrl: `upi://pay?${params.toString().replace(/\+/g, '%20')}`,
      qrUrl: `${apiUrl}/v1/payments/upi-qr/${orderNumber}.png`,
      instructions: 'भुगतान के बाद UTR नंबर डालें',
    };
  }
}
