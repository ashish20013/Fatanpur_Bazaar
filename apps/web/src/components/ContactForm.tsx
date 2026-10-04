'use client';

import { useState } from 'react';
import { call, ClientError } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { buttonClass } from './ui';

/** §8 item 5 — contact page ka form. Cart/order jaisa hi pattern: BFF ko call, chhota client bundle. */
export function ContactForm({ lang }: { lang: Lang }): React.ReactNode {
  const t = dict(lang);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (done) return <p className="fb-card p-4 text-base font-semibold text-ok">{t.contact.done}</p>;

  return (
    <form
      className="fb-card space-y-2 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^[6-9]\d{9}$/.test(phone)) {
          setErr(t.auth.phoneHint);
          return;
        }
        if (name.trim().length < 1 || message.trim().length < 5) {
          setErr(t.common.required);
          return;
        }
        setBusy(true);
        setErr(null);
        try {
          await call('/content/contact', { method: 'POST', body: { name: name.trim(), phone, subject: subject.trim() || undefined, message: message.trim() } });
          setDone(true);
        } catch (e2) {
          setErr(e2 instanceof ClientError ? e2.message : t.common.error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-lg font-semibold">{t.contact.title}</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 120))}
        placeholder={t.contact.name}
        aria-label={t.contact.name}
        className="h-12 w-full rounded border border-line px-3 text-body outline-none focus:border-g-600"
      />
      <input
        inputMode="numeric"
        maxLength={10}
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
        placeholder="9876543210"
        aria-label={t.contact.phone}
        className="h-12 w-full rounded border border-line px-3 text-body outline-none focus:border-g-600"
      />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value.slice(0, 180))}
        placeholder={t.contact.subjectOptional}
        aria-label={t.contact.subject}
        className="h-12 w-full rounded border border-line px-3 text-body outline-none focus:border-g-600"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
        placeholder={t.contact.message}
        aria-label={t.contact.message}
        rows={4}
        className="w-full rounded border border-line px-3 py-2 text-body outline-none focus:border-g-600"
      />
      {err ? <p className="text-base text-danger">{err}</p> : null}
      <button type="submit" disabled={busy} className={buttonClass('primary', 'md', true)}>
        {busy ? t.contact.sending : t.contact.send}
      </button>
    </form>
  );
}
