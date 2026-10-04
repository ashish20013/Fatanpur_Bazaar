/** Shapes returned by the /admin/content/* and public /content/* endpoints the content editor uses. */
export interface PageRow {
  id: number;
  slug: string;
  title: string;
  isPublished: 0 | 1;
  updatedAt: string;
}

export interface PostRow {
  id: number;
  slug: string;
  title: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  views: number;
}

/** GET /admin/content/posts/:id (any status). */
export interface PostFull {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyHtml: string;
  coverUrl: string | null;
  status: PostRow['status'];
  seoTitle: string | null;
  seoDescription: string | null;
  categoryId: number | null;
  publishedAt: string | null;
}

/** GET /admin/content/pages/:slug (published or hidden). */
export interface PageFull {
  id: number;
  slug: string;
  title: string;
  bodyHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  isPublished: 0 | 1;
}

/** GET /admin/content/faqs — every FAQ, hidden ones included, all scopes. */
export interface FaqRow {
  id: number;
  question: string;
  answer: string;
  pageScope: string;
  sortOrder: number;
  isActive: 0 | 1;
}

/** Raw contact_messages row from GET /admin/content/messages. */
export interface MessageRow {
  id: number;
  name: string;
  phone: string;
  subject: string | null;
  message: string;
  order_number: string | null;
  status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
  admin_note: string | null;
  created_at: string;
}

/** FAQ scopes the site reads: `general` feeds the /faq page; `home` is the home-page block. */
export const FAQ_SCOPES = ['home', 'general'] as const;
