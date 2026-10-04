import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Owns, Public, Resource, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { AppError } from '../../common/errors';
import type { AuthUser } from '../../common/types';
import { ServicesService } from './services.service';

type Booking = { id: number; order_id: number; order_number: string; customer_id: number; technician_id: number | null; scheduled_date: string; slot_start: string; reschedule_count: number };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

@Controller()
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Public()
  @Get('catalog/services/:slug/slots')
  slots(@Param('slug') slug: string, @Query('date') date: string): Promise<unknown> {
    if (!DATE.test(date ?? '')) throw new AppError('VALIDATION_FAILED', {}, { field: 'date' });
    return this.services.slots(slug, date);
  }

  @Get('services/bookings')
  mine(@CurrentUser() u: AuthUser): Promise<unknown> {
    return u.role === 'CUSTOMER' ? this.services.myBookings(u.id) : this.services.technicianJobs(u.id);
  }

  @Post('services/bookings/:id/reschedule')
  @HttpCode(200)
  @Owns('booking')
  reschedule(@Resource() b: Booking, @CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ date: z.string().regex(DATE), start: z.string().regex(/^\d{2}:\d{2}$/) }))) body: { date: string; start: string }): Promise<unknown> {
    return this.services.reschedule(b, body.date, body.start, u);
  }

  @Post('services/bookings/:id/start')
  @HttpCode(200)
  @Roles('DELIVERY_BOY', 'SUPERVISOR')
  @Owns('booking')
  start(@Resource() b: Booking, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.services.start(b, u);
  }

  @Post('services/bookings/:id/quote')
  @HttpCode(200)
  @Roles('DELIVERY_BOY', 'SUPERVISOR')
  @Owns('booking')
  quote(@Resource() b: Booking, @CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ amount: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/), note: z.string().max(1000).optional() }))) body: { amount: string; note?: string }): Promise<unknown> {
    return this.services.proposeQuote(b, body.amount, body.note, u);
  }

  @Post('services/bookings/:id/quote/decision')
  @HttpCode(200)
  @Owns('booking')
  decide(@Resource() b: Booking, @CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ approve: z.boolean() }))) body: { approve: boolean }): Promise<unknown> {
    return this.services.decideQuote(b, body.approve, u);
  }
}
