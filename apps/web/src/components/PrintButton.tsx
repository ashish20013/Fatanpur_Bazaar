'use client';

import { Icon } from './icons';
import { buttonClass } from './ui';

/** Opens the browser's print dialog (also "Save as PDF" on phones). */
export function PrintButton({ label }: { label: string }): React.ReactNode {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass('primary', 'sm')}>
      <Icon name="printer" size={16} /> {label}
    </button>
  );
}
