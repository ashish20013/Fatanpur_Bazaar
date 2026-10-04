'use client';

import { useState, type ReactNode } from 'react';
import { call } from '@/lib/client';
import { Icon } from '../icons';
import { Badge, EmptyState, buttonClass } from '../ui';
import { useAdminAction } from './admin-client';
import { FAQ_SCOPES, type FaqRow } from './content-types';
import { Check, Field, Notice, PanelTitle, inputCls, textareaCls } from './form-kit';

interface FaqForm {
  question: string;
  answer: string;
  pageScope: string;
  sortOrder: string;
  isActive: boolean;
}

const SCOPE_LABEL: Record<string, string> = { home: 'Home page', general: 'FAQ page' };
const scopeLabel = (s: string): string => SCOPE_LABEL[s] ?? s;

function fromRow(q: FaqRow): FaqForm {
  return { question: q.question, answer: q.answer, pageScope: q.pageScope, sortOrder: String(q.sortOrder), isActive: q.isActive === 1 };
}

function toBody(f: FaqForm): Record<string, unknown> {
  return { question: f.question.trim(), answer: f.answer.trim(), pageScope: f.pageScope, sortOrder: Number(f.sortOrder) || 0, isActive: f.isActive };
}

function FaqFields({ initial, busy, onSave, onCancel }: { initial: FaqForm; busy: boolean; onSave: (f: FaqForm) => void; onCancel: () => void }): ReactNode {
  const [f, setF] = useState<FaqForm>(initial);
  const set = <K extends keyof FaqForm>(k: K, v: FaqForm[K]): void => setF((p) => ({ ...p, [k]: v }));
  // Keep an unexpected legacy scope selectable so saving never silently moves the FAQ.
  const scopes: string[] = FAQ_SCOPES.includes(f.pageScope as (typeof FAQ_SCOPES)[number]) ? [...FAQ_SCOPES] : [...FAQ_SCOPES, f.pageScope];
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(f);
      }}
    >
      <Field label="Question" wide>
        <input required minLength={3} maxLength={300} value={f.question} onChange={(e) => set('question', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Answer" hint="Plain text or simple HTML (links, bold)." wide>
        <textarea required minLength={2} maxLength={5000} value={f.answer} onChange={(e) => set('answer', e.target.value)} className={textareaCls} />
      </Field>
      <Field label="Where it shows">
        <select value={f.pageScope} onChange={(e) => set('pageScope', e.target.value)} className={inputCls}>
          {scopes.map((s) => (
            <option key={s} value={s}>
              {scopeLabel(s)} ({s})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Sort order" hint="Lower numbers show first">
        <input inputMode="numeric" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value.replace(/[^\d-]/g, ''))} className={inputCls} />
      </Field>
      <Check label="Active (shown on the website)" checked={f.isActive} onChange={(v) => set('isActive', v)} />
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className={buttonClass('ghost', 'sm')}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save FAQ'}
        </button>
      </div>
    </form>
  );
}

function FaqItem({ q, open, busyKey, onToggleOpen, onSave, onActive, onDelete }: { q: FaqRow; open: boolean; busyKey: string | null; onToggleOpen: () => void; onSave: (f: FaqForm) => void; onActive: () => void; onDelete: () => void }): ReactNode {
  const active = q.isActive === 1;
  return (
    <li className={`p-3 ${active ? '' : 'bg-paper/60'}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink" lang="hi">
            {q.question}
          </p>
          <p className="line-clamp-2 text-base text-ink-2" lang="hi">
            {q.answer.replace(/<[^>]+>/g, ' ')}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <Badge tone={active ? 'ok' : 'muted'}>{active ? 'Shown' : 'Hidden'}</Badge>
            <span>{scopeLabel(q.pageScope)}</span>
            <span>· sort {q.sortOrder}</span>
          </p>
        </div>
        <span className="inline-flex gap-1">
          <button type="button" disabled={busyKey === `faq-${q.id}`} onClick={onActive} className={buttonClass('ghost', 'sm')}>
            <Icon name={active ? 'eye' : 'check'} size={16} /> {active ? 'Hide' : 'Show'}
          </button>
          <button type="button" onClick={onToggleOpen} className={buttonClass(open ? 'ghost' : 'secondary', 'sm')}>
            <Icon name={open ? 'x' : 'pencil'} size={16} /> {open ? 'Close' : 'Edit'}
          </button>
          <button type="button" disabled={busyKey === `del-${q.id}`} onClick={onDelete} className={buttonClass('ghost', 'sm')} aria-label="Delete FAQ">
            <Icon name="trash" size={16} className="text-danger" />
          </button>
        </span>
      </div>
      {open ? (
        <div className="mt-3 border-t border-line pt-3">
          <FaqFields initial={fromRow(q)} busy={busyKey === `faq-${q.id}`} onSave={onSave} onCancel={onToggleOpen} />
        </div>
      ) : null}
    </li>
  );
}

/** Every FAQ (hidden ones too) from GET /admin/content/faqs; answers are sanitised by the API on save. */
export function ContentFaqs({ rows }: { rows: FaqRow[] }): ReactNode {
  const a = useAdminAction();
  const [open, setOpen] = useState<number | 'new' | null>(null);

  async function save(id: number | null, f: FaqForm): Promise<void> {
    const r = await a.run(`faq-${id ?? 'new'}`, () => call(id ? `/admin/content/faqs/${id}` : '/admin/content/faqs', { method: id ? 'PUT' : 'POST', body: toBody(f) }), 'FAQ saved.');
    if (r !== null) setOpen(null);
  }

  async function toggleActive(q: FaqRow): Promise<void> {
    const f = { ...fromRow(q), isActive: q.isActive !== 1 };
    await a.run(`faq-${q.id}`, () => call(`/admin/content/faqs/${q.id}`, { method: 'PUT', body: toBody(f) }), f.isActive ? 'FAQ is shown again.' : 'FAQ hidden from the website.');
  }

  async function remove(q: FaqRow): Promise<void> {
    if (!window.confirm(`Delete this FAQ permanently?\n\n“${q.question}”\n\nTo keep it for later, use Hide instead.`)) return;
    const r = await a.run(`del-${q.id}`, () => call(`/admin/content/faqs/${q.id}`, { method: 'DELETE' }), 'FAQ deleted.');
    if (r !== null && open === q.id) setOpen(null);
  }

  const nextSort = rows.reduce((m, q) => Math.max(m, q.sortOrder), -1) + 1;
  return (
    <section className="space-y-3">
      <PanelTitle
        action={
          <button type="button" onClick={() => setOpen(open === 'new' ? null : 'new')} className={buttonClass(open === 'new' ? 'ghost' : 'primary', 'sm')}>
            <Icon name={open === 'new' ? 'x' : 'plus'} size={18} /> {open === 'new' ? 'Close' : 'New FAQ'}
          </button>
        }
      >
        Frequently asked questions
      </PanelTitle>
      <Notice err={a.err} ok={a.ok} />
      {open === 'new' ? (
        <div className="fb-card p-4">
          <FaqFields initial={{ question: '', answer: '', pageScope: 'general', sortOrder: String(nextSort), isActive: true }} busy={a.busy === 'faq-new'} onSave={(f) => void save(null, f)} onCancel={() => setOpen(null)} />
        </div>
      ) : null}
      {rows.length ? (
        <ul className="divide-y divide-line rounded border border-line bg-card">
          {rows.map((q) => (
            <FaqItem key={q.id} q={q} open={open === q.id} busyKey={a.busy} onToggleOpen={() => setOpen(open === q.id ? null : q.id)} onSave={(f) => void save(q.id, f)} onActive={() => void toggleActive(q)} onDelete={() => void remove(q)} />
          ))}
        </ul>
      ) : (
        <div className="fb-card">
          <EmptyState icon="info-circle" title="No FAQs yet" body="Answer the questions customers ask on the phone most often." />
        </div>
      )}
    </section>
  );
}
