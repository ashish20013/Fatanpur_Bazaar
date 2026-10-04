import { Module } from '@nestjs/common';
import { SystemTasks } from './system.tasks';
import { DeliveryModule } from '../delivery/delivery.module';
import { AdminModule } from '../admin/admin.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({ imports: [DeliveryModule, AdminModule, TrackingModule], providers: [SystemTasks] })
export class TasksModule {}
