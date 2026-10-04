import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
// import { KNEX } from '../../database/knex.provider';
import { AppError, notFound } from '../../common/errors';

/** A14 step 5 prescription gate — shared by placement without importing the rx review flow. */
@Injectable()
export class PrescriptionRecordsService {
  // constructor(@Inject(KNEX) private readonly db: Knex) {}

  async validateForOrder(
    trx: Knex.Transaction,
    userId: number,
    rxId: number | undefined,
  ): Promise<{ id: number; status: 'PENDING_REVIEW' | 'APPROVED' }> {
    if (!rxId) throw new AppError('PRESCRIPTION_REQUIRED');
    const rx = await trx('prescriptions')
      .where({ id: rxId, user_id: userId })
      .forUpdate()
      .first('id', 'order_id', 'status', 'expires_at', 'purged_at');
    if (!rx) throw notFound();
    if (rx.order_id)
      throw new AppError(
        'PRESCRIPTION_INVALID',
        {},
        { data: { reason: 'यह पर्ची पहले इस्तेमाल हो चुकी है' } },
      );
    if (rx.status === 'REJECTED' || rx.purged_at) throw new AppError('PRESCRIPTION_INVALID');
    if (rx.expires_at && new Date(rx.expires_at).getTime() < Date.now())
      throw new AppError('PRESCRIPTION_INVALID', {}, { data: { reason: 'पर्ची की वैधता खत्म' } });
    return { id: rx.id, status: rx.status };
  }

  async attach(trx: Knex.Transaction, rxId: number, orderId: number): Promise<void> {
    await trx('prescriptions').where({ id: rxId }).update({ order_id: orderId });
  }
}
