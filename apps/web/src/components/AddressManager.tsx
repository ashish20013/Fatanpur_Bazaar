'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AddressView, ServiceabilityResult } from '@fb/shared-types';
import { call, errText } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { AddressForm, type AddressDefaults } from './AddressForm';
import { SorryScreen } from './area';
import { Icon } from './icons';
import { Badge, EmptyState, buttonClass } from './ui';

/** Address book. A8.4 §2 — out-of-area addresses stay saved, only marked (never re-type a form). */
export function AddressManager({ lang, initial, supportPhone, defaults, startAdding = false }: { lang: Lang; initial: AddressView[]; supportPhone: string; defaults: AddressDefaults; startAdding?: boolean }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<AddressView | null>(null);
  const [adding, setAdding] = useState(startAdding || initial.length === 0);
  const [sorry, setSorry] = useState<ServiceabilityResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function remove(id: number): Promise<void> {
    try {
      await call(`/users/me/addresses/${id}`, { method: 'DELETE' });
      setList(list.filter((a) => a.id !== id));
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    }
  }

  return (
    <div className="space-y-4">
      {adding || editing ? (
        <div className="fb-card p-4 sm:p-6">
          <AddressForm
            lang={lang}
            initial={editing ?? undefined}
            defaults={defaults}
            onOutOfArea={(r) => setSorry(r)}
            onCancel={
              list.length
                ? () => {
                    setAdding(false);
                    setEditing(null);
                  }
                : undefined
            }
            onSaved={(a) => {
              setList([a, ...list.filter((x) => x.id !== a.id)]);
              setAdding(false);
              setEditing(null);
              router.refresh();
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={buttonClass('primary', 'md')}>
          <Icon name="plus" size={18} /> {t.checkout.addAddress.replace(/^\+\s*/, '')}
        </button>
      )}

      {list.length === 0 && !adding ? <EmptyState icon="home" title={t.account.addresses} body={t.address.landmarkHint} /> : null}

      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((a) => (
          <li key={a.id} className="fb-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-au-50 text-em-700 ring-1 ring-au-200">
                <Icon name="home" size={18} />
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-body font-semibold">
                  {a.villageNameHi ?? a.villageName ?? a.areaText} {a.isDefault ? <Badge tone="muted">{t.address.default}</Badge> : null}
                </p>
                <p className="text-base text-ink-2">{[a.line1, a.landmark].filter(Boolean).join(', ')}</p>
                <p className="text-sm text-ink-3">
                  {a.receiverName}
                  {a.guardianName ? ` · ${t.addr2.guardian.split(' /')[0]}: ${a.guardianName}` : ''} · {a.phone}
                  {a.altPhone ? ` / ${a.altPhone}` : ''}
                </p>
                {a.directions ? <p className="text-sm text-ink-3">{a.directions}</p> : null}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {!a.isServiceable ? <Badge tone="danger">{t.address.outOfArea}</Badge> : null}
                  {a.mapsUrl ? (
                    <a href={a.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-em-700">
                      <Icon name="map-pin" size={14} /> {t.loc.openMaps}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-1 border-t border-line pt-2">
              <button type="button" onClick={() => setEditing(a)} className={buttonClass('ghost', 'sm')}>
                <Icon name="pencil" size={16} /> {t.address.edit}
              </button>
              <button type="button" onClick={() => void remove(a.id)} className={`${buttonClass('ghost', 'sm')} !text-danger`}>
                <Icon name="trash" size={16} /> {t.address.delete}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {err ? <p className="text-base text-danger">{err}</p> : null}
      {sorry ? <SorryScreen lang={lang} result={sorry} supportPhone={supportPhone} source="ADDRESS" onClose={() => setSorry(null)} /> : null}
    </div>
  );
}
