import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../services/api';
import { useAuth } from '../../store/auth';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Check, Empty, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';
import { colors, font, space, type as t } from '../../theme/tokens';

interface ConfigRow {
  key: string;
  value: string;
  default: string;
  type: 'bool' | 'int' | 'string' | 'json';
  label: string;
}

type LogKind = 'notifications' | 'escalations' | 'rejections' | 'assignments' | 'config';

/**
 * Alert & Notification Management — the owner's own controls for the order-alert system.
 *
 * ⚠️ Global admin only, and the server says so: the endpoints behind this screen check
 * `isGlobalAdmin` in the handler, not just the role. This screen hides itself from anyone else
 * as a courtesy, but the refusal that matters is the one the API gives.
 *
 * Every row is rendered from what the server sent — key, current value, default, type — so a
 * setting added on the backend appears here without another app release. That is deliberate: the
 * alternative is a hand-written form that silently stops matching the server it configures.
 */
export default function AdminAlertsScreen(): React.JSX.Element {
  const { user } = useAuth();
  const action = useAdminAction();
  const [rows, setRows] = useState<ConfigRow[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [logKind, setLogKind] = useState<LogKind>('notifications');
  const [logs, setLogs] = useState<Record<string, unknown>[] | null>(null);

  const isOwner = user?.role === 'ADMIN' && user.isGlobalAdmin === true;

  const load = useCallback(async () => {
    const r = await api.get<{ rows: ConfigRow[] }>('/admin/alerts/config');
    setRows(r.rows);
    setEdits({});
  }, []);

  const loadLogs = useCallback(async (kind: LogKind) => {
    setLogKind(kind);
    setLogs(null);
    const r = await api.get<Record<string, unknown>[]>(`/admin/alerts/logs?kind=${kind}&limit=60`);
    setLogs(r);
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    void action.run('load', load);
    void action.run('logs', () => loadLogs('notifications'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  if (!isOwner) {
    return (
      <AdminScreen title="Alerts">
        <Empty text="Only the main admin can change the alert settings." />
      </AdminScreen>
    );
  }

  const set = (key: string, value: string): void => setEdits((e) => ({ ...e, [key]: value }));
  const current = (r: ConfigRow): string => edits[r.key] ?? r.value;
  const dirty = Object.keys(edits).length;

  const save = (): void => {
    void action.run(
      'save',
      () => api.put<{ saved: number }>('/admin/alerts/config', { changes: edits }),
      'Saved — the new settings apply to the next order.',
      () => void load(),
    );
  };

  /** The keys are grouped the way the owner thinks about them, not the way they are stored. */
  const groups: { title: string; note: string; match: (k: string) => boolean }[] = [
    { title: 'Who gets alerted', note: 'Delivery boys hear the ringing alert. Admins and supervisors only get told.', match: (k) => k.includes('rider') || k.includes('admin_enabled') || k.includes('supervisor_enabled') || k.includes('extra_user') },
    { title: 'Timing', note: 'All in seconds. 0 means "never" where that makes sense.', match: (k) => k.endsWith('_sec') },
    { title: 'How the phone behaves', note: 'Ringtone, vibration and how loudly Android is asked to show it.', match: (k) => ['alert_ringtone', 'alert_vibration', 'alert_priority', 'alert_visibility', 'alert_repeat_count'].includes(k) },
    { title: 'What the alert says', note: 'Use {orderNumber} {customer} {village} {amount} {money} {items} {status} {minutes} — they are filled in per order.', match: (k) => k.startsWith('alert_title_') || k.startsWith('alert_body_') },
    { title: 'Other', note: '', match: () => true },
  ];
  const used = new Set<string>();

  return (
    <AdminScreen
      title="Alerts & notifications"
      err={action.err}
      ok={action.ok}
      action={dirty ? <Btn label={`Save ${dirty}`} onPress={save} busy={action.busy === 'save'} /> : undefined}
    >
      {rows === null ? (
        <Empty text="Loading…" />
      ) : (
        groups.map((g) => {
          const mine = rows.filter((r) => !used.has(r.key) && g.match(r.key));
          mine.forEach((r) => used.add(r.key));
          if (mine.length === 0) return null;
          return (
            <Card key={g.title} style={{ marginBottom: space[3] }}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              {g.note ? <Text style={styles.groupNote}>{g.note}</Text> : null}
              {mine.map((r) => (
                <View key={r.key} style={styles.item}>
                  {r.type === 'bool' ? (
                    <Check label={r.label} checked={current(r) === '1'} onChange={(v) => set(r.key, v ? '1' : '0')} />
                  ) : (
                    <Field label={r.label} hint={current(r) === r.default ? undefined : `default: ${r.default}`}>
                      <TextField
                        value={current(r)}
                        onChangeText={(v) => set(r.key, v)}
                        keyboardType={r.type === 'int' ? 'number-pad' : 'default'}
                        multiline={r.type === 'string' && current(r).length > 40}
                      />
                    </Field>
                  )}
                </View>
              ))}
            </Card>
          );
        })
      )}

      <Card>
        <Text style={styles.groupTitle}>History</Text>
        <Text style={styles.groupNote}>What was sent, what failed, who declined and what was escalated.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {(['notifications', 'escalations', 'rejections', 'assignments', 'config'] as LogKind[]).map((k) => (
            <Btn key={k} label={k} tone={k === logKind ? 'primary' : 'secondary'} onPress={() => void action.run('logs', () => loadLogs(k))} busy={action.busy === 'logs' && k === logKind} />
          ))}
        </ScrollView>
        {logs === null ? (
          <Empty text="Loading…" />
        ) : logs.length === 0 ? (
          <Empty text="Nothing yet." />
        ) : (
          logs.slice(0, 40).map((l, i) => <LogLine key={String(l.id ?? i)} kind={logKind} row={l} />)
        )}
      </Card>
    </AdminScreen>
  );
}

/** One history line, shaped by which list it came from. */
function LogLine({ kind, row }: { kind: LogKind; row: Record<string, unknown> }): React.JSX.Element {
  const s = (k: string): string => (row[k] === null || row[k] === undefined ? '' : String(row[k]));
  if (kind === 'notifications') {
    // A PUSH row with no pushed_at never reached a phone — that is the failure list.
    const delivered = Boolean(row.pushedAt);
    return (
      <View style={styles.logRow}>
        <Row label={s('type').replace('alert.', '')} value={`${s('userName') || s('userRole')} · ${s('title')}`} />
        <View style={styles.logMeta}>
          <Pill text={delivered ? 'sent' : 'not sent'} tone={delivered ? 'ok' : 'danger'} />
          <Text style={styles.logWhen}>{s('createdAt').slice(0, 19).replace('T', ' ')}</Text>
        </View>
      </View>
    );
  }
  if (kind === 'rejections') {
    return (
      <View style={styles.logRow}>
        <Row label={s('orderNumber')} value={`${s('riderName') || 'rider'} — ${s('reason')}`} />
        <Text style={styles.logWhen}>{s('assignedBy') ? 'was assigned' : 'declined from the pool'}</Text>
      </View>
    );
  }
  if (kind === 'assignments') {
    return (
      <View style={styles.logRow}>
        <Row label={s('orderNumber')} value={`${s('riderName') || '—'} · ${s('status')}`} />
      </View>
    );
  }
  return (
    <View style={styles.logRow}>
      <Row label={s('action') || 'config'} value={s('orderNumber') || s('actorRole')} />
      <Text style={styles.logWhen} numberOfLines={2}>
        {JSON.stringify(row.detail ?? row.after ?? {}).slice(0, 160)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  groupTitle: { fontFamily: font.bodySemi, fontSize: t.body, color: colors.ink },
  groupNote: { fontSize: t.base, color: colors.ink3, marginTop: 2, marginBottom: space[2] },
  item: { marginTop: space[2] },
  tabs: { gap: space[2], paddingVertical: space[2] },
  logRow: { paddingVertical: space[2], borderTopWidth: 1, borderTopColor: colors.line },
  logMeta: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: 2 },
  logWhen: { fontSize: t.xs, color: colors.ink3 },
});
