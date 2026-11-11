import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Check, Empty, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';
import { colors, space } from '../../theme/tokens';

/** Mirrors apps/web/src/components/admin/VillagesAdmin.tsx (GET/PATCH /admin/villages). */
export interface VillageRow {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
  lat: string | number;
  lng: string | number;
  distanceKm: string | number | null;
  deliveryFee: string;
  minOrder: string;
  etaMinutes: number;
  isActive: 0 | 1 | boolean;
  isPopular: 0 | 1 | boolean;
  orderCount30d: number;
  aliases: string[];
}

const on = (v: 0 | 1 | boolean): boolean => v === 1 || v === true;

/**
 * Villages — the screen the shopkeeper touches most (§A8.10). Switching one off stops every
 * customer there from ordering, so a village with recent orders asks for confirmation first,
 * exactly as the website does.
 */
export default function AdminVillagesScreen(): React.JSX.Element {
  const [rows, setRows] = useState<VillageRow[] | null>(null);
  const [alias, setAlias] = useState<Record<number, string>>({});
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try {
      setRows(await api.get<VillageRow[]>('/admin/villages'));
    } catch (e) {
      setErr(errText(e, true));
    }
  }, [setErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (v: VillageRow, body: Record<string, unknown>, msg: string): void => {
    void run(String(v.id), () => api.patch(`/admin/villages/${v.id}`, body), msg, () => void load());
  };

  const toggle = (v: VillageRow, next: boolean): void => {
    // ⚠️ Turning a village off is a business decision, not a toggle. Say what it costs first.
    if (!next && v.orderCount30d > 0) {
      Alert.alert(
        'Turn this village off?',
        `${v.nameHi ?? v.name} had ${v.orderCount30d} orders in the last 30 days. Customers there will not be able to order.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Turn off', style: 'destructive', onPress: () => patch(v, { isActive: false }, 'Village turned off') },
        ],
      );
      return;
    }
    patch(v, { isActive: next }, next ? 'Village turned on' : 'Village turned off');
  };

  const addAlias = (v: VillageRow): void => {
    const a = (alias[v.id] ?? '').trim();
    if (!a) return;
    void run(`alias-${v.id}`, () => api.post(`/admin/villages/${v.id}/aliases`, { alias: a, type: 'SPELLING' }), 'Alias added', () => {
      setAlias((p) => ({ ...p, [v.id]: '' }));
      void load();
    });
  };

  return (
    <AdminScreen title="Villages" err={err} ok={ok} loading={rows === null}>
      {rows && rows.length === 0 ? <Empty text="No villages yet." /> : null}
      {rows?.map((v) => (
        <Card key={v.id}>
          <Row label="Village" value={`${v.nameHi ?? v.name}${v.nameHi ? ` · ${v.name}` : ''}`} strong />
          <Row label="Distance" value={v.distanceKm !== null ? `${v.distanceKm} km` : '—'} />
          <Row label="Orders (30d)" value={v.orderCount30d} />
          <Row label="Delivery fee" value={`₹${v.deliveryFee}`} />
          <Row label="Min order" value={`₹${v.minOrder}`} />
          <Row label="ETA" value={`${v.etaMinutes} min`} />
          <Row
            label="Aliases"
            value={
              v.aliases.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {v.aliases.map((a) => (
                    <Pill key={a} text={a} />
                  ))}
                </View>
              ) : (
                <Pill text="none" />
              )
            }
          />
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space[1] }} />
          <Check label="Active (shown in the village picker)" checked={on(v.isActive)} onChange={(n) => toggle(v, n)} disabled={busy === String(v.id)} />
          <Check label="Popular (pinned to the top)" checked={on(v.isPopular)} onChange={(n) => patch(v, { isPopular: n }, 'Saved')} disabled={busy === String(v.id)} />
          <Field label="Add a spelling alias" hint="The picker's search matches these — add how people actually write it.">
            <TextField value={alias[v.id] ?? ''} onChangeText={(x) => setAlias((p) => ({ ...p, [v.id]: x }))} placeholder="e.g. Rani Ganj" />
          </Field>
          <Btn label="Add alias" onPress={() => addAlias(v)} tone="secondary" busy={busy === `alias-${v.id}`} icon="plus" />
        </Card>
      ))}
    </AdminScreen>
  );
}
