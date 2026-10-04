'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { call, errText, savePrefs } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { buttonClass } from './ui';

interface Profile {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  language: 'hi' | 'en';
  referralCode: string | null;
}

/** ⚠️ Yahan `role` bhejne ka koi rasta nahi — API ka schema use girata hai (§2 layer 2). */
export function ProfileForm({ lang, profile }: { lang: Lang; profile: Profile }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [name, setName] = useState(profile.name ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [language, setLanguage] = useState<'hi' | 'en'>(profile.language);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = 'h-12 w-full rounded border border-line px-3 text-body outline-none focus:border-g-600';

  async function save(): Promise<void> {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await call('/users/me', { method: 'PATCH', body: { name: name.trim() || undefined, email: email.trim() || null, language } });
      await savePrefs({ lang: language });
      setMsg(t.staff.saved);
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fb-card space-y-3 p-3">
      <div>
        <label className="mb-1 block text-base font-semibold" htmlFor="pf-name">
          {t.auth.name}
        </label>
        <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </div>
      <div>
        <label className="mb-1 block text-base font-semibold" htmlFor="pf-phone">
          {t.auth.phone}
        </label>
        <input id="pf-phone" value={profile.phone} readOnly disabled className={`${field} bg-g-50 text-ink-2`} />
      </div>
      <div>
        <label className="mb-1 block text-base font-semibold" htmlFor="pf-email">
          Email
        </label>
        <input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </div>
      <fieldset>
        <legend className="mb-1 text-base font-semibold">{t.lang.hi} / {t.lang.en}</legend>
        <div className="flex gap-2">
          {(['hi', 'en'] as const).map((l) => (
            <label key={l} className={`flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded border ${language === l ? 'border-g-600 bg-g-50' : 'border-line'}`}>
              <input type="radio" name="lang" className="h-5 w-5" checked={language === l} onChange={() => setLanguage(l)} />
              {l === 'hi' ? t.lang.hi : t.lang.en}
            </label>
          ))}
        </div>
      </fieldset>
      {profile.referralCode ? (
        <p className="text-base text-ink-2">
          {t.account.referralCode}: <span className="font-bold tracking-wider">{profile.referralCode}</span>
        </p>
      ) : null}
      <button type="button" disabled={busy} onClick={() => void save()} className={buttonClass('primary', 'md', true)}>
        {busy ? t.common.saving : t.common.save}
      </button>
      {msg ? <p className="text-base text-ok">{msg}</p> : null}
      {err ? <p className="text-base text-danger">{err}</p> : null}
    </div>
  );
}
