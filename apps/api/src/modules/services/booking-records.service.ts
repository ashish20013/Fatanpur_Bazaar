import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { AppError } from '../../common/errors';
import { fourDigitCode } from '../../common/utils/ids';
import { hhmmToMinutes, minutesToHhmm } from '../../common/utils/time';
import { SettingsService } from '../settings/settings.service';

/** Creation + capacity check of service_bookings — used by order placement (A14 step 17, A24). */
@Injectable()
export class BookingRecordsService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
  ) {}

  async technicianCount(conn: Knex | Knex.Transaction = this.db): Promise<number> {
    const [{ n }] = (await conn('users as u').join('staff_profiles as s', 's.user_id', 'u.id').where('u.status', 'ACTIVE').whereIn('u.role', ['DELIVERY_BOY', 'SUPERVISOR']).where('s.is_available', 1).count({ n: '*' })) as { n: number }[];
    return Math.max(1, Number(n));
  }

  async create(trx: Knex.Transaction, orderId: number, slot: { date: string; start: string }, visitingCharge: string, customerNote: string | null): Promise<void> {
    const slotMin = await this.settings.int('service_slot_minutes', 120);
    // Capacity re-checked inside the transaction (A24) — two customers can't both take the last slot.
    const [{ n }] = (await trx('service_bookings').where({ scheduled_date: slot.date, slot_start: `${slot.start}:00` }).forUpdate().count({ n: '*' })) as { n: number }[];
    if (Number(n) >= (await this.technicianCount(trx))) throw new AppError('SLOT_UNAVAILABLE');
    await trx('service_bookings').insert({
      order_id: orderId,
      scheduled_date: slot.date,
      slot_start: `${slot.start}:00`,
      slot_end: `${minutesToHhmm(hhmmToMinutes(slot.start) + slotMin)}:00`,
      visiting_charge: visitingCharge,
      completion_otp: fourDigitCode(),
      customer_note: customerNote,
    });
  }
}
