import { Global, Module } from '@nestjs/common';
import { PaymentRecordsService } from './payment-records.service';
import { BookingRecordsService } from '../services/booking-records.service';
import { PrescriptionRecordsService } from '../prescriptions/prescription-records.service';

/** Dependency-free record services used by order placement (breaks orders ↔ payments/services/rx cycles). */
@Global()
@Module({ providers: [PaymentRecordsService, BookingRecordsService, PrescriptionRecordsService], exports: [PaymentRecordsService, BookingRecordsService, PrescriptionRecordsService] })
export class RecordsCoreModule {}
