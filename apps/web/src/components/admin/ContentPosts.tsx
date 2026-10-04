'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { call, errText } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { Icon } from '../icons';
import { Badge, EmptyState, Skeleton, buttonClass } from '../ui';
import { opt, useAdminAction } from './admin-client';
import type { PostFull, PostRow } from './content-types';
import { Field, Notice, PanelTitle, inputCls, textareaCls } from './form-kit';
import { TableWrap, Td, Th } from './table';

type Status = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
interface PostForm {
  title: string;
  excerpt: string;
  bodyHtml: string;
  coverUrl: string;
  status: Status;
  seoTitle: string;
  seoDescription: string;
}
const EMPTY: PostForm = { title: '', excerpt: '', bodyHtml: '', coverUrl: '', status: 'DRAFT', seoTitle: '', seoDescription: '' };
const STATUS_TONE: Record<PostRow['status'], 'ok' | 'muted' | 'warn' | 'info'> = { PUBLISHED: 'ok', DRAFT: 'muted', SCHEDULED: 'info', ARCHIVED: 'warn' };

function toBody(f: PostForm): Record<string, unknown> {
  return { title: f.title.trim(), excerpt: opt(f.excerpt), bodyHtml: f.bodyHtml, coverUrl: opt(f.coverUrl), status: f.status, seoTitle: opt(f.seoTitle), seoDescription: opt(f.seoDescription) };
}

function fromFull(p: PostFull): PostForm {
  // SCHEDULED is not offered in the editor (no scheduler UI) — it is edited as a draft.
  const status: Status = p.status === 'SCHEDULED' ? 'DRAFT' : p.status;
  return { title: p.title, excerpt: p.excerpt ?? '', bodyHtml: p.bodyHtml, coverUrl: p.coverUrl ?? '', status, seoTitle: p.seoTitle ?? '', seoDescription: p.seoDescription ?? '' };
}

function PostFields({ initial, busy, onSave, onCancel }: { initial: PostForm; busy: boolean; onSave: (f: PostForm) => void; onCancel: () => void }): ReactNode {
  const [f, setF] = useState<PostForm>(initial);
  const set = <K extends keyof PostForm>(k: K, v: PostForm[K]): void => setF((p) => ({ ...p, [k]: v }));
  const words = f.bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(f);
      }}
    >
      <Field label="Title" wide>
        <input required minLength={3} maxLength={220} value={f.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Excerpt (list summary)" wide>
        <input maxLength={400} value={f.excerpt} onChange={(e) => set('excerpt', e.target.value)} className={inputCls} />
      </Field>
      <Field label={`Body HTML · ${words} words`} hint="Allowed: headings, paragraphs, lists, links, bold/italic, images. Anything else is removed on save." wide>
        <textarea required value={f.bodyHtml} onChange={(e) => set('bodyHtml', e.target.value)} className={`${textareaCls} min-h-72 font-mono text-sm`} />
      </Field>
      <Field label="Cover image URL" hint="Optional. A site path like /uploads/… or a full https:// link.">
        <input maxLength={255} value={f.coverUrl} onChange={(e) => set('coverUrl', e.target.value)} className={`${inputCls} font-mono`} />
      </Field>
      <Field label="Status">
        <select value={f.status} onChange={(e) => set('status', e.target.value as Status)} className={inputCls}>
          <option value="DRAFT">Draft (hidden)</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived (hidden)</option>
        </select>
      </Field>
      <Field label="SEO title">
        <input maxLength={180} value={f.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} className={inputCls} />
      </Field>
      <Field label="SEO description">
        <input maxLength={320} value={f.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} className={inputCls} />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className={buttonClass('ghost', 'sm')}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !f.bodyHtml.trim()} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save post'}
        </button>
      </div>
    </form>
  );
}

/** Loads the full post (any status) from the admin endpoint, then shows the editor. */
function PostEditLoader({ row, busy, onSave, onCancel }: { row: PostRow; busy: boolean; onSave: (f: PostForm) => void; onCancel: () => void }): ReactNode {
  const [state, setState] = useState<{ form: PostForm } | { error: string } | null>(null);
  useEffect(() => {
    let alive = true;
    call<PostFull>(`/admin/content/posts/${row.id}`)
      .then((p) => alive && setState({ form: fromFull(p) }))
      .catch((e: unknown) => alive && setState({ error: errText(e, 'en') }));
    return () => {
      alive = false;
    };
  }, [row.id]);
  if (!state) return <Skeleton className="h-64 w-full" />;
  if ('error' in state) return <Notice err={`Could not load this post: ${state.error}`} />;
  return <PostFields initial={state.form} busy={busy} onSave={onSave} onCancel={onCancel} />;
}

