import { Global, Module } from '@nestjs/common';
import { AdminCouponsController, CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Global()
@Module({ controllers: [CouponsController, AdminCouponsController], providers: [CouponsService], exports: [CouponsService] })
export class CouponsModule {}
