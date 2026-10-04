import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ClientLogController } from './client-log.controller';
import { TrackingModule } from '../tracking/tracking.module';

@Module({ imports: [TrackingModule], controllers: [HealthController, ClientLogController] })
export class HealthModule {}