export function ContentPosts({ rows }: { rows: PostRow[] }): ReactNode {
  const a = useAdminAction();
  const [editId, setEditId] = useState<number | 'new' | null>(null);

  async function save(id: number | null, f: PostForm): Promise<void> {
    const r = await a.run(`post-${id ?? 'new'}`, () => call<{ id: number; slug: string }>(id ? `/admin/content/posts/${id}` : '/admin/content/posts', { method: id ? 'PUT' : 'POST', body: toBody(f) }), (x) => `Post saved (/blog/${x.slug}).`);
    if (r) setEditId(null);
  }

  async function remove(p: PostRow): Promise<void> {
    if (!window.confirm(`Delete the post "${p.title}" permanently? Its link /blog/${p.slug} will stop working. To only hide it, set the status to Draft or Archived instead.`)) return;
    const r = await a.run(`del-${p.id}`, () => call(`/admin/content/posts/${p.id}`, { method: 'DELETE' }), 'Post deleted.');
    if (r !== null && editId === p.id) setEditId(null);
  }

  return (
    <section className="space-y-3">
      <PanelTitle
        action={
          <button type="button" onClick={() => setEditId(editId === 'new' ? null : 'new')} className={buttonClass(editId === 'new' ? 'ghost' : 'primary', 'sm')}>
            <Icon name={editId === 'new' ? 'x' : 'plus'} size={18} /> {editId === 'new' ? 'Close' : 'New post'}
          </button>
        }
      >
        Blog posts
      </PanelTitle>
      <Notice err={a.err} ok={a.ok} />
      {editId === 'new' ? (
        <div className="fb-card p-4">
          <PostFields initial={EMPTY} busy={a.busy === 'post-new'} onSave={(f) => void save(null, f)} onCancel={() => setEditId(null)} />
        </div>
      ) : null}
      {rows.length ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Status</Th>
              <Th>Published</Th>
              <Th align="right">Views</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <PostTableRow key={p.id} p={p} open={editId === p.id} busy={a.busy === `post-${p.id}`} deleting={a.busy === `del-${p.id}`} onToggle={() => setEditId(editId === p.id ? null : p.id)} onSave={(f) => void save(p.id, f)} onDelete={() => void remove(p)} />
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <div className="fb-card">
          <EmptyState icon="article" title="No blog posts yet" body="Helpful Hindi posts bring customers from Google. Write the first one." />
        </div>
      )}
    </section>
  );
}

function PostTableRow({ p, open, busy, deleting, onToggle, onSave, onDelete }: { p: PostRow; open: boolean; busy: boolean; deleting: boolean; onToggle: () => void; onSave: (f: PostForm) => void; onDelete: () => void }): ReactNode {
  return (
    <>
      <tr>
        <Td>
          <span className="block font-semibold">{p.title}</span>
          {p.status === 'PUBLISHED' ? (
            <Link href={`/blog/${p.slug}`} target="_blank" className="font-mono text-sm text-em-700">
              /blog/{p.slug}
            </Link>
          ) : (
            <span className="font-mono text-sm text-ink-3">/blog/{p.slug}</span>
          )}
        </Td>
        <Td>
          <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
        </Td>
        <Td className="text-sm">{p.publishedAt ? formatDate(p.publishedAt, 'en') : '—'}</Td>
        <Td align="right">{p.views}</Td>
        <Td align="right">
          <span className="inline-flex gap-1">
            <button type="button" onClick={onToggle} className={buttonClass(open ? 'ghost' : 'secondary', 'sm')}>
              <Icon name={open ? 'x' : 'pencil'} size={16} /> {open ? 'Close' : 'Edit'}
            </button>
            <button type="button" disabled={deleting} onClick={onDelete} className={buttonClass('ghost', 'sm')} aria-label={`Delete ${p.title}`}>
              <Icon name="trash" size={16} className="text-danger" />
            </button>
          </span>
        </Td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={5} className="border-b border-line bg-paper/50 p-4">
            <PostEditLoader row={p} busy={busy} onSave={onSave} onCancel={onToggle} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
