import { Module } from '@nestjs/common';
import { TrackingModule } from '../tracking/tracking.module';
import { AlertConfigService } from './alert-config.service';
import { AlertsService } from './alerts.service';
import { AlertConfigController, AlertsBoardController } from './alerts.controller';

/**
 * Order alerts and escalation.
 *
 * Imports only what already exists — settings, audit, notifications and the socket gateway are
 * global providers — so nothing else in the app has to change to make room for it. The delivery
 * module reaches it through `AlertsService`, which is exported.
 */
@Module({
  imports: [TrackingModule],
  controllers: [AlertConfigController, AlertsBoardController],
  providers: [AlertConfigService, AlertsService],
  exports: [AlertsService, AlertConfigService],
})
export class AlertsModule {}
