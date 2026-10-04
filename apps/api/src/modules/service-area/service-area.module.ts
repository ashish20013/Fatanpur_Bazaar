import { Global, Module } from '@nestjs/common';
import { AdminServiceAreaController, AdminVillagesController, ServiceAreaController } from './service-area.controller';
import { ServiceAreaService } from './service-area.service';

@Global()
@Module({ controllers: [ServiceAreaController, AdminServiceAreaController, AdminVillagesController], providers: [ServiceAreaService], exports: [ServiceAreaService] })
export class ServiceAreaModule {}
