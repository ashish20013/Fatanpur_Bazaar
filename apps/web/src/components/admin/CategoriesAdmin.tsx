'use client';

import { Fragment, useState } from 'react';
import { CATEGORY_VERTICALS, type CategoryVertical } from '@fb/shared-types';
import { call } from '@/lib/client';
import { PUBLIC_API_URL } from '@/lib/env';
import { imageUrl } from '@/lib/format';
import { ColourArt, Icon } from '../icons';
import { Badge, EmptyState, buttonClass } from '../ui';
import { opt, upload, useAdminAction } from './admin-client';
import { Check, Field, Notice, PanelTitle, inputCls, textareaCls } from './form-kit';
import { TableWrap, Td, Th } from './table';

/** Row exactly as GET /admin/categories returns it (raw columns + counts). */
export interface CategoryRow {
  id: number;
  parent_id: number | null;
  vertical: CategoryVertical;
  item_type: 'PRODUCT' | 'SERVICE';
  name: string;
  name_hi: string | null;
  slug: string;
  image_url: string | null;
  image_url_sm: string | null;
  icon: string | null;
  sort_order: number;
  is_active: 0 | 1;
  seo_title: string | null;
  seo_description: string | null;
  intro_html: string | null;
  parent_name: string | null;
  product_count: number | string;
  child_count: number | string;
}

interface CatForm {
  name: string;
  nameHi: string;
  parentId: string;
  vertical: CategoryVertical;
  itemType: 'PRODUCT' | 'SERVICE';
  icon: string;
  sortOrder: string;
  isActive: boolean;
  seoTitle: string;
  seoDescription: string;
  introHtml: string;
}

const EMPTY: CatForm = { name: '', nameHi: '', parentId: '', vertical: 'GROCERY', itemType: 'PRODUCT', icon: '', sortOrder: '0', isActive: true, seoTitle: '', seoDescription: '', introHtml: '' };

function fromRow(c: CategoryRow): CatForm {
  return {
    name: c.name,
    nameHi: c.name_hi ?? '',
    parentId: c.parent_id ? String(c.parent_id) : '',
    vertical: c.vertical,
    itemType: c.item_type,
    icon: c.icon ?? '',
    sortOrder: String(c.sort_order),
    isActive: c.is_active === 1,
    seoTitle: c.seo_title ?? '',
    seoDescription: c.seo_description ?? '',
    introHtml: c.intro_html ?? '',
  };
}

/** The API replaces every column on PUT, so the full form is always sent (blank → cleared). */
function toBody(f: CatForm): Record<string, unknown> {
  return {
    name: f.name.trim(),
    nameHi: opt(f.nameHi),
    parentId: f.parentId ? Number(f.parentId) : null,
    vertical: f.vertical,
    itemType: f.itemType,
    icon: opt(f.icon),
    sortOrder: Number(f.sortOrder) || 0,
    isActive: f.isActive,
    seoTitle: opt(f.seoTitle),
    seoDescription: opt(f.seoDescription),
    introHtml: opt(f.introHtml),
  };
}

const VERTICAL_LABEL: Record<CategoryVertical, string> = {
  VEGETABLES: 'Vegetables',
  FRUITS: 'Fruits',
  GROCERY: 'Grocery',
  PHARMACY: 'Pharmacy',
  AGRI_INPUT: 'Farming inputs',
  SERVICE: 'Services',
  OTHER: 'Other',
};

