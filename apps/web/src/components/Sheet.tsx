'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

/**
 * One overlay for the whole site: a bottom sheet on phones (thumb-reachable, 48px rows) and a
 * centred dialog from 640px up. Escape / backdrop close it, body scroll is locked while open and
 * focus moves into it (keyboard + screen-reader friendly).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = 'बंद करें',
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  wide?: boolean;
}): ReactNode {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <button type="button" aria-label={closeLabel} className="fb-backdrop absolute inset-0 cursor-default bg-[#0b2618]/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={`fb-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-card shadow-3 outline-none sm:rounded-[22px] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-2 sm:hidden" aria-hidden="true" />
        {title ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 className="fb-display min-w-0 text-xl text-ink">{title}</h2>
            <button type="button" onClick={onClose} className="fb-tap -mr-2 grid place-items-center rounded-full text-ink-2 hover:bg-paper-2" aria-label={closeLabel}>
              <Icon name="x" />
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="shrink-0 border-t border-line bg-card px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
