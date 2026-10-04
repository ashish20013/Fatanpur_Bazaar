import type { ReactNode } from 'react';
import { Icon } from '../icons';

/** Shared staff-form pieces so every admin screen has the same 44px inputs, labels and notices. */
export const inputCls = 'h-11 w-full rounded border border-line-2 bg-card px-3 text-body outline-none focus:border-em-600 disabled:bg-paper disabled:text-ink-3';
export const textareaCls = 'min-h-28 w-full rounded border border-line-2 bg-card px-3 py-2 text-body outline-none focus:border-em-600';

export function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }): ReactNode {
  return (
    <label className={`flex flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-sm font-semibold text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-sm text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): ReactNode {
  return (
    <label className="flex min-h-11 items-center gap-2 text-base text-ink">
      <input type="checkbox" className="h-5 w-5 accent-em-700" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Error / success line for a screen. aria-live so screen readers hear the outcome of an action. */
export function Notice({ err, ok }: { err: string | null; ok?: string | null }): ReactNode {
  if (!err && !ok) return <p aria-live="polite" className="sr-only" />;
  return (
    <p aria-live="polite" className={`flex items-start gap-2 rounded border px-3 py-2 text-base ${err ? 'border-[#f3c8c2] bg-[#fdecea] text-danger' : 'border-em-200 bg-em-50 text-em-800'}`}>
      <Icon name={err ? 'alert-triangle' : 'circle-check'} size={18} className="mt-0.5 shrink-0" />
      <span>{err ?? ok}</span>
    </p>
  );
}

/** Server-side load failure for a staff page (English, with a plain reload link). */
export function LoadError({ what, href }: { what: string; href: string }): ReactNode {
  return (
    <div className="fb-card mx-auto my-6 max-w-md p-5 text-center">
      <Icon name="alert-triangle" size={28} className="mx-auto text-danger" />
      <p className="mt-2 text-body font-semibold text-ink">Could not load {what}.</p>
      <p className="text-base text-ink-2">The server did not respond, or you do not have access.</p>
      <a href={href} className="mt-3 inline-flex h-10 items-center justify-center rounded border border-line-2 bg-card px-3.5 text-base font-semibold text-em-800 no-underline hover:bg-em-50">
        Try again
      </a>
    </div>
  );
}

export function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }): ReactNode {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export interface TabDef<K extends string> {
  key: K;
  label: string;
  count?: number;
}

export function Tabs<K extends string>({ tabs, active, onChange }: { tabs: TabDef<K>[]; active: K; onChange: (k: K) => void }): ReactNode {
  return (
    <div role="tablist" className="fb-scroll-x flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-base font-semibold ${active === t.key ? 'border-em-700 text-em-800' : 'border-transparent text-ink-2 hover:text-ink'}`}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1.5 rounded-full bg-paper-2 px-1.5 text-sm text-ink-2">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