function CategoryForm({ initial, rows, selfId, slug, busy, onSave, onCancel }: { initial: CatForm; rows: CategoryRow[]; selfId: number | null; slug?: string; busy: boolean; onSave: (f: CatForm) => void; onCancel: () => void }): React.ReactNode {
  const [f, setF] = useState<CatForm>(initial);
  const set = <K extends keyof CatForm>(k: K, v: CatForm[K]): void => setF((p) => ({ ...p, [k]: v }));
  // Two-level tree: only top-level categories can be parents, and never the category itself.
  const parents = rows.filter((r) => r.parent_id === null && r.id !== selfId);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(f);
      }}
    >
      <Field label="Name (English)">
        <input required minLength={2} maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Name (Hindi)">
        <input maxLength={120} value={f.nameHi} onChange={(e) => set('nameHi', e.target.value)} className={inputCls} lang="hi" />
      </Field>
      <Field label="Slug" hint={slug ? 'Set automatically from the name when the category is created.' : 'Generated from the English name on save.'}>
        <input value={slug ?? ''} readOnly disabled placeholder="auto" className={`${inputCls} font-mono`} />
      </Field>
      <Field label="Parent category">
        <select value={f.parentId} onChange={(e) => set('parentId', e.target.value)} className={inputCls}>
          <option value="">— None (top level) —</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.name_hi ? `· ${p.name_hi}` : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Vertical" hint="Switching a vertical off in Settings hides every category in it.">
        <select value={f.vertical} onChange={(e) => set('vertical', e.target.value as CategoryVertical)} className={inputCls}>
          {CATEGORY_VERTICALS.map((v) => (
            <option key={v} value={v}>
              {VERTICAL_LABEL[v]} ({v})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Item type">
        <select value={f.itemType} onChange={(e) => set('itemType', e.target.value as CatForm['itemType'])} className={inputCls}>
          <option value="PRODUCT">Products</option>
          <option value="SERVICE">Services (booking)</option>
        </select>
      </Field>
      <Field label="Icon name" hint="Tabler icon name, e.g. carrot, apple, pill">
        <span className="flex items-center gap-2">
          <input maxLength={40} value={f.icon} onChange={(e) => set('icon', e.target.value.trim())} className={inputCls} />
          {f.icon ? <Icon name={f.icon} size={24} className="shrink-0 text-em-700" /> : null}
        </span>
      </Field>
      <Field label="Sort order" hint="Lower numbers show first">
        <input inputMode="numeric" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value.replace(/[^\d-]/g, ''))} className={inputCls} />
      </Field>
      <Field label="SEO title">
        <input maxLength={180} value={f.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} className={inputCls} />
      </Field>
      <Field label="SEO description">
        <input maxLength={320} value={f.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Intro HTML" hint="Shown at the top of the category page. Unsafe tags are removed on save." wide>
        <textarea maxLength={20000} value={f.introHtml} onChange={(e) => set('introHtml', e.target.value)} className={`${textareaCls} font-mono text-sm`} />
      </Field>
      <Check label="Active (visible on the website)" checked={f.isActive} onChange={(v) => set('isActive', v)} />
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className={buttonClass('ghost', 'sm')}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save category'}
        </button>
      </div>
    </form>
  );
}

/** 40px preview of whatever the website will show for this category. */
function CategoryThumb({ c }: { c: CategoryRow }): React.ReactNode {
  const src = imageUrl(c.image_url_sm ?? c.image_url, PUBLIC_API_URL);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={c.name_hi ?? c.name} width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line" />;
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper-2 ring-1 ring-line">
      <ColourArt name={`cat-${c.slug}`} fallback={c.icon ?? 'category'} size={26} />
    </span>
  );
}

