/// <reference types="multer" />
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { verticalFromSlug, type Vertical } from '@fb/shared-types';
import {
  CurrentUser,
  MaybeUser,
  OptionalAuth,
  Public,
  RateLimit,
  RequirePermission,
  Roles,
} from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PagedResult } from '../../common/interceptors/transform.interceptor';
import { AppError, notFound } from '../../common/errors';
import { isGlobalAdmin, clientIp, pageArgs, type AppRequest, type AuthUser } from '../../common/types';
import { CatalogService } from './catalog.service';
import { SearchService } from './search.service';
import { AdminCatalogService, type ProductInput } from './admin-catalog.service';
import { InventoryService } from './inventory.service';
import { ServiceAreaService } from '../service-area/service-area.service';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { ComplianceService } from './compliance.service';

const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/, 'रकम सही लिखें (जैसे 25.00)');
const phone = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/);
const ListQuery = z.object({
  category: z.string().max(140).optional(),
  vertical: z.string().max(20).optional(),
  type: z.enum(['PRODUCT', 'SERVICE']).optional(),
  sort: z.enum(['popular', 'price_asc', 'price_desc', 'new', 'az', 'az_en']).optional(),
  q: z.string().max(60).optional(),
  page: z.coerce.number().optional(),
  perPage: z.coerce.number().optional(),
});

@Controller('catalog')
@Public()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly search: SearchService,
    private readonly sa: ServiceAreaService,
    private readonly compliance: ComplianceService,
    @Inject(KNEX) private readonly db: Knex,
  ) {}

  @Get('home')
  home(@Query('lang') lang?: string): Promise<unknown> {
    return this.catalog.home(lang === 'en' ? 'en' : 'hi');
  }

  @Get('categories')
  categories(): Promise<unknown> {
    return this.catalog.categoryTree();
  }

  @Get('categories/:slug')
  category(@Param('slug') slug: string): Promise<unknown> {
    return this.catalog.category(slug);
  }

  @Get('products')
  async products(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>): Promise<PagedResult<unknown>> {
    const { page, perPage } = pageArgs(q, 24, 100);
    let vertical: Vertical | undefined;
    if (q.vertical) {
      vertical = verticalFromSlug(q.vertical) ?? (q.vertical.toUpperCase() as Vertical);
      if (!(await this.compliance.isEnabled(vertical))) throw notFound();
    }
    const r = await this.catalog.listProducts(
      { vertical, categorySlug: q.category, itemType: q.type, sort: q.sort },
      page,
      perPage,
    );
    return new PagedResult(r.items, page, perPage, r.total);
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string): Promise<unknown> {
    if (!/^[a-z0-9-]{1,220}$/.test(slug)) throw notFound();
    return this.catalog.detail(slug);
  }

  @Get('services')
  async services(@Query() q: Record<string, string>): Promise<PagedResult<unknown>> {
    const { page, perPage } = pageArgs(q, 24, 100);
    const r = await this.catalog.services(q.category, page, perPage);
    return new PagedResult(r.items, page, perPage, r.total);
  }

  @Get('search')
  @OptionalAuth()
  @RateLimit({ bucket: 'search', by: 'ip', limit: 120, windowSec: 300 })
  doSearch(@Query('q') q: string | undefined, @MaybeUser() u: AuthUser | undefined): Promise<unknown> {
    return this.search.search(String(q ?? ''), u?.id ?? null);
  }

  @Get('search/suggest')
  @RateLimit({ bucket: 'search', by: 'ip', limit: 120, windowSec: 300 })
  suggest(@Query('q') q: string | undefined): Promise<unknown> {
    return this.search.suggest(String(q ?? ''));
  }

  @Get('areas')
  areas(): Promise<unknown> {
    return this.sa.pickerList();
  }

  /** Area landing page data (/area/{slug}) — unique intro per village from the DB. */
  @Get('areas/:slug')
  async area(@Param('slug') slug: string): Promise<unknown> {
    const v = await this.db('villages')
      .where({ slug, is_active: 1 })
      .first(
        'id',
        'name',
        'name_hi as nameHi',
        'slug',
        'distance_km as distanceKm',
        'eta_minutes as etaMinutes',
        'delivery_fee as deliveryFee',
        'intro_html as introHtml',
        'seo_title as seoTitle',
        'seo_description as seoDescription',
        'latitude as lat',
        'longitude as lng',
      );
    if (!v) throw notFound();
    return v;
  }

  @Get('sitemap')
  sitemap(): Promise<unknown> {
    return this.catalog.sitemapEntries();
  }

  @Post('products/:id/notify')
  @OptionalAuth()
  @RateLimit({ bucket: 'stock_alert', by: 'ip', limit: 20, windowSec: 3600 })
  async notifyMe(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(z.object({ phone }))) b: { phone: string },
    @MaybeUser() u: AuthUser | undefined,
  ): Promise<{ ok: true }> {
    await this.db.raw('INSERT IGNORE INTO stock_alerts (product_id, user_id, phone) VALUES (?, ?, ?)', [
      id,
      u?.id ?? null,
      `91${b.phone}`,
    ]);
    return { ok: true };
  }

  @Post('product-request')
  @RateLimit({ bucket: 'contact', by: 'ip', limit: 3, windowSec: 3600 })
  async productRequest(
    @Body(
      new ZodPipe(
        z.object({
          query: z.string().trim().min(2).max(100),
          name: z.string().trim().min(1).max(120),
          phone,
        }),
      ),
    )
    b: { query: string; name: string; phone: string },
    @Req() req: AppRequest,
  ): Promise<{ ok: true }> {
    await this.search.requestProduct(b.query, b.name, b.phone, clientIp(req));
    return { ok: true };
  }
}

