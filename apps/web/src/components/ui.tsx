import type { ReactNode } from 'react';
import { Icon } from './icons';

/**
 * §9 base UI: ek hi radius/shadow family, har interactive element ke saare states,
 * skeleton (spinner nahi), aur 48px tap targets.
 */
type ButtonVariant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-em-700 text-[#fffaf0] shadow-1 hover:bg-em-600 active:bg-em-800 disabled:bg-em-200 disabled:text-ink-3 disabled:shadow-none',
  gold: 'bg-[linear-gradient(180deg,#efdba2_0%,#d9b965_55%,#cba954_100%)] text-em-900 shadow-gold hover:brightness-[1.04] active:brightness-95 disabled:opacity-60',
  secondary: 'bg-card text-em-800 border border-line-2 hover:bg-em-50 hover:border-em-300 active:bg-em-100 disabled:text-ink-3',
  ghost: 'bg-transparent text-ink-2 hover:bg-paper-2 active:bg-line',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-100 disabled:opacity-50',
};
const SIZE: Record<Size, string> = { sm: 'h-10 px-3.5 text-base', md: 'h-12 px-5 text-body', lg: 'h-14 px-6 text-lg' };

export function buttonClass(variant: ButtonVariant = 'primary', size: Size = 'md', full = false): string {
  return [
    'inline-flex select-none items-center justify-center gap-2 rounded font-semibold no-underline transition duration-150 active:scale-[0.985]',
    'disabled:cursor-not-allowed disabled:active:scale-100',
    VARIANT[variant],
    SIZE[size],
    full ? 'w-full' : '',
  ].join(' ');
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }): ReactNode {
  return <div className={`fb-card p-3 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = 'ok' }: { children: ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }): ReactNode {
  const tones: Record<string, string> = {
    ok: 'bg-em-100 text-em-800',
    warn: 'bg-au-100 text-au-800',
    danger: 'bg-[#fdecea] text-danger',
    info: 'bg-[#e7f1f6] text-info',
    muted: 'bg-g-50 text-ink-2',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Skeleton({ className = '' }: { className?: string }): ReactNode {
  return <div className={`fb-skeleton ${className}`} aria-hidden="true" />;
}

/** §18 — har data view pe loading + empty + error, teenon. */
export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full border border-au-300 bg-au-50 text-em-700" aria-hidden="true">
        {/^[a-z0-9-]+$/.test(icon) ? <Icon name={icon} size={30} stroke={1.5} /> : <span className="text-2xl">{icon}</span>}
      </div>
      <p className="fb-display text-xl text-ink">{title}</p>
      {body ? <p className="max-w-sm text-base text-ink-2">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Stars({ avg, count }: { avg: string | number; count: number }): ReactNode {
  if (!count) return null;
  const v = Math.round(Number(avg) * 10) / 10;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink-2" aria-label={`रेटिंग ${v} — ${count} लोगों ने दी`}>
      <span className="text-au-600" aria-hidden="true">★</span>
      <span className="font-semibold text-ink">{v}</span>
      <span className="text-ink-3">({count})</span>
    </span>
  );
}

export function SectionTitle({ children, href, more }: { children: ReactNode; href?: string; more?: string }): ReactNode {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h2 className="fb-display text-xl text-ink">{children}</h2>
      {href ? (
        <a className="text-base font-semibold text-em-700 underline-offset-2 hover:underline" href={href}>
          {more}
        </a>
      ) : null}
    </div>
  );
}
