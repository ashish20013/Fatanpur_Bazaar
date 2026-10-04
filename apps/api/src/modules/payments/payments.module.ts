import { Module } from '@nestjs/common';
import { AdminPaymentsController, PaymentsController, WebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ controllers: [PaymentsController, AdminPaymentsController, WebhooksController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
