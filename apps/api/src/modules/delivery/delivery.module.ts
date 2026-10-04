import { Module } from '@nestjs/common';
import { AdminDeliveryController, DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { TrackingModule } from '../tracking/tracking.module';

@Module({ imports: [TrackingModule], controllers: [DeliveryController, AdminDeliveryController], providers: [DeliveryService], exports: [DeliveryService] })
export class DeliveryModule {}
