import { Module } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { TrackingGateway } from './tracking.gateway';
import { TrackingController } from './tracking.controller';

@Module({ controllers: [TrackingController], providers: [TrackingService, TrackingGateway], exports: [TrackingService, TrackingGateway] })
export class TrackingModule {}