function CategoryRowView({ c, onEdit, onDelete, onPhoto, onPhotoRemove, busy }: { c: CategoryRow; onEdit: () => void; onDelete: () => void; onPhoto: (f: File) => void; onPhotoRemove: () => void; busy: boolean }): React.ReactNode {
  return (
    <tr className={c.is_active ? '' : 'bg-paper/60'}>
      <Td>
        <span className={`flex items-center gap-2 ${c.parent_id ? 'pl-5' : ''}`}>
          <CategoryThumb c={c} />
          <span>
            <span className="block font-semibold">{c.name}</span>
            <span className="block text-sm text-ink-3" lang="hi">
              {c.name_hi ?? ''}
            </span>
          </span>
        </span>
      </Td>
      <Td className="font-mono text-sm">{c.slug}</Td>
      <Td>
        <Badge tone="info">{VERTICAL_LABEL[c.vertical]}</Badge>
      </Td>
      <Td className="text-sm">{c.parent_name ?? '—'}</Td>
      <Td align="right">{Number(c.product_count)}</Td>
      <Td align="center">
        <Badge tone={c.is_active ? 'ok' : 'muted'}>{c.is_active ? 'On' : 'Off'}</Badge>
      </Td>
      <Td align="right">{c.sort_order}</Td>
      <Td align="right">
        <span className="inline-flex flex-wrap justify-end gap-1">
          <label className={`${buttonClass('secondary', 'sm')} cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            <Icon name="photo" size={16} /> {c.image_url ? 'Replace' : 'Photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ''; // so picking the same file twice still fires
                if (f) onPhoto(f);
              }}
            />
          </label>
          {c.image_url ? (
            <button type="button" disabled={busy} onClick={onPhotoRemove} className={buttonClass('ghost', 'sm')} aria-label={`Remove photo of ${c.name}`}>
              <Icon name="trash" size={16} className="text-danger" />
            </button>
          ) : null}
          <button type="button" onClick={onEdit} className={buttonClass('secondary', 'sm')} aria-label={`Edit ${c.name}`}>
            <Icon name="pencil" size={16} /> Edit
          </button>
          <button type="button" disabled={busy} onClick={onDelete} className={buttonClass('ghost', 'sm')} aria-label={`Delete ${c.name}`}>
            <Icon name="trash" size={16} className="text-danger" />
          </button>
        </span>
      </Td>
    </tr>
  );
}

/** Catalog tree admin. Delete = hard delete only when empty; otherwise the API switches it off. */
export function CategoriesAdmin({ rows }: { rows: CategoryRow[] }): React.ReactNode {
  const a = useAdminAction();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  async function save(id: number | null, f: CatForm): Promise<void> {
    const r = await a.run(id ? `save-${id}` : 'create', () => call<{ id: number }>(id ? `/admin/categories/${id}` : '/admin/categories', { method: id ? 'PUT' : 'POST', body: toBody(f) }), id ? 'Category saved.' : 'Category created.');
    if (r) {
      setAdding(false);
      setEditId(null);
    }
  }

  /**
   * The category's picture on the website. Squared and re-encoded by the API exactly like a
   * product shot, so the shopkeeper can use a straight phone photo here too.
   */
  async function setPhoto(c: CategoryRow, file: File): Promise<void> {
    const fd = new FormData();
    fd.append('file', file);
    await a.run(`photo-${c.id}`, () => upload(`/admin/categories/${c.id}/image`, fd), `Photo set for "${c.name}".`);
  }

  async function removePhoto(c: CategoryRow): Promise<void> {
    if (!window.confirm(`Remove the photo of "${c.name}"? The drawn picture comes back.`)) return;
    await a.run(`photo-${c.id}`, () => call<{ ok: true }>(`/admin/categories/${c.id}/image`, { method: 'DELETE' }), `Photo removed from "${c.name}".`);
  }

  async function remove(c: CategoryRow): Promise<void> {
    const n = Number(c.product_count) + Number(c.child_count);
    const msg = n > 0 ? `"${c.name}" still has ${c.product_count} product(s) and ${c.child_count} sub-categories. It will be switched OFF instead of deleted. Continue?` : `Delete "${c.name}" permanently?`;
    if (!window.confirm(msg)) return;
    await a.run(`del-${c.id}`, () => call<{ deleted: boolean; deactivated: boolean }>(`/admin/categories/${c.id}`, { method: 'DELETE' }), (r) => (r.deleted ? `"${c.name}" was deleted.` : `"${c.name}" has products or sub-categories, so it was switched OFF instead of deleted.`));
  }

  return (
    <div className="space-y-4">
      <PanelTitle
        action={
          <button type="button" onClick={() => setAdding(!adding)} className={buttonClass(adding ? 'ghost' : 'primary', 'sm')}>
            <Icon name={adding ? 'x' : 'plus'} size={18} /> {adding ? 'Close' : 'New category'}
          </button>
        }
      >
        {rows.length} categories
      </PanelTitle>
      <Notice err={a.err} ok={a.ok} />
      {adding ? (
        <div className="fb-card p-4">
          <CategoryForm initial={EMPTY} rows={rows} selfId={null} busy={a.busy === 'create'} onSave={(f) => void save(null, f)} onCancel={() => setAdding(false)} />
        </div>
      ) : null}
      {rows.length ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th>Vertical</Th>
              <Th>Parent</Th>
              <Th align="right">Products</Th>
              <Th align="center">Active</Th>
              <Th align="right">Sort</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <Fragment key={c.id}>
                <CategoryRowView
                  c={c}
                  busy={a.busy === `del-${c.id}` || a.busy === `photo-${c.id}`}
                  onEdit={() => setEditId(editId === c.id ? null : c.id)}
                  onDelete={() => void remove(c)}
                  onPhoto={(f) => void setPhoto(c, f)}
                  onPhotoRemove={() => void removePhoto(c)}
                />
                {editId === c.id ? (
                  <tr>
                    <td colSpan={8} className="border-b border-line bg-paper/50 p-4">
                      <CategoryForm initial={fromRow(c)} rows={rows} selfId={c.id} slug={c.slug} busy={a.busy === `save-${c.id}`} onSave={(f) => void save(c.id, f)} onCancel={() => setEditId(null)} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <div className="fb-card">
          <EmptyState icon="category" title="No categories yet" body="Create the first category to start listing products." />
        </div>
      )}
    </div>
  );
}
