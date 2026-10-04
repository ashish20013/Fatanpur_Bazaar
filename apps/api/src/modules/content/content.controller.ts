import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public, RateLimit, RequirePermission, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PagedResult } from '../../common/interceptors/transform.interceptor';
import { clientIp, pageArgs, type AppRequest, type AuthUser } from '../../common/types';
import { ContentService } from './content.service';

const Contact = z.object({ name: z.string().trim().min(1).max(120), phone: z.string().trim().regex(/^[6-9]\d{9}$/), subject: z.string().max(180).optional(), message: z.string().trim().min(5).max(2000), orderNumber: z.string().regex(/^FB-\d{8}-\d{4,6}$/).optional() });
const Page = z.object({ title: z.string().min(2).max(180), bodyHtml: z.string().max(200000), seoTitle: z.string().max(180).optional(), seoDescription: z.string().max(320).optional(), isPublished: z.boolean().optional() });
const Post_ = z.object({ title: z.string().min(3).max(220), excerpt: z.string().max(400).optional(), bodyHtml: z.string().max(400000), coverUrl: z.string().max(255).optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']), seoTitle: z.string().max(180).optional(), seoDescription: z.string().max(320).optional(), categoryId: z.number().int().positive().nullable().optional() });
const Faq = z.object({ question: z.string().min(3).max(300), answer: z.string().min(2).max(5000), pageScope: z.string().max(60).optional(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional() });

@Controller('content')
@Public()
export class ContentController {
  constructor(private readonly content: ContentService) {}
  @Get('pages/:slug')
  page(@Param('slug') slug: string): Promise<unknown> {
    return this.content.page(slug);
  }
  @Get('faqs')
  faqs(@Query('scope') scope?: string): Promise<unknown> {
    return this.content.faqs(scope?.slice(0, 60) || 'home');
  }
  @Get('blog')
  async blog(@Query() q: Record<string, string>): Promise<PagedResult<unknown>> {
    const { page, perPage } = pageArgs(q, 12, 50);
    const r = await this.content.blogList(page, perPage);
    return new PagedResult(r.items, page, perPage, r.total);
  }
  @Get('blog/:slug')
  post(@Param('slug') slug: string): Promise<unknown> {
    return this.content.blogPost(slug);
  }
  /**
   * Public settings (is_public=1 only) — website ka header/footer, delivery fee, store hours,
   * support number sab yahin se aate hain. ⚠️ Secret settings (upi_vpa, keys) is list me nahi aatin.
   */
  @Get('settings')
  settings(): Promise<Record<string, string | null>> {
    return this.content.publicSettings();
  }

  @Get('sitemap')
  sitemap(): Promise<unknown> {
    return this.content.sitemap();
  }
  @Post('contact')
  @RateLimit({ bucket: 'contact', by: 'ip', limit: 3, windowSec: 3600 })
  contact(@Body(new ZodPipe(Contact)) b: z.infer<typeof Contact>, @Req() req: AppRequest): Promise<unknown> {
    return this.content.contact(b, clientIp(req));
  }
}

@Controller('admin/content')
@Roles('ADMIN', 'SUPERVISOR')
@RequirePermission('content.manage')
export class AdminContentController {
  constructor(private readonly content: ContentService) {}
  @Get('pages')
  pages(): Promise<unknown> {
    return this.content.adminPages();
  }
  @Put('pages/:slug')
  async savePage(@Param('slug') slug: string, @Body(new ZodPipe(Page)) b: z.infer<typeof Page>): Promise<{ ok: true }> {
    await this.content.savePage(slug.slice(0, 120), b);
    return { ok: true };
  }
  @Get('pages/:slug')
  page(@Param('slug') slug: string): Promise<unknown> {
    return this.content.adminPage(slug.slice(0, 120));
  }
  @Get('posts')
  posts(): Promise<unknown> {
    return this.content.adminPosts();
  }
  @Get('posts/:id')
  post(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.content.adminPost(id);
  }
  @Delete('posts/:id')
  async removePost(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.content.removePost(id);
    return { ok: true };
  }
  @Get('faqs')
  faqs(): Promise<unknown> {
    return this.content.adminFaqs();
  }
  @Delete('faqs/:id')
  async removeFaq(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.content.removeFaq(id);
    return { ok: true };
  }
  @Post('posts')
  create(@Body(new ZodPipe(Post_)) b: z.infer<typeof Post_>, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.content.savePost(null, u.id, b);
  }
  @Put('posts/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(Post_)) b: z.infer<typeof Post_>, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.content.savePost(id, u.id, b);
  }
  @Post('faqs')
  faq(@Body(new ZodPipe(Faq)) b: z.infer<typeof Faq>): Promise<unknown> {
    return this.content.saveFaq(null, b);
  }
  @Put('faqs/:id')
  faqUpdate(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(Faq)) b: z.infer<typeof Faq>): Promise<unknown> {
    return this.content.saveFaq(id, b);
  }
  @Get('messages')
  messages(): Promise<unknown> {
    return this.content.messages();
  }
  @Patch('messages/:id')
  @HttpCode(200)
  async message(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(z.object({ status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED']), note: z.string().max(500).optional() }))) b: { status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED'; note?: string }, @CurrentUser() u: AuthUser): Promise<{ ok: true }> {
    await this.content.setMessageStatus(id, b.status, b.note, u.id);
    return { ok: true };
  }
}
