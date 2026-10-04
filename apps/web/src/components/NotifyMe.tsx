'use client';

import { useState } from 'react';
import { call } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { buttonClass } from './ui';

/** A9 — stock 0 pe page 200 rehta hai aur customer "आने पर बताएं" chhod sakta hai (stock_alerts). */
export function NotifyMe({ lang, productId }: { lang: Lang; productId: number }): React.ReactNode {
  const t = dict(lang);
  const [phone, setPhone] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (done) return <p className="text-base font-semibold text-ok">{t.product.notifyDone}</p>;

  return (
    <div className="space-y-2">
      <p className="text-base font-semibold">{t.product.notifyMe}</p>
      <div className="flex gap-2">
        <input
          inputMode="numeric"
          maxLength={10}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="9876543210"
          aria-label={t.address.phone}
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-body outline-none focus:border-g-600"
        />
        <button
          type="button"
          disabled={busy}
          className={buttonClass('secondary', 'md')}
          onClick={async () => {
            if (!/^[6-9]\d{9}$/.test(phone)) {
              setErr(t.auth.phoneHint);
              return;
            }
            setBusy(true);
            try {
              await call(`/catalog/products/${productId}/notify`, { method: 'POST', body: { phone } });
              setDone(true);
            } catch (e) {
              setErr(e instanceof Error ? e.message : t.common.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t.sorry.leadCta}
        </button>
      </div>
      {err ? <p className="text-base text-danger">{err}</p> : null}
    </div>
  );
}
