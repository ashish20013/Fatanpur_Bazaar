'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { call, errText } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { Icon } from '../icons';
import { Badge, EmptyState, Skeleton, buttonClass } from '../ui';
import { opt, useAdminAction } from './admin-client';
import type { PageFull, PageRow } from './content-types';
import { Check, Field, Notice, PanelTitle, inputCls, textareaCls } from './form-kit';

interface PageForm {
  title: string;
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
  isPublished: boolean;
}

function PageFields({ initial, busy, onSave, onCancel }: { initial: PageForm; busy: boolean; onSave: (f: PageForm) => void; onCancel: () => void }): ReactNode {
  const [f, setF] = useState<PageForm>(initial);
  const set = <K extends keyof PageForm>(k: K, v: PageForm[K]): void => setF((p) => ({ ...p, [k]: v }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(f);
      }}
    >
      <Field label="Title" wide>
        <input required minLength={2} maxLength={180} value={f.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Body HTML" hint="Unsafe tags and scripts are removed on save." wide>
        <textarea required value={f.bodyHtml} onChange={(e) => set('bodyHtml', e.target.value)} className={`${textareaCls} min-h-72 font-mono text-sm`} />
      </Field>
      <Field label="SEO title">
        <input maxLength={180} value={f.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} className={inputCls} />
      </Field>
      <Field label="SEO description">
        <input maxLength={320} value={f.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} className={inputCls} />
      </Field>
      <Check label="Published (visible on the website)" checked={f.isPublished} onChange={(v) => set('isPublished', v)} />
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className={buttonClass('ghost', 'sm')}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !f.bodyHtml.trim()} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save page'}
        </button>
      </div>
    </form>
  );
}

/** Loads the full page (published or hidden) from the admin endpoint, then shows the editor. */
function PageEditLoader({ row, busy, onSave, onCancel }: { row: PageRow; busy: boolean; onSave: (f: PageForm) => void; onCancel: () => void }): ReactNode {
  const [state, setState] = useState<{ form: PageForm } | { error: string } | null>(null);
  useEffect(() => {
    let alive = true;
    call<PageFull>(`/admin/content/pages/${encodeURIComponent(row.slug)}`)
      .then((p) => alive && setState({ form: { title: p.title, bodyHtml: p.bodyHtml, seoTitle: p.seoTitle ?? '', seoDescription: p.seoDescription ?? '', isPublished: p.isPublished === 1 } }))
      .catch((e: unknown) => alive && setState({ error: errText(e, 'en') }));
    return () => {
      alive = false;
    };
  }, [row.slug]);
  if (!state) return <Skeleton className="h-64 w-full" />;
  if ('error' in state) return <Notice err={`Could not load this page: ${state.error}`} />;
  return <PageFields initial={state.form} busy={busy} onSave={onSave} onCancel={onCancel} />;
}

export function ContentPages({ rows }: { rows: PageRow[] }): ReactNode {
  const a = useAdminAction();
  const [open, setOpen] = useState<string | null>(null);

  async function save(slug: string, f: PageForm): Promise<void> {
    const body = { title: f.title.trim(), bodyHtml: f.bodyHtml, seoTitle: opt(f.seoTitle), seoDescription: opt(f.seoDescription), isPublished: f.isPublished };
    const r = await a.run(`page-${slug}`, () => call(`/admin/content/pages/${encodeURIComponent(slug)}`, { method: 'PUT', body }), `Page /${slug} saved.`);
    if (r !== null) setOpen(null);
  }

  return (
    <section className="space-y-3">
      <PanelTitle>Pages (about, privacy, terms…)</PanelTitle>
      <p className="text-base text-ink-2">Each page has a fixed address on the website. Changes show on the site within about an hour.</p>
      <Notice err={a.err} ok={a.ok} />
      {rows.length ? (
        <ul className="divide-y divide-line rounded border border-line bg-card">
          {rows.map((p) => (
            <li key={p.slug} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{p.title}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
                    <Link href={`/${p.slug}`} target="_blank" className="font-mono text-em-700">
                      /{p.slug}
                    </Link>
                    <Badge tone={p.isPublished ? 'ok' : 'muted'}>{p.isPublished ? 'Published' : 'Hidden'}</Badge>
                    <span>Updated {formatDate(p.updatedAt, 'en')}</span>
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(open === p.slug ? null : p.slug)} className={buttonClass(open === p.slug ? 'ghost' : 'secondary', 'sm')}>
                  <Icon name={open === p.slug ? 'x' : 'pencil'} size={16} /> {open === p.slug ? 'Close' : 'Edit'}
                </button>
              </div>
              {open === p.slug ? (
                <div className="mt-3 border-t border-line pt-3">
                  <PageEditLoader row={p} busy={a.busy === `page-${p.slug}`} onSave={(f) => void save(p.slug, f)} onCancel={() => setOpen(null)} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="fb-card">
          <EmptyState icon="file-text" title="No pages found" body="The about, privacy, terms, refund, shipping and contact pages come from the database seed. Run the seed, then edit them here." />
        </div>
      )}
    </section>
  );
}
