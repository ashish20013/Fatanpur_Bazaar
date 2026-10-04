import { Global, Module } from '@nestjs/common';
import { AdminOrdersController, OrdersController } from './orders.controller';
import { QuoteService } from './quote.service';
import { OrderPlacementService } from './order-placement.service';
import { OrderStateService } from './order-state.service';
import { OrdersQueryService } from './orders-query.service';
import { AdjustmentService } from './adjustment.service';
import { OrderEvents } from './order-events';
import { OrdersTasks } from './orders.tasks';

@Global()
@Module({
  controllers: [OrdersController, AdminOrdersController],
  providers: [QuoteService, OrderPlacementService, OrderStateService, OrdersQueryService, AdjustmentService, OrderEvents, OrdersTasks],
  exports: [OrderStateService, OrdersQueryService, OrderEvents, QuoteService],
})
export class OrdersModule {}
