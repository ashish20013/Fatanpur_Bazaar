import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';

@Global()
@Module({ providers: [NotificationService], controllers: [NotificationsController], exports: [NotificationService] })
export class NotificationsModule {}
