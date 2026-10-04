'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { call, errText } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { Badge, buttonClass } from '../ui';
import { Icon } from '../icons';

export interface SettingRow {
  key: string;
  value: string | null;
  type: 'string' | 'int' | 'decimal' | 'bool' | 'json';
  group_name?: string;
  groupName?: string;
  label: string | null;
  is_public?: number;
  /** Server-enforced: this one lives in .env and the API refuses to change it. */
  locked?: boolean;
  /** Write-only: stored encrypted, never sent back. `value` arrives as dots or empty. */
  secret?: boolean;
  /** For a secret: is one stored at all? The only thing about it the screen may know. */
  isSet?: boolean;
}

/**
 * Settings ADMIN-only hain. Yahan se hi vertical on/off hota hai (kill-switch),
 * delivery fee, store ka samay, UPI details, aur allow_admin_creation.
 * ⚠️ Sirf badle hue fields bheje jaate hain, aur har badlaav audit log me jaata hai.
 */
export function SettingsAdmin({ lang, rows }: { lang: Lang; rows: SettingRow[] }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const groups = new Map<string, SettingRow[]>();
  for (const r of rows) {
    const g = r.groupName ?? r.group_name ?? 'other';
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }

  async function save(): Promise<void> {
    if (!Object.keys(changes).length) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await call('/admin/settings', { method: 'PUT', body: { changes } });
      setMsg(t.staff.saved);
      setChanges({});
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([group, list]) => (
        <section key={group} className="fb-card p-3">
          <h2 className="mb-2 text-lg capitalize">{group}</h2>
          <div className="space-y-2">
            {list.map((s) => {
              const current = changes[s.key] ?? s.value ?? '';
              return (
                <div key={s.key} className="grid gap-1 sm:grid-cols-[1fr_200px] sm:items-center">
                  <label htmlFor={`set-${s.key}`} className="text-base">
                    <span className="font-semibold">{s.label ?? s.key}</span>
                    <span className="ml-2 font-mono text-sm text-ink-3">{s.key}</span>
                    {s.is_public ? <Badge tone="muted">public</Badge> : null}
                  </label>
                  {/* A locked setting is shown, not offered. Handing someone a box they can type
                      in and then refusing the save is worse than saying up front that this one is
                      decided on the server — and the refusal is enforced there either way. */}
                  {s.locked ? (
                    <div className="flex h-12 items-center gap-2 rounded border border-dashed border-line-2 bg-paper-2 px-3">
                      <Icon name="lock" size={16} className="shrink-0 text-ink-3" />
                      <span className="truncate font-mono text-base text-ink-2">{current || '—'}</span>
                      <span className="ml-auto whitespace-nowrap text-xs text-ink-3">.env</span>
                    </div>
                  ) : s.secret ? (
                    /*
                     * A gateway key can be typed in and replaced, never read back.
                     *
                     * It arrives as dots and leaves as dots. Typing over them sends the new key;
                     * leaving them alone sends nothing, so saving an unrelated setting on this
                     * page can never blank the key and stop payments. `type="password"` keeps it
                     * off the screen in a shop where someone is usually watching, and off any
                     * screenshot sent for help.
                     */
                    <div>
                      <input
                        id={`set-${s.key}`}
                        type="password"
                        autoComplete="new-password"
                        value={changes[s.key] ?? ''}
                        placeholder={s.isSet ? '••••••••' : t.staff.notSet}
                        onChange={(e) => setChanges({ ...changes, [s.key]: e.target.value })}
                        className="h-12 w-full rounded border border-line px-3 font-mono text-body"
                      />
                      <p className="mt-0.5 text-xs text-ink-3">{s.isSet ? t.staff.secretSet : t.staff.secretEmpty}</p>
                    </div>
                  ) : s.type === 'bool' ? (
                    <select id={`set-${s.key}`} value={current} onChange={(e) => setChanges({ ...changes, [s.key]: e.target.value })} className="h-12 rounded border border-line px-3 text-body">
                      <option value="1">{t.staff.on}</option>
                      <option value="0">{t.staff.off}</option>
                    </select>
                  ) : (
                    <input id={`set-${s.key}`} value={current} onChange={(e) => setChanges({ ...changes, [s.key]: e.target.value })} className="h-12 rounded border border-line px-3 text-body" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="sticky bottom-2 flex items-center gap-3 rounded bg-card p-2 shadow-2">
        <button type="button" disabled={busy || !Object.keys(changes).length} onClick={() => void save()} className={buttonClass('primary', 'md')}>
          {busy ? t.common.saving : `${t.common.save} (${Object.keys(changes).length})`}
        </button>
        {msg ? <span className="text-base text-ok">{msg}</span> : null}
        {err ? <span className="text-base text-danger">{err}</span> : null}
      </div>
    </div>
  );
}
