import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, MaybeUser, OptionalAuth, Public, RateLimit, RequirePermission, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PagedResult } from '../../common/interceptors/transform.interceptor';
import { clientIp, pageArgs, type AppRequest, type AuthUser } from '../../common/types';
import { ServiceAreaService } from './service-area.service';

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/);
const CheckSchema = z.object({ villageId: z.number().int().positive().optional(), lat: lat.optional(), lng: lng.optional(), accuracyM: z.number().nonnegative().max(100000).optional() });
const RequestSchema = z.object({
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'मोबाइल नंबर 10 अंकों का होना चाहिए'),
  areaText: z.string().trim().max(200).optional(),
  villageGuess: z.string().trim().max(120).optional(),
  lat: lat.optional(),
  lng: lng.optional(),
  source: z.enum(['CHECKOUT', 'ADDRESS', 'HOMEPAGE', 'APP']).default('HOMEPAGE'),
});
const ZoneSchema = z.object({
  name: z.string().trim().max(120).optional(),
  mode: z.enum(['RADIUS', 'POLYGON']),
  centerLat: lat,
  centerLng: lng,
  radiusKm: z.number().min(1).max(15).nullable().optional(),
  polygon: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(z.number()).min(2).max(3)).min(4).max(500)).min(1).max(1) }).nullable().optional(),
  deliveryFee: money,
  minOrder: money,
  etaMinutes: z.number().int().min(5).max(600),
  priority: z.number().int().min(0).max(1000),
  confirm: z.boolean().optional(),
});
const VillageCreate = z.object({ name: z.string().trim().min(2).max(120), nameHi: z.string().trim().max(120).optional(), lat, lng, deliveryFee: money.optional(), minOrder: money.optional(), etaMinutes: z.number().int().min(0).max(600).optional(), isActive: z.boolean().optional(), introHtml: z.string().max(20000).optional() });
const VillagePatch = VillageCreate.partial().extend({ distanceKm: z.number().min(0).max(100).optional(), isPopular: z.boolean().optional(), seoTitle: z.string().max(180).optional(), seoDescription: z.string().max(320).optional(), confirm: z.boolean().optional() });
const AliasSchema = z.object({ alias: z.string().trim().min(2).max(140), type: z.enum(['SPELLING', 'HAMLET', 'LANDMARK', 'OLD_NAME']).default('SPELLING') });
const ActivateSchema = z.object({ villageGuess: z.string().trim().min(2).max(120), nameHi: z.string().trim().max(120).optional(), lat: lat.optional(), lng: lng.optional() });

@Controller('service-area')
export class ServiceAreaController {
  constructor(private readonly sa: ServiceAreaService) {}

  @Public()
  @Get()
  summary(): Promise<unknown> {
    return this.sa.summary();
  }

  /** A8.9 picker data — public, cacheable 1 h at the edge (Cache-Control set in main.ts). */
  @Public()
  @Get('villages')
  villages(@Query() q: Record<string, string>): Promise<unknown> {
    const la = q.lat !== undefined ? Number(q.lat) : undefined;
    const ln = q.lng !== undefined ? Number(q.lng) : undefined;
    return this.sa.pickerList(q.q?.slice(0, 60), la, ln);
  }

  @Public()
  @Post('check')
  @HttpCode(200)
  @RateLimit({ bucket: 'sa:check', by: 'ip', limit: 120, windowSec: 300 })
  async check(@Body(new ZodPipe(CheckSchema)) b: z.infer<typeof CheckSchema>): Promise<unknown> {
    return this.sa.toApi(await this.sa.check(b));
  }

  @Public()
  @OptionalAuth()
  @Post('request')
  @RateLimit({ bucket: 'area_request', by: 'ip', limit: 5, windowSec: 86400 })
  request(@Body(new ZodPipe(RequestSchema)) b: z.infer<typeof RequestSchema>, @MaybeUser() u: AuthUser | undefined): Promise<unknown> {
    return this.sa.createRequest(b, u?.id ?? null);
  }
}

@Controller('admin/service-area')
@Roles('ADMIN', 'SUPERVISOR')
export class AdminServiceAreaController {
  constructor(private readonly sa: ServiceAreaService) {}

  @Get('zones')
  @RequirePermission('service_area.manage')
  zones(): Promise<unknown> {
    return this.sa.listZones();
  }

  /** Live preview for the map editor: which villages are in/out of a draft boundary. */
  @Post('zones/:id/preview')
  @HttpCode(200)
  @RequirePermission('service_area.manage')
  async preview(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(ZoneSchema)) b: z.infer<typeof ZoneSchema>): Promise<unknown> {
    const ring = b.mode === 'POLYGON' && b.polygon ? (b.polygon.coordinates[0].map((p) => [p[0], p[1]]) as [number, number][]) : null;
    return this.sa.impact(id, { ...b, ring });
  }

  @Put('zones/:id')
  @RequirePermission('service_area.manage')
  save(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(ZoneSchema)) b: z.infer<typeof ZoneSchema>, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.sa.saveZone(id, b, u, clientIp(req));
  }

  @Get('requests')
  @RequirePermission('service_area.view')
  async requests(@Query() q: Record<string, string>): Promise<unknown> {
    if (q.view === 'list') {
      const { page, perPage } = pageArgs(q, 50, 100);
      const r = await this.sa.requestList(page, perPage);
      return new PagedResult(r.items, page, perPage, r.total);
    }
    return this.sa.requestGroups();
  }

  @Post('requests/activate')
  @RequirePermission('villages.manage')
  activate(@Body(new ZodPipe(ActivateSchema)) b: z.infer<typeof ActivateSchema>, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    const coords = b.lat !== undefined && b.lng !== undefined ? { lat: b.lat, lng: b.lng } : null;
    return this.sa.activateFromRequests(b.villageGuess, coords, b.nameHi, u, clientIp(req));
  }

  @Get('report')
  @RequirePermission('reports.view')
  report(): Promise<unknown> {
    return this.sa.villageReport();
  }
}

@Controller('admin/villages')
@Roles('ADMIN', 'SUPERVISOR')
@RequirePermission('villages.manage')
export class AdminVillagesController {
  constructor(private readonly sa: ServiceAreaService) {}

  @Get()
  list(): Promise<unknown> {
    return this.sa.adminVillages();
  }
  @Post()
  create(@Body(new ZodPipe(VillageCreate)) b: z.infer<typeof VillageCreate>, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.sa.createVillage(b, u, clientIp(req));
  }
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(VillagePatch)) b: z.infer<typeof VillagePatch>, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.sa.updateVillage(id, b, u, clientIp(req));
  }
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Query('confirm') confirm: string | undefined, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.sa.removeVillage(id, confirm === '1', u, clientIp(req));
  }
  @Post(':id/aliases')
  alias(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(AliasSchema)) b: z.infer<typeof AliasSchema>): Promise<unknown> {
    return this.sa.addAlias(id, b.alias, b.type);
  }
  @Delete('aliases/:aliasId')
  async removeAlias(@Param('aliasId', ParseIntPipe) aliasId: number): Promise<{ ok: true }> {
    await this.sa.removeAlias(aliasId);
    return { ok: true };
  }
}
