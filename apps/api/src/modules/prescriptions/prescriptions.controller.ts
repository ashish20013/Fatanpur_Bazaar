/// <reference types="multer" />
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, RateLimit, RequirePermission, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { AppError } from '../../common/errors';
import { RawResponse } from '../../common/interceptors/transform.interceptor';
import { clientIp, type AppRequest, type AuthUser } from '../../common/types';
import { PrescriptionsService } from './prescriptions.service';

@Controller()
export class PrescriptionsController {
  constructor(private readonly rx: PrescriptionsService) {}

  @Post('prescriptions')
  @Roles('CUSTOMER')
  @RateLimit({ bucket: 'upload', by: 'user', limit: 10, windowSec: 86400 })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  upload(
    @CurrentUser() u: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() raw: Record<string, string>,
  ): Promise<unknown> {
    if (!file) throw new AppError('VALIDATION_FAILED', {}, { field: 'file' });
    const meta = new ZodPipe(
      z.object({
        doctorName: z.string().max(120).optional(),
        issuedOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
    ).transform(raw);
    return this.rx.upload(u, file.buffer, meta);
  }

  @Get('prescriptions')
  mine(@CurrentUser() u: AuthUser): Promise<unknown> {
    return this.rx.mine(u.id);
  }

  /** Always an attachment, never inline; never cached; never sniffed as HTML. */
  @Get('files/rx/:token')
  async file(
    @Param('token') token: string,
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RawResponse> {
    const f = await this.rx.serve(token, u, clientIp(req));
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${f.name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new RawResponse(f.buf);
  }

  @Get('admin/prescriptions')
  @Roles('ADMIN', 'SUPERVISOR')
  @RequirePermission('prescriptions.review')
  queue(@CurrentUser() u: AuthUser): Promise<unknown> {
    return this.rx.queue(u);
  }

  @Post('prescriptions/:id/review')
  @HttpCode(200)
  @Roles('ADMIN', 'SUPERVISOR')
  @RequirePermission('prescriptions.review')
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body(
      new ZodPipe(
        z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().max(500).optional() }),
      ),
    )
    b: { decision: 'APPROVED' | 'REJECTED'; note?: string },
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    return this.rx.review(id, b.decision, b.note, u, clientIp(req));
  }
}
