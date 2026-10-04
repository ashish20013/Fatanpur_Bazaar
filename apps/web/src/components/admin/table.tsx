import type { ReactNode } from 'react';

/**
 * Admin table shell. ⚠️ Table hi ek aisi cheez hai jise horizontal scroll ki ijazat hai,
 * aur wo bhi apne wrapper ke andar — page body 320px pe kabhi side me nahi khiskta (§9).
 */
export function TableWrap({ children }: { children: ReactNode }): ReactNode {
  return (
    // tabIndex + role: a region that scrolls with the mouse must also scroll with the arrow keys,
    // otherwise a keyboard-only user can never reach the right-hand columns (WCAG 2.1.1).
    <div className="overflow-x-auto rounded border border-line bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-em-600" tabIndex={0} role="region" aria-label="Table">
      <table className="w-full min-w-[640px] border-collapse text-base">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
}): ReactNode {
  return (
    <th className={`border-b border-line px-3 py-2 text-${align} text-sm font-semibold text-ink-2`}>
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}): ReactNode {
  return (
    <td className={`border-b border-line px-3 py-2 text-${align} align-middle ${className}`}>{children}</td>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: 'default' | 'warn' | 'danger';
}): ReactNode {
  const border = tone === 'danger' ? 'border-danger' : tone === 'warn' ? 'border-a-600' : 'border-line';
  const body = (
    <>
      <p className="text-sm text-ink-3">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint ? <p className="text-sm text-ink-2">{hint}</p> : null}
    </>
  );
  return href ? (
    <a href={href} className={`fb-card block border ${border} p-3 no-underline`}>
      {body}
    </a>
  ) : (
    <div className={`fb-card border ${border} p-3`}>{body}</div>
  );
}
