import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { TrackingModule } from '../tracking/tracking.module';

@Module({ imports: [TrackingModule], controllers: [ServicesController], providers: [ServicesService] })
export class ServicesModule {}
