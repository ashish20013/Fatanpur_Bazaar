import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { CronService } from './cron.service';

@Global()
@Module({ providers: [QueueService, CronService], exports: [QueueService, CronService] })
export class JobsModule {}