const ProductSchema = z
  .object({
    categoryId: z.number().int().positive(),
    supplierId: z.number().int().positive().nullable().optional(),
    itemType: z.enum(['PRODUCT', 'SERVICE']).default('PRODUCT'),
    sku: z.string().trim().max(40).nullable().optional(),
    name: z.string().trim().min(2).max(200),
    nameHi: z.string().trim().max(200).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    brand: z.string().trim().max(120).nullable().optional(),
    unit: z.string().trim().min(1).max(30),
    unitValue: z.number().positive().max(100000),
    mrp: money,
    price: money,
    costPrice: money.nullable().optional(),
    stockQty: z.number().int().min(0).max(1000000).optional(),
    lowStockAt: z.number().int().min(0).max(100000).optional(),
    isWeighted: z.boolean().optional(),
    serviceDurationMin: z.number().int().min(5).max(1440).nullable().optional(),
    visitingCharge: money.nullable().optional(),
    isQuoteBased: z.boolean().optional(),
    serviceNote: z.string().max(500).nullable().optional(),
    isAvailable: z.boolean().optional(),
    prescriptionRequired: z.boolean().optional(),
    isRegulated: z.boolean().optional(),
    maxQtyPerOrder: z.number().int().min(1).max(1000).optional(),
    hsnCode: z.string().max(12).nullable().optional(),
    taxRate: z
      .string()
      .regex(/^\d{1,2}(\.\d{1,2})?$/)
      .optional(),
    keywords: z.string().max(300).nullable().optional(),
    metaTitle: z.string().max(180).nullable().optional(),
    metaDescription: z.string().max(320).nullable().optional(),
    isFeatured: z.boolean().optional(),
  })
  .refine((p) => Number(p.price) <= Number(p.mrp) || Number(p.mrp) === 0, {
    message: 'दाम MRP से ज़्यादा नहीं हो सकता',
    path: ['price'],
  });
const StockSchema = z
  .object({
    set: z.number().int().min(0).max(1000000).optional(),
    delta: z.number().int().min(-1000000).max(1000000).optional(),
    reason: z.enum(['RESTOCK', 'MANUAL', 'CORRECTION']).default('MANUAL'),
    note: z.string().max(255).optional(),
  })
  .refine((b) => b.set !== undefined || b.delta !== undefined, { message: 'set या delta ज़रूरी है' });
const CategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameHi: z.string().max(120).optional(),
  parentId: z.number().int().positive().nullable().optional(),
  vertical: z.enum(['VEGETABLES', 'FRUITS', 'GROCERY', 'PHARMACY', 'AGRI_INPUT', 'SERVICE', 'OTHER']),
  itemType: z.enum(['PRODUCT', 'SERVICE']).default('PRODUCT'),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  seoTitle: z.string().max(180).optional(),
  seoDescription: z.string().max(320).optional(),
  introHtml: z.string().max(20000).optional(),
  icon: z.string().max(40).optional(),
});
const SupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  nameHi: z.string().max(160).optional(),
  type: z.enum(['SHOP', 'MANDI', 'FARMER', 'DISTRIBUTOR', 'OTHER']).optional(),
  contactPerson: z.string().max(120).optional(),
  phone: phone.optional(),
  villageId: z.number().int().positive().optional(),
  addressLine: z.string().max(255).optional(),
  gstin: z.string().max(20).optional(),
  fssaiLicense: z.string().max(30).optional(),
  fssaiExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  showOnProduct: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});
const upload = FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

@Controller('admin')
@Roles('ADMIN', 'SUPERVISOR')
export class AdminCatalogController {
  constructor(
    private readonly admin: AdminCatalogService,
    private readonly inventory: InventoryService,
  ) {}

