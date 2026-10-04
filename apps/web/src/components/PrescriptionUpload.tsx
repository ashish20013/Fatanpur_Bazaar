'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dict, type Lang } from '@/lib/i18n';
import { buttonClass } from './ui';
import { Icon } from './icons';

/**
 * A21 — pharmacy parchi. File seedha BFF proxy se API jaati hai (multipart),
 * jahan asli MIME sniff hota hai, image re-encode hoti hai aur file webroot ke BAHAR
 * private folder me jaati hai. Yahan sirf size/type ki pehli jhalak dekhi jaati hai.
 */
const MAX_MB = 5;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function PrescriptionUpload({ lang, orderId }: { lang: Lang; orderId?: number }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function upload(file: File): Promise<void> {
    setErr(null);
    if (!OK_TYPES.includes(file.type)) {
      setErr('JPG, PNG, WEBP या PDF ही भेजें');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setErr(`फ़ाइल ${MAX_MB} MB से छोटी होनी चाहिए`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (orderId) fd.append('orderId', String(orderId));
      const res = await fetch('/api/bff/prescriptions', { method: 'POST', body: fd, headers: { 'x-requested-with': 'fb-web' }, credentials: 'same-origin' });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message: string } } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? t.common.error);
      setOk(true);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fb-card space-y-2 p-3">
      <p className="text-base font-semibold">{t.checkout.rxUpload}</p>
      <label className={`${buttonClass('secondary', 'md')} cursor-pointer`}>
        <Icon name="photo" size={18} /> {t.checkout.rxUpload}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>
      {ok ? <p className="text-base text-ok">{t.staff.saved}</p> : null}
      {err ? <p className="text-base text-danger">{err}</p> : null}
      <p className="text-sm text-ink-3">{t.product.rxHint}</p>
    </div>
  );
}
