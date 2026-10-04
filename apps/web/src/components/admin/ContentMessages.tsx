'use client';

import { useState, type ReactNode } from 'react';
import { call } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { EmptyState, Badge, buttonClass } from '../ui';
import { useAdminAction } from './admin-client';
import type { MessageRow } from './content-types';
import { Notice, PanelTitle, inputCls } from './form-kit';

type Status = MessageRow['status'];
const LABEL: Record<Status, string> = { NEW: 'New', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved' };
const TONE: Record<Status, 'warn' | 'info' | 'ok'> = { NEW: 'warn', IN_PROGRESS: 'info', RESOLVED: 'ok' };

function MessageItem({ m, busy, onSave }: { m: MessageRow; busy: boolean; onSave: (status: Status, note: string) => void }): ReactNode {
  const [status, setStatus] = useState<Status>(m.status);
  const [note, setNote] = useState(m.admin_note ?? '');
  const dirty = status !== m.status || note !== (m.admin_note ?? '');
  const tel = m.phone.length === 10 ? `+91${m.phone}` : `+${m.phone}`;
  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TONE[m.status]}>{LABEL[m.status]}</Badge>
        <span className="font-semibold text-ink">{m.name}</span>
        <a href={`tel:${tel}`} className="font-semibold tabular-nums text-em-700">
          {m.phone}
        </a>
        {m.order_number ? <span className="font-mono text-sm text-ink-2">{m.order_number}</span> : null}
        <span className="ml-auto text-sm text-ink-3">{formatDate(m.created_at, 'en')}</span>
      </div>
      <p className="whitespace-pre-line text-body text-ink" lang="hi">
        {m.subject ? <strong>{m.subject}: </strong> : null}
        {m.message}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Status" className={`${inputCls} w-auto`}>
          {(Object.keys(LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>
              {LABEL[s]}
            </option>
          ))}
        </select>
        <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (e.g. called back, item added)" aria-label="Internal note" className={`${inputCls} min-w-0 flex-1`} />
        <button type="button" disabled={busy || !dirty} onClick={() => onSave(status, note)} className={buttonClass('secondary', 'sm')}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </li>
  );
}

/** Contact-form messages and "item not found" requests — the demand list for new stock. */
export function ContentMessages({ rows }: { rows: MessageRow[] }): ReactNode {
  const a = useAdminAction();
  const [filter, setFilter] = useState<Status | 'ALL'>('NEW');
  const shown = filter === 'ALL' ? rows : rows.filter((m) => m.status === filter);

  async function save(m: MessageRow, status: Status, note: string): Promise<void> {
    await a.run(`msg-${m.id}`, () => call(`/admin/content/messages/${m.id}`, { method: 'PATCH', body: { status, note: note.trim() || undefined } }), `Message from ${m.name} updated.`);
  }

  return (
    <section className="space-y-3">
      <PanelTitle>Customer messages</PanelTitle>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(['NEW', 'IN_PROGRESS', 'RESOLVED', 'ALL'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`h-10 rounded-full border px-4 text-base font-semibold ${filter === s ? 'border-em-700 bg-em-700 text-white' : 'border-line-2 bg-card text-ink-2 hover:border-em-300'}`}>
            {s === 'ALL' ? 'All' : LABEL[s]} ({s === 'ALL' ? rows.length : rows.filter((m) => m.status === s).length})
          </button>
        ))}
      </div>
      <Notice err={a.err} ok={a.ok} />
      {shown.length ? (
        <ul className="divide-y divide-line rounded border border-line bg-card">
          {shown.map((m) => (
            <MessageItem key={m.id} m={m} busy={a.busy === `msg-${m.id}`} onSave={(s, n) => void save(m, s, n)} />
          ))}
        </ul>
      ) : (
        <div className="fb-card">
          <EmptyState icon="message" title={filter === 'NEW' ? 'No new messages' : 'Nothing here'} body="Messages from the contact form and search requests appear here." />
        </div>
      )}
    </section>
  );
}