  @Get('products')
  @RequirePermission('products.view')
  async list(@Query() q: Record<string, string>): Promise<PagedResult<unknown>> {
    const { page, perPage } = pageArgs(q, 50, 100);
    const r = await this.admin.list({
      search: q.q?.slice(0, 60),
      categoryId: q.categoryId ? Number(q.categoryId) : undefined,
      lowStock: q.lowStock === '1',
      page,
      perPage,
    });
    return new PagedResult(r.items, page, perPage, r.total);
  }
  @Get('products/:id')
  @RequirePermission('products.view')
  get(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.admin.get(id);
  }
  @Post('products')
  @RequirePermission('products.manage')
  create(
    @Body(new ZodPipe(ProductSchema)) b: ProductInput,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.admin.create(b, u, clientIp(req));
  }
  @Put('products/:id')
  @RequirePermission('products.manage')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(ProductSchema)) b: ProductInput,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.admin.update(
      id,
      b,
      u,
      clientIp(req),
      isGlobalAdmin(u) || u.permissions.has('products.price_change'),
    );
  }
  @Patch('products/:id/price')
  @RequirePermission('products.price_change')
  price(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(z.object({ price: money, mrp: money.optional() }))) b: { price: string; mrp?: string },
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.admin.changePrice(id, b.price, b.mrp, u, clientIp(req));
  }
  @Patch('products/:id/stock')
  @RequirePermission('inventory.manage')
  stock(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(StockSchema)) b: z.infer<typeof StockSchema>,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.admin.changeStock(id, b, u, clientIp(req));
  }
  @Delete('products/:id')
  @RequirePermission('products.manage')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.admin.remove(id, u, clientIp(req));
  }
  @Post('products/:id/images')
  @RequirePermission('products.manage')
  @UseInterceptors(upload)
  image(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('alt') alt: string | undefined,
  ): Promise<unknown> {
    if (!file) throw new AppError('VALIDATION_FAILED', {}, { field: 'file' });
    return this.admin.addImage(id, file.buffer, alt?.slice(0, 200));
  }
  @Delete('product-images/:id')
  @RequirePermission('products.manage')
  async removeImage(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.admin.removeImage(id);
    return { ok: true };
  }
  @Get('inventory/low-stock')
  @RequirePermission('inventory.view')
  lowStock(): Promise<unknown> {
    return this.inventory.lowStock();
  }
  @Get('inventory/:productId/logs')
  @RequirePermission('inventory.view')
  logs(@Param('productId', ParseIntPipe) id: number): Promise<unknown> {
    return this.inventory.logs(id);
  }

  @Get('categories')
  @RequirePermission('products.view')
  categories(): Promise<unknown> {
    return this.admin.listCategories();
  }
  @Post('categories')
  @RequirePermission('categories.manage')
  createCategory(
    @Body(new ZodPipe(CategorySchema)) b: z.infer<typeof CategorySchema>,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.admin.saveCategory(null, b, u, clientIp(req));
  }
  @Put('categories/:id')
  @RequirePermission('categories.manage')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(CategorySchema)) b: z.infer<typeof CategorySchema>,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.admin.saveCategory(id, b, u, clientIp(req));
  }
  @Delete('categories/:id')
  @RequirePermission('categories.manage')
  removeCategory(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.admin.removeCategory(id, u, clientIp(req));
  }
  @Post('categories/:id/image')
  @RequirePermission('categories.manage')
  @UseInterceptors(upload)
  categoryImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    if (!file) throw new AppError('VALIDATION_FAILED', {}, { field: 'file' });
    return this.admin.setCategoryImage(id, file.buffer, u, clientIp(req));
  }
  @Delete('categories/:id/image')
  @RequirePermission('categories.manage')
  async removeCategoryImage(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<{ ok: true }> {
    await this.admin.removeCategoryImage(id, u, clientIp(req));
    return { ok: true };
  }
  @Delete('banners/:id')
  @RequirePermission('content.manage')
  async removeBanner(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<{ ok: true }> {
    await this.admin.removeBanner(id, u, clientIp(req));
    return { ok: true };
  }
  @Get('suppliers')
  @RequirePermission('products.view')
  suppliers(): Promise<unknown> {
    return this.admin.listSuppliers();
  }
  @Post('suppliers')
  @RequirePermission('suppliers.manage')
  createSupplier(
    @Body(new ZodPipe(SupplierSchema)) b: z.infer<typeof SupplierSchema>,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.admin.saveSupplier(null, b, u, clientIp(req));
  }
  @Put('suppliers/:id')
  @RequirePermission('suppliers.manage')
  updateSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(SupplierSchema)) b: z.infer<typeof SupplierSchema>,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.admin.saveSupplier(id, b, u, clientIp(req));
  }
  @Get('synonyms')
  @RequirePermission('products.manage')
  synonyms(): Promise<unknown> {
    return this.admin.listSynonyms();
  }
  @Post('synonyms')
  @RequirePermission('products.manage')
  async synonym(
    @Body(
      new ZodPipe(
        z.object({ term: z.string().trim().min(2).max(80), mapsTo: z.string().trim().min(2).max(120) }),
      ),
    )
    b: {
      term: string;
      mapsTo: string;
    },
  ): Promise<{ ok: true }> {
    await this.admin.saveSynonym(b.term, b.mapsTo);
    return { ok: true };
  }
  @Get('banners')
  @RequirePermission('content.manage')
  banners(): Promise<unknown> {
    return this.admin.listBanners();
  }
  @Post('banners')
  @RequirePermission('content.manage')
  @UseInterceptors(upload)
  banner(
    @Body() raw: Record<string, string>,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<unknown> {
    const b = new ZodPipe(
      z.object({
        id: z.coerce.number().int().positive().optional(),
        title: z.string().min(2).max(160),
        subtitle: z.string().max(200).optional(),
        linkUrl: z
          .string()
          .max(255)
          .regex(/^\/[^\s]*$/)
          .optional(),
        position: z.enum(['HOME_TOP', 'HOME_MID', 'CATEGORY']).optional(),
        sortOrder: z.coerce.number().int().optional(),
        isActive: z.enum(['0', '1']).optional(),
      }),
    ).transform(raw);
    return this.admin.saveBanner(b.id ?? null, { ...b, isActive: b.isActive !== '0' }, file?.buffer ?? null);
  }
}
