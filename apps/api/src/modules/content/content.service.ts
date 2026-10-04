import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { CACHE, type ICacheProvider } from '../../common/cache/cache.provider';
import { notFound } from '../../common/errors';
import { sanitizeHtml } from '../../common/utils/sanitize';
import { slugify } from '../../common/utils/translit';
import { SettingsService } from '../settings/settings.service';

/** Pages / FAQs / blog / contact. Admin HTML is sanitised on WRITE (allowlist) and again on the web. */
@Injectable()
export class ContentService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(CACHE) private readonly cache: ICacheProvider,
    private readonly settings: SettingsService,
  ) {}

  /** is_public=1 settings only — header/footer, fees, store hours. Secrets never leave the server. */
  publicSettings(): Promise<Record<string, string | null>> {
    return this.settings.publicSettings();
  }

  page(slug: string): Promise<unknown> {
    return this.cache.wrap(`content:page:${slug}`, 5 * 60_000, async () => {
      const p = await this.db('pages').where({ slug, is_published: 1 }).first('slug', 'title', 'body_html as bodyHtml', 'seo_title as seoTitle', 'seo_description as seoDescription', 'updated_at as updatedAt');
      if (!p) throw notFound();
      return p;
    });
  }
  faqs(scope = 'home'): Promise<unknown> {
    return this.cache.wrap(`content:faqs:${scope}`, 5 * 60_000, () => this.db('faqs').where({ page_scope: scope, is_active: 1 }).orderBy('sort_order').select('id', 'question', 'answer'));
  }
  async blogList(page: number, perPage: number): Promise<{ items: unknown[]; total: number }> {
    const base = this.db('blog_posts').where({ status: 'PUBLISHED' }).where('published_at', '<=', this.db.fn.now());
    const [{ total }] = (await base.clone().count({ total: '*' })) as { total: number }[];
    const items = await base.clone().orderBy('published_at', 'desc').limit(perPage).offset((page - 1) * perPage).select('slug', 'title', 'excerpt', 'cover_url as coverUrl', 'read_minutes as readMinutes', 'published_at as publishedAt');
    return { items, total: Number(total) };
  }
  async blogPost(slug: string): Promise<unknown> {
    const p = await this.db('blog_posts as b').leftJoin('users as u', 'u.id', 'b.author_id').where({ 'b.slug': slug, 'b.status': 'PUBLISHED' })
      .first('b.id', 'b.slug', 'b.title', 'b.excerpt', 'b.body_html as bodyHtml', 'b.cover_url as coverUrl', 'b.seo_title as seoTitle', 'b.seo_description as seoDescription', 'b.read_minutes as readMinutes', 'b.published_at as publishedAt', 'b.updated_at as updatedAt', 'u.name as author');
    if (!p) throw notFound();
    void this.db('blog_posts').where({ id: p.id }).increment('view_count', 1).catch(() => undefined);
    return p;
  }
  async contact(b: { name: string; phone: string; subject?: string; message: string; orderNumber?: string }, ip: string): Promise<{ ok: true }> {
    await this.db('contact_messages').insert({ name: b.name, phone: `91${b.phone}`, subject: b.subject ?? null, message: b.message, order_number: b.orderNumber ?? null, ip_address: ip });
    return { ok: true };
  }
  async sitemap(): Promise<{ blog: { slug: string; updatedAt: string }[]; pages: string[] }> {
    const [blog, pages] = await Promise.all([
      this.db('blog_posts').where({ status: 'PUBLISHED' }).select('slug', 'updated_at as updatedAt'),
      this.db('pages').where({ is_published: 1 }).pluck('slug'),
    ]);
    return { blog, pages };
  }

  // ── admin ──
  async savePage(slug: string, b: { title: string; bodyHtml: string; seoTitle?: string; seoDescription?: string; isPublished?: boolean }): Promise<void> {
    await this.db.raw(
      `INSERT INTO pages (slug, title, body_html, seo_title, seo_description, is_published) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), body_html = VALUES(body_html), seo_title = VALUES(seo_title), seo_description = VALUES(seo_description), is_published = VALUES(is_published)`,
      [slug, b.title, sanitizeHtml(b.bodyHtml), b.seoTitle ?? null, b.seoDescription ?? null, b.isPublished === false ? 0 : 1],
    );
    this.cache.delPrefix('content:');
  }
  async savePost(id: number | null, authorId: number, b: { title: string; excerpt?: string; bodyHtml: string; coverUrl?: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; seoTitle?: string; seoDescription?: string; categoryId?: number | null }): Promise<{ id: number; slug: string }> {
    const body = sanitizeHtml(b.bodyHtml);
    const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const row = { title: b.title, excerpt: b.excerpt ?? null, body_html: body, cover_url: b.coverUrl ?? null, status: b.status, seo_title: b.seoTitle ?? null, seo_description: b.seoDescription ?? null, category_id: b.categoryId ?? null, read_minutes: Math.max(1, Math.min(60, Math.round(words / 180))) };
    if (id) {
      const cur = await this.db('blog_posts').where({ id }).first('slug', 'published_at');
      if (!cur) throw notFound();
      await this.db('blog_posts').where({ id }).update({ ...row, published_at: b.status === 'PUBLISHED' && !cur.published_at ? this.db.fn.now() : cur.published_at });
      this.cache.delPrefix('content:');
      return { id, slug: cur.slug };
    }
    let slug = slugify(b.title);
    if (await this.db('blog_posts').where({ slug }).first('id')) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const [nid] = await this.db('blog_posts').insert({ ...row, slug, author_id: authorId, published_at: b.status === 'PUBLISHED' ? this.db.fn.now() : null });
    return { id: nid, slug };
  }
  async saveFaq(id: number | null, b: { question: string; answer: string; pageScope?: string; sortOrder?: number; isActive?: boolean }): Promise<{ id: number }> {
    const row = { question: b.question, answer: sanitizeHtml(b.answer), page_scope: b.pageScope ?? 'home', sort_order: b.sortOrder ?? 0, is_active: b.isActive === false ? 0 : 1 };
    let rid = id;
    if (id) await this.db('faqs').where({ id }).update(row);
    else [rid] = await this.db('faqs').insert(row);
    this.cache.delPrefix('content:');
    return { id: rid as number };
  }
  adminPosts(): Promise<unknown[]> {
    return this.db('blog_posts').orderBy('id', 'desc').select('id', 'slug', 'title', 'status', 'published_at as publishedAt', 'view_count as views');
  }
  /** Full post for the editor — any status (the public endpoint only serves PUBLISHED and counts a view). */
  async adminPost(id: number): Promise<unknown> {
    const r = await this.db('blog_posts').where({ id }).first('id', 'slug', 'title', 'excerpt', 'body_html as bodyHtml', 'cover_url as coverUrl', 'status', 'seo_title as seoTitle', 'seo_description as seoDescription', 'category_id as categoryId', 'published_at as publishedAt');
    if (!r) throw notFound();
    return r;
  }
  async removePost(id: number): Promise<void> {
    const n = await this.db('blog_posts').where({ id }).del();
    if (!n) throw notFound();
    this.cache.delPrefix('content:');
  }
  async adminPage(slug: string): Promise<unknown> {
    const r = await this.db('pages').where({ slug }).first('id', 'slug', 'title', 'body_html as bodyHtml', 'seo_title as seoTitle', 'seo_description as seoDescription', 'is_published as isPublished');
    if (!r) throw notFound();
    return r;
  }
  /** Every FAQ incl. hidden ones, all scopes. */
  adminFaqs(): Promise<unknown[]> {
    return this.db('faqs').orderBy([{ column: 'page_scope' }, { column: 'sort_order' }, { column: 'id' }]).select('id', 'question', 'answer', 'page_scope as pageScope', 'sort_order as sortOrder', 'is_active as isActive');
  }
  async removeFaq(id: number): Promise<void> {
    const n = await this.db('faqs').where({ id }).del();
    if (!n) throw notFound();
    this.cache.delPrefix('content:');
  }
  adminPages(): Promise<unknown[]> {
    return this.db('pages').orderBy('slug').select('id', 'slug', 'title', 'is_published as isPublished', 'updated_at as updatedAt');
  }
  messages(): Promise<unknown[]> {
    return this.db('contact_messages').orderBy('id', 'desc').limit(200);
  }
  async setMessageStatus(id: number, status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED', note: string | undefined, actorId: number): Promise<void> {
    await this.db('contact_messages').where({ id }).update({ status, admin_note: note ?? null, handled_by: actorId });
  }
}
