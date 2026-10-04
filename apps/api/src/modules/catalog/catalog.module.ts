import { Global, Module } from '@nestjs/common';
import { AdminCatalogController, CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ComplianceService } from './compliance.service';
import { SearchService } from './search.service';
import { ImagesService } from './images.service';
import { InventoryService } from './inventory.service';
import { AdminCatalogService } from './admin-catalog.service';

@Global()
@Module({
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService, ComplianceService, SearchService, ImagesService, InventoryService, AdminCatalogService],
  exports: [CatalogService, ComplianceService, InventoryService, ImagesService],
})
export class CatalogModule {}
