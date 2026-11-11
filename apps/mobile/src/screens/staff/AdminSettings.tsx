import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Check, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';
import { space } from '../../theme/tokens';

export interface SettingRow {
  key: string; value: string | null; type: 'string' | 'int' | 'decimal' | 'bool' | 'json';
  group_name?: string; groupName?: string; label: string | null; is_public?: number;
  /** Server-enforced: this one lives in .env and the API refuses to change it. */
  locked?: boolean;
  /** Write-only: stored encrypted, never sent back. */
  secret?: boolean;
  isSet?: boolean;
}

/**
 * Settings (GET /admin/settings, PUT /admin/settings) — ADMIN only.
 *
 * ⚠️ Two kinds of setting are never editable here and the server says so: the ones that live
 * in .env (`locked`, e.g. the OTP driver, which §A2 keeps out of the panel on purpose) and
 * secrets, which are write-only and never sent back. A locked row is shown read-only rather
 * than hidden, so the owner can see the value that is in force.
 */
export default function AdminSettingsScreen(): React.JSX.Element {
  const [rows, setRows] = useState<SettingRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try { setRows(await api.get<SettingRow[]>('/admin/settings')); }
    catch (e) { setErr(errText(e, true)); }
  }, [setErr]);

  useEffect(() => { void load(); }, [load]);

  const save = (s: SettingRow, value: string): void => {
    void run(s.key, () => api.put('/admin/settings', { changes: { [s.key]: value } }), 'Saved', () => {
      setDraft((p) => ({ ...p, [s.key]: '' })); void load();
    });
  };

  // ⚠️ PUT /admin/settings takes `{ changes: { key: value } }` with every value a STRING. It was
  // being sent `{ settings: [...] }`, which the schema rejects, so no setting could be saved.
  const groups = [...new Set((rows ?? []).map((r) => r.groupName ?? r.group_name ?? 'General'))];

  return (
    <AdminScreen title="Settings" err={err} ok={ok} loading={rows === null}>
      {groups.map((g) => (
        <View key={g} style={{ gap: space[2] }}>
          <Row label="Group" value={g} strong />
          {(rows ?? []).filter((r) => (r.groupName ?? r.group_name ?? 'General') === g).map((s) => (
            <Card key={s.key}>
              <Row label="Setting" value={s.label ?? s.key} strong />
              <Row label="Key" value={s.key} />
              {s.locked ? (
                <>
                  <Row label="Value" value={s.value ?? '—'} />
                  <Pill text="Set in .env — cannot be changed here" tone="warn" />
                </>
              ) : s.secret ? (
                <>
                  <Row label="Stored" value={<Pill text={s.isSet ? 'A value is saved' : 'Not set'} tone={s.isSet ? 'ok' : 'muted'} />} />
                  <Field label="Replace secret" hint="Write-only — it is never shown again.">
                    <TextField value={draft[s.key] ?? ''} onChangeText={(v) => setDraft((p) => ({ ...p, [s.key]: v }))} placeholder="New value" />
                  </Field>
                  <Btn label="Save secret" onPress={() => save(s, draft[s.key] ?? '')} busy={busy === s.key} />
                </>
              ) : s.type === 'bool' ? (
                <Check label="On" checked={s.value === '1' || s.value === 'true'} disabled={busy === s.key} onChange={(n) => save(s, n ? '1' : '0')} />
              ) : (
                <>
                  <Field label="Value">
                    <TextField
                      value={draft[s.key] ?? s.value ?? ''}
                      onChangeText={(v) => setDraft((p) => ({ ...p, [s.key]: v }))}
                      keyboardType={s.type === 'int' ? 'number-pad' : s.type === 'decimal' ? 'decimal-pad' : 'default'}
                      multiline={s.type === 'json'}
                    />
                  </Field>
                  <Btn label="Save" onPress={() => save(s, draft[s.key] ?? s.value ?? '')} busy={busy === s.key} />
                </>
              )}
            </Card>
          ))}
        </View>
      ))}
    </AdminScreen>
  );
}
